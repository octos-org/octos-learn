//! Octos server client (web `api/client.ts`, `api/auth.ts` and the
//! `/api/ui-protocol/ws` JSON-RPC bridge), on Makepad's network runtime so
//! every reply arrives as an `Event::NetworkResponses` on the UI thread.
//!
//! Login follows the server's `/api/auth/status` (web login page): a host
//! with local solo login (`octos serve --solo`) signs in automatically
//! (`POST /api/auth/solo`, 404 -> `/api/auth/solo/create`); otherwise the
//! learner signs in by email code (`/api/auth/send-code`, `/api/auth/verify`),
//! and the token is kept in the data directory (`auth.json`) and checked with
//! `/api/auth/me` on the next launch. Then a WebSocket to
//! `/api/ui-protocol/ws?token=…`. Server URL: `OCTOS_SERVER_URL`, default
//! the public `https://learn.pitun.cc` (as the WebView app).
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
    Upload { purpose: String },
    Json { purpose: String },
    /// Reachability check before reopening the socket after a drop.
    Probe,
    /// `/api/auth/status`: which login the server offers.
    Status,
    SendCode,
    Verify,
    /// `/api/auth/me` for a token restored from disk.
    Me,
    Logout,
}

/// Public server (web app / WebView APK).
pub const PUBLIC_SERVER: &str = "https://learn.pitun.cc";

/// What a JSON-RPC call was for.
#[derive(Clone, Debug)]
pub enum Call {
    Fire,
    Invoke { turn_id: String },
    Admit { turn_id: String },
    /// `turn/start` (an agent chat turn).
    Turn { turn_id: String },
    /// A synchronous skill action (selection classify): its first
    /// successful result's structured metadata.
    Metadata { purpose: String },
    /// A synchronous skill action whose whole result is needed.
    Result { purpose: String },
    /// `skill/action/job/list` of a session (job recovery).
    JobList { session: String },
}

/// A sent JSON-RPC call gets no reply within this: it fails (no hung UI).
const CALL_TIMEOUT_SECS: f64 = 90.;
/// While a lesson is being generated, re-read its jobs this often (web
/// re-lists jobs on every bridge connect; updates can be missed).
const JOB_POLL_SECS: f64 = 20.;


/// Progress of an agent chat turn (web sendMessage projection).
#[derive(Clone, Debug)]
pub enum TurnUpdate {
    /// `turn/start` accepted or rejected.
    Accepted(Result<(), String>),
    /// A lesson file persisted with an assistant message (server path).
    Lesson(String),
    /// The assistant's persisted text reply.
    Reply(String),
    /// The turn ended: completed, or failed with a message.
    Done(Result<(), String>),
}

/// Server results the app reacts to.
#[derive(Clone, Debug)]
pub enum ServerEvent {
    LoggedIn,
    /// The server needs an email-code login (web login page).
    LoginRequired { self_registration: bool },
    /// `/api/auth/send-code` result.
    CodeSent(Result<(), String>),
    /// `/api/auth/verify` rejected the code.
    LoginFailed(String),
    /// Login or connection failure (user-facing Chinese message).
    Unavailable(String),
    /// `skill/action/invoke` accepted (or rejected) the turn.
    Invoked { turn_id: String, result: Result<String, String> },
    /// `skill/action/job/updated` (web SkillActionJob).
    Job(Value),
    /// A session's full job listing (reconnect / poll).
    JobsListed { session: String, jobs: Vec<Value> },
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
    /// POST /api/upload: server-side paths of the uploaded files.
    Uploaded { purpose: String, paths: Result<Vec<String>, String> },
    /// voice/admit: Some(transcript) for speech, None for no_speech.
    Admitted { turn_id: String, result: Result<Option<String>, String> },
    Turn { turn_id: String, update: TurnUpdate },
    /// Result of a `Call::Metadata` invocation.
    Metadata { purpose: String, result: Result<Value, String> },
    ActionResult { purpose: String, result: Result<Value, String> },
    /// A generic REST call (`Server::json`).
    Json { purpose: String, result: Result<Value, String> },
}

/// Debug logs never carry credentials: `"token":"…"` values are masked.
fn redact(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    while let Some(i) = rest.find("\"token\":\"") {
        let start = i + "\"token\":\"".len();
        out.push_str(&rest[..start]);
        out.push_str("***");
        rest = &rest[start..];
        rest = rest.find('"').map_or("", |j| &rest[j..]);
    }
    out.push_str(rest);
    out
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
    /// Signed-in email (email-code login), for the UI.
    pub email: Option<String>,
    logging_in: bool,
    /// Waiting for the learner to sign in by email code.
    awaiting_login: bool,
    login_event: Option<bool>,
    auth_file: Option<std::path::PathBuf>,
    /// Token being checked with /api/auth/me.
    pending_token: Option<String>,
    socket: LiveId,
    ws: Ws,
    outbox: Vec<(String, String)>,
    calls: HashMap<String, Call>,
    /// Calls written to the socket and still unanswered: id -> sent at.
    sent: HashMap<String, std::time::Instant>,
    http: HashMap<LiveId, Http>,
    seq: u64,
    /// Reconnect after a drop: when, and the next backoff (seconds).
    reconnect_at: Option<std::time::Instant>,
    backoff: f64,
    /// Session whose lesson jobs are watched (a question is pending).
    watched: Option<String>,
    last_poll: Option<std::time::Instant>,
}

impl Default for Server {
    fn default() -> Self {
        Self {
            base: std::env::var("OCTOS_SERVER_URL")
                .ok()
                .map(|s| s.trim_end_matches('/').to_owned())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| PUBLIC_SERVER.into()),
            token: None,
            profile_id: None,
            email: None,
            logging_in: false,
            awaiting_login: false,
            login_event: None,
            auth_file: None,
            pending_token: None,
            socket: LiveId::unique(),
            ws: Ws::Closed,
            outbox: Vec::new(),
            calls: HashMap::new(),
            sent: HashMap::new(),
            http: HashMap::new(),
            seq: 0,
            reconnect_at: None,
            backoff: 1.,
            watched: None,
            last_poll: None,
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
    let b = random_bytes::<16>();
    let hex = |r: std::ops::Range<usize>| b[r].iter().map(|x| format!("{x:02x}")).collect::<String>();
    // RFC 4122 v4 (web crypto.randomUUID).
    format!(
        "{}-{}-4{}-{:02x}{}-{}",
        hex(0..4),
        hex(4..6),
        &hex(6..8)[1..],
        (b[8] & 0x3f) | 0x80,
        hex(9..10),
        hex(10..16)
    )
}

/// OS randomness (/dev/urandom), mixed with the clock and Makepad's unique
/// ids if it cannot be read.
pub fn random_bytes<const N: usize>() -> [u8; N] {
    use std::io::Read;
    let mut out = [0u8; N];
    if std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut out)).is_ok() {
        return out;
    }
    let mut x = LiveId::unique().0 ^ std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos() as u64);
    for byte in &mut out {
        // xorshift64*
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        *byte = (x.wrapping_mul(0x2545_f491_4f6c_dd1d) >> 56) as u8;
    }
    out
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
    /// Sign in if needed: ask the server which login it offers (solo signs
    /// in at once; email login asks the app to show the login page).
    pub fn ensure_login(&mut self, cx: &mut Cx) {
        if self.token.is_some() || self.logging_in {
            return;
        }
        if let Some(self_registration) = self.awaiting_login.then_some(self.login_event.unwrap_or(true)) {
            // Still waiting for the learner: show the login page again.
            self.login_event = Some(self_registration);
            return;
        }
        self.logging_in = true;
        let req = self.request("/api/auth/status", HttpMethod::GET);
        self.http(cx, req, Http::Status);
    }
    /// Where the email-login token is kept; restores it (checked with /me).
    pub fn restore_login(&mut self, cx: &mut Cx, path: std::path::PathBuf) {
        let saved: Value = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
        self.auth_file = Some(path);
        if saved["base"] != self.base.as_str() {
            return;
        }
        if let Some(token) = saved["token"].as_str() {
            self.token = Some(token.to_owned());
            self.profile_id = saved["profile_id"].as_str().map(str::to_owned);
            self.email = saved["email"].as_str().map(str::to_owned);
            self.logging_in = true;
            let req = self.request("/api/auth/me", HttpMethod::GET);
            self.token = None; // not usable until /me confirms it
            let mut req = req;
            req.set_header("Authorization".into(), format!("Bearer {token}"));
            self.pending_token = Some(token.to_owned());
            self.http(cx, req, Http::Me);
        }
    }
    fn save_login(&self) {
        let Some(path) = &self.auth_file else { return };
        let body = json!({"base": self.base, "token": self.token, "profile_id": self.profile_id, "email": self.email}).to_string();
        let _ = std::fs::write(path, body);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }
    }
    /// Drop the session locally (expired token / sign out).
    fn forget_login(&mut self, cx: &mut Cx) {
        self.token = None;
        self.email = None;
        self.pending_token = None;
        if let Some(path) = &self.auth_file {
            let _ = std::fs::remove_file(path);
        }
        if self.ws != Ws::Closed {
            let _ = cx.net.ws_close(self.socket);
            self.ws = Ws::Closed;
        }
    }
    /// Web sendCode.
    pub fn send_code(&mut self, cx: &mut Cx, email: &str) {
        let mut req = self.request("/api/auth/send-code", HttpMethod::POST);
        req.set_body_string(&json!({"email": email}).to_string());
        self.email = Some(email.to_owned());
        self.http(cx, req, Http::SendCode);
    }
    /// Web verify (email code).
    pub fn verify(&mut self, cx: &mut Cx, email: &str, code: &str) {
        let mut req = self.request("/api/auth/verify", HttpMethod::POST);
        req.set_body_string(&json!({"email": email, "code": code}).to_string());
        self.email = Some(email.to_owned());
        self.http(cx, req, Http::Verify);
    }
    /// Web logout (退出).
    pub fn logout(&mut self, cx: &mut Cx) {
        if self.token.is_some() {
            let req = self.request("/api/auth/logout", HttpMethod::POST);
            self.http(cx, req, Http::Logout);
        }
        self.forget_login(cx);
        self.awaiting_login = false;
    }
    /// The learner closed the login page: stop asking until next time.
    pub fn cancel_login(&mut self) {
        self.awaiting_login = false;
        self.login_event = None;
    }
    /// Signed in by email (sign-out is offered), as opposed to local solo.
    pub fn email_login(&self) -> bool {
        self.token.is_some() && self.email.is_some()
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
        self.outbox.push((id.clone(), json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}).to_string()));
        self.flush(cx);
        id
    }
    /// The session whose lesson jobs to recover / poll (None: nothing pending).
    pub fn set_watched(&mut self, session: Option<String>) {
        if self.watched != session {
            self.watched = session;
            self.last_poll = None;
        }
    }
    /// Web listSkillActionJobs for every lesson action of the watched session.
    fn poll_jobs(&mut self, cx: &mut Cx) {
        let Some(session) = self.watched.clone() else { return };
        self.last_poll = Some(std::time::Instant::now());
        // All of the session's actions in one listing, so a job missing from
        // it is known to be gone.
        self.call(cx, "skill/action/job/list", json!({"session_id": session.clone()}), Call::JobList { session });
    }
    /// What a call that will never be answered reports to the app.
    fn failed(call: Call, message: &str) -> Option<ServerEvent> {
        let err = Err(message.to_owned());
        match call {
            Call::Fire | Call::JobList { .. } => None,
            Call::Invoke { turn_id } => Some(ServerEvent::Invoked { turn_id, result: err }),
            Call::Admit { turn_id } => Some(ServerEvent::Admitted { turn_id, result: Err(message.to_owned()) }),
            Call::Turn { turn_id } => Some(ServerEvent::Turn { turn_id, update: TurnUpdate::Accepted(Err(message.to_owned())) }),
            Call::Metadata { purpose } => Some(ServerEvent::Metadata { purpose, result: Err(message.to_owned()) }),
            Call::Result { purpose } => Some(ServerEvent::ActionResult { purpose, result: Err(message.to_owned()) }),
        }
    }
    fn schedule_reconnect(&mut self) {
        self.reconnect_at = Some(std::time::Instant::now() + std::time::Duration::from_secs_f64(self.backoff));
        self.backoff = (self.backoff * 2.).min(15.);
    }
    /// Reconnects, call timeouts and job polling (cheap; runs on every event).
    fn maintain(&mut self, cx: &mut Cx, out: &mut Vec<ServerEvent>) {
        let now = std::time::Instant::now();
        let expired: Vec<String> = self
            .sent
            .iter()
            .filter(|(_, t)| now.duration_since(**t).as_secs_f64() > CALL_TIMEOUT_SECS)
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            self.sent.remove(&id);
            if let Some(ev) = self.calls.remove(&id).and_then(|c| Self::failed(c, "服务器长时间没有回应，请重试")) {
                out.push(ev);
            }
        }
        if self.ws == Ws::Closed
            && self.token.is_some()
            && self.reconnect_at.is_some_and(|t| now >= t)
            && (!self.outbox.is_empty() || self.watched.is_some())
        {
            self.reconnect_at = None;
            // Makepad's Apple backend reports a socket open at once and
            // crashes sending on one whose connect then fails: reopen only
            // once the server answers HTTP.
            let req = self.request("/api/auth/status", HttpMethod::GET);
            self.http(cx, req, Http::Probe);
        }
        if self.ws == Ws::Open
            && self.watched.is_some()
            && self.last_poll.is_none_or(|t| now.duration_since(t).as_secs_f64() >= JOB_POLL_SECS)
        {
            self.poll_jobs(cx);
        }
    }
    fn flush(&mut self, cx: &mut Cx) {
        if self.ws != Ws::Open {
            self.ensure_socket(cx);
            return;
        }
        for (id, frame) in std::mem::take(&mut self.outbox) {
            if std::env::var_os("OCTOS_SERVER_DEBUG").is_some() {
                eprintln!("[octos-server] ws send {}", redact(&frame.chars().take(1200).collect::<String>()));
            }
            if self.calls.contains_key(&id) {
                self.sent.insert(id, std::time::Instant::now());
            }
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
    /// Any JSON REST endpoint of the profile API (gateway start/stop, …).
    pub fn json(&mut self, cx: &mut Cx, method: HttpMethod, path: &str, body: Option<Value>, purpose: &str) {
        let mut req = self.request(path, method);
        if let Some(body) = body {
            req.set_body_string(&body.to_string());
        }
        self.http(cx, req, Http::Json { purpose: purpose.into() });
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
    /// Web uploadFiles: multipart `file` parts (plus audio_upload_mode).
    pub fn upload(&mut self, cx: &mut Cx, name: &str, mime: &str, bytes: &[u8], audio_mode: Option<&str>, purpose: &str) {
        let boundary = format!("octos{}", uuid().replace('-', ""));
        let mut body = Vec::new();
        if let Some(mode) = audio_mode {
            body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"audio_upload_mode\"\r\n\r\n{mode}\r\n").as_bytes());
        }
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let mut req = self.request("/api/upload", HttpMethod::POST);
        req.headers.insert("Content-Type".into(), vec![format!("multipart/form-data; boundary={boundary}")]);
        req.set_body(body);
        self.http(cx, req, Http::Upload { purpose: purpose.into() });
    }
    /// Download a session artifact (web buildFileUrl: `ws/…` handles are
    /// session-scoped query URLs).
    pub fn fetch_file(&mut self, cx: &mut Cx, session_id: &str, handle: &str, turn_id: &str) {
        let path = format!("/api/files?path={}&session={}", query_escape(handle), query_escape(session_id));
        let req = self.request(&path, HttpMethod::GET);
        self.http(cx, req, Http::File { turn_id: turn_id.into() });
    }

    pub fn handle(&mut self, cx: &mut Cx, event: &Event) -> Vec<ServerEvent> {
        let mut out = Vec::new();
        if let Some(self_registration) = self.login_event.take() {
            out.push(ServerEvent::LoginRequired { self_registration });
        }
        self.maintain(cx, &mut out);
        let Event::NetworkResponses(responses) = event else { return out };
        let debug = std::env::var_os("OCTOS_SERVER_DEBUG").is_some();
        for r in responses {
            if debug {
                let line = match r {
                    NetworkResponse::HttpResponse { response, .. } => format!("http {} {}", response.status_code, response.get_string_body().unwrap_or_default().chars().take(300).collect::<String>()),
                    NetworkResponse::HttpError { error, .. } => format!("http error {}", error.message),
                    NetworkResponse::WsOpened { .. } => "ws opened".into(),
                    NetworkResponse::WsClosed { .. } => "ws closed".into(),
                    NetworkResponse::WsError { message, .. } => format!("ws error {message}"),
                    NetworkResponse::WsMessage { message: WsMessage::Text(t), .. } => format!("ws text {}", t.chars().take(600).collect::<String>()),
                    _ => "other".into(),
                };
                eprintln!("[octos-server] {}", redact(&line));
            }
            match r {
                NetworkResponse::HttpResponse { request_id, response } => {
                    let Some(purpose) = self.http.remove(request_id) else { continue };
                    let status = response.status_code;
                    let body = response.body_string().unwrap_or_default();
                    let ok = (200..300).contains(&status);
                    let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
                    match purpose {
                        Http::Status => {
                            self.logging_in = false;
                            if !ok {
                                out.push(ServerEvent::Unavailable(format!("连接不到学习服务（HTTP {status}）")));
                            } else if v["local_solo_enabled"] == true {
                                self.logging_in = true;
                                let req = self.request("/api/auth/solo", HttpMethod::POST);
                                self.http(cx, req, Http::Solo);
                            } else if v["email_login_enabled"] == true {
                                self.awaiting_login = true;
                                let self_registration = v["allow_self_registration"] == true;
                                self.login_event = Some(self_registration);
                                out.push(ServerEvent::LoginRequired { self_registration });
                                self.login_event = None;
                            } else {
                                out.push(ServerEvent::Unavailable("这个服务器没有开启登录".into()));
                            }
                            continue;
                        }
                        Http::SendCode => {
                            out.push(ServerEvent::CodeSent(if ok && v["ok"] != false {
                                Ok(())
                            } else {
                                Err(v["message"].as_str().map(str::to_owned).unwrap_or_else(|| error_text(status, &body)))
                            }));
                            continue;
                        }
                        Http::Verify => {
                            match v["token"].as_str().filter(|_| ok && v["ok"] != false) {
                                Some(token) => {
                                    self.token = Some(token.to_owned());
                                    self.profile_id = v["user"]["id"].as_str().map(str::to_owned);
                                    self.awaiting_login = false;
                                    self.save_login();
                                    out.push(ServerEvent::LoggedIn);
                                    self.flush(cx);
                                }
                                None => out.push(ServerEvent::LoginFailed(
                                    v["message"].as_str().map(str::to_owned).unwrap_or_else(|| "验证码不正确或已过期".into()),
                                )),
                            }
                            continue;
                        }
                        Http::Me => {
                            self.logging_in = false;
                            match self.pending_token.take() {
                                Some(token) if ok => {
                                    self.token = Some(token);
                                    if let Some(id) = v["user"]["id"].as_str() {
                                        self.profile_id = Some(id.to_owned());
                                    }
                                    out.push(ServerEvent::LoggedIn);
                                    self.flush(cx);
                                }
                                // Expired or revoked: sign in again when needed.
                                _ if status == 401 || status == 403 => self.forget_login(cx),
                                // Offline: keep it and try again next launch.
                                _ => {}
                            }
                            continue;
                        }
                        Http::Logout => continue,
                        _ => {}
                    }
                    // A session that expired while in use: sign in again.
                    if status == 401 && self.email.is_some() && !matches!(purpose, Http::Probe) {
                        self.forget_login(cx);
                        self.awaiting_login = true;
                        out.push(ServerEvent::LoginRequired { self_registration: true });
                    }
                    if let Http::Probe = purpose {
                        if (200..500).contains(&status) {
                            self.ensure_socket(cx);
                        } else {
                            self.schedule_reconnect();
                        }
                        continue;
                    }
                    match purpose {
                        Http::Probe | Http::Status | Http::SendCode | Http::Verify | Http::Me | Http::Logout => {}
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
                        Http::Json { purpose } => out.push(ServerEvent::Json {
                            purpose,
                            result: if (200..300).contains(&status) {
                                Ok(serde_json::from_str(&body).unwrap_or(Value::Null))
                            } else {
                                Err(error_text(status, &body))
                            },
                        }),
                        Http::Upload { purpose } => out.push(ServerEvent::Uploaded {
                            purpose,
                            paths: if (200..300).contains(&status) {
                                serde_json::from_str::<Vec<String>>(&body).map_err(|e| e.to_string())
                            } else {
                                Err(error_text(status, &body))
                            },
                        }),
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
                        Http::Probe => self.schedule_reconnect(),
                        Http::Status => {
                            self.logging_in = false;
                            out.push(ServerEvent::Unavailable(format!("连接不到学习服务（{}）：{}", self.base, error.message)));
                        }
                        Http::SendCode => out.push(ServerEvent::CodeSent(Err(format!("发送验证码失败：{}", error.message)))),
                        Http::Verify => out.push(ServerEvent::LoginFailed(format!("验证失败：{}", error.message))),
                        // Offline at launch: keep the saved session; a 401 later signs out.
                        Http::Me => {
                            self.logging_in = false;
                            self.token = self.pending_token.take();
                        }
                        Http::Logout => {}
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
                        Http::Upload { purpose } => out.push(ServerEvent::Uploaded { purpose, paths: Err(error.message.clone()) }),
                        Http::Json { purpose } => out.push(ServerEvent::Json { purpose, result: Err(error.message.clone()) }),
                    }
                }
                NetworkResponse::WsOpened { socket_id } if *socket_id == self.socket => {
                    self.ws = Ws::Open;
                    self.backoff = 1.;
                    // Web: re-list lesson jobs on every connect (updates sent
                    // while the socket was down are not replayed).
                    if self.watched.is_some() {
                        self.poll_jobs(cx);
                    }
                    self.flush(cx);
                }
                NetworkResponse::WsClosed { socket_id } | NetworkResponse::WsError { socket_id, .. }
                    if *socket_id == self.socket =>
                {
                    self.ws = Ws::Closed;
                    // Calls already sent will never be answered on a new socket.
                    for id in std::mem::take(&mut self.sent).into_keys() {
                        if let Some(ev) = self.calls.remove(&id).and_then(|c| Self::failed(c, "与服务器的连接中断，请重试")) {
                            out.push(ev);
                        }
                    }
                    // Drop the dead socket from the network layer.
                    let _ = cx.net.ws_close(*socket_id);
                    self.schedule_reconnect();
                }
                NetworkResponse::WsMessage { socket_id, message: WsMessage::Text(text) } if *socket_id == self.socket => {
                    let Ok(msg) = serde_json::from_str::<Value>(text) else { continue };
                    if let Some(method) = msg["method"].as_str() {
                        let params = &msg["params"];
                        let turn_id = params["turn_id"].as_str().unwrap_or("").to_owned();
                        match method {
                            "skill/action/job/updated" => out.push(ServerEvent::Job(params["job"].clone())),
                            "projection/envelope" => {
                                let payload = &params["payload"];
                                match payload["type"].as_str() {
                                    Some("assistant_persisted") => {
                                        if let Some(text) = payload["data"]["text"].as_str().map(str::trim).filter(|t| !t.is_empty()) {
                                            out.push(ServerEvent::Turn { turn_id: turn_id.clone(), update: TurnUpdate::Reply(text.to_owned()) });
                                        }
                                        // Final lesson only (prefix parts are .part-NNN.).
                                        for path in payload["data"]["meta"]["media"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                                            let name = path.rsplit('/').next().unwrap_or(path);
                                            if name.ends_with(".octos-lesson.json") && !name.contains(".part-") {
                                                out.push(ServerEvent::Turn { turn_id: turn_id.clone(), update: TurnUpdate::Lesson(path.to_owned()) });
                                            }
                                        }
                                    }
                                    Some("turn_terminal") => {
                                        let outcome = payload["data"]["outcome"].as_str().unwrap_or("");
                                        let result = if outcome == "completed" {
                                            Ok(())
                                        } else {
                                            Err(payload["data"]["error"].as_str().or(payload["data"]["message"].as_str()).unwrap_or("回答没有完成").to_owned())
                                        };
                                        out.push(ServerEvent::Turn { turn_id, update: TurnUpdate::Done(result) });
                                    }
                                    _ => {}
                                }
                            }
                            "turn/error" => {
                                let message = params["message"].as_str().or(params["error"].as_str()).unwrap_or("回答没有完成").to_owned();
                                out.push(ServerEvent::Turn { turn_id, update: TurnUpdate::Done(Err(message)) });
                            }
                            _ => {}
                        }
                        continue;
                    }
                    let Some(id) = msg["id"].as_str() else { continue };
                    self.sent.remove(id);
                    let Some(call) = self.calls.remove(id) else { continue };
                    if let Call::JobList { session } = call {
                        // An error reply says nothing about the jobs: skip it.
                        if let Some(jobs) = msg["result"]["jobs"].as_array() {
                            out.push(ServerEvent::JobsListed { session, jobs: jobs.clone() });
                        }
                        continue;
                    }
                    if let Call::Admit { turn_id } = call {
                        let result = match msg.get("error") {
                            Some(e) if !e.is_null() => Err(e["message"].as_str().unwrap_or("语音识别失败").to_owned()),
                            _ => match msg["result"]["status"].as_str() {
                                Some("speech") => Ok(msg["result"]["transcript"].as_str().map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())),
                                _ => Ok(None),
                            },
                        };
                        out.push(ServerEvent::Admitted { turn_id, result });
                        continue;
                    }
                    if let Call::Result { purpose } = call {
                        let result = match msg.get("error") {
                            Some(e) if !e.is_null() => Err(e["message"].as_str().unwrap_or("请求失败").to_owned()),
                            _ => {
                                let failed = msg["result"]["results"].as_array().into_iter().flatten().find(|r| r["success"] == false);
                                match failed {
                                    Some(r) => Err(r["output"].as_str().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("选区辅助内容生成失败，请重试").to_owned()),
                                    None if msg["result"]["ok"] == false => Err("选区辅助内容生成失败，请重试".to_owned()),
                                    None => Ok(msg["result"].clone()),
                                }
                            }
                        };
                        out.push(ServerEvent::ActionResult { purpose, result });
                        continue;
                    }
                    if let Call::Metadata { purpose } = call {
                        let result = match msg.get("error") {
                            Some(e) if !e.is_null() => Err(e["message"].as_str().unwrap_or("请求失败").to_owned()),
                            _ => {
                                let results = msg["result"]["results"].as_array().cloned().unwrap_or_default();
                                if msg["result"]["ok"] == false || results.iter().any(|r| r["success"] == false) {
                                    Err("暂时无法识别选区内容".to_owned())
                                } else {
                                    results
                                        .iter()
                                        .find(|r| r["success"] == true && !r["structured_metadata"].is_null())
                                        .map(|r| r["structured_metadata"].clone())
                                        .ok_or("选区识别没有返回可用结果".to_owned())
                                }
                            }
                        };
                        out.push(ServerEvent::Metadata { purpose, result });
                        continue;
                    }
                    if let Call::Turn { turn_id } = call {
                        let result = match msg.get("error") {
                            Some(e) if !e.is_null() => Err(e["message"].as_str().unwrap_or("提问发送失败").to_owned()),
                            _ if msg["result"]["accepted"] == false => Err("提问没有被接受".to_owned()),
                            _ => Ok(()),
                        };
                        out.push(ServerEvent::Turn { turn_id, update: TurnUpdate::Accepted(result) });
                        continue;
                    }
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

#[cfg(test)]
mod tests {
    #[test]
    fn debug_lines_mask_tokens() {
        assert_eq!(super::redact(r#"http 200 {"token":"abc123","user":{"id":"x"}}"#), r#"http 200 {"token":"***","user":{"id":"x"}}"#);
        assert_eq!(super::redact("no secrets"), "no secrets");
    }
    #[test]
    fn uuid_is_v4_and_random() {
        let (a, b) = (super::uuid(), super::uuid());
        assert_eq!(a.len(), 36);
        assert_eq!(&a[14..15], "4");
        assert!(matches!(&a[19..20], "8" | "9" | "a" | "b"));
        assert_ne!(a[..8], b[..8]);
    }
}
