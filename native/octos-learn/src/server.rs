//! Octos server client (web `api/client.ts`, `api/auth.ts` and the
//! `/api/ui-protocol/ws` JSON-RPC bridge), on Makepad's network runtime so
//! every reply arrives as an `Event::NetworkResponses` on the UI thread.
//!
//! The local single-user flow: `POST /api/auth/solo` (404 when this machine
//! has no profile yet -> `POST /api/auth/solo/create`), then a WebSocket to
//! `/api/ui-protocol/ws?token=…`. Server URL: `OCTOS_SERVER_URL`, default
//! `http://127.0.0.1:50080` (`octos serve --solo`).
use makepad_widgets::makepad_platform::makepad_network::{WsMessage, WsSend};
use makepad_widgets::*;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Web UI_PROTOCOL_FEATURES + auxiliary.rest_to_ws.v1.
const UI_FEATURES: [&str; 17] = [
    "projection.envelope.v2",
    "voice.asr_admission.v1",
    "approval.typed.v1",
    "user_question.v1",
    "pane.snapshots.v1",
    "harness.task_control.v1",
    "event.spawn_complete.v1",
    "event.file_attached.v1",
    "state.session_hydrate.v1",
    "skill.actions.v1",
    "skill.action_jobs.v1",
    "context.lifecycle.v1",
    "coding.autonomy.v1",
    "coding.loop_runtime.v1",
    "coding.goal_runtime.v1",
    "smart_home.v1",
    "auxiliary.rest_to_ws.v1",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Ws {
    Closed,
    Connecting,
    Open,
}

#[derive(Clone, Debug)]
enum Http {
    Solo,
    SoloCreate,
    File { turn_id: String },
    Profile,
    TestProvider,
    SaveProfile,
    Speech { purpose: String },
}

/// What a JSON-RPC call was for.
#[derive(Clone, Debug)]
pub enum Call {
    Fire,
    Invoke { turn_id: String },
}

/// Server results the app reacts to.
#[derive(Clone, Debug)]
pub enum ServerEvent {
    LoggedIn,
    /// Login or connection failure (user-facing Chinese message).
    Unavailable(String),
    /// `skill/action/invoke` accepted (or rejected) the turn.
    Invoked { turn_id: String, result: Result<String, String> },
    /// `skill/action/job/updated` (web SkillActionJob).
    Job(Value),
    /// The authoring lesson file of a turn was downloaded.
    LessonFile { turn_id: String, body: Result<String, String> },
    /// GET /api/my/profile.
    Profile(Result<Value, String>),
    /// POST /api/my/test-provider.
    ProviderTested(Result<(), String>),
    /// PUT /api/my/profile.
    ProfileSaved(Result<Value, String>),
    /// POST /api/voice/synthesize (audio bytes).
    Speech { purpose: String, audio: Result<Vec<u8>, String> },
}

/// Web formatSettingsError: the server's JSON error/message, else the text.
fn error_text(status: u16, body: &str) -> String {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    v["error"]
        .as_str()
        .or(v["message"].as_str())
        .map(str::to_owned)
        .or_else(|| (!body.trim().is_empty()).then(|| body.trim().chars().take(200).collect()))
        .unwrap_or_else(|| format!("HTTP {status}"))
}

pub struct Server {
    pub base: String,
    token: Option<String>,
    pub profile_id: Option<String>,
    logging_in: bool,
    socket: LiveId,
    ws: Ws,
    outbox: Vec<String>,
    calls: HashMap<String, Call>,
    http: HashMap<LiveId, Http>,
    seq: u64,
}

impl Default for Server {
    fn default() -> Self {
        Self {
            base: std::env::var("OCTOS_SERVER_URL")
                .ok()
                .map(|s| s.trim_end_matches('/').to_owned())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "http://127.0.0.1:50080".into()),
            token: None,
            profile_id: None,
            logging_in: false,
            socket: LiveId::unique(),
            ws: Ws::Closed,
            outbox: Vec::new(),
            calls: HashMap::new(),
            http: HashMap::new(),
            seq: 0,
        }
    }
}

/// application/x-www-form-urlencoded component (URLSearchParams.set).
pub fn query_escape(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'*' => out.push(b as char),
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// A random UUID-shaped id (crypto.randomUUID stand-in for turn/request ids).
pub fn uuid() -> String {
    let a = LiveId::unique().0 ^ (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos() as u64));
    let b = LiveId::unique().0.rotate_left(17) ^ a.rotate_right(29);
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) as u32,
        (a >> 16) as u16,
        a as u16 & 0x0fff,
        ((b >> 48) as u16 & 0x3fff) | 0x8000,
        b & 0xffff_ffff_ffff
    )
}

impl Server {
    pub fn logged_in(&self) -> bool {
        self.token.is_some()
    }
    fn request(&self, path: &str, method: HttpMethod) -> HttpRequest {
        let mut req = HttpRequest::new(format!("{}{path}", self.base), method);
        req.set_header("Content-Type".into(), "application/json".into());
        if let Some(t) = &self.token {
            req.set_header("Authorization".into(), format!("Bearer {t}"));
        }
        if let Some(p) = &self.profile_id {
            req.set_header("X-Profile-Id".into(), p.clone());
        }
        req
    }
    fn http(&mut self, cx: &mut Cx, req: HttpRequest, purpose: Http) {
        let id = LiveId::unique();
        self.http.insert(id, purpose);
        cx.http_request(id, req);
    }
    /// Web login page solo flow (re-login the local owner, creating it once).
    pub fn ensure_login(&mut self, cx: &mut Cx) {
        if self.token.is_some() || self.logging_in {
            return;
        }
        self.logging_in = true;
        let req = self.request("/api/auth/solo", HttpMethod::POST);
        self.http(cx, req, Http::Solo);
    }
    fn ensure_socket(&mut self, cx: &mut Cx) {
        let Some(token) = self.token.clone() else {
            self.ensure_login(cx);
            return;
        };
        if self.ws != Ws::Closed {
            return;
        }
        // Web getUiProtocolFeatures(): capabilities negotiated on the open
        // query; the server gates methods such as session/title.set
        // (auxiliary.rest_to_ws.v1) and skill action jobs on them.
        let mut url = format!(
            "{}/api/ui-protocol/ws?token={}",
            self.base.replacen("http", "ws", 1),
            query_escape(&token)
        );
        for feature in UI_FEATURES {
            url.push_str("&ui_feature=");
            url.push_str(&query_escape(feature));
        }
        self.socket = LiveId::unique();
        self.ws = Ws::Connecting;
        if cx.net.ws_open(self.socket, HttpRequest::new(url, HttpMethod::GET)).is_err() {
            self.ws = Ws::Closed;
        }
    }
    /// JSON-RPC request; queued until the socket is open.
    pub fn call(&mut self, cx: &mut Cx, method: &str, params: Value, purpose: Call) -> String {
        self.seq += 1;
        let id = uuid();
        self.calls.insert(id.clone(), purpose);
        self.outbox.push(json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}).to_string());
        self.flush(cx);
        id
    }
    fn flush(&mut self, cx: &mut Cx) {
        if self.ws != Ws::Open {
            self.ensure_socket(cx);
            return;
        }
        for frame in std::mem::take(&mut self.outbox) {
            let _ = cx.net.ws_send(self.socket, WsSend::Text(frame));
        }
    }
    pub fn get_profile(&mut self, cx: &mut Cx) {
        let req = self.request("/api/my/profile", HttpMethod::GET);
        self.http(cx, req, Http::Profile);
    }
    pub fn test_provider(&mut self, cx: &mut Cx, body: Value) {
        let mut req = self.request("/api/my/test-provider", HttpMethod::POST);
        req.set_body_string(&body.to_string());
        self.http(cx, req, Http::TestProvider);
    }
    pub fn save_profile(&mut self, cx: &mut Cx, body: Value) {
        let mut req = self.request("/api/my/profile", HttpMethod::PUT);
        req.set_body_string(&body.to_string());
        self.http(cx, req, Http::SaveProfile);
    }
    /// Web synthesizeSpeech (non-hosted route): the profile's TTS voice.
    pub fn synthesize(&mut self, cx: &mut Cx, text: &str, purpose: &str) {
        let mut req = self.request("/api/voice/synthesize", HttpMethod::POST);
        req.set_body_string(&json!({"text": text}).to_string());
        self.http(cx, req, Http::Speech { purpose: purpose.into() });
    }
    /// Download a session artifact (web buildFileUrl: `ws/…` handles are
    /// session-scoped query URLs).
    pub fn fetch_file(&mut self, cx: &mut Cx, session_id: &str, handle: &str, turn_id: &str) {
        let path = format!("/api/files?path={}&session={}", query_escape(handle), query_escape(session_id));
        let req = self.request(&path, HttpMethod::GET);
        self.http(cx, req, Http::File { turn_id: turn_id.into() });
    }

    pub fn handle(&mut self, cx: &mut Cx, event: &Event) -> Vec<ServerEvent> {
        let Event::NetworkResponses(responses) = event else { return vec![] };
        let mut out = Vec::new();
        let debug = std::env::var_os("OCTOS_SERVER_DEBUG").is_some();
        for r in responses {
            if debug {
                let line = match r {
                    NetworkResponse::HttpResponse { response, .. } => format!("http {}", response.status_code),
                    NetworkResponse::HttpError { error, .. } => format!("http error {}", error.message),
                    NetworkResponse::WsOpened { .. } => "ws opened".into(),
                    NetworkResponse::WsClosed { .. } => "ws closed".into(),
                    NetworkResponse::WsError { message, .. } => format!("ws error {message}"),
                    NetworkResponse::WsMessage { message: WsMessage::Text(t), .. } => format!("ws text {}", t.chars().take(160).collect::<String>()),
                    _ => "other".into(),
                };
                eprintln!("[octos-server] {line}");
            }
            match r {
                NetworkResponse::HttpResponse { request_id, response } => {
                    let Some(purpose) = self.http.remove(request_id) else { continue };
                    let status = response.status_code;
                    let body = response.body_string().unwrap_or_default();
                    match purpose {
                        Http::Solo | Http::SoloCreate if (200..300).contains(&status) => {
                            let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                            self.token = v["token"].as_str().map(str::to_owned);
                            // /solo/create returns profile_id; /solo returns user.id
                            // (the solo owner's profile id).
                            self.profile_id = v["profile_id"].as_str().or(v["user"]["id"].as_str()).map(str::to_owned);
                            self.logging_in = false;
                            if self.token.is_some() {
                                out.push(ServerEvent::LoggedIn);
                                self.flush(cx);
                            } else {
                                out.push(ServerEvent::Unavailable("登录返回无效".into()));
                            }
                        }
                        Http::Solo if status == 404 => {
                            // Web solo-profile-form: first run creates the local profile.
                            let mut req = self.request("/api/auth/solo/create", HttpMethod::POST);
                            req.set_body_string(&json!({"name": "Octos Learner"}).to_string());
                            self.http(cx, req, Http::SoloCreate);
                        }
                        Http::Solo | Http::SoloCreate => {
                            self.logging_in = false;
                            out.push(ServerEvent::Unavailable(if status == 403 {
                                "本机 Octos 服务没有开启本地登录（octos serve --solo）".into()
                            } else {
                                format!("登录失败（HTTP {status}）")
                            }));
                        }
                        Http::File { turn_id } => out.push(ServerEvent::LessonFile {
                            turn_id,
                            body: if (200..300).contains(&status) { Ok(body) } else { Err(format!("课程文件下载失败（HTTP {status}）")) },
                        }),
                        Http::Profile => out.push(ServerEvent::Profile(if (200..300).contains(&status) {
                            serde_json::from_str(&body).map_err(|e| e.to_string())
                        } else {
                            Err(error_text(status, &body))
                        })),
                        Http::TestProvider => {
                            let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                            out.push(ServerEvent::ProviderTested(if (200..300).contains(&status) && v["ok"] == true {
                                Ok(())
                            } else {
                                Err(v["error"]
                                    .as_str()
                                    .or(v["message"].as_str())
                                    .map(str::to_owned)
                                    .unwrap_or_else(|| if (200..300).contains(&status) {
                                        "连接测试失败，请检查模型名称和 API Key。".into()
                                    } else {
                                        error_text(status, &body)
                                    }))
                            }));
                        }
                        Http::SaveProfile => out.push(ServerEvent::ProfileSaved(if (200..300).contains(&status) {
                            serde_json::from_str(&body).map_err(|e| e.to_string())
                        } else {
                            Err(error_text(status, &body))
                        })),
                        Http::Speech { purpose } => out.push(ServerEvent::Speech {
                            purpose,
                            audio: match response.body() {
                                Some(bytes) if (200..300).contains(&status) && !bytes.is_empty() => Ok(bytes.to_vec()),
                                _ => Err(error_text(status, &body)),
                            },
                        }),
                    }
                }
                NetworkResponse::HttpError { request_id, error } => {
                    let Some(purpose) = self.http.remove(request_id) else { continue };
                    match purpose {
                        Http::Solo | Http::SoloCreate => {
                            self.logging_in = false;
                            out.push(ServerEvent::Unavailable(format!(
                                "连接不到 Octos 服务（{}）：{}",
                                self.base, error.message
                            )));
                        }
                        Http::File { turn_id } => out.push(ServerEvent::LessonFile {
                            turn_id,
                            body: Err(format!("课程文件下载失败：{}", error.message)),
                        }),
                        Http::Profile => out.push(ServerEvent::Profile(Err(error.message.clone()))),
                        Http::TestProvider => out.push(ServerEvent::ProviderTested(Err(error.message.clone()))),
                        Http::SaveProfile => out.push(ServerEvent::ProfileSaved(Err(error.message.clone()))),
                        Http::Speech { purpose } => out.push(ServerEvent::Speech { purpose, audio: Err(error.message.clone()) }),
                    }
                }
                NetworkResponse::WsOpened { socket_id } if *socket_id == self.socket => {
                    self.ws = Ws::Open;
                    self.flush(cx);
                }
                NetworkResponse::WsClosed { socket_id } | NetworkResponse::WsError { socket_id, .. }
                    if *socket_id == self.socket =>
                {
                    self.ws = Ws::Closed;
                }
                NetworkResponse::WsMessage { socket_id, message: WsMessage::Text(text) } if *socket_id == self.socket => {
                    let Ok(msg) = serde_json::from_str::<Value>(text) else { continue };
                    if let Some(method) = msg["method"].as_str() {
                        if method == "skill/action/job/updated" {
                            out.push(ServerEvent::Job(msg["params"]["job"].clone()));
                        }
                        continue;
                    }
                    let Some(id) = msg["id"].as_str() else { continue };
                    let Some(call) = self.calls.remove(id) else { continue };
                    if let Call::Invoke { turn_id } = call {
                        let result = match msg.get("error") {
                            Some(e) if !e.is_null() => Err(e["message"].as_str().unwrap_or("生成请求失败").to_owned()),
                            _ if msg["result"]["ok"] == false => {
                                Err(msg["result"]["error"].as_str().unwrap_or("生成请求被拒绝").to_owned())
                            }
                            // {"ok": true, "execution": "background", "jobs": [{job_id, …}]}
                            _ => Ok(msg["result"]["jobs"][0]["job_id"].as_str().unwrap_or("").to_owned()),
                        };
                        out.push(ServerEvent::Invoked { turn_id, result });
                    }
                }
                _ => {}
            }
        }
        out
    }
}
