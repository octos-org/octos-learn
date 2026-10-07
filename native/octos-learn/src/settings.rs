//! Native settings page (web src/settings/settings-page.tsx): header,
//! grouped sidebar with search, and the Profile / Voice / LLM / API Keys
//! tabs backed by `/api/my/profile` (secrets arrive masked; sending a masked
//! value back keeps the stored secret, as the web does).
//! DIFF: no dark theme toggle; Developer Options only stores its switches
//! (the web debug overlays are not part of the native app).
use crate::{board_view, server, App};
use makepad_widgets::*;
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Tab {
    #[default]
    Profile,
    Voice,
    Companion,
    Llm,
    ApiKeys,
    Authentication,
    Developer,
}

struct TabDef {
    tab: Tab,
    label: &'static str,
    icon: &'static str,
    group: &'static str,
    admin: bool,
}

const TABS: [TabDef; 7] = [
    TabDef { tab: Tab::Profile, label: "Profile", icon: ICON_USER, group: "PERSONAL", admin: false },
    TabDef { tab: Tab::Voice, label: "Voice", icon: ICON_VOLUME, group: "PERSONAL", admin: false },
    TabDef { tab: Tab::Companion, label: "Learning Companion", icon: ICON_CAP, group: "PERSONAL", admin: false },
    TabDef { tab: Tab::Llm, label: "LLM", icon: ICON_CPU, group: "LEARNING", admin: false },
    TabDef { tab: Tab::ApiKeys, label: "API Keys", icon: ICON_KEY, group: "LEARNING", admin: false },
    TabDef { tab: Tab::Authentication, label: "Authentication", icon: ICON_SHIELD, group: "ACCESS", admin: true },
    TabDef { tab: Tab::Developer, label: "Developer Options", icon: ICON_BUG, group: "DEVELOPER", admin: false },
];

const ICON_USER: &str = include_str!("../assets/icons/user.svg");
const ICON_VOLUME: &str = include_str!("../assets/icons/volume-2.svg");
const ICON_CAP: &str = include_str!("../assets/icons/graduation-cap.svg");
const ICON_CPU: &str = include_str!("../assets/icons/cpu.svg");
const ICON_KEY: &str = include_str!("../assets/icons/key-round.svg");
const ICON_SHIELD: &str = include_str!("../assets/icons/shield-check.svg");
const ICON_BUG: &str = include_str!("../assets/icons/bug.svg");
const ICON_ACTIVITY: &str = include_str!("../assets/icons/activity.svg");
const ICON_SAVE: &str = include_str!("../assets/icons/save.svg");
const ICON_PLUG: &str = include_str!("../assets/icons/plug.svg");
const ICON_PLUS: &str = include_str!("../assets/icons/plus.svg");
const ICON_TRASH: &str = include_str!("../assets/icons/trash-2.svg");
const ICON_PLAY: &str = include_str!("../assets/icons/play.svg");
const ICON_SQUARE: &str = include_str!("../assets/icons/square.svg");
const ICON_RESTART: &str = include_str!("../assets/icons/rotate-ccw.svg");
const ICON_SHUFFLE: &str = include_str!("../assets/icons/shuffle.svg");
const ICON_SLIDERS: &str = include_str!("../assets/icons/sliders-horizontal.svg");
const ICON_FILE: &str = include_str!("../assets/icons/file-text.svg");
const ICON_SERVER: &str = include_str!("../assets/icons/server.svg");
const ICON_RADIO: &str = include_str!("../assets/icons/radio.svg");
const ICON_MAIL: &str = include_str!("../assets/icons/mail.svg");
const ICON_USER_PLUS: &str = include_str!("../assets/icons/user-plus.svg");
const ICON_SEND: &str = include_str!("../assets/icons/send.svg");
const ICON_LAYERS: &str = include_str!("../assets/icons/layers.svg");
const ICON_SPARKLES: &str = include_str!("../assets/icons/sparkles.svg");

/// Web llm-providers.ts LLM_PROVIDERS: (id, name, env key, presets).
pub struct Provider {
    pub id: &'static str,
    pub name: &'static str,
    pub env_key: &'static str,
    pub models: &'static [(&'static str, &'static str)],
    pub json_credential: bool,
}
pub const PROVIDERS: [Provider; 18] = [
    Provider { id: "openai", name: "OpenAI", env_key: "OPENAI_API_KEY", models: &[("gpt-5", "GPT-5"), ("gpt-5.3-codex", "GPT-5.3 Codex"), ("gpt-5.1-codex", "GPT-5.1 Codex"), ("gpt-4o", "GPT-4o"), ("gpt-4o-mini", "GPT-4o Mini")], json_credential: false },
    Provider { id: "anthropic", name: "Anthropic", env_key: "ANTHROPIC_API_KEY", models: &[("claude-sonnet-4-20250514", "Claude Sonnet 4"), ("claude-haiku-4-5", "Claude Haiku 4.5")], json_credential: false },
    Provider { id: "deepseek", name: "DeepSeek", env_key: "DEEPSEEK_API_KEY", models: &[("deepseek-v3.2", "DeepSeek V3.2"), ("deepseek-chat", "DeepSeek Chat"), ("deepseek-r1", "DeepSeek R1")], json_credential: false },
    Provider { id: "google", name: "Google Gemini", env_key: "GEMINI_API_KEY", models: &[("gemini-3.6-flash", "Gemini 3.6 Flash（推荐）"), ("gemini-3.1-pro-preview", "Gemini 3.1 Pro"), ("gemini-3-flash-preview", "Gemini 3 Flash")], json_credential: false },
    Provider { id: "vertex", name: "Google Vertex AI", env_key: "VERTEX_SA_JSON", models: &[("gemini-2.5-flash", "Gemini 2.5 Flash"), ("gemini-2.5-pro", "Gemini 2.5 Pro")], json_credential: true },
    Provider { id: "groq", name: "Groq", env_key: "GROQ_API_KEY", models: &[("llama-3.3-70b-versatile", "Llama 3.3 70B")], json_credential: false },
    Provider { id: "ollama", name: "Ollama (Local)", env_key: "", models: &[], json_credential: false },
    Provider { id: "dashscope", name: "DashScope", env_key: "DASHSCOPE_API_KEY", models: &[], json_credential: false },
    Provider { id: "nvidia", name: "NVIDIA", env_key: "NVIDIA_API_KEY", models: &[], json_credential: false },
    Provider { id: "minimax", name: "MiniMax", env_key: "MINIMAX_API_KEY", models: &[("MiniMax-M2.7", "MiniMax M2.7"), ("MiniMax-M2.5", "MiniMax M2.5")], json_credential: false },
    Provider { id: "zhipu", name: "Zhipu (GLM)", env_key: "ZHIPU_API_KEY", models: &[], json_credential: false },
    Provider { id: "zai", name: "Z.ai (GLM)", env_key: "ZAI_API_KEY", models: &[], json_credential: false },
    Provider { id: "moonshot", name: "Moonshot", env_key: "MOONSHOT_API_KEY", models: &[], json_credential: false },
    Provider { id: "perplexity", name: "Perplexity", env_key: "PERPLEXITY_API_KEY", models: &[], json_credential: false },
    Provider { id: "mistral", name: "Mistral", env_key: "MISTRAL_API_KEY", models: &[("mistral-large-2512", "Mistral Large")], json_credential: false },
    Provider { id: "openrouter", name: "OpenRouter", env_key: "OPENROUTER_API_KEY", models: &[], json_credential: false },
    Provider { id: "vllm", name: "vLLM", env_key: "VLLM_API_KEY", models: &[], json_credential: false },
    Provider { id: "__custom_family__", name: "Custom Provider", env_key: "", models: &[], json_credential: false },
];
fn providers() -> impl Iterator<Item = &'static Provider> {
    PROVIDERS.iter()
}
fn provider(id: &str) -> Option<&'static Provider> {
    providers().find(|p| p.id == id)
}
fn default_base_url(id: &str) -> &'static str {
    match id {
        "ollama" => "http://localhost:11434",
        "moonshot" => "https://api.moonshot.cn/v1",
        "vllm" => "http://localhost:8000",
        _ => "",
    }
}
fn shows_base_url(id: &str) -> bool {
    matches!(id, "ollama" | "vllm" | "moonshot" | "__custom_family__")
}
/// Web isLessonCapable (local build).
fn lesson_capable(family: &str) -> bool {
    matches!(family.trim().to_lowercase().as_str(), "google" | "gemini" | "vertex")
}

/// Web voice-tab ROUTES / ASR_LANGUAGES / VOICES.
const ROUTES: [(&str, &str, &str); 4] = [
    ("inherit", "平台提供 / 服务器默认", "未配置个人凭据时使用平台语音，受平台额度限制。"),
    ("auto", "Auto", "Cloud when credentials are set, else on-device."),
    ("local", "Local (on-device)", "Local ominix-api engine."),
    ("cloud", "Cloud (Volcano)", "Volcano Engine cloud TTS (requires App ID + token)."),
];
const ASR_LANGUAGES: [&str; 30] = [
    "Chinese", "English", "Cantonese", "Arabic", "German", "French", "Spanish", "Portuguese", "Indonesian", "Italian", "Korean", "Russian",
    "Thai", "Vietnamese", "Japanese", "Turkish", "Hindi", "Malay", "Dutch", "Swedish", "Danish", "Finnish", "Polish", "Czech", "Filipino",
    "Persian", "Greek", "Romanian", "Hungarian", "Macedonian",
];
const VOICES: [(&str, &str); 4] = [
    ("zh_female_xiaohe_uranus_bigtts", "小何"),
    ("zh_male_m191_uranus_bigtts", "云舟"),
    ("zh_male_taocheng_uranus_bigtts", "小天"),
    ("en_male_tim_uranus_bigtts", "Tim"),
];

/// Web api-keys-tab GROUPS (LLM provider keys come from PROVIDERS).
const KEY_GROUPS: [(&str, &str, &str, &[(&str, &str, &str)]); 2] = [
    ("Channels", "Credentials for messaging channels and the email tool.", ICON_RADIO, &[
        ("TELEGRAM_BOT_TOKEN", "Telegram Bot Token", "Bot token from @BotFather"),
        ("LARK_APP_ID", "Lark App ID", "Lark suite app ID"),
        ("LARK_APP_SECRET", "Lark App Secret", "Lark suite app secret"),
        ("FEISHU_APP_ID", "Feishu App ID", "Feishu channel app ID"),
        ("FEISHU_APP_SECRET", "Feishu App Secret", "Feishu channel app secret"),
        ("SMTP_PASSWORD", "SMTP Password", "Password for the email tool's SMTP account"),
    ]),
    ("Infrastructure", "Tokens for local infrastructure and tunnels.", ICON_SERVER, &[
        ("NGROK_AUTHTOKEN", "ngrok Authtoken", "Authtoken for ngrok tunnels"),
    ]),
];
fn key_fields() -> Vec<(String, String, String)> {
    providers()
        .filter(|p| !p.env_key.is_empty() && !p.json_credential)
        .map(|p| (p.env_key.to_owned(), p.name.to_owned(), format!("API key for {} models", p.name)))
        .chain(KEY_GROUPS.iter().flat_map(|g| g.3.iter().map(|(k, n, d)| ((*k).to_owned(), (*n).to_owned(), (*d).to_owned()))))
        .collect()
}

#[derive(Default)]
pub struct SettingsState {
    pub open: bool,
    pub tab: Tab,
    query: String,
    pub profile: Option<Value>,
    nav: Vec<(WidgetRef, Tab)>,
    /// Named controls of the current tab.
    controls: Vec<(String, WidgetRef)>,
    /// LLM form (rebuilt when the provider or fallbacks change).
    llm: Value,
    /// Voice form (route switches show the cloud card).
    voice: Value,
    /// Profile env editor rows (key, new value input shown).
    env_rows: Vec<String>,
    /// (tab, message, ok) shown next to the tab's save button.
    message: Option<(Tab, String, bool)>,
    /// What is in flight: "save" | "test" | "gateway" | "tts".
    pub busy: Option<&'static str>,
    /// The tab that issued the in-flight request.
    busy_tab: Tab,
    loading: bool,
    /// Authentication tab: SMTP form, registration mode, allowed emails.
    auth: Value,
    /// Developer tab (web useDebugSettings), saved in the data directory.
    debug: Value,
}

/// A page being built: DSL text plus the values to apply afterwards.
#[derive(Default)]
struct Page {
    names: Vec<String>,
    icons: Vec<(String, &'static str)>,
    texts: Vec<(String, String)>,
    drops: Vec<(String, Vec<String>, usize)>,
    toggles: Vec<(String, bool)>,
    counter: usize,
}

fn esc(text: &str) -> String {
    text.replace(['"', '\\'], " ").replace('\n', " ")
}

impl Page {
    fn icon_name(&mut self, icon: &'static str) -> String {
        self.counter += 1;
        let name = format!("s_icon_{}", self.counter);
        self.icons.push((name.clone(), icon));
        name
    }
    /// A 40px rounded icon tile (web .h-10.w-10.rounded-xl.bg-accent/10).
    fn tile(&mut self, icon: &'static str) -> String {
        let name = self.icon_name(icon);
        format!("RoundedView{{width:40 height:40 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#e9e8e4 border_radius:6}}
            {name} := Button{{width:40 height:40 text:\"\" margin:0 padding:0 icon_walk:Walk{{width:20 height:20}} draw_icon +: {{color:#2b2b29}}
                draw_bg +: {{color:#0000 color_hover:#0000 color_down:#0000 border_size:0 border_color:#0000}}}}}}")
    }
    fn label(&self, text: &str, size: f64, color: &str, bold: bool) -> String {
        let style = if bold { "theme.font_bold" } else { "theme.font_regular" };
        format!(
            "Label{{width:Fill padding:0 text:\"{}\" draw_text.wrap:Words draw_text.text_style: {style}{{font_size:{:.2} line_spacing:1.3}} draw_text.color:{color}}}",
            esc(text),
            size * 0.75
        )
    }
    /// Web .glass-section card: header (tile, title, description) + body.
    fn card(&mut self, icon: &'static str, title: &str, desc: &str, body: &str) -> String {
        let tile = self.tile(icon);
        format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:24 margin:Inset{{bottom:24}} draw_bg +: {{color:#fffffe border_radius:8 border_size:0.5 border_color:#d4d3cf}}
                View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:0.5}} margin:Inset{{bottom:22}}
                    {tile}
                    View{{width:Fill height:Fit flow:Down spacing:2
                        {}
                        {}
                    }}
                }}
                {body}
            }}",
            self.label(title, 14., "#1c1c1b", true),
            self.label(desc, 12., "#6b6b67", false)
        )
    }
    fn field_label(&self, text: &str) -> String {
        format!("View{{width:Fill height:Fit margin:Inset{{top:4 bottom:8}} {}}}", self.label(text, 12., "#4a4a47", false))
    }
    fn readonly(&self, text: &str, mono: bool) -> String {
        let style = if mono { "theme.font_code" } else { "theme.font_regular" };
        format!(
            "RoundedView{{width:Fill height:44 align:Align{{y:0.5}} padding:Inset{{left:16 right:16}} margin:Inset{{bottom:16}} draw_bg +: {{color:#dedddb border_radius:6}}
                Label{{width:Fill padding:0 text:\"{}\" draw_text.text_style: {style}{{font_size:10.5}} draw_text.color:#5f5f5b}}}}",
            esc(text)
        )
    }
    fn input(&mut self, name: &str, value: &str, placeholder: &str, password: bool, multiline: bool) -> String {
        self.names.push(name.into());
        self.texts.push((name.into(), value.into()));
        let height = if multiline { "height:Fit" } else { "height:Fit" };
        let extra = if password { "is_password:true" } else { "" };
        let wrap = if multiline { "draw_text.wrap:Words" } else { "" };
        format!(
            "{name} := TextInput{{width:Fill {height} {extra} {wrap} padding:Inset{{left:16 right:16 top:13 bottom:13}} margin:Inset{{bottom:16}} empty_text:\"{}\"
                draw_bg +: {{color:#eeedea color_hover:#eeedea color_focus:#eeedea color_down:#eeedea color_empty:#eeedea border_radius:6 border_size:0
                    border_color:#0000 border_color_hover:#0000 border_color_focus:#0000 border_color_down:#0000 border_color_empty:#0000}}
                draw_text +: {{color:#1c1c1b color_hover:#1c1c1b color_focus:#1c1c1b color_down:#1c1c1b color_empty:#9a9a95 color_empty_hover:#9a9a95 color_empty_focus:#9a9a95 text_style.font_size:10.5}}
                draw_cursor +: {{color:#1c1c1b}}}}",
            esc(placeholder)
        )
    }
    fn dropdown(&mut self, name: &str, labels: Vec<String>, selected: usize) -> String {
        self.names.push(name.into());
        self.drops.push((name.into(), labels, selected));
        format!(
            "{name} := DropDown{{width:Fill height:44 margin:Inset{{bottom:16}} padding:Inset{{left:16 right:30 top:13 bottom:13}}
                draw_text +: {{color:#1c1c1b color_hover:#1c1c1b color_focus:#1c1c1b color_down:#1c1c1b text_style.font_size:10.5 ink_centered:false}}
                draw_bg +: {{color:#eeedea color_hover:#e6e5e2 color_focus:#e6e5e2 color_down:#e0dfdb border_radius:6 border_size:0
                    border_color:#0000 border_color_hover:#0000 border_color_focus:#0000 border_color_down:#0000 border_color_2:#0000 border_color_2_hover:#0000 border_color_2_focus:#0000 border_color_2_down:#0000}}}}"
        )
    }
    /// Web toggle row: title + description, switch on the right.
    fn toggle_row(&mut self, name: &str, title: &str, desc: &str, on: bool) -> String {
        self.names.push(name.into());
        self.toggles.push((name.into(), on));
        format!(
            "RoundedView{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} padding:Inset{{left:16 right:16 top:14 bottom:14}} margin:Inset{{bottom:16}} draw_bg +: {{color:#dedddb border_radius:6}}
                View{{width:Fill height:Fit flow:Down spacing:3
                    {}
                    {}
                }}
                {name} := Toggle{{text:\"\" width:44 height:26 padding:0 margin:0 draw_bg +: {{size:24 border_radius:5 border_size:0
                    color:#d4d3cf color_hover:#cbcac6 color_focus:#d4d3cf color_down:#c4c3bf color_active:#1b1b1a color_disabled:#e4e3e0
                    border_color:#0000 border_color_hover:#0000 border_color_focus:#0000 border_color_down:#0000 border_color_active:#0000 border_color_disabled:#0000
                    mark_color:#ffffff mark_color_hover:#ffffff mark_color_down:#ffffff mark_color_active:#ffffff mark_color_active_hover:#ffffff}}}}
            }}",
            self.label(title, 14., "#1c1c1b", false),
            self.label(desc, 12., "#5f5f5b", false)
        )
    }
    /// Buttons: "primary" (dark), "outline", "green", "red", "amber", "dashed".
    fn button(&mut self, name: &str, text: &str, icon: Option<&'static str>, kind: &str, enabled: bool) -> String {
        self.names.push(name.into());
        if let Some(icon) = icon {
            self.icons.push((name.into(), icon));
        }
        let (bg, hover, fg, border) = match kind {
            "primary" => ("#1b1b1a", "#333331", "#ffffff", "#0000"),
            "green" => ("#16a34a", "#15803d", "#ffffff", "#0000"),
            "red" => ("#ef4444", "#dc2626", "#ffffff", "#0000"),
            "amber" => ("#f59e0b", "#d97706", "#ffffff", "#0000"),
            "dashed" => ("#fffffe", "#f5f4f1", "#5f5f5b", "#d4d3cf"),
            _ => ("#fffffe", "#f5f4f1", "#5f5f5b", "#d4d3cf"),
        };
        let alpha = if enabled { "" } else { "66" };
        let width = if kind == "dashed" { "Fill" } else { "Fit" };
        let align = if kind == "dashed" { "align:Align{x:0.5 y:0.5}" } else { "" };
        format!(
            "{name} := Button{{width:{width} height:40 text:\"{}\" {align} spacing:8 margin:0 padding:Inset{{left:18 right:18}}
                icon_walk:Walk{{width:14 height:14}} draw_icon +: {{color:{fg}{alpha}}}
                draw_text.color:{fg}{alpha} draw_text.text_style.font_size:10.5
                draw_bg +: {{color:{bg}{alpha} color_hover:{} color_down:{} border_radius:6 border_size:{} border_color:{border}}}}}",
            esc(text),
            if enabled { hover } else { bg },
            if enabled { hover } else { bg },
            if border == "#0000" { "0" } else { "0.5" }
        )
    }
    fn note(&self, text: &str, color: &str) -> String {
        format!("View{{width:Fill height:Fit margin:Inset{{bottom:12}} {}}}", self.label(text, 12., color, false))
    }
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or("").to_owned()
}
fn optional_int(text: &str) -> Value {
    text.trim().parse::<i64>().map(Value::from).unwrap_or(Value::Null)
}
fn created_label(iso: &str) -> String {
    const MONTHS: [&str; 12] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let date = iso.get(..10).unwrap_or("");
    let mut parts = date.split('-');
    match (parts.next().and_then(|y| y.parse::<u32>().ok()), parts.next().and_then(|m| m.parse::<usize>().ok()), parts.next().and_then(|d| d.parse::<u32>().ok())) {
        (Some(y), Some(m), Some(d)) if (1..=12).contains(&m) => format!("{} {d}, {y}", MONTHS[m - 1]),
        _ => iso.to_owned(),
    }
}

impl App {
    /// Open the settings page (web /settings?tab=…).
    pub(crate) fn open_settings(&mut self, cx: &mut Cx, tab: Tab) {
        self.settings.open = true;
        self.settings.tab = tab;
        self.settings.message = None;
        self.settings.loading = self.settings.profile.is_none();
        self.ui.widget(cx, ids!(settings_page)).set_visible(cx, true);
        self.server.ensure_login(cx);
        if self.server.logged_in() {
            self.server.get_profile(cx);
        }
        self.reset_settings_forms();
        self.load_debug_settings();
        if tab == Tab::Authentication && self.server.logged_in() {
            self.load_auth(cx);
        }
        self.rebuild_settings(cx);
    }
    pub(crate) fn close_settings(&mut self, cx: &mut Cx) {
        self.settings.open = false;
        self.ui.widget(cx, ids!(settings_page)).set_visible(cx, false);
        self.ui.redraw(cx);
    }
    /// Reset the editable forms from the loaded profile.
    fn reset_settings_forms(&mut self) {
        let Some(p) = self.settings.profile.clone() else { return };
        let c = &p["config"];
        let primary = &c["llm"]["primary"];
        let family = s(&primary["family_id"]);
        let known = provider(&family).is_some();
        let model = s(&primary["model_id"]);
        let presets = provider(&family).map(|p| p.models).unwrap_or(&[]);
        let preset = presets.iter().any(|(id, _)| *id == model);
        self.settings.llm = json!({
            "family_id": if known { family.clone() } else if family.is_empty() { String::new() } else { "__custom_family__".into() },
            "custom_family_id": if known { String::new() } else { family.clone() },
            "model_id": if preset || presets.is_empty() { model.clone() } else { "__custom__".into() },
            "custom_model_id": if preset { String::new() } else { model.clone() },
            "base_url": s(&primary["route"]["base_url"]),
            "sa_json": "",
            "fallbacks": c["llm"]["fallbacks"].as_array().cloned().unwrap_or_default().iter().map(|f| json!({"family_id": s(&f["family_id"]), "model_id": s(&f["model_id"])})).collect::<Vec<_>>(),
            "adaptive": c["adaptive_routing"]["enabled"].as_bool().unwrap_or(false),
            "system_prompt": s(&c["gateway"]["system_prompt"]),
            "max_output_tokens": c["gateway"]["max_output_tokens"].as_i64().map(|v| v.to_string()).unwrap_or_default(),
            "max_history": c["gateway"]["max_history"].as_i64().map(|v| v.to_string()).unwrap_or_default(),
            "max_iterations": c["gateway"]["max_iterations"].as_i64().map(|v| v.to_string()).unwrap_or_default(),
            "max_concurrent_sessions": c["gateway"]["max_concurrent_sessions"].as_i64().map(|v| v.to_string()).unwrap_or_default(),
            "browser_timeout_secs": c["gateway"]["browser_timeout_secs"].as_i64().map(|v| v.to_string()).unwrap_or_default(),
        });
        let cloud = &c["tts_cloud"];
        self.settings.voice = json!({
            "route": c["tts_provider"].as_str().unwrap_or("inherit"),
            "asr": c["asr_language"].as_str().unwrap_or("inherit"),
            "appid": s(&cloud["appid"]),
            "voice": s(&cloud["voice"]),
            "cluster": s(&cloud["cluster"]),
            "encoding": s(&cloud["encoding"]),
            "token": "",
            "advanced": false,
            "had_cloud": !cloud.is_null(),
            "edited": false,
        });
        self.settings.env_rows = c["env_vars"].as_object().map(|m| m.keys().cloned().collect()).unwrap_or_default();
    }
    /// Sidebar (grouped tabs filtered by the search box) and the tab body.
    pub(crate) fn rebuild_settings(&mut self, cx: &mut Cx) {
        if !self.settings.open {
            return;
        }
        // Sidebar.
        let query = self.settings.query.to_lowercase();
        let mut nav = Vec::new();
        let mut items: Vec<WidgetRef> = Vec::new();
        let mut group = "";
        for def in TABS.iter().filter(|d| query.is_empty() || d.label.to_lowercase().contains(&query) || d.group.to_lowercase().contains(&query)) {
            if def.group != group {
                group = def.group;
                if let Ok(w) = board_view::widget(cx, &format!(
                    "View{{width:Fill height:Fit padding:Inset{{left:8 top:{} bottom:8}} Label{{width:Fit padding:0 text:\"{group}\" draw_text.text_style: theme.font_bold{{font_size:7.5}} draw_text.color:#6b6b67}}}}",
                    if items.is_empty() { 4 } else { 16 }
                )) {
                    items.push(w);
                }
            }
            let active = def.tab == self.settings.tab;
            let (bg, border) = if active { ("#d9d8d4", "#2b2b29") } else { ("#0000", "#0000") };
            let admin = if def.admin {
                "RoundedView{width:Fit height:Fit padding:Inset{left:8 right:8 top:3 bottom:3} draw_bg +: {color:#d4d3cf border_radius:8} Label{width:Fit padding:0 text:\"ADMIN\" draw_text.text_style.font_size:6.75 draw_text.color:#3b3b39}}"
            } else {
                ""
            };
            let code = format!(
                "View{{width:Fill height:Fit flow:Overlay margin:Inset{{bottom:4}}
                    RoundedView{{width:Fill height:46 draw_bg +: {{color:{bg} border_radius:6 border_size:{} border_color:#bdbcb8}}}}
                    SolidView{{width:3 height:46 draw_bg.color:{border}}}
                    View{{width:Fill height:46 flow:Right align:Align{{y:0.5}} padding:Inset{{left:14 right:10}} spacing:8
                        nav_icon := Button{{width:18 height:18 text:\"\" margin:0 padding:0 icon_walk:Walk{{width:15 height:15}} draw_icon +: {{color:#3b3b39}} draw_bg +: {{color:#0000 color_hover:#0000 color_down:#0000 border_size:0 border_color:#0000}}}}
                        Label{{width:Fill padding:0 text:\"{}\" draw_text.text_style: theme.font_regular{{font_size:10.5}} draw_text.color:#2b2b29}}
                        {admin}
                    }}
                    nav_hit := Button{{width:Fill height:46 text:\"\" margin:0 draw_bg +: {{color:#0000 color_hover:#0000000a color_down:#00000014 border_radius:6 border_size:0 border_color:#0000}}}}
                }}",
                if active { "0.5" } else { "0" },
                def.label
            );
            if let Ok(w) = board_view::widget(cx, &code) {
                if let Some(mut b) = w.widget(cx, ids!(nav_icon)).borrow_mut::<Button>() {
                    b.draw_icon.load_from_str(def.icon);
                }
                nav.push((w.widget(cx, ids!(nav_hit)), def.tab));
                items.push(w);
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(settings_nav)), items);
        self.settings.nav = nav;
        // Body.
        let mut page = Page::default();
        let body = match (&self.settings.profile, self.settings.tab) {
            (_, Tab::Companion) => self.companion_tab(&mut page),
            (_, Tab::Authentication) => self.auth_tab(&mut page),
            (_, Tab::Developer) => self.developer_tab(&mut page),
            (None, _) => page.note(if self.settings.loading { "正在读取设置…" } else { "Failed to load profile." }, "#6b6b67"),
            (Some(_), Tab::Profile) => self.profile_tab(&mut page),
            (Some(_), Tab::Llm) => self.llm_tab(&mut page),
            (Some(_), Tab::ApiKeys) => self.keys_tab(&mut page),
            (Some(_), Tab::Voice) => self.voice_tab(&mut page),
        };
        let code = format!("View{{width:Fill height:Fit flow:Down {body}}}");
        let Ok(w) = board_view::widget(cx, &code) else {
            self.error = "设置页生成失败".into();
            return;
        };
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(settings_body)), vec![w.clone()]);
        for (name, icon) in &page.icons {
            if let Some(mut b) = w.widget(cx, &[LiveId::from_str(name)]).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(icon);
            }
        }
        for (name, text) in &page.texts {
            w.widget(cx, &[LiveId::from_str(name)]).as_text_input().set_text(cx, text);
        }
        for (name, labels, selected) in &page.drops {
            let d = w.widget(cx, &[LiveId::from_str(name)]).as_drop_down();
            d.set_labels(cx, labels.clone());
            d.set_selected_item(cx, *selected);
        }
        for (name, on) in &page.toggles {
            w.widget(cx, &[LiveId::from_str(name)]).as_check_box().set_active(cx, *on, Animate::No);
        }
        self.settings.controls = page.names.iter().map(|n| (n.clone(), w.widget(cx, &[LiveId::from_str(n)]))).collect();
        for (id, _, _, png) in SKINS {
            let key = id.replace('-', "_");
            match png {
                Some(bytes) => {
                    if let Some(img) = self.control(&format!("skin_png_{key}")) {
                        let _ = img.as_image().load_png_from_data(cx, bytes);
                    }
                }
                None => {
                    if let Some(w) = self.control(&format!("skin_svg_{key}")) {
                        if let Some(mut svg) = w.borrow_mut::<Svg>() {
                            svg.draw_svg.load_from_str(&avatar_svg(id));
                        }
                    }
                }
            }
        }
        self.ui.redraw(cx);
    }
    fn settings_message(&self, page: &Page, tab: Tab) -> String {
        match &self.settings.message {
            Some((t, m, ok)) if *t == tab => format!(
                "View{{width:Fill height:Fit margin:Inset{{left:12}} {}}}",
                page.label(m, 12., if *ok { "#16a34a" } else { "#dc2626" }, false)
            ),
            _ => String::new(),
        }
    }
    fn profile_tab(&mut self, page: &mut Page) -> String {
        let p = self.settings.profile.clone().unwrap_or_default();
        let mut info = String::new();
        info.push_str(&page.field_label("Profile ID"));
        info.push_str(&page.readonly(&s(&p["id"]), true));
        info.push_str(&page.field_label("Display Name"));
        info.push_str(&page.input("s_name", &s(&p["name"]), "Enter display name", false, false));
        info.push_str(&page.toggle_row("s_autostart", "Auto-start Gateway", "Automatically start gateway when server starts", p["enabled"].as_bool().unwrap_or(false)));
        info.push_str(&page.toggle_row("s_admin", "Admin Mode", "Admin-only tools, restricted shell/file/web access", p["config"]["admin_mode"].as_bool().unwrap_or(false)));
        info.push_str(&page.field_label("Created"));
        info.push_str(&page.readonly(&created_label(&s(&p["created_at"])), false));
        let save = page.button("s_profile_save", if self.settings.busy == Some("save") { "Saving…" } else { "Save Changes" }, Some(ICON_SAVE), "primary", self.settings.busy.is_none());
        info.push_str(&format!("View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} {save} {}}}", self.settings_message(page, Tab::Profile)));
        let mut out = page.card(ICON_USER, "Profile Information", "Manage your profile details", &info);
        // Gateway status.
        let running = p["status"]["running"].as_bool().unwrap_or(false);
        let mut gw = format!(
            "RoundedView{{width:Fill height:40 flow:Right align:Align{{y:0.5}} padding:Inset{{left:16 right:16}} margin:Inset{{bottom:20}} draw_bg +: {{color:#dedddb border_radius:6}}
                Label{{width:Fill padding:0 text:\"Status\" draw_text.text_style.font_size:9 draw_text.color:#5f5f5b}}
                Label{{width:Fit padding:0 text:\"{}\" draw_text.text_style.font_size:9 draw_text.color:{}}}
            }}",
            if running { "Running" } else { "Stopped" },
            if running { "#16a34a" } else { "#8a8a85" }
        );
        let idle = self.settings.busy.is_none();
        let start = page.button("s_gw_start", "Start", Some(ICON_PLAY), "green", !running && idle);
        let stop = page.button("s_gw_stop", "Stop", Some(ICON_SQUARE), "red", running && idle);
        let restart = page.button("s_gw_restart", "Restart", Some(ICON_RESTART), "amber", running && idle);
        gw.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:12 {start} {stop} {restart}}}"));
        out.push_str(&page.card(ICON_ACTIVITY, "Gateway Status", "Runtime status of the gateway process", &gw));
        // Environment variables (web profile-tab env editor).
        let env = p["config"]["env_vars"].as_object().cloned().unwrap_or_default();
        let mut rows = String::new();
        if self.settings.env_rows.is_empty() {
            rows.push_str(&page.note("No environment variables configured", "#6b6b67"));
        }
        for (i, key) in self.settings.env_rows.clone().iter().enumerate() {
            let value = env.get(key).and_then(Value::as_str).unwrap_or("");
            let key_input = page.input(&format!("s_env_key_{i}"), key, "VARIABLE_NAME", false, false);
            let value_input = page.input(
                &format!("s_env_val_{i}"),
                "",
                if value.is_empty() { "Enter value" } else { "Enter new value (leave empty to keep current)" },
                true,
                false,
            );
            let delete = page.button(&format!("s_env_del_{i}"), "", Some(ICON_TRASH), "outline", true);
            rows.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:8 View{{width:220 height:Fit {key_input}}} View{{width:Fill height:Fit {value_input}}} View{{width:Fit height:Fit {delete}}}}}"));
        }
        let add = page.button("s_env_add", "Add Variable", Some(ICON_PLUS), "outline", true);
        let save_env = page.button("s_env_save", "Save Variables", Some(ICON_SAVE), "primary", idle);
        rows.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:12 {add} {save_env}}}"));
        out.push_str(&page.card(ICON_KEY, "Environment Variables", "Secret keys and configuration values", &rows));
        out
    }
    fn llm_tab(&mut self, page: &mut Page) -> String {
        let f = self.settings.llm.clone();
        let family = s(&f["family_id"]);
        let custom = family == "__custom_family__";
        let effective = if custom { s(&f["custom_family_id"]) } else { family.clone() };
        let prov = provider(&family);
        let mut body = String::new();
        body.push_str(&page.field_label("Provider"));
        let mut labels = vec!["Select a provider...".to_owned()];
        labels.extend(providers().map(|p| p.name.to_owned()));
        let selected = providers().position(|p| p.id == family).map_or(0, |i| i + 1);
        body.push_str(&page.dropdown("s_llm_provider", labels, selected));
        let mut status = vec![if lesson_capable(&effective) { "可用于课程生成" } else { "暂不支持课程生成" }.to_owned()];
        if !effective.is_empty() && !lesson_capable(&effective) {
            status.push("当前模型平台暂不支持生成课程，请选择 Gemini。原设置会保留，直到你保存新的选择。".into());
        }
        let model_id = s(&f["model_id"]);
        let effective_model = if model_id == "__custom__" || prov.is_none_or(|p| p.models.is_empty()) { s(&f["custom_model_id"]) } else { model_id.clone() };
        if matches!(effective.as_str(), "google" | "gemini") && effective_model != "gemini-3.6-flash" {
            status.push("课程已针对 Gemini 3.6 Flash 调优，推荐选择该模型".into());
        }
        for line in status {
            body.push_str(&page.note(&line, "#6b6b67"));
        }
        if custom {
            body.push_str(&page.field_label("Custom Provider ID"));
            body.push_str(&page.input("s_llm_custom_family", &s(&f["custom_family_id"]), "e.g. my-provider", false, false));
        }
        if !family.is_empty() {
            body.push_str(&page.field_label("Model"));
            match prov.filter(|p| !p.models.is_empty()) {
                Some(p) => {
                    let mut labels: Vec<String> = p.models.iter().map(|(_, n)| (*n).to_owned()).collect();
                    labels.push("Custom model...".into());
                    let sel = p.models.iter().position(|(id, _)| *id == model_id).unwrap_or(p.models.len());
                    body.push_str(&page.dropdown("s_llm_model", labels, sel));
                    if sel == p.models.len() {
                        body.push_str(&page.input("s_llm_custom_model", &s(&f["custom_model_id"]), "e.g. my-model-v2", false, false));
                    }
                }
                None => body.push_str(&page.input("s_llm_custom_model", &s(&f["custom_model_id"]), "e.g. my-model-v2", false, false)),
            }
        }
        if prov.is_some_and(|p| p.json_credential) {
            body.push_str(&page.field_label("Service Account JSON"));
            body.push_str(&page.input("s_llm_sa_json", "", "Paste the service account JSON (leave empty to keep current)", true, true));
        }
        if shows_base_url(&family) {
            body.push_str(&page.field_label("Base URL"));
            let base = s(&f["base_url"]);
            body.push_str(&page.input("s_llm_base_url", &base, default_base_url(&family), false, false));
        }
        if let Some(p) = prov.filter(|p| !p.env_key.is_empty() && !p.json_credential) {
            let configured = self.settings.profile.as_ref().and_then(|pr| pr["config"]["env_vars"][p.env_key].as_str()).is_some_and(|v| !v.is_empty());
            let line = if configured {
                format!("✓ {} is configured in API Keys.", p.env_key)
            } else {
                format!("{} is not set. Add it in API Keys.", p.env_key)
            };
            body.push_str(&format!(
                "RoundedView{{width:Fill height:40 align:Align{{y:0.5}} padding:Inset{{left:16 right:16}} margin:Inset{{bottom:20}} draw_bg +: {{color:#dedddb border_radius:6}} {}}}",
                page.label(&line, 12., if configured { "#2b2b29" } else { "#b45309" }, false)
            ));
        }
        let test = page.button("s_llm_test", if self.settings.busy == Some("test") { "Testing…" } else { "Test Connection" }, Some(ICON_PLUG), "outline", self.settings.busy.is_none() && !family.is_empty());
        let test_message = match &self.settings.message {
            Some((Tab::Llm, m, ok)) if self.settings.busy_tab == Tab::Llm && m.starts_with("[test]") => format!(
                "View{{width:Fill height:Fit margin:Inset{{left:12}} {}}}",
                page.label(&m[6..], 12., if *ok { "#16a34a" } else { "#dc2626" }, false)
            ),
            _ => String::new(),
        };
        body.push_str(&format!("View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} {test} {test_message}}}"));
        let mut out = page.card(ICON_CPU, "LLM Configuration", "Select a provider and model for this profile", &body);
        // Fallbacks.
        let mut fb = String::new();
        let fallbacks = f["fallbacks"].as_array().cloned().unwrap_or_default();
        if fallbacks.is_empty() {
            fb.push_str(&page.note("No fallbacks configured. Add one below.", "#6b6b67"));
        }
        for (i, row) in fallbacks.iter().enumerate() {
            let mut labels = vec!["Select provider...".to_owned()];
            labels.extend(providers().filter(|p| p.id != "__custom_family__").map(|p| p.name.to_owned()));
            let sel = providers().filter(|p| p.id != "__custom_family__").position(|p| p.id == s(&row["family_id"])).map_or(0, |i| i + 1);
            let drop = page.dropdown(&format!("s_fb_provider_{i}"), labels, sel);
            let model = page.input(&format!("s_fb_model_{i}"), &s(&row["model_id"]), "Model ID...", false, false);
            let remove = page.button(&format!("s_fb_remove_{i}"), "", Some(ICON_TRASH), "outline", true);
            fb.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:8 View{{width:Fill height:Fit {drop}}} View{{width:Fill height:Fit {model}}} {remove}}}"));
        }
        fb.push_str(&page.button("s_fb_add", "Add Fallback", Some(ICON_PLUS), "dashed", true));
        out.push_str(&page.card(ICON_SHUFFLE, "Fallback Models", "Ordered list of fallback providers tried if the primary fails", &fb));
        // Adaptive routing.
        let adaptive = f["adaptive"].as_bool().unwrap_or(false);
        let mut ar = format!(
            "View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} {} s_llm_adaptive := Toggle{{text:\"\" width:44 height:26 padding:0 margin:0 draw_bg +: {{size:24 border_radius:5 border_size:0
                    color:#d4d3cf color_hover:#cbcac6 color_focus:#d4d3cf color_down:#c4c3bf color_active:#1b1b1a color_disabled:#e4e3e0
                    border_color:#0000 border_color_hover:#0000 border_color_focus:#0000 border_color_down:#0000 border_color_active:#0000 border_color_disabled:#0000
                    mark_color:#ffffff mark_color_hover:#ffffff mark_color_down:#ffffff mark_color_active:#ffffff mark_color_active_hover:#ffffff}}}}}}",
            page.label("Enable adaptive routing", 14., "#1c1c1b", false)
        );
        page.names.push("s_llm_adaptive".into());
        page.toggles.push(("s_llm_adaptive".into(), adaptive));
        if adaptive {
            for line in [
                "Tracks p50/p95 latency per model over a rolling window",
                "Automatically shifts traffic away from slow or erroring models",
                "Primary model is preferred when healthy; fallbacks are tried in order",
                "No manual intervention needed — weights adjust in real time",
            ] {
                ar.push_str(&page.note(&format!("• {line}"), "#6b6b67"));
            }
        }
        out.push_str(&page.card(ICON_SLIDERS, "Adaptive Routing", "Automatically route between primary and fallbacks based on latency and error rates", &ar));
        // Prompt & output, gateway parameters.
        let mut po = page.field_label("System Prompt");
        po.push_str(&page.input("s_llm_system_prompt", &s(&f["system_prompt"]), "Optional system prompt override...", false, true));
        po.push_str(&page.field_label("Max Output Tokens"));
        po.push_str(&page.input("s_llm_max_output_tokens", &s(&f["max_output_tokens"]), "Leave empty for default", false, false));
        out.push_str(&page.card(ICON_FILE, "Prompt & Output", "System prompt override and output limits", &po));
        let mut gp = String::new();
        for (key, label) in [("max_history", "Max History"), ("max_iterations", "Max Iterations"), ("max_concurrent_sessions", "Max Concurrent Sessions"), ("browser_timeout_secs", "Browser Timeout (seconds)")] {
            gp.push_str(&page.field_label(label));
            gp.push_str(&page.input(&format!("s_llm_{key}"), &s(&f[key]), "Default", false, false));
        }
        out.push_str(&page.card(ICON_SERVER, "Gateway Parameters", "Agent loop and session limits", &gp));
        let save = page.button("s_llm_save", if self.settings.busy == Some("save") { "Saving…" } else { "Save Changes" }, Some(ICON_SAVE), "primary", self.settings.busy.is_none());
        let reset = page.button("s_llm_reset", "Reset", Some(ICON_RESTART), "outline", true);
        let message = match &self.settings.message {
            Some((Tab::Llm, m, _)) if m.starts_with("[test]") => String::new(),
            _ => self.settings_message(page, Tab::Llm),
        };
        out.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:0.5}} {save} {reset} {message}}}"));
        out
    }
    fn keys_tab(&mut self, page: &mut Page) -> String {
        let env = self.settings.profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or_default();
        let mut groups: Vec<(&str, &str, &'static str, Vec<(String, String, String)>)> = vec![(
            "LLM Providers",
            "API keys for model providers. The LLM tab binds the selected model to one of these keys.",
            ICON_CPU,
            providers()
                .filter(|p| !p.env_key.is_empty() && !p.json_credential)
                .map(|p| (p.env_key.to_owned(), p.name.to_owned(), format!("API key for {} models", p.name)))
                .collect(),
        )];
        for g in KEY_GROUPS {
            groups.push((g.0, g.1, g.2, g.3.iter().map(|(k, n, d)| ((*k).to_owned(), (*n).to_owned(), (*d).to_owned())).collect()));
        }
        let mut out = String::new();
        for (title, desc, icon, fields) in groups {
            let mut body = String::new();
            for (key, name, description) in fields {
                let value = s(&env[key.as_str()]);
                let configured = !value.trim().is_empty();
                let input = page.input(&format!("s_key_{key}"), &value, &format!("Enter {name}"), true, false);
                body.push_str(&format!(
                    "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:16 right:16 top:16 bottom:0}} margin:Inset{{bottom:12}} draw_bg +: {{color:#dedddb border_radius:6}}
                        View{{width:Fill height:Fit flow:Right margin:Inset{{bottom:12}}
                            View{{width:Fill height:Fit flow:Down spacing:2 {} {} {}}}
                            View{{width:Fit height:Fit flow:Right spacing:6 align:Align{{y:0.5}}
                                RoundedView{{width:8 height:8 draw_bg +: {{color:{} border_radius:4}}}}
                                Label{{width:Fit padding:0 text:\"{}\" draw_text.text_style.font_size:7.5 draw_text.color:#5f5f5b}}
                            }}
                        }}
                        {input}
                    }}",
                    page.label(&name, 14., "#1c1c1b", false),
                    page.label(&description, 12., "#5f5f5b", false),
                    format!("Label{{width:Fill padding:0 text:\"{key}\" draw_text.text_style: theme.font_code{{font_size:8.25}} draw_text.color:#7a7a75}}"),
                    if configured { "#22c55e" } else { "#a9a8a4" },
                    if configured { "Configured" } else { "Not set" }
                ));
            }
            out.push_str(&page.card(icon, title, desc, &body));
        }
        let save = page.button("s_keys_save", if self.settings.busy == Some("save") { "Saving…" } else { "Save Changes" }, Some(ICON_SAVE), "primary", self.settings.busy.is_none());
        let reset = page.button("s_keys_reset", "Reset", Some(ICON_RESTART), "outline", true);
        out.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:0.5}} {save} {reset} {}}}", self.settings_message(page, Tab::ApiKeys)));
        out
    }
    fn voice_tab(&mut self, page: &mut Page) -> String {
        let v = self.settings.voice.clone();
        let mut asr = page.field_label("Recognition language");
        let mut labels = vec!["Inherit (server default)".to_owned(), "Auto".to_owned()];
        labels.extend(ASR_LANGUAGES.iter().map(|l| (*l).to_owned()));
        let asr_value = s(&v["asr"]);
        let sel = match asr_value.as_str() {
            "inherit" => 0,
            "auto" => 1,
            l => ASR_LANGUAGES.iter().position(|x| *x == l).map_or(0, |i| i + 2),
        };
        asr.push_str(&page.dropdown("s_voice_asr", labels, sel));
        asr.push_str(&page.note("Applied on the next utterance. Auto lets the recognition engine detect the spoken language.", "#6b6b67"));
        let mut out = page.card(ICON_VOLUME, "Speech recognition (ASR)", "Choose how speech is recognized for this profile across AppUI and connected channels", &asr);
        let route = s(&v["route"]);
        let mut tts = page.field_label("TTS route");
        let rsel = ROUTES.iter().position(|r| r.0 == route).unwrap_or(0);
        tts.push_str(&page.dropdown("s_voice_route", ROUTES.iter().map(|r| r.1.to_owned()).collect(), rsel));
        tts.push_str(&page.note(ROUTES[rsel].2, "#6b6b67"));
        out.push_str(&page.card(ICON_VOLUME, "Voice synthesis (TTS)", "Choose how spoken replies are synthesized", &tts));
        if route == "auto" || route == "cloud" {
            let token_set = self.settings.profile.as_ref().and_then(|p| p["config"]["env_vars"]["VOLC_TTS_TOKEN"].as_str()).is_some_and(|t| !t.is_empty());
            let mut cloud = page.field_label("App ID");
            cloud.push_str(&page.input("s_voice_appid", &s(&v["appid"]), "", false, false));
            cloud.push_str(&page.field_label(&format!("Token{}", if token_set { " (已设置)" } else { "" })));
            cloud.push_str(&page.input("s_voice_token", &s(&v["token"]), if token_set { "•••••• (unchanged)" } else { "Enter token" }, true, false));
            cloud.push_str(&page.field_label("Voice"));
            let voice = s(&v["voice"]);
            let mut labels = vec!["Default (BV001_streaming)".to_owned()];
            labels.extend(VOICES.iter().map(|(_, l)| (*l).to_owned()));
            let custom = !voice.is_empty() && !VOICES.iter().any(|(id, _)| *id == voice);
            if custom {
                labels.push(voice.clone());
            }
            let vsel = if voice.is_empty() { 0 } else { VOICES.iter().position(|(id, _)| *id == voice).map_or(VOICES.len() + 1, |i| i + 1) };
            cloud.push_str(&page.dropdown("s_voice_voice", labels, vsel));
            if !voice.is_empty() {
                cloud.push_str(&page.note(&voice, "#6b6b67"));
            }
            let advanced = v["advanced"].as_bool().unwrap_or(false);
            cloud.push_str(&page.button("s_voice_advanced", if advanced { "▲ Hide advanced" } else { "▼ Advanced" }, None, "outline", true));
            if advanced {
                cloud.push_str("View{width:Fill height:16}");
                cloud.push_str(&page.field_label("Cluster"));
                cloud.push_str(&page.input("s_voice_cluster", &s(&v["cluster"]), "volcano_tts", false, false));
                cloud.push_str(&page.field_label("Encoding"));
                cloud.push_str(&page.input("s_voice_encoding", &s(&v["encoding"]), "mp3", false, false));
            }
            let appid_ok = normalize_appid(&s(&v["appid"])).is_some();
            let token_ok = token_set || !s(&v["token"]).is_empty();
            if route == "cloud" && (!appid_ok || !token_ok) {
                cloud.push_str(&page.note("Cloud 模式需要纯数字 App ID 和 Token；不要填写“APP ID:”前缀", "#dc2626"));
            }
            if route == "auto" && !token_ok {
                cloud.push_str(&page.note("未填 token，Auto 将回退端侧", "#d97706"));
            }
            out.push_str(&page.card(ICON_VOLUME, "Volcano (cloud) credentials", "Token is stored securely; other fields are plain settings", &cloud));
        }
        let idle = self.settings.busy.is_none();
        let save = page.button("s_voice_save", if self.settings.busy == Some("save") { "Saving…" } else { "Save" }, Some(ICON_SAVE), "primary", idle);
        let test = page.button("s_voice_test", if self.settings.busy == Some("tts") { "Testing…" } else { "Test TTS" }, Some(ICON_PLUG), "outline", idle);
        out.push_str(&format!("View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:0.5}} {save} {test} {}}}", self.settings_message(page, Tab::Voice)));
        out.push_str(&format!("View{{width:Fill height:Fit margin:Inset{{top:20}} {}}}", page.label("Restart the profile to apply credential changes.", 12., "#6b6b67", false)));
        out
    }
    fn companion_tab(&mut self, page: &mut Page) -> String {
        // Web TeacherSkinPicker: a 4-column grid of skin cards.
        let mut rows = String::new();
        for chunk in SKINS.chunks(4) {
            let mut row = String::from("View{width:Fill height:Fit flow:Right spacing:12 margin:Inset{bottom:12}");
            for (id, label, desc, png) in chunk {
                let active = self.teacher_skin == *id;
                let key = id.replace('-', "_");
                let art = if png.is_some() {
                    page.names.push(format!("skin_png_{key}"));
                    format!("skin_png_{key} := Image{{width:80 height:80 fit:ImageFit.Smallest}}")
                } else {
                    page.names.push(format!("skin_svg_{key}"));
                    format!("skin_svg_{key} := Svg{{width:64 height:64}}")
                };
                let pill = |text: &str, strong: bool| format!(
                    "RoundedView{{width:Fit height:Fit padding:Inset{{left:8 right:8 top:4 bottom:4}} draw_bg +: {{color:{} border_radius:3 border_size:0.5 border_color:#bdbcb8}} Label{{width:Fit padding:0 text:\"{text}\" draw_text.text_style: theme.font_bold{{font_size:7.5}} draw_text.color:#3b3b39}}}}",
                    if strong { "#e2e1dd" } else { "#efeeea" }
                );
                let kind = if png.is_some() { "3D · Animated" } else { "2D · SVG" };
                let active_pill = if active { pill("✓ Active", true) } else { String::new() };
                page.names.push(format!("skin_hit_{key}"));
                row.push_str(&format!(
                    "View{{width:Fill height:256 flow:Overlay
                        RoundedView{{width:Fill height:Fill draw_bg +: {{color:{} border_radius:6 border_size:0.5 border_color:{}}}}}
                        View{{width:Fill height:Fill flow:Down padding:16
                            {}
                            View{{width:Fill height:Fit margin:Inset{{top:6}} {}}}
                            View{{width:Fill height:Fill align:Align{{x:0.5 y:0.5}} {art}}}
                            View{{width:Fill height:Fit flow:Right spacing:8 {} {active_pill}}}
                        }}
                        skin_hit_{key} := Button{{width:Fill height:Fill text:\"\" margin:0 draw_bg +: {{color:#0000 color_hover:#0000000a color_down:#00000014 border_radius:6 border_size:0 border_color:#0000}}}}
                    }}",
                    if active { "#fbfaf8" } else { "#f6f5f2" },
                    if active { "#8f8e8a" } else { "#dcdbd7" },
                    page.label(label, 14., "#1c1c1b", true),
                    page.label(desc, 12., "#5f5f5b", false),
                    pill(kind, false),
                ));
            }
            for _ in chunk.len()..4 {
                row.push_str("View{width:Fill height:1}");
            }
            row.push('}');
            rows.push_str(&row);
        }
        page.card(ICON_CAP, "Learning Companion", "Choose the Octos teacher shown in the lower-right corner of the learning canvas.", &rows)
    }
    /// Web authentication-tab: registration access, SMTP for login codes,
    /// allowed emails and a test email (admin REST endpoints).
    fn auth_tab(&mut self, page: &mut Page) -> String {
        let a = self.settings.auth.clone();
        if !a["loaded"].as_bool().unwrap_or(false) {
            return page.note(a["error"].as_str().unwrap_or("Loading authentication settings..."), "#6b6b67");
        }
        let open = a["open"].as_bool().unwrap_or(false);
        let mut reg = String::from("View{width:Fill height:Fit flow:Right spacing:12");
        for (id, title, desc, selected) in [
            ("s_auth_open", "Open registration", "Anyone who verifies an email OTP can create their own user and profile.", open),
            ("s_auth_restricted", "Restricted registration", "Only existing users and addresses listed under Users → Allowed Emails can sign in.", !open),
        ] {
            page.names.push(id.into());
            reg.push_str(&format!(
                "View{{width:Fill height:Fit flow:Overlay
                    RoundedView{{width:Fill height:Fit flow:Right spacing:12 padding:16 draw_bg +: {{color:{} border_radius:6 border_size:0.5 border_color:{}}}
                        RoundedView{{width:14 height:14 margin:Inset{{top:3}} draw_bg +: {{color:{} border_radius:7 border_size:{} border_color:#8a8a85}}}}
                        View{{width:Fill height:Fit flow:Down spacing:6 {} {}}}
                    }}
                    {id} := Button{{width:Fill height:Fill text:\"\" margin:0 draw_bg +: {{color:#0000 color_hover:#0000000a color_down:#00000014 border_radius:6 border_size:0 border_color:#0000}}}}
                }}",
                if selected { "#eeedea" } else { "#dedddb" },
                if selected { "#5f5f5b" } else { "#0000" },
                if selected { "#2563eb" } else { "#ffffff" },
                if selected { "3" } else { "0.5" },
                page.label(title, 14., "#1c1c1b", true),
                page.label(desc, 12., "#5f5f5b", false),
            ));
        }
        reg.push('}');
        let mut out = page.card(ICON_SHIELD, "Registration Access", "Choose who can create a user through email verification", &reg);
        // SMTP.
        let col = |page: &mut Page, label: &str, name: &str, value: &str, placeholder: &str, password: bool| {
            format!("View{{width:Fill height:Fit flow:Down {} {}}}", page.field_label(label), page.input(name, value, placeholder, password, false))
        };
        let host = col(page, "SMTP host", "s_auth_host", &s(&a["host"]), "smtp.example.com", false);
        let port = col(page, "SMTP port", "s_auth_port", &a["port"].as_i64().map(|p| p.to_string()).unwrap_or_default(), "465", false);
        let user = col(page, "SMTP username", "s_auth_user", &s(&a["username"]), "", false);
        let password_set = a["password_configured"].as_bool().unwrap_or(false);
        let pass = col(page, "SMTP password", "s_auth_pass", "", if password_set { "Configured; leave blank to keep" } else { "Enter SMTP password" }, true);
        let hint = page.note("Leave blank only when the server already provides SMTP credentials, such as through SMTP_PASSWORD.", "#7a7a75");
        let from = col(page, "From address", "s_auth_from", &s(&a["from_address"]), "Octos <login@example.com>", false);
        let save = page.button("s_auth_save", if self.settings.busy == Some("auth-save") { "Saving…" } else { "Save authentication settings" }, Some(ICON_SHIELD), "primary", self.settings.busy.is_none());
        let message = match &self.settings.message {
            Some((Tab::Authentication, m, ok)) if m.starts_with("[smtp]") => page.note(&m[6..], if *ok { "#16a34a" } else { "#dc2626" }),
            _ => String::new(),
        };
        let smtp = format!(
            "View{{width:Fill height:Fit flow:Right spacing:16 {host} {port}}}
             View{{width:Fill height:Fit flow:Right spacing:16 {user} View{{width:Fill height:Fit flow:Down {pass} {hint}}}}}
             {from}
             {message}
             View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} {save}}}"
        );
        out.push_str(&page.card(ICON_MAIL, "Email OTP Delivery", "SMTP used to send login verification codes", &smtp));
        // Allowed emails.
        let email = col(page, "Allowed email", "s_auth_email", "", "learner@example.com", false);
        let note = col(page, "Invitation note", "s_auth_note", "", "Optional context", false);
        let add = page.button("s_auth_add", "Add allowed email", Some(ICON_USER_PLUS), "primary", self.settings.busy.is_none());
        let mut list = String::new();
        let entries = a["emails"].as_array().cloned().unwrap_or_default();
        if entries.is_empty() {
            list.push_str("View{width:Fill height:Fit padding:Inset{top:24 bottom:24} align:Align{x:0.5}");
            list.push_str(&page.label("No email addresses have been invited yet.", 12., "#6b6b67", false).replace("width:Fill", "width:Fit"));
            list.push('}');
        }
        for (i, entry) in entries.iter().enumerate() {
            let registered = entry["registered"].as_bool().unwrap_or(false) || !entry["claimed_user_id"].is_null();
            let sub = if registered {
                format!("Registered{}", entry["registered_name"].as_str().map(|n| format!(" as {n}")).unwrap_or_default())
            } else {
                entry["note"].as_str().filter(|n| !n.is_empty()).unwrap_or("Invitation not claimed").to_owned()
            };
            let action = if registered {
                "RoundedView{width:Fit height:Fit padding:Inset{left:10 right:10 top:4 bottom:4} draw_bg +: {color:#e9e8e4 border_radius:9} Label{width:Fit padding:0 text:\"Registered\" draw_text.text_style.font_size:8.25 draw_text.color:#3b3b39}}".to_owned()
            } else {
                page.button(&format!("s_auth_remove_{i}"), "", Some(ICON_TRASH), "outline", self.settings.busy.is_none())
            };
            list.push_str(&format!(
                "View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} padding:Inset{{left:16 right:16 top:12 bottom:12}} View{{width:Fill height:Fit flow:Down spacing:2 {} {}}} {action}}}",
                page.label(&s(&entry["email"]), 14., "#1c1c1b", false),
                page.label(&sub, 12., "#6b6b67", false),
            ));
        }
        let message = match &self.settings.message {
            Some((Tab::Authentication, m, ok)) if m.starts_with("[email]") => page.note(&m[7..], if *ok { "#16a34a" } else { "#dc2626" }),
            _ => String::new(),
        };
        let allowed = format!(
            "View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:1.}} {email} {note} View{{width:Fit height:Fit margin:Inset{{bottom:16}} {add}}}}}
             {message}
             RoundedView{{width:Fill height:Fit flow:Down margin:Inset{{top:4}} draw_bg +: {{color:#fffffe border_radius:6 border_size:0.5 border_color:#d4d3cf}} {list}}}"
        );
        out.push_str(&page.card(ICON_USER_PLUS, "Allowed Emails", "Invite specific people when registration is restricted", &allowed));
        // Test email.
        let to = col(page, "Test recipient", "s_auth_test_to", "", "you@example.com", false);
        let send = page.button("s_auth_test", if self.settings.busy == Some("auth-test") { "Sending…" } else { "Send test email" }, Some(ICON_SEND), "outline", self.settings.busy.is_none());
        let message = match &self.settings.message {
            Some((Tab::Authentication, m, ok)) if m.starts_with("[test]") => page.note(&m[6..], if *ok { "#16a34a" } else { "#dc2626" }),
            _ => String::new(),
        };
        out.push_str(&page.card(
            ICON_SEND,
            "Test Login Email",
            "Uses the currently saved SMTP configuration",
            &format!("View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:1.}} {to} View{{width:Fit height:Fit margin:Inset{{bottom:16}} {send}}}}} {message}"),
        ));
        out
    }
    /// Web developer-tab (useDebugSettings).
    fn developer_tab(&mut self, page: &mut Page) -> String {
        let d = self.settings.debug.clone();
        let on = d["debugMode"].as_bool().unwrap_or(false);
        let tile = page.tile(ICON_BUG);
        let mut out = format!(
            "RoundedView{{width:Fill height:Fit flow:Right spacing:12 padding:20 margin:Inset{{bottom:24}} draw_bg +: {{color:#fffffe border_radius:8 border_size:0.5 border_color:#d4d3cf}}
                {tile}
                View{{width:Fill height:Fit flow:Down spacing:4 {} {}}}
            }}",
            page.label("Developer Options / 开发者与调试选项", 16., "#1c1c1b", true),
            page.label("控制全局调试模式、TypeSafe Jev System One 实时准入监控浮窗及白板实验性诊断工具。", 14., "#5f5f5b", false),
        );
        let pill = |text: &str| format!("RoundedView{{width:Fit height:Fit padding:Inset{{left:8 right:8 top:4 bottom:4}} draw_bg +: {{color:#efeeea border_radius:3 border_size:0.5 border_color:#bdbcb8}} Label{{width:Fit padding:0 text:\"{text}\" draw_text.text_style: theme.font_bold{{font_size:7.5}} draw_text.color:#3b3b39}}}}");
        out.push_str(&format!(
            "RoundedView{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} padding:20 margin:Inset{{bottom:24}} draw_bg +: {{color:#fffffe border_radius:8 border_size:0.5 border_color:#d4d3cf}}
                View{{width:Fill height:Fit flow:Down spacing:6
                    View{{width:Fill height:Fit flow:Right spacing:8 align:Align{{y:0.5}} View{{width:Fit height:Fit {}}} {}}}
                    {}
                }}
                {}
            }}",
            page.label("调试模式 (Debug Mode)", 14., "#1c1c1b", true).replace("width:Fill", "width:Fit"),
            pill(if on { "已启用 · Active" } else { "已停用 · Inactive" }),
            page.label("全站调试总开关。关闭时将隐藏白板上的所有调试浮层与测试探针；开启后可在下方按需启用各项具体调试工具。", 12., "#5f5f5b", false),
            self.toggle_widget(page, "s_dbg_mode", on),
        ));
        let mut features = format!(
            "View{{width:Fill height:Fit flow:Down spacing:4 margin:Inset{{bottom:16}} {} {}}}",
            page.label("调试功能清单 (Debug Features)", 14., "#1c1c1b", true),
            page.label(if on { "调试模式已开启，以下配置实时生效。" } else { "调试模式当前处于停用状态。开启总开关后，以下配置将实时生效。" }, 12., "#5f5f5b", false),
        );
        for (key, icon, title, desc) in [
            ("showJevAdmissionDebugger", ICON_SPARKLES, "TypeSafe Jev 准入监视浮窗", "在学习白板右下角显示 Jev System One 快速门禁决策（准入排课 / 静默拦截 / 追问）、时延置信度监控与真机快速注入测试工具。"),
            ("showLearningTraceInspector", ICON_ACTIVITY, "白板学习链路追踪探针 (Learn Trace)", "在白板侧边记录提问、手写框选、LLM 课时生成全链路事件与关键时序数据。"),
        ] {
            let value = d[key].as_bool().unwrap_or(true);
            let tile = page.tile(icon);
            let toggle = self.toggle_widget(page, &format!("s_dbg_{key}"), value);
            features.push_str(&format!(
                "View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:0.5}} padding:Inset{{top:12 bottom:12}}
                    {tile}
                    View{{width:Fill height:Fit flow:Down spacing:4 View{{width:Fill height:Fit flow:Right spacing:8 align:Align{{y:0.5}} View{{width:Fit height:Fit {}}} {}}} {}}}
                    {toggle}
                }}",
                page.label(title, 14., "#1c1c1b", true).replace("width:Fill", "width:Fit"),
                pill(if on && value { "显示中" } else { "已隐藏" }),
                page.label(desc, 12., "#5f5f5b", false),
            ));
        }
        let tile = page.tile(ICON_LAYERS);
        features.push_str(&format!(
            "View{{width:Fill height:Fit flow:Right spacing:12 padding:Inset{{top:12 bottom:4}} {tile} View{{width:Fill height:Fit flow:Down spacing:4 {} {}}}}}",
            page.label("预留调试扩展槽 (Extensible Debug Slots)", 14., "#1c1c1b", true),
            page.label("调试设置已采用统一的键值扩展模型。未来新增的实验性功能（如 ACS 多模态视觉诊断、弱网/丢包时延模拟、笔迹实时渲染 FPS 监控等）将在此无缝挂载。", 12., "#5f5f5b", false),
        ));
        out.push_str(&format!("RoundedView{{width:Fill height:Fit flow:Down padding:20 margin:Inset{{bottom:16}} draw_bg +: {{color:#fffffe border_radius:8 border_size:0.5 border_color:#d4d3cf}} {features}}}"));
        let reset = page.button("s_dbg_reset", "重置调试选项", Some(ICON_RESTART), "outline", true);
        out.push_str(&format!(
            "View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} View{{width:Fill height:Fit flow:Down spacing:4 {} {}}} {reset}}}",
            page.label("设置修改后通过内部事件总线实时生效，无需刷新页面。", 12., "#5f5f5b", false),
            page.label("原生应用暂无这两个调试浮层，这里的开关只会被保存。", 12., "#b45309", false),
        ));
        out
    }
    fn toggle_widget(&self, page: &mut Page, name: &str, on: bool) -> String {
        page.names.push(name.into());
        page.toggles.push((name.into(), on));
        format!("{name} := Toggle{{text:\"\" width:44 height:26 padding:0 margin:0 draw_bg +: {{size:24 border_radius:5 border_size:0
            color:#d4d3cf color_hover:#cbcac6 color_focus:#d4d3cf color_down:#c4c3bf color_active:#1b1b1a color_disabled:#e4e3e0
            border_color:#0000 border_color_hover:#0000 border_color_focus:#0000 border_color_down:#0000 border_color_active:#0000 border_color_disabled:#0000
            mark_color:#ffffff mark_color_hover:#ffffff mark_color_down:#ffffff mark_color_active:#ffffff mark_color_active_hover:#ffffff}}}}")
    }
    fn debug_path(&self) -> Option<std::path::PathBuf> {
        self.store.as_ref().map(|s| s.dir().join("debug-settings.json"))
    }
    fn load_debug_settings(&mut self) {
        let saved = self.debug_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        let mut d = json!({"debugMode": false, "showJevAdmissionDebugger": true, "showLearningTraceInspector": true});
        if let Some(Value::Object(m)) = saved {
            for (k, v) in m {
                d[k] = v;
            }
        }
        self.settings.debug = d;
    }
    fn save_debug_settings(&self) {
        if let Some(p) = self.debug_path() {
            let _ = std::fs::create_dir_all(p.parent().unwrap()).and_then(|_| std::fs::write(p, self.settings.debug.to_string()));
        }
    }
    fn load_auth(&mut self, cx: &mut Cx) {
        self.settings.auth = json!({"loaded": false});
        self.server.json(cx, HttpMethod::GET, "/api/admin/smtp", None, "settings:smtp");
        self.server.json(cx, HttpMethod::GET, "/api/admin/allowed-emails", None, "settings:emails");
    }
    fn control(&self, name: &str) -> Option<WidgetRef> {
        self.settings.controls.iter().find(|(n, _)| n == name).map(|(_, w)| w.clone())
    }
    fn control_text(&self, name: &str) -> String {
        self.control(name).map(|w| w.as_text_input().text()).unwrap_or_default()
    }
    /// Read the visible LLM controls into the form.
    fn capture_llm_form(&mut self, cx: &mut Cx) {
        let mut f = self.settings.llm.clone();
        for (key, name) in [
            ("custom_family_id", "s_llm_custom_family"),
            ("custom_model_id", "s_llm_custom_model"),
            ("base_url", "s_llm_base_url"),
            ("sa_json", "s_llm_sa_json"),
            ("system_prompt", "s_llm_system_prompt"),
            ("max_output_tokens", "s_llm_max_output_tokens"),
            ("max_history", "s_llm_max_history"),
            ("max_iterations", "s_llm_max_iterations"),
            ("max_concurrent_sessions", "s_llm_max_concurrent_sessions"),
            ("browser_timeout_secs", "s_llm_browser_timeout_secs"),
        ] {
            if self.control(name).is_some() {
                f[key] = json!(self.control_text(name));
            }
        }
        if let Some(w) = self.control("s_llm_adaptive") {
            f["adaptive"] = json!(w.as_check_box().active(cx));
        }
        let fb_providers: Vec<&Provider> = providers().filter(|p| p.id != "__custom_family__").collect();
        if let Some(rows) = f["fallbacks"].as_array().cloned() {
            let rows: Vec<Value> = rows
                .iter()
                .enumerate()
                .map(|(i, row)| {
                    let family = self
                        .control(&format!("s_fb_provider_{i}"))
                        .map(|w| w.as_drop_down().selected_item())
                        .and_then(|sel| sel.checked_sub(1))
                        .and_then(|i| fb_providers.get(i))
                        .map_or_else(|| s(&row["family_id"]), |p| p.id.to_owned());
                    json!({"family_id": family, "model_id": self.control_text(&format!("s_fb_model_{i}"))})
                })
                .collect();
            f["fallbacks"] = json!(rows);
        }
        self.settings.llm = f;
    }
    fn capture_auth_form(&mut self) {
        for (key, name) in [("host", "s_auth_host"), ("port", "s_auth_port"), ("username", "s_auth_user"), ("from_address", "s_auth_from")] {
            if self.control(name).is_some() {
                let text = self.control_text(name);
                self.settings.auth[key] = if key == "port" { text.trim().parse::<i64>().map(Value::from).unwrap_or(json!(text)) } else { json!(text) };
            }
        }
    }
    fn capture_voice_form(&mut self) {
        let mut v = self.settings.voice.clone();
        for (key, name) in [("appid", "s_voice_appid"), ("token", "s_voice_token"), ("cluster", "s_voice_cluster"), ("encoding", "s_voice_encoding")] {
            if self.control(name).is_some() {
                let text = self.control_text(name);
                if key != "token" && text != s(&v[key]) {
                    v["edited"] = json!(true);
                }
                v[key] = json!(text);
            }
        }
        self.settings.voice = v;
    }
    fn save_settings_config(&mut self, cx: &mut Cx, patch: Value, top: Value) {
        let Some(profile) = self.settings.profile.as_ref() else { return };
        let mut config = profile["config"].clone();
        if let (Some(c), Some(p)) = (config.as_object_mut(), patch.as_object()) {
            for (k, v) in p {
                c.insert(k.clone(), v.clone());
            }
        }
        let mut body = json!({"config": config});
        if let (Some(b), Some(t)) = (body.as_object_mut(), top.as_object()) {
            for (k, v) in t {
                b.insert(k.clone(), v.clone());
            }
        }
        self.settings.busy = Some("save");
        self.settings.busy_tab = self.settings.tab;
        self.settings.message = None;
        self.server.save_profile(cx, body);
        self.rebuild_settings(cx);
    }
    fn llm_save_patch(&self) -> Value {
        let f = &self.settings.llm;
        let family = s(&f["family_id"]);
        let custom = family == "__custom_family__";
        let effective = if custom { s(&f["custom_family_id"]).trim().to_owned() } else { family.clone() };
        let prov = provider(&family);
        let model = if s(&f["model_id"]) == "__custom__" || prov.is_none_or(|p| p.models.is_empty()) { s(&f["custom_model_id"]) } else { s(&f["model_id"]) };
        let env_key = prov.map(|p| p.env_key).filter(|k| !k.is_empty());
        let base_url = shows_base_url(&family).then(|| s(&f["base_url"]).trim().to_owned()).filter(|u| !u.is_empty());
        let route = if env_key.is_some() || base_url.is_some() { json!({"api_key_env": env_key, "base_url": base_url}) } else { Value::Null };
        let profile = self.settings.profile.clone().unwrap_or_default();
        let mut gateway = profile["config"]["gateway"].clone();
        gateway["system_prompt"] = { let p = s(&f["system_prompt"]); if p.trim().is_empty() { Value::Null } else { json!(p.trim()) } };
        for key in ["max_output_tokens", "max_history", "max_iterations", "max_concurrent_sessions", "browser_timeout_secs"] {
            gateway[key] = optional_int(&s(&f[key]));
        }
        let fallbacks: Vec<Value> = f["fallbacks"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|r| !s(&r["family_id"]).trim().is_empty())
            .map(|r| json!({"family_id": s(&r["family_id"]).trim(), "model_id": s(&r["model_id"]).trim()}))
            .collect();
        let mut patch = json!({
            "llm": {"primary": {"family_id": effective, "model_id": model.trim(), "route": route}, "fallbacks": fallbacks},
            "gateway": gateway,
            "adaptive_routing": {"enabled": f["adaptive"].as_bool().unwrap_or(false)},
        });
        // Web buildCredentialEnvPatch: a pasted JSON credential (Vertex).
        let sa = s(&f["sa_json"]);
        if prov.is_some_and(|p| p.json_credential) && !sa.trim().is_empty() {
            let mut env = profile["config"]["env_vars"].clone();
            env[prov.unwrap().env_key] = json!(sa.trim());
            patch["env_vars"] = env;
        }
        patch
    }

    /// Settings page actions (header, sidebar, tab controls).
    pub(crate) fn settings_actions(&mut self, cx: &mut Cx, actions: &Actions) {
        if !self.settings.open {
            if self.ui.button(cx, ids!(launcher_settings)).clicked(actions) {
                self.open_settings(cx, Tab::Profile);
            }
            return;
        }
        if self.ui.button(cx, ids!(settings_back)).clicked(actions) {
            self.close_settings(cx);
            return;
        }
        if self.ui.button(cx, ids!(settings_setup)).clicked(actions) {
            // Web 新手设置白板: the setup whiteboard.
            self.close_settings(cx);
            self.open_live_board(cx);
            self.setup_force = true;
            self.setup_check = true;
            if self.server.logged_in() {
                self.check_setup(cx);
            }
            return;
        }
        if let Some(query) = self.ui.text_input(cx, ids!(settings_search)).changed(actions) {
            self.settings.query = query;
            self.rebuild_settings(cx);
        }
        if let Some(tab) = self.settings.nav.iter().find(|(w, _)| w.as_button().clicked(actions)).map(|(_, t)| *t) {
            if tab != self.settings.tab {
                self.settings.tab = tab;
                self.settings.message = None;
                self.reset_settings_forms();
                if tab == Tab::Authentication && self.server.logged_in() {
                    self.load_auth(cx);
                }
                if tab == Tab::Developer {
                    self.load_debug_settings();
                }
                self.rebuild_settings(cx);
            }
            return;
        }
        let clicked = |app: &App, name: &str| app.control(name).is_some_and(|w| w.as_button().clicked(actions));
        match self.settings.tab {
            Tab::Profile => {
                if clicked(self, "s_profile_save") {
                    let name = self.control_text("s_name").trim().to_owned();
                    let enabled = self.control("s_autostart").is_some_and(|w| w.as_check_box().active(cx));
                    let admin = self.control("s_admin").is_some_and(|w| w.as_check_box().active(cx));
                    self.save_settings_config(cx, json!({"admin_mode": admin}), json!({"name": name, "enabled": enabled}));
                }
                for (action, path) in [("s_gw_start", "start"), ("s_gw_stop", "stop"), ("s_gw_restart", "restart")] {
                    if clicked(self, action) {
                        self.settings.busy = Some("gateway");
                        self.settings.busy_tab = Tab::Profile;
                        self.server.json(cx, HttpMethod::POST, &format!("/api/my/profile/{path}"), None, "settings:gateway");
                        self.rebuild_settings(cx);
                    }
                }
                if clicked(self, "s_env_add") {
                    self.settings.env_rows.push(String::new());
                    self.rebuild_settings(cx);
                }
                let rows = self.settings.env_rows.len();
                if let Some(i) = (0..rows).find(|i| clicked(self, &format!("s_env_del_{i}"))) {
                    self.settings.env_rows.remove(i);
                    self.rebuild_settings(cx);
                    return;
                }
                if clicked(self, "s_env_save") {
                    let existing = self.settings.profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or_default();
                    let mut env = serde_json::Map::new();
                    for i in 0..rows {
                        let key = self.control_text(&format!("s_env_key_{i}")).trim().to_owned();
                        if key.is_empty() {
                            continue;
                        }
                        let value = self.control_text(&format!("s_env_val_{i}"));
                        let original_key = &self.settings.env_rows[i];
                        // Empty input keeps the stored (masked) value.
                        let kept = existing[original_key.as_str()].clone();
                        env.insert(key, if value.is_empty() { kept } else { json!(value) });
                    }
                    self.save_settings_config(cx, json!({"env_vars": Value::Object(env)}), json!({}));
                }
            }
            Tab::Llm => {
                if let Some(sel) = self.control("s_llm_provider").and_then(|w| w.as_drop_down().changed(actions)) {
                    self.capture_llm_form(cx);
                    let p = sel.checked_sub(1).and_then(|i| providers().nth(i));
                    let f = &mut self.settings.llm;
                    f["family_id"] = json!(p.map_or("", |p| p.id));
                    f["model_id"] = json!(p.and_then(|p| p.models.first()).map_or("", |m| m.0));
                    f["custom_model_id"] = json!("");
                    f["base_url"] = json!(p.map_or("", |p| default_base_url(p.id)));
                    self.rebuild_settings(cx);
                    return;
                }
                if let Some(sel) = self.control("s_llm_model").and_then(|w| w.as_drop_down().changed(actions)) {
                    self.capture_llm_form(cx);
                    let family = s(&self.settings.llm["family_id"]);
                    let models = provider(&family).map(|p| p.models).unwrap_or(&[]);
                    self.settings.llm["model_id"] = json!(models.get(sel).map_or("__custom__", |m| m.0));
                    self.rebuild_settings(cx);
                    return;
                }
                if let Some(on) = self.control("s_llm_adaptive").and_then(|w| w.as_check_box().changed(actions)) {
                    self.capture_llm_form(cx);
                    self.settings.llm["adaptive"] = json!(on);
                    self.rebuild_settings(cx);
                    return;
                }
                if clicked(self, "s_fb_add") {
                    self.capture_llm_form(cx);
                    if let Some(rows) = self.settings.llm["fallbacks"].as_array_mut() {
                        rows.push(json!({"family_id": "", "model_id": ""}));
                    }
                    self.rebuild_settings(cx);
                    return;
                }
                let rows = self.settings.llm["fallbacks"].as_array().map_or(0, Vec::len);
                if let Some(i) = (0..rows).find(|i| clicked(self, &format!("s_fb_remove_{i}"))) {
                    self.capture_llm_form(cx);
                    if let Some(rows) = self.settings.llm["fallbacks"].as_array_mut() {
                        rows.remove(i);
                    }
                    self.rebuild_settings(cx);
                    return;
                }
                if clicked(self, "s_llm_reset") {
                    self.settings.message = None;
                    self.reset_settings_forms();
                    self.rebuild_settings(cx);
                }
                if clicked(self, "s_llm_test") {
                    self.capture_llm_form(cx);
                    let f = &self.settings.llm;
                    let family = s(&f["family_id"]);
                    let effective = if family == "__custom_family__" { s(&f["custom_family_id"]) } else { family.clone() };
                    let prov = provider(&family);
                    let model = if s(&f["model_id"]) == "__custom__" || prov.is_none_or(|p| p.models.is_empty()) { s(&f["custom_model_id"]) } else { s(&f["model_id"]) };
                    if model.trim().is_empty() {
                        self.settings.message = Some((Tab::Llm, "[test]Select or enter a model ID before testing.".into(), false));
                        self.settings.busy_tab = Tab::Llm;
                        self.rebuild_settings(cx);
                        return;
                    }
                    let env_key = prov.map_or("", |p| p.env_key);
                    let sa = s(&f["sa_json"]).trim().to_owned();
                    let api_key = if !sa.is_empty() { Some(sa) } else if env_key.is_empty() { Some("not-required".to_owned()) } else { None };
                    let base = if shows_base_url(&family) { s(&f["base_url"]).trim().to_owned() } else { default_base_url(&family).to_owned() };
                    let mut body = json!({"provider": effective, "model": model, "profile_id": self.server.profile_id});
                    if !env_key.is_empty() {
                        body["api_key_env"] = json!(env_key);
                    }
                    if let Some(k) = api_key {
                        body["api_key"] = json!(k);
                    }
                    if !base.is_empty() {
                        body["base_url"] = json!(base);
                    }
                    self.settings.busy = Some("test");
                    self.settings.busy_tab = Tab::Llm;
                    self.settings.message = None;
                    self.server.test_provider(cx, body);
                    self.rebuild_settings(cx);
                }
                if clicked(self, "s_llm_save") {
                    self.capture_llm_form(cx);
                    let patch = self.llm_save_patch();
                    self.save_settings_config(cx, patch, json!({}));
                }
            }
            Tab::ApiKeys => {
                if clicked(self, "s_keys_reset") {
                    self.settings.message = None;
                    self.rebuild_settings(cx);
                }
                if clicked(self, "s_keys_save") {
                    let mut env = self.settings.profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or(json!({}));
                    for (key, _, _) in key_fields() {
                        let value = self.control_text(&format!("s_key_{key}")).trim().to_owned();
                        if let Some(m) = env.as_object_mut() {
                            if value.is_empty() {
                                m.remove(&key);
                            } else {
                                m.insert(key.clone(), json!(value));
                            }
                        }
                    }
                    self.save_settings_config(cx, json!({"env_vars": env}), json!({}));
                }
            }
            Tab::Voice => {
                if let Some(sel) = self.control("s_voice_route").and_then(|w| w.as_drop_down().changed(actions)) {
                    self.capture_voice_form();
                    self.settings.voice["route"] = json!(ROUTES.get(sel).map_or("inherit", |r| r.0));
                    self.rebuild_settings(cx);
                    return;
                }
                if let Some(sel) = self.control("s_voice_asr").and_then(|w| w.as_drop_down().changed(actions)) {
                    self.settings.voice["asr"] = json!(match sel {
                        0 => "inherit",
                        1 => "auto",
                        i => ASR_LANGUAGES.get(i - 2).copied().unwrap_or("inherit"),
                    });
                }
                if let Some(sel) = self.control("s_voice_voice").and_then(|w| w.as_drop_down().changed(actions)) {
                    self.capture_voice_form();
                    let current = s(&self.settings.voice["voice"]);
                    self.settings.voice["voice"] = json!(match sel {
                        0 => String::new(),
                        i if i <= VOICES.len() => VOICES[i - 1].0.to_owned(),
                        _ => current,
                    });
                    self.settings.voice["edited"] = json!(true);
                    self.rebuild_settings(cx);
                    return;
                }
                if clicked(self, "s_voice_advanced") {
                    self.capture_voice_form();
                    let open = self.settings.voice["advanced"].as_bool().unwrap_or(false);
                    self.settings.voice["advanced"] = json!(!open);
                    self.rebuild_settings(cx);
                    return;
                }
                let save = clicked(self, "s_voice_save");
                let test = clicked(self, "s_voice_test");
                if save || test {
                    self.capture_voice_form();
                    let v = self.settings.voice.clone();
                    let route = s(&v["route"]);
                    let token_set = self.settings.profile.as_ref().and_then(|p| p["config"]["env_vars"]["VOLC_TTS_TOKEN"].as_str()).is_some_and(|t| !t.is_empty());
                    if route == "cloud" && (normalize_appid(&s(&v["appid"])).is_none() || (!token_set && s(&v["token"]).is_empty())) {
                        self.settings.message = Some((Tab::Voice, "Cloud 模式需要纯数字 App ID 和 Token；不要填写“APP ID:”前缀".into(), false));
                        self.rebuild_settings(cx);
                        return;
                    }
                    let mut env = self.settings.profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or(json!({}));
                    if !s(&v["token"]).is_empty() {
                        env["VOLC_TTS_TOKEN"] = json!(s(&v["token"]));
                    }
                    let cloud = if v["had_cloud"].as_bool().unwrap_or(false) || v["edited"].as_bool().unwrap_or(false) {
                        let mut c = json!({});
                        for key in ["voice", "cluster", "encoding"] {
                            if !s(&v[key]).is_empty() {
                                c[key] = json!(s(&v[key]));
                            }
                        }
                        let appid = s(&v["appid"]);
                        if !appid.is_empty() {
                            c["appid"] = json!(normalize_appid(&appid).unwrap_or(appid));
                        }
                        c
                    } else {
                        Value::Null
                    };
                    let asr = s(&v["asr"]);
                    let patch = json!({
                        "tts_provider": if route == "inherit" { Value::Null } else { json!(route) },
                        "tts_cloud": cloud,
                        "asr_language": if asr == "inherit" { Value::Null } else { json!(asr) },
                        "env_vars": env,
                    });
                    self.save_settings_config(cx, patch, json!({}));
                    if test {
                        self.settings.busy = Some("tts");
                        self.rebuild_settings(cx);
                    }
                }
            }
            Tab::Authentication => {
                for (name, open) in [("s_auth_open", true), ("s_auth_restricted", false)] {
                    if clicked(self, name) {
                        self.capture_auth_form();
                        self.settings.auth["open"] = json!(open);
                        self.rebuild_settings(cx);
                        return;
                    }
                }
                if clicked(self, "s_auth_save") {
                    self.capture_auth_form();
                    let a = &self.settings.auth;
                    let Ok(port) = s(&a["port"]).trim().parse::<u16>() else {
                        self.settings.message = Some((Tab::Authentication, "[smtp]SMTP port must be a number.".into(), false));
                        self.rebuild_settings(cx);
                        return;
                    };
                    let mut body = json!({"host": s(&a["host"]).trim(), "port": port, "username": s(&a["username"]).trim(), "from_address": s(&a["from_address"]).trim(), "allow_self_registration": a["open"].as_bool().unwrap_or(false)});
                    let password = self.control_text("s_auth_pass");
                    if !password.is_empty() {
                        body["password"] = json!(password);
                    }
                    self.settings.busy = Some("auth-save");
                    self.server.json(cx, HttpMethod::POST, "/api/admin/smtp", Some(body), "settings:smtp-save");
                    self.rebuild_settings(cx);
                }
                if clicked(self, "s_auth_add") {
                    let email = self.control_text("s_auth_email").trim().to_owned();
                    if email.contains('@') {
                        self.capture_auth_form();
                        let note = self.control_text("s_auth_note").trim().to_owned();
                        let mut body = json!({"email": email});
                        if !note.is_empty() {
                            body["note"] = json!(note);
                        }
                        self.settings.busy = Some("auth-email");
                        self.server.json(cx, HttpMethod::POST, "/api/admin/allowed-emails", Some(body), "settings:email-add");
                        self.rebuild_settings(cx);
                    } else {
                        self.settings.message = Some((Tab::Authentication, "[email]Enter a valid email address.".into(), false));
                        self.rebuild_settings(cx);
                    }
                }
                let emails: Vec<String> = self.settings.auth["emails"].as_array().into_iter().flatten().map(|e| s(&e["email"])).collect();
                if let Some(email) = emails.iter().enumerate().find(|(i, _)| clicked(self, &format!("s_auth_remove_{i}"))).map(|(_, e)| e.clone()) {
                    self.capture_auth_form();
                    self.settings.busy = Some("auth-email");
                    self.server.json(cx, HttpMethod::DELETE, &format!("/api/admin/allowed-emails/{}", server::query_escape(&email)), None, "settings:email-remove");
                    self.rebuild_settings(cx);
                }
                if clicked(self, "s_auth_test") {
                    let to = self.control_text("s_auth_test_to").trim().to_owned();
                    self.capture_auth_form();
                    self.settings.busy = Some("auth-test");
                    self.server.json(cx, HttpMethod::POST, "/api/admin/smtp/test", Some(json!({"to": to})), "settings:smtp-test");
                    self.rebuild_settings(cx);
                }
            }
            Tab::Developer => {
                let mut changed = false;
                for key in ["debugMode", "showJevAdmissionDebugger", "showLearningTraceInspector"] {
                    let name = if key == "debugMode" { "s_dbg_mode".to_owned() } else { format!("s_dbg_{key}") };
                    if let Some(on) = self.control(&name).and_then(|w| w.as_check_box().changed(actions)) {
                        self.settings.debug[key] = json!(on);
                        changed = true;
                    }
                }
                if clicked(self, "s_dbg_reset") {
                    self.settings.debug = json!({"debugMode": false, "showJevAdmissionDebugger": true, "showLearningTraceInspector": true});
                    changed = true;
                }
                if changed {
                    self.save_debug_settings();
                    self.rebuild_settings(cx);
                }
            }
            Tab::Companion => {
                let picked = SKINS.iter().find(|(id, _, _, _)| clicked(self, &format!("skin_hit_{}", id.replace('-', "_")))).map(|k| k.0);
                if let Some(id) = picked {
                    self.set_teacher_skin(cx, id);
                    self.rebuild_settings(cx);
                }
            }
        }
    }

    /// Server results for the settings page; true when consumed.
    pub(crate) fn settings_server_event(&mut self, cx: &mut Cx, ev: &server::ServerEvent) -> bool {
        if !self.settings.open {
            return false;
        }
        match ev {
            server::ServerEvent::LoggedIn => {
                self.server.get_profile(cx);
                if self.settings.tab == Tab::Authentication {
                    self.load_auth(cx);
                }
                false
            }
            server::ServerEvent::Profile(result) => {
                self.settings.loading = false;
                if let Ok(p) = result {
                    self.settings.profile = Some(p.clone());
                    self.reset_settings_forms();
                }
                self.rebuild_settings(cx);
                // The setup page shares the profile when both are open.
                !self.ui.widget(cx, ids!(setup_page)).visible()
            }
            server::ServerEvent::ProfileSaved(result) if matches!(self.settings.busy, Some("save") | Some("tts")) => {
                let testing = self.settings.busy == Some("tts");
                self.settings.busy = None;
                match result {
                    Ok(p) => {
                        self.settings.profile = Some(p.clone());
                        let message = match p["runtime_disposition"].as_str() {
                            _ if self.settings.busy_tab != Tab::Llm => "Saved".to_owned(),
                            Some("reloaded") => "已生效，下一次生成使用新模型".into(),
                            Some("restart_required") => "已保存，服务重启后生效".into(),
                            Some("persisted_but_not_live") => "已保存。当前任务结束后，下一次生成将使用新模型".into(),
                            _ => "已保存，下一次生成课程时生效".into(),
                        };
                        self.reset_settings_forms();
                        self.settings.message = Some((self.settings.busy_tab, message, true));
                        if testing {
                            self.settings.busy = Some("tts");
                            self.server.synthesize(cx, "你好，这是一段课程语音测试。", "settings-tts");
                        }
                    }
                    Err(e) => self.settings.message = Some((self.settings.busy_tab, e.clone(), false)),
                }
                self.rebuild_settings(cx);
                true
            }
            server::ServerEvent::ProviderTested(result) if self.settings.busy == Some("test") => {
                self.settings.busy = None;
                self.settings.message = Some(match result {
                    Ok(()) => (Tab::Llm, "[test]Connected".into(), true),
                    Err(e) => (Tab::Llm, format!("[test]{e}"), false),
                });
                self.rebuild_settings(cx);
                true
            }
            server::ServerEvent::Json { purpose, result } if purpose == "settings:gateway" => {
                self.settings.busy = None;
                if let Err(e) = result {
                    self.settings.message = Some((Tab::Profile, e.clone(), false));
                }
                // Refresh the status from the profile.
                self.server.get_profile(cx);
                self.rebuild_settings(cx);
                true
            }
            server::ServerEvent::Json { purpose, result } if purpose.starts_with("settings:") => {
                let a = &mut self.settings.auth;
                match (purpose.as_str(), result) {
                    ("settings:smtp", Ok(v)) => {
                        for k in ["host", "port", "username", "from_address", "password_configured"] {
                            a[k] = v[k].clone();
                        }
                        a["open"] = v["allow_self_registration"].clone();
                        a["loaded"] = json!(true);
                    }
                    ("settings:smtp", Err(e)) => a["error"] = json!(format!("Failed to load authentication settings: {e}")),
                    ("settings:emails", Ok(v)) => {
                        a["emails"] = v.get("entries").or(v.get("emails")).cloned().unwrap_or_else(|| if v.is_array() { v.clone() } else { json!([]) });
                    }
                    ("settings:smtp-save", r) => {
                        self.settings.busy = None;
                        self.settings.message = Some(match r {
                            Ok(_) => (Tab::Authentication, "[smtp]Authentication settings saved and applied.".into(), true),
                            Err(e) => (Tab::Authentication, format!("[smtp]{e}"), false),
                        });
                        if r.is_ok() && !self.control_text("s_auth_pass").is_empty() {
                            self.settings.auth["password_configured"] = json!(true);
                        }
                    }
                    ("settings:email-add" | "settings:email-remove", r) => {
                        self.settings.busy = None;
                        match r {
                            Ok(_) => {
                                self.settings.message = None;
                                self.server.json(cx, HttpMethod::GET, "/api/admin/allowed-emails", None, "settings:emails");
                            }
                            Err(e) => self.settings.message = Some((Tab::Authentication, format!("[email]{e}"), false)),
                        }
                    }
                    ("settings:smtp-test", r) => {
                        self.settings.busy = None;
                        self.settings.message = Some(match r {
                            Ok(v) if v["ok"] != false => (Tab::Authentication, format!("[test]{}", v["message"].as_str().unwrap_or("Test email sent.")), true),
                            Ok(v) => (Tab::Authentication, format!("[test]{}", v["error"].as_str().or(v["message"].as_str()).unwrap_or("Test email failed.")), false),
                            Err(e) => (Tab::Authentication, format!("[test]{e}"), false),
                        });
                    }
                    _ => {}
                }
                self.rebuild_settings(cx);
                true
            }
            server::ServerEvent::Speech { purpose, audio } if purpose == "settings-tts" => {
                self.settings.busy = None;
                let message = match audio.clone().and_then(|a| self.play_speech(cx, &a, "preview")) {
                    Ok(()) => (Tab::Voice, "TTS 可用，试听已发送到当前默认扬声器。".to_owned(), true),
                    Err(e) => (Tab::Voice, format!("TTS 测试失败：{e}"), false),
                };
                self.settings.message = Some(message);
                self.rebuild_settings(cx);
                true
            }
            _ => false,
        }
    }
}

/// Web normalizeVolcanoAppId: /^(?:app\s*id\s*[:：]\s*)?(\d+)$/i.
fn normalize_appid(value: &str) -> Option<String> {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"(?i)^(?:app\s*id\s*[:：]\s*)?(\d+)$").unwrap())
        .captures(value.trim())
        .map(|c| c[1].to_owned())
}

/// Web use-teacher-skin TEACHER_SKINS: (id, label, description, 3D thumbnail).
pub const SKINS: [(&str, &str, &str, Option<&[u8]>); 7] = [
    ("ocean", "Ocean", "The calm blue Octos classroom companion.", None),
    ("coral", "Coral", "A warm, cheerful look inspired by coral reefs.", None),
    ("scholar", "Scholar", "Round glasses and a tiny cap for focused study.", None),
    ("starlight", "Starlight", "A deep-space Octos with a soft cosmic glow.", None),
    ("panda-3d", "Panda Pal", "A round little study buddy who nods, dances, and jumps.", Some(include_bytes!("../assets/companions/panda-thumbnail.png"))),
    ("penguin-3d", "Pocket Penguin", "A tiny, bright-eyed penguin with a gentle breathing idle.", Some(include_bytes!("../assets/companions/penguin-thumbnail.png"))),
    ("bee-3d", "Bumble Buddy", "A cheerful flying helper who hovers beside each lesson.", Some(include_bytes!("../assets/companions/bee-thumbnail.png"))),
];

/// Web OctosAvatar (octos-avatar.tsx + octos-avatar.css) for a 2D skin,
/// with the skin's CSS variables inlined.
pub fn avatar_svg(skin: &str) -> String {
    let (start, end, shadow, detail) = match skin {
        "coral" => ("#ffaaa0", "#ed6577", "#a9475c", "#9d3d58"),
        "scholar" => ("#b5a7ee", "#766bd2", "#4d438f", "#383265"),
        "starlight" => ("#6677d8", "#273678", "#182052", "#eef1ff"),
        _ => ("#76d8e4", "#2d9fbd", "#246f82", "#176b80"),
    };
    let stars = if skin == "starlight" {
        r##"<g fill="#fff4b9"><path d="m29 35 1.5 3 3 .5-2.2 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.2-2.2 3-.5Z"/><circle cx="66" cy="33" r="2"/><circle cx="70" cy="53" r="1.3"/></g>"##.to_owned()
    } else {
        String::new()
    };
    let scholar = if skin == "scholar" {
        format!(
            r##"<g fill="none" stroke="{detail}" stroke-width="2.3"><circle cx="38" cy="49" r="9"/><circle cx="59" cy="49" r="9"/><path d="M47 48h3"/></g><path d="m24 24 25-12 25 12-25 11-25-11Z" fill="{detail}"/><path d="M67 26v12" fill="none" stroke="{detail}" stroke-width="2"/><circle cx="67" cy="39" r="2.5" fill="{detail}"/>"##
        )
    } else {
        String::new()
    };
    let coral = if skin == "coral" {
        r##"<g fill="#fff0a8"><circle cx="68" cy="25" r="4"/><circle cx="62" cy="23" r="4"/><circle cx="65" cy="18" r="4"/><circle cx="71" cy="20" r="4"/></g><circle cx="66.5" cy="21.5" r="2.5" fill="#cf6d61"/>"##.to_owned()
    } else {
        String::new()
    };
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="octos-g" x1="22" y1="14" x2="76" y2="84" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{start}"/><stop offset="1" stop-color="{end}"/></linearGradient></defs><g opacity="0.18" fill="{shadow}"><ellipse cx="48" cy="82" rx="31" ry="6"/></g><g fill="url(#octos-g)"><path d="M20 63c-8 4-9 15-2 18 6 3 11-1 12-7 1-3 4-4 7-2l1-10c-7-4-12-3-18 1Z"/><path d="M35 66c-5 7-3 17 4 18 6 1 9-5 8-11l-1-9-11 2Z"/><path d="M50 65v10c0 7 4 11 9 9 6-2 7-11 2-18l-11-1Z"/><path d="M60 63c8-3 14-1 17 5 4 8-2 15-8 12-4-2-4-7-8-8-2-1-4 0-6 2l5-11Z"/><path d="M18 49c0-21 12-35 30-35s30 14 30 35c0 17-12 27-30 27S18 66 18 49Z"/></g><path d="M27 40c2-10 9-17 18-19" fill="none" stroke="#ffffff6b" stroke-linecap="round" stroke-width="4"/>{stars}<g><ellipse cx="38" cy="49" rx="7" ry="8" fill="#ffffff"/><ellipse cx="59" cy="49" rx="7" ry="8" fill="#ffffff"/><circle cx="40" cy="51" r="3" fill="#21383f"/><circle cx="57" cy="51" r="3" fill="#21383f"/><path d="M43 62c3 3 7 3 10 0" fill="none" stroke="#21383f" stroke-linecap="round" stroke-width="2.5"/></g>{scholar}{coral}</svg>"##
    )
}

impl App {
    fn skin_path(&self) -> Option<std::path::PathBuf> {
        self.store.as_ref().map(|s| s.dir().join("teacher-skin"))
    }
    /// Web useTeacherSkin: the saved companion (default ocean).
    pub(crate) fn load_teacher_skin(&mut self, cx: &mut Cx) {
        let saved = self.skin_path().and_then(|p| std::fs::read_to_string(p).ok()).map(|s| s.trim().to_owned());
        self.teacher_skin = saved.filter(|s| SKINS.iter().any(|k| k.0 == s)).unwrap_or_else(|| "ocean".into());
        self.apply_teacher_skin(cx);
    }
    pub(crate) fn set_teacher_skin(&mut self, cx: &mut Cx, skin: &str) {
        self.teacher_skin = skin.to_owned();
        if let Some(path) = self.skin_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap()).and_then(|_| std::fs::write(path, skin));
        }
        self.apply_teacher_skin(cx);
    }
    /// The lower-right teacher: 2D skins as SVG, 3D companions as their
    /// thumbnail. DIFF: the GLB models (and their animations) are not drawn.
    pub(crate) fn apply_teacher_skin(&mut self, cx: &mut Cx) {
        let Some(def) = SKINS.iter().find(|k| k.0 == self.teacher_skin) else { return };
        let png = def.3;
        self.ui.widget(cx, ids!(octos_art_holder)).set_visible(cx, png.is_none());
        self.ui.widget(cx, ids!(octos_png)).set_visible(cx, png.is_some());
        match png {
            Some(bytes) => {
                let _ = self.ui.image(cx, ids!(octos_png_image)).load_png_from_data(cx, bytes);
            }
            None => {
                if let Some(mut svg) = self.ui.widget(cx, ids!(octos_art)).borrow_mut::<Svg>() {
                    svg.draw_svg.load_from_str(&avatar_svg(def.0));
                }
            }
        }
        self.ui.redraw(cx);
    }
}
