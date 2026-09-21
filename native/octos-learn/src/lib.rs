//! Octos Learn macOS product shell: launcher + course playback page.
//! The playback page mirrors the web learning workspace (src/learning/
//! learning-workspace.tsx + oll/oll-lesson-runtime.tsx): full-screen spatial
//! board with floating controls. Differences from the web baseline are marked
//! "DIFF" and collected in the handoff report.
use makepad_widgets::*;
use oll_runtime::session::Session;
use octos_oll_preview::{board_view, progress_store, spatial_board};
use std::time::Instant;

mod course_pack;

app_main!(App);

script_mod! {
    use mod.prelude.widgets.*
    use mod.widgets.*
    startup() do #(App::script_component(vm)) {
        ui: Root {
            main_window := Window {
                window.inner_size: vec2(1440, 900)
                body +: {
                    flow: Overlay
                    // Launcher (web course-launcher.tsx): header, hero, recent
                    // whiteboards, curated courses. Light theme taken from the
                    // audited course-launcher.css (#f7f4ec page, #fffef9 cards,
                    // #166a79 teal accent, #243b40 text).
                    launcher := SolidView {
                        visible: true
                        width: Fill height: Fill
                        draw_bg +: { color: #f7f4ec }
                        launcher_scroll := ScrollYView { width: Fill height: Fill flow: Down
                            View { width: Fill height: Fit flow: Down align: Align{x: 0.5}
                                View { width: 1120 height: Fit flow: Down padding: Inset{bottom: 72}
                                    // 1. Header (web .course-launcher-header).
                                    View { width: Fill height: Fit flow: Down
                                        View { width: Fill height: 82 flow: Right align: Align{y: 0.5} spacing: 10
                                            logo_fallback := RoundedView { width: 34 height: 34 align: Align{x: 0.5 y: 0.5}
                                                draw_bg +: { color: #166a79 border_radius: 9 }
                                                Label { text: "O" draw_text.text_style.font_size: 15 draw_text.color: #ffffff }
                                            }
                                            // The logo file is a multi-motif artboard sheet;
                                            // preserve_viewbox crops to the intended motif.
                                            logo_svg := Svg { width: 34 height: 34 draw_svg +: { preserve_viewbox: true } }
                                            Label { text: "Octos Learn" draw_text.text_style.font_size: 16 draw_text.color: #243b40 }
                                            View { width: Fill height: 1 }
                                            // DIFF: no login/account system in this version.
                                            Label { text: "登录尚未迁移" draw_text.text_style.font_size: 10 draw_text.color: #607477 }
                                        }
                                        SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } }
                                    }
                                    // 2. Hero (web .course-launcher-hero).
                                    View { width: Fill height: Fit flow: Down padding: Inset{top: 56 bottom: 44}
                                        Label { text: "LEARN ON A LIVING WHITEBOARD" draw_text.text_style.font_size: 9 draw_text.color: #5a8d94 }
                                        Label { width: Fill text: "从一节课开始，或者从一块空白白板开始。"
                                            draw_text.wrap: Words draw_text.text_style.font_size: 28 draw_text.color: #243b40
                                            margin: Inset{top: 14 bottom: 12} }
                                        Label { width: Fill text: "跟着准备好的课程探索，也可以写下自己的问题，让小章鱼陪你一起推导。"
                                            draw_text.wrap: Words draw_text.text_style.font_size: 13 draw_text.color: #607477 }
                                        View { width: Fit height: Fit flow: Right spacing: 12 align: Align{y: 0.5} margin: Inset{top: 24}
                                            // DIFF: blank whiteboard needs the session system; disabled.
                                            blank_board := Button { enabled: false text: "＋ 新建空白白板"
                                                draw_bg +: { color: #166a79 color_hover: #105664 color_down: #105664 } draw_text.color: #ffffff }
                                            Label { text: "空白白板尚未迁移" draw_text.text_style.font_size: 9 draw_text.color: #718387 }
                                        }
                                    }
                                    // 3. Recent whiteboards (web .course-launcher-sessions);
                                    // cards are built from progress_store checkpoint files.
                                    sessions_section := View { visible: false width: Fill height: Fit flow: Down margin: Inset{bottom: 40}
                                        View { width: Fill height: Fit flow: Down spacing: 4
                                            Label { text: "RECENT WHITEBOARDS" draw_text.text_style.font_size: 9 draw_text.color: #5a8d94 }
                                            Label { text: "最近白板" draw_text.text_style.font_size: 18 draw_text.color: #243b40 margin: Inset{top: 4 bottom: 10} }
                                            SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } margin: Inset{bottom: 16} }
                                        }
                                        session_list := View { width: Fill height: Fit flow: Flow.Right{wrap: true} spacing: 12 }
                                    }
                                    // 4. Curated courses (web .course-launcher-library);
                                    // cards are built from course_pack::catalog().
                                    View { width: Fill height: Fit flow: Down spacing: 4
                                        Label { text: "CURATED COURSES" draw_text.text_style.font_size: 9 draw_text.color: #5a8d94 }
                                        Label { text: "预制课程" draw_text.text_style.font_size: 18 draw_text.color: #243b40 margin: Inset{top: 4 bottom: 10} }
                                        SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } margin: Inset{bottom: 16} }
                                        launcher_status := Label { width: Fill text: "" draw_text.wrap: Words draw_text.color: #815d40 draw_text.text_style.font_size: 11 }
                                        course_list := View { width: Fill height: Fit flow: Flow.Right{wrap: true} spacing: 22 margin: Inset{top: 8} }
                                    }
                                }
                            }
                        }
                    }
                    // Playback page (web: learning-page.tsx full-bleed board, all
                    // controls floating above it).
                    learning := View {
                        visible: false
                        width: Fill height: Fill
                        flow: Overlay
                        spatial := SpatialBoard { width: Fill height: Fill draw_bg +: { color: #f8f7f3 } }
                        // Top bar (web .learning-workspace-topbar: left 116, right 14, top 14).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 116 right: 14 top: 14}
                            topbar := RoundedView {
                                width: Fill height: Fit flow: Right spacing: 10 align: Align{y: 0.5}
                                padding: Inset{left: 18 right: 9 top: 7 bottom: 7}
                                draw_bg +: { color: #fdfaf3 border_radius: 18 border_size: 1 border_color: #e8e0d4 }
                                View { width: Fill height: Fit flow: Down spacing: 2
                                    Label { text: "OCTOS LEARNING CANVAS" draw_text.text_style.font_size: 8 draw_text.color: #8a8074 }
                                    course_title := Label { text: "" draw_text.text_style.font_size: 15 draw_text.color: #332e28 }
                                }
                                play := Button { text: "播放" draw_text.color: #3c3832 }
                                // DIFF: runtime has no per-beat seek, so both stay disabled.
                                next_beat := Button { enabled: false text: "下一 Beat（未迁移）" draw_text.color: #b3aa9c }
                                replay_topic := Button { enabled: false text: "重播 Topic（未迁移）" draw_text.color: #b3aa9c }
                                narration_toggle := Button { text: "旁白：开" draw_text.color: #3c3832 }
                                action_status := Label { width: Fit text: "" draw_text.text_style.font_size: 9 draw_text.color: #a09689 }
                                progress_note := Label { width: Fit text: "" draw_text.text_style.font_size: 9 draw_text.color: #94a36f }
                                // DIFF: voice/camera are not migrated; disabled placeholders.
                                voice := Button { enabled: false text: "启用语音（未迁移）" draw_text.color: #b3aa9c }
                                camera := Button { enabled: false text: "启用摄像头（未迁移）" draw_text.color: #b3aa9c }
                            }
                        }
                        // Top-left round page buttons (web .learning-top-action-group: left 12 top 24).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 12 top: 24}
                            View { width: 64 height: Fit flow: Down spacing: 6 align: Align{x: 0.5}
                                back := Button { width: 44 height: 44 text: "首页" draw_text.text_style.font_size: 9 draw_text.color: #3c3832
                                    draw_bg +: { border_radius: 22 color: #fffdf8 color_hover: #f3ede2 } }
                                settings := Button { enabled: false width: 44 height: 44 text: "设置" draw_text.text_style.font_size: 9 draw_text.color: #b3aa9c
                                    draw_bg +: { border_radius: 22 color: #fffdf8 } }
                                // DIFF: settings page not migrated; the disabled state plus this note explain it.
                                Label { width: Fill text: "设置尚未迁移" draw_text.wrap: Words draw_text.text_style.font_size: 7 draw_text.color: #a09689 }
                            }
                        }
                        // Handwriting toolbar (web .learning-ink-toolbar: top 88 left 20).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 20 top: 88}
                            View { width: Fit height: Fit flow: Down spacing: 6
                                ink_toolbar := RoundedView {
                                    width: Fit height: Fit flow: Down spacing: 3 padding: 5 align: Align{x: 0.5}
                                    draw_bg +: { color: #fffdf8f0 border_radius: 16 border_size: 1 border_color: #e8e0d4 }
                                    // Buttons are built in Rust (rebuild_ink_tools) so the
                                    // browse/pen active state can be highlighted per mode.
                                    // DIFF: oll-runtime Ink has no erase/select; both stay disabled.
                                    ink_tools := View { width: Fit height: Fit flow: Down spacing: 3 align: Align{x: 0.5} }
                                    ink_status := Label { width: Fit text: "0 项笔迹" draw_text.text_style.font_size: 8 draw_text.color: #827b72 }
                                }
                                ink_palette_panel := RoundedView {
                                    visible: false width: Fit height: Fit flow: Right spacing: 4 padding: 5
                                    draw_bg +: { color: #fffdf8f0 border_radius: 12 border_size: 1 border_color: #e8e0d4 }
                                    ink_color_0 := Button { width: 26 height: 26 text: "" draw_bg +: { color: #176b62 color_hover: #176b62 color_down: #176b62 border_radius: 13 } }
                                    ink_color_1 := Button { width: 26 height: 26 text: "" draw_bg +: { color: #d4a574 color_hover: #d4a574 color_down: #d4a574 border_radius: 13 } }
                                    ink_color_2 := Button { width: 26 height: 26 text: "" draw_bg +: { color: #b95873 color_hover: #b95873 color_down: #b95873 border_radius: 13 } }
                                    ink_color_3 := Button { width: 26 height: 26 text: "" draw_bg +: { color: #4f84b5 color_hover: #4f84b5 color_down: #4f84b5 border_radius: 13 } }
                                    ink_color_4 := Button { width: 26 height: 26 text: "" draw_bg +: { color: #332e28 color_hover: #332e28 color_down: #332e28 border_radius: 13 } }
                                }
                                ink_width_panel := RoundedView {
                                    visible: false width: Fit height: Fit flow: Right spacing: 4 padding: 5
                                    draw_bg +: { color: #fffdf8f0 border_radius: 12 border_size: 1 border_color: #e8e0d4 }
                                    ink_width_0 := Button { text: "细" }
                                    ink_width_1 := Button { text: "中" }
                                    ink_width_2 := Button { text: "粗" }
                                    ink_width_3 := Button { text: "特" }
                                }
                                // DIFF: persisted ink documents are not migrated; strokes live in memory only.
                                Label { width: Fit text: "擦除 / 框选 / 笔迹持久化尚未迁移" draw_text.text_style.font_size: 8 draw_text.color: #a09689 }
                            }
                        }
                        // Variable controls. DIFF: the web panel is world-anchored next to
                        // the plot card; this version pins it to a fixed floating slot
                        // (web default slot: left 28, bottom 182).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 1.} padding: Inset{left: 28 bottom: 182}
                            variable_panel := RoundedView {
                                visible: false width: 360 height: Fit flow: Down spacing: 6
                                padding: Inset{left: 12 right: 12 top: 10 bottom: 10}
                                draw_bg +: { color: #fffdf8f2 border_radius: 18 border_size: 1 border_color: #e8e0d4 }
                                variable_list := View { width: Fill height: Fit flow: Down spacing: 8 }
                                variable_note := Label { visible: false width: Fill height: Fit text: "老师正在演示这个变量，结束后即可继续拖动"
                                    draw_text.wrap: Words draw_text.text_style.font_size: 9 draw_text.color: #827b72 }
                            }
                        }
                        // Teacher (web .octos-teacher: right 24 bottom 98).
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 98}
                            View { width: Fit height: Fit flow: Right spacing: 12 align: Align{y: 1.}
                                narration_bubble := RoundedView {
                                    visible: false width: 360 height: Fit
                                    padding: Inset{left: 17 right: 17 top: 14 bottom: 14}
                                    draw_bg +: { color: #fffdf8ee border_radius: 20 border_size: 1 border_color: #e3d9cb }
                                    // DIFF: the web bubble renders markdown; plain text here.
                                    narration := Label { width: Fill height: Fit text: "" draw_text.wrap: Words draw_text.text_style.font_size: 13 draw_text.color: #3c3832 }
                                }
                                View { width: Fit height: Fit flow: Down spacing: 4 align: Align{x: 0.5}
                                    // DIFF: static avatar; the organic skin animation is a later milestone.
                                    teacher_avatar := CircleView { width: 94 height: 94 align: Align{x: 0.5 y: 0.5}
                                        draw_bg +: { color: #bfe3ea border_size: 1 border_color: #7fb5c4 }
                                        Label { text: "Octos" draw_text.text_style.font_size: 11 draw_text.color: #2d6a78 }
                                    }
                                    teacher_state := Label { width: Fit text: "已暂停" draw_text.text_style.font_size: 9 draw_text.color: #827b72 }
                                }
                            }
                        }
                        // Error bar (web .learning-ink-error bottom toast, simplified).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 24}
                            error_bar := RoundedView {
                                visible: false width: Fit height: Fit padding: Inset{left: 16 right: 16 top: 10 bottom: 10}
                                draw_bg +: { color: #f9e3df border_radius: 12 }
                                error_label := Label { width: Fit height: Fit text: "" draw_text.text_style.font_size: 11 draw_text.color: #8c3a2b }
                            }
                        }
                    }
                }
            }
        }
    }
}

struct VariableRow {
    alias: String,
    unit: String,
    min: f64,
    max: f64,
    step: f64,
    initial: f64,
    sliding: bool,
    slider: WidgetRef,
    value: WidgetRef,
    minus: WidgetRef,
    plus: WidgetRef,
    reset: WidgetRef,
}

struct CourseCardRefs {
    pack_id: String,
    version: String,
    preview: WidgetRef,
    start: WidgetRef,
}

struct SessionCardRefs {
    pack_id: String,
    version: String,
    open: WidgetRef,
}

#[derive(Script, ScriptHook)]
pub struct App {
    #[live]
    ui: WidgetRef,
    #[rust]
    player: Option<Session>,
    #[rust]
    course_source: String,
    // Currently open pack (recorded so progress keys and reopen stay stable).
    #[rust]
    pack_id: String,
    #[rust]
    pack_version: String,
    #[rust]
    drawing: bool,
    #[rust]
    pen_color: Vec4,
    #[rust]
    pen_width: f64,
    #[rust]
    narration_muted: bool,
    #[rust]
    store: Option<progress_store::Store>,
    #[rust]
    pending_save: Option<progress_store::Request>,
    #[rust]
    last_save: Option<Instant>,
    #[rust]
    awaiting_restore: bool,
    #[rust]
    timer: Timer,
    #[rust]
    last_tick: Option<Instant>,
    #[rust]
    error: String,
    #[rust]
    last_ink_count: usize,
    #[rust]
    variable_rows: Vec<VariableRow>,
    #[rust]
    course_cards: Vec<CourseCardRefs>,
    #[rust]
    session_cards: Vec<SessionCardRefs>,
    // Ink toolbar buttons in INK_TOOLS order, rebuilt when the mode changes.
    #[rust]
    ink_tool_buttons: Vec<WidgetRef>,
    // Set by "开始互动"/"继续学习": playback starts once the restore reply
    // resolves (restored checkpoint, or fresh when none exists).
    #[rust]
    autoplay_pending: bool,
}

const PEN_COLORS: [(u8, u8, u8); 5] = [
    (0x17, 0x6b, 0x62),
    (0xd4, 0xa5, 0x74),
    (0xb9, 0x58, 0x73),
    (0x4f, 0x84, 0xb5),
    (0x33, 0x2e, 0x28),
];
/// Brand logo shipped with the app repository (public/images), rendered
/// natively by DrawSvg. The rounded fallback block stays when parsing fails.
const LAUNCHER_LOGO_SVG: &str = include_str!("../../../public/images/octos-logo-color.svg");
const PEN_WIDTHS: [f64; 4] = [2.0, 3.5, 5.5, 8.0];
// Ink toolbar order: label, tool id. Erase/select stay disabled (no Ink support).
const INK_TOOLS: [&str; 8] = ["浏览", "书写", "擦除", "框选", "调色", "粗细", "撤销", "重做"];
const INK_TOOL_BROWSE: usize = 0;
const INK_TOOL_PEN: usize = 1;
const INK_TOOL_ERASE: usize = 2;
const INK_TOOL_SELECT: usize = 3;
const INK_TOOL_PALETTE: usize = 4;
const INK_TOOL_WIDTH: usize = 5;
const INK_TOOL_UNDO: usize = 6;
const INK_TOOL_REDO: usize = 7;

fn pen_vec4(rgb: (u8, u8, u8)) -> Vec4 {
    vec4(
        rgb.0 as f32 / 255.,
        rgb.1 as f32 / 255.,
        rgb.2 as f32 / 255.,
        1.,
    )
}
fn clicked(w: &WidgetRef, actions: &Actions) -> bool {
    actions
        .find_widget_action(w.widget_uid())
        .is_some_and(|item| matches!(item.cast(), ButtonAction::Clicked(_)))
}
/// Web ± steppers snap to the declared step grid from min (oll-lesson-runtime.tsx:3515).
fn step_value(value: f64, min: f64, max: f64, step: f64, direction: f64) -> f64 {
    let step = if step > 0. { step } else { (max - min) / 100. };
    let index = ((value - min) / step).round() + direction;
    (min + index * step).clamp(min, max)
}
fn format_value(value: f64, unit: &str) -> String {
    let rounded = (value * 100.).round() / 100.;
    let base = if rounded == rounded.trunc() {
        format!("{}", rounded as i64)
    } else {
        format!("{rounded}")
    };
    if unit.is_empty() {
        base
    } else {
        format!("{base} {unit}")
    }
}
/// Catalog grade/subject codes rendered as localized badge text. The audited
/// web launcher prints the raw codes; these labels follow the localized
/// wording requested for the product UI, falling back to the raw code.
fn grade_label(grade: &str) -> &str {
    match grade {
        "primary-age-8-9" => "小学 8-9 岁",
        "secondary-age-12-14" => "初中 12-14 岁",
        other => other,
    }
}
fn subject_label(subject: &str) -> &str {
    match subject {
        "mathematics" => "数学",
        other => other,
    }
}
/// Text embedded into eval'd widget code must not break the string literal.
fn script_text(text: &str) -> String {
    text.replace(['"', '\\', '\n'], " ")
}
/// makepad's SVG parser applies presentation attributes and inline styles but
/// not `<style>` class rules. The brand logo uses Illustrator `stN` classes,
/// so bake those fill/fill-rule declarations into attributes before loading.
fn bake_svg_classes(svg: &str) -> String {
    let mut baked_attrs: Vec<(String, String)> = Vec::new();
    let mut out = String::new();
    let mut rest = svg;
    while let Some(start) = rest.find("<style") {
        let Some(open_end) = rest[start..].find('>').map(|i| start + i + 1) else {
            break;
        };
        let Some(close) = rest[open_end..].find("</style>").map(|i| open_end + i) else {
            break;
        };
        let body = &rest[open_end..close];
        out.push_str(&rest[..start]);
        rest = &rest[close + "</style>".len()..];
        for rule in body.split('}') {
            let Some((selectors, decls)) = rule.split_once('{') else {
                continue;
            };
            for decl in decls.split(';') {
                let Some((prop, value)) = decl.split_once(':') else {
                    continue;
                };
                let (prop, value) = (prop.trim(), value.trim());
                if prop != "fill" && prop != "fill-rule" {
                    continue;
                }
                for selector in selectors.split(',') {
                    if let Some(class) = selector.trim().strip_prefix('.') {
                        baked_attrs.push((class.to_owned(), format!("{prop}=\"{value}\"")));
                    }
                }
            }
        }
    }
    out.push_str(rest);
    // Combine all declarations for one class into a single attribute string;
    // the logo's elements each carry exactly one class.
    let mut by_class: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for (class, attr) in baked_attrs {
        by_class.entry(class).or_default().push(attr);
    }
    let mut result = out;
    for (class, attrs) in by_class {
        result = result.replace(&format!("class=\"{class}\""), &attrs.join(" "));
    }
    result
}

impl App {
    fn course_key(&self) -> String {
        format!("{}@{}", self.pack_id, self.pack_version)
    }
    fn note(&mut self, cx: &mut Cx, message: &str) {
        self.ui.label(cx, ids!(progress_note)).set_text(cx, message);
    }
    fn save_progress(&mut self, _cx: &mut Cx) {
        if let Some(player) = &self.player {
            match player.checkpoint() {
                Ok(value) => {
                    self.pending_save =
                        Some(progress_store::Request::Save(self.course_key(), value));
                    self.last_save = Some(Instant::now());
                }
                Err(e) => self.error = e,
            }
        }
    }
    fn poll_storage(&mut self, cx: &mut Cx) {
        if let Some(store) = &self.store {
            if let Some(request) = self.pending_save.take() {
                if let Err(request) = store.send(request) {
                    self.pending_save = Some(request);
                }
            }
        }
        while let Some(reply) = self.store.as_ref().and_then(|s| s.poll()) {
            match reply {
                progress_store::Reply::Saved(key) => {
                    if key == self.course_key() {
                        self.note(cx, "进度已保存");
                    }
                }
                progress_store::Reply::Loaded(key, saved) => {
                    if key != self.course_key() || !self.awaiting_restore {
                        continue;
                    }
                    self.awaiting_restore = false;
                    // The user already started playback before the reply
                    // arrived; never clobber a live session with a restore.
                    if self.player.as_ref().is_some_and(|s| s.playing) {
                        self.autoplay_pending = false;
                        continue;
                    }
                    match saved {
                        Some(saved) => match Session::restore(&self.course_source, &saved) {
                            Ok(player) => {
                                let w = self.ui.widget(cx, ids!(spatial));
                                if let Some(mut b) = w.borrow_mut::<spatial_board::SpatialBoard>()
                                {
                                    b.clear(cx);
                                }
                                self.player = Some(player);
                                self.error.clear();
                                self.build_variable_rows(cx);
                                if self.autoplay_pending {
                                    self.autoplay_pending = false;
                                    self.note(cx, "已恢复进度，继续播放");
                                    self.start_playback(cx);
                                } else {
                                    self.note(cx, "已恢复进度（已暂停），点击播放继续");
                                }
                                self.refresh(cx);
                            }
                            Err(e) => {
                                self.note(cx, &format!("无法恢复进度，已从头开始：{e}"));
                                if self.autoplay_pending {
                                    self.autoplay_pending = false;
                                    self.start_playback(cx);
                                }
                            }
                        },
                        None => {
                            self.note(cx, "这门课程还没有保存的进度");
                            if self.autoplay_pending {
                                self.autoplay_pending = false;
                                self.start_playback(cx);
                            }
                        }
                    }
                }
                progress_store::Reply::Failed(e) => {
                    self.error = format!("进度存储失败：{e}");
                    if self.autoplay_pending {
                        self.autoplay_pending = false;
                        self.start_playback(cx);
                    }
                }
            }
        }
    }
    fn start_playback(&mut self, _cx: &mut Cx) {
        if let Some(session) = &mut self.player {
            if !session.playing {
                if let Err(e) = session.play() {
                    self.error = e;
                }
            }
        }
        self.last_tick = Some(Instant::now());
    }
    fn open_course(&mut self, cx: &mut Cx, pack_id: &str, version: &str, autoplay: bool) {
        self.error.clear();
        self.drawing = false;
        self.narration_muted = false;
        self.autoplay_pending = false;
        let root = course_pack::pack_root();
        let source = match course_pack::load_source(&root, pack_id, version) {
            Ok(source) => source,
            Err(e) => {
                self.error = e.clone();
                self.ui.label(cx, ids!(launcher_status)).set_text(cx, &e);
                self.refresh(cx);
                return;
            }
        };
        match Session::load(&source) {
            Ok(session) => {
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.clear(cx);
                };
                self.pack_id = pack_id.into();
                self.pack_version = version.into();
                self.course_source = source;
                self.player = Some(session);
                self.build_variable_rows(cx);
                self.show_learning(cx, true);
                self.note(cx, "");
                self.autoplay_pending = autoplay;
                if let Some(store) = &self.store {
                    self.awaiting_restore =
                        store.send(progress_store::Request::Load(self.course_key())).is_ok();
                }
                if self.autoplay_pending && !self.awaiting_restore {
                    // No store worker: nothing to wait for, start immediately.
                    self.autoplay_pending = false;
                    self.start_playback(cx);
                }
            }
            Err(e) => {
                self.error = e.clone();
                self.ui.label(cx, ids!(launcher_status)).set_text(cx, &e);
            }
        }
        self.refresh(cx);
    }
    fn show_learning(&mut self, cx: &mut Cx, learning: bool) {
        self.ui.widget(cx, ids!(launcher)).set_visible(cx, !learning);
        self.ui.widget(cx, ids!(learning)).set_visible(cx, learning);
    }
    /// Ink toolbar buttons with the current browse/pen mode highlighted
    /// (web .learning-ink-toolbar is-active: teal text on a faint teal wash).
    /// Rebuilt on every mode change because script-shader buttons cannot be
    /// recoloured from Rust without dropping state.
    fn rebuild_ink_tools(&mut self, cx: &mut Cx) {
        self.ink_tool_buttons.clear();
        let mut widgets = Vec::new();
        for (index, label) in INK_TOOLS.iter().enumerate() {
            let active = (index == INK_TOOL_PEN) == self.drawing
                && (index == INK_TOOL_PEN || index == INK_TOOL_BROWSE);
            let disabled = index == INK_TOOL_ERASE || index == INK_TOOL_SELECT;
            let (bg, extra_bg, text_color, enabled) = if disabled {
                ("#0000", "", "#c3bbae", false)
            } else if active {
                ("#dceef1", "color_hover:#dceef1 color_down:#d0e5ea", "#0c7085", true)
            } else {
                ("#0000", "color_hover:#f1f3ee color_down:#e7ebe6", "#4a4238", true)
            };
            let code = format!(
                "Button{{width:64 enabled:{enabled} text:\"{label}\"
                    draw_bg +: {{color:{bg} {extra_bg} border_radius:10 border_color:#0000}}
                    draw_text.color:{text_color}}}"
            );
            match board_view::widget(cx, &code) {
                Ok(button) => {
                    widgets.push(button.clone());
                    self.ink_tool_buttons.push(button);
                }
                Err(e) => self.error = e,
            }
        }
        if let Err(e) =
            board_view::children(cx, &self.ui.widget(cx, ids!(ink_tools)), widgets)
        {
            self.error = e;
        }
    }
    /// Course card (web CourseCard): SVG cover with grade badge, meta row,
    /// title, description, offline/duration footer, preview/start actions.
    fn course_card(cx: &mut Cx, root: &std::path::Path, pack: &serde_json::Value) -> Result<(WidgetRef, CourseCardRefs), String> {
        let pack_id = pack["packId"].as_str().unwrap_or("").to_owned();
        let version = pack["version"].as_str().unwrap_or("").to_owned();
        let title = script_text(pack["title"].as_str().unwrap_or(&pack_id));
        let desc = script_text(pack["description"].as_str().unwrap_or(""));
        let grade = format!(
            "{} · {}",
            grade_label(pack["grade"].as_str().unwrap_or("")),
            subject_label(pack["subject"].as_str().unwrap_or(""))
        );
        let minutes = (pack["durationSeconds"].as_f64().unwrap_or(0.) / 60.).ceil() as u64;
        let recommended = pack["recommended"].as_bool().unwrap_or(false);
        let first_char = title.chars().next().unwrap_or('课');
        let code = format!(
            "RoundedView{{width:340 height:Fit flow:Down draw_bg +: {{color:#fffef9 border_radius:18 border_size:1 border_color:#dbded9}}
                cover := View{{width:Fill height:174 flow:Overlay
                    cover_fallback := RoundedView{{visible:false width:Fill height:Fill align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#e4f2ee border_radius:0}}
                        fallback_char := Label{{text:\"{first_char}\" draw_text.text_style.font_size:40 draw_text.color:#166a79}}
                    }}
                    thumb := Svg{{width:Fill height:Fill}}
                    View{{width:Fill height:Fill flow:Down align:Align{{x:0. y:1.}} padding:Inset{{left:14 bottom:12}}
                        RoundedView{{width:Fit height:Fit padding:Inset{{left:10 right:10 top:5 bottom:5}} draw_bg +: {{color:#fffffff0 border_radius:12}}
                            grade := Label{{text:\"{grade}\" draw_text.text_style.font_size:9 draw_text.color:#24434a}}
                        }}
                    }}
                }}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:20 right:20 top:16 bottom:16}}
                    View{{width:Fill height:Fit flow:Right spacing:12
                        Label{{text:\"课程包 v{version}\" draw_text.text_style.font_size:9 draw_text.color:#5c8b92}}
                        recommended := Label{{visible:false text:\"推荐版本\" draw_text.text_style.font_size:9 draw_text.color:#0b6978}}
                    }}
                    card_title := Label{{width:Fill text:\"{title}\" draw_text.wrap:Words draw_text.text_style.font_size:15 draw_text.color:#243b40 margin:Inset{{top:8}}}}
                    card_desc := Label{{width:Fill height:44 text:\"{desc}\" draw_text.wrap:Words draw_text.text_style.font_size:10 draw_text.color:#627579 margin:Inset{{top:6}}}}
                    View{{width:Fill height:Fit flow:Down spacing:8 margin:Inset{{top:12}}
                        SolidView{{width:Fill height:1 draw_bg +: {{color:#e7e9e3}}}}
                        View{{width:Fill height:Fit flow:Right spacing:8 align:Align{{y:0.5}}
                            Label{{width:Fill text:\"内置课程 · 可离线 · {minutes} 分钟\" draw_text.text_style.font_size:9 draw_text.color:#667a7b}}
                            preview := Button{{text:\"预览\" draw_bg +: {{color:#0000 color_hover:#f1f3ee color_down:#e7ebe6 border_radius:8 border_color:#0000}} draw_text.color:#607477}}
                            start := Button{{text:\"开始互动\" draw_bg +: {{color:#0000 color_hover:#f1f3ee color_down:#e7ebe6 border_radius:8 border_color:#0000}} draw_text.color:#0b6978}}
                        }}
                    }}
                }}
            }}"
        );
        let card = board_view::widget(cx, &code)?;
        // Thumbnail: render the pack SVG natively; fall back to an accent
        // block with the first title character when missing/unreadable.
        let thumb_name = pack["thumbnail"].as_str().unwrap_or("thumbnail.svg");
        let thumb_text = std::fs::read_to_string(root.join(&pack_id).join(&version).join(thumb_name))
            .ok()
            .filter(|text| text.contains("<svg"));
        let thumb = card.widget(cx, ids!(thumb));
        match thumb_text {
            Some(text) => {
                if let Some(mut svg) = thumb.borrow_mut::<Svg>() {
                    svg.draw_svg.load_from_str(&text);
                }
            }
            None => {
                thumb.set_visible(cx, false);
                card.widget(cx, ids!(cover_fallback)).set_visible(cx, true);
            }
        }
        card.widget(cx, ids!(recommended)).set_visible(cx, recommended);
        Ok((
            card.clone(),
            CourseCardRefs {
                pack_id,
                version,
                preview: card.widget(cx, ids!(preview)),
                start: card.widget(cx, ids!(start)),
            },
        ))
    }
    /// Recent-whiteboard card (web WhiteboardSessionCard, without the
    /// rename/delete actions, which need the session system).
    fn session_card(cx: &mut Cx, pack_id: &str, version: &str, title: &str, status: &str) -> Result<(WidgetRef, SessionCardRefs), String> {
        let title = script_text(title);
        let code = format!(
            "RoundedView{{width:280 height:76 flow:Right align:Align{{y:0.5}} padding:Inset{{left:16 right:10}} spacing:8 draw_bg +: {{color:#fffef9 border_radius:15 border_size:1 border_color:#dbded9}}
                View{{width:Fill height:Fit flow:Down spacing:4
                    session_title := Label{{width:Fill text:\"{title}\" draw_text.text_style.font_size:12 draw_text.color:#29464b}}
                    session_state := Label{{text:\"{status}\" draw_text.text_style.font_size:9 draw_text.color:#718387}}
                }}
                open := Button{{text:\"继续学习\" draw_bg +: {{color:#0000 color_hover:#f1f3ee color_down:#e7ebe6 border_radius:8 border_color:#0000}} draw_text.color:#0b6978}}
            }}"
        );
        let card = board_view::widget(cx, &code)?;
        Ok((
            card.clone(),
            SessionCardRefs {
                pack_id: pack_id.into(),
                version: version.into(),
                open: card.widget(cx, ids!(open)),
            },
        ))
    }
    /// Rebuild the launcher lists: curated course cards from the pack catalog
    /// and recent-whiteboard cards from progress_store checkpoint files.
    /// Called at startup and whenever the user returns from the learning page.
    fn rebuild_launcher(&mut self, cx: &mut Cx) {
        self.course_cards.clear();
        self.session_cards.clear();
        let root = course_pack::pack_root();
        let packs = match course_pack::catalog(&root) {
            Ok(packs) => {
                self.ui.label(cx, ids!(launcher_status)).set_text(cx, "");
                packs
            }
            Err(e) => {
                self.ui.label(cx, ids!(launcher_status)).set_text(cx, &e);
                Vec::new()
            }
        };
        // Recent whiteboards: every `{packId}@{version}.json` checkpoint in the
        // store directory, newest first. Completion is resolved by restoring
        // the checkpoint once (cheap for the small built-in packs).
        let mut sessions = Vec::new();
        if let Some(store) = &self.store {
            if let Ok(read) = std::fs::read_dir(store.dir()) {
                for file in read.flatten() {
                    let name = file.file_name().to_string_lossy().into_owned();
                    let Some(key) = name.strip_suffix(".json") else { continue };
                    let Some((pack_id, version)) = key.split_once('@') else { continue };
                    let title = packs
                        .iter()
                        .find(|p| p["packId"] == pack_id && p["version"] == version)
                        .and_then(|p| p["title"].as_str())
                        .unwrap_or(pack_id)
                        .to_owned();
                    let restored = std::fs::read_to_string(file.path())
                        .ok()
                        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                        .and_then(|saved| {
                            course_pack::load_source(&root, pack_id, version)
                                .ok()
                                .and_then(|src| Session::restore(&src, &saved).ok())
                        });
                    let status = match &restored {
                        Some(s) if s.complete() => "已完成".to_owned(),
                        Some(s) => format!(
                            "进行中 · 动作 {}/{}",
                            s.board.cursor,
                            s.board.action_count()
                        ),
                        None => "进行中".to_owned(),
                    };
                    let mtime = file
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                    sessions.push((pack_id.to_owned(), version.to_owned(), title, status, mtime));
                }
            }
        }
        sessions.sort_by(|a, b| b.4.cmp(&a.4));
        let mut session_widgets = Vec::new();
        for (pack_id, version, title, status, _) in sessions {
            match Self::session_card(cx, &pack_id, &version, &title, &status) {
                Ok((widget, refs)) => {
                    session_widgets.push(widget);
                    self.session_cards.push(refs);
                }
                Err(e) => {
                    self.ui.label(cx, ids!(launcher_status)).set_text(cx, &e);
                }
            }
        }
        if let Err(e) = board_view::children(cx, &self.ui.widget(cx, ids!(session_list)), session_widgets) {
            self.error = e;
        }
        self.ui
            .widget(cx, ids!(sessions_section))
            .set_visible(cx, !self.session_cards.is_empty());
        let mut course_widgets = Vec::new();
        for pack in &packs {
            match Self::course_card(cx, &root, pack) {
                Ok((widget, refs)) => {
                    course_widgets.push(widget);
                    self.course_cards.push(refs);
                }
                Err(e) => {
                    self.ui.label(cx, ids!(launcher_status)).set_text(cx, &e);
                }
            }
        }
        if let Err(e) = board_view::children(cx, &self.ui.widget(cx, ids!(course_list)), course_widgets) {
            self.error = e;
        }
        if self.course_cards.is_empty() && self.error.is_empty() {
            self.ui
                .label(cx, ids!(launcher_status))
                .set_text(cx, "课程包还在准备中。首批课程发布后会出现在这里。");
        }
        self.ui.redraw(cx);
    }
    fn build_variable_rows(&mut self, cx: &mut Cx) {
        self.variable_rows.clear();
        let mut roots = Vec::new();
        if let Some(session) = &self.player {
            for d in session.board.variable_declarations() {
                let alias = d["as"].as_str().unwrap_or("").to_owned();
                if alias.is_empty() {
                    continue;
                }
                let min = d["min"].as_f64().unwrap_or(0.);
                let max = d["max"].as_f64().unwrap_or(1.);
                let initial = d["initial"].as_f64().unwrap_or(min);
                let step = d["control"]["step"].as_f64().unwrap_or(0.);
                let unit = d["unit"].as_str().unwrap_or("").to_owned();
                let label = d["label"]
                    .as_str()
                    .unwrap_or(&alias)
                    .replace(['"', '\\'], " ");
                let code = format!(
                    "View{{width:Fill height:Fit flow:Down spacing:3
                        View{{width:Fill height:Fit flow:Right align: Align{{y: 0.5}}
                            row_label := Label{{width:Fill height:Fit text:\"{label}\" draw_text.text_style.font_size:11 draw_text.color:#3c3832}}
                            row_value := Label{{width:Fit height:Fit text:\"\" draw_text.text_style.font_size:11 draw_text.color:#827b72}}
                        }}
                        View{{width:Fill height:Fit flow:Right spacing:6 align: Align{{y: 0.5}}
                            row_slider := mod.widgets.Slider{{width:Fill min:{min} max:{max} step:{step} default:{initial}}}
                            row_minus := Button{{text:\"-\" draw_text.color:#4a4238}}
                            row_plus := Button{{text:\"+\" draw_text.color:#4a4238}}
                            row_reset := Button{{text:\"复位\" draw_text.text_style.font_size:9 draw_text.color:#4a4238}}
                        }}
                    }}"
                );
                match board_view::widget(cx, &code) {
                    Ok(root) => {
                        let slider = root.widget(cx, ids!(row_slider));
                        if let Some(mut s) = slider.borrow_mut::<Slider>() {
                            s.set_value(cx, initial);
                        }
                        let row = VariableRow {
                            alias,
                            unit,
                            min,
                            max,
                            step,
                            initial,
                            sliding: false,
                            slider,
                            value: root.widget(cx, ids!(row_value)),
                            minus: root.widget(cx, ids!(row_minus)),
                            plus: root.widget(cx, ids!(row_plus)),
                            reset: root.widget(cx, ids!(row_reset)),
                        };
                        row.value
                            .set_text(cx, &format_value(initial, &row.unit));
                        roots.push(root);
                        self.variable_rows.push(row);
                    }
                    Err(e) => self.error = e,
                }
            }
        }
        let list = self.ui.widget(cx, ids!(variable_list));
        if let Err(e) = board_view::children(cx, &list, roots) {
            self.error = e;
        }
        self.ui
            .widget(cx, ids!(variable_panel))
            .set_visible(cx, !self.variable_rows.is_empty());
        let w = self.ui.widget(cx, ids!(spatial));
        if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
            board.set_left_inset(if self.variable_rows.is_empty() {
                0.
            } else {
                412.
            });
        };
    }
    fn set_variable(&mut self, cx: &mut Cx, index: usize, value: f64) {
        if self.player.as_ref().is_some_and(|s| s.board.animating()) {
            // Teacher demo in progress: sliders stay locked (web parity).
            return;
        }
        let Some(alias) = self.variable_rows.get(index).map(|r| r.alias.clone()) else {
            return;
        };
        if let Some(session) = &mut self.player {
            if let Err(e) = session.board.set_variable(&alias, value) {
                self.error = e;
            }
        }
        self.refresh(cx);
    }
    fn refresh_variable_rows(&mut self, cx: &mut Cx) {
        let animating = self.player.as_ref().is_some_and(|s| s.board.animating());
        for row in &mut self.variable_rows {
            let value = self
                .player
                .as_ref()
                .and_then(|s| s.board.variables.get(&row.alias).copied())
                .unwrap_or(row.initial);
            if !row.sliding {
                if let Some(mut s) = row.slider.borrow_mut::<Slider>() {
                    s.set_value(cx, value);
                }
            }
            row.value.set_text(cx, &format_value(value, &row.unit));
        }
        self.ui
            .widget(cx, ids!(variable_note))
            .set_visible(cx, animating);
    }
    fn refresh(&mut self, cx: &mut Cx) {
        if let Some(session) = &self.player {
            let p = &session.board;
            self.ui.label(cx, ids!(course_title)).set_text(cx, &p.title);
            let state = if session.complete() {
                "播放完成"
            } else if session.playing {
                "播放中"
            } else {
                "已暂停"
            };
            self.ui
                .widget(cx, ids!(play))
                .set_text(cx, if session.playing { "暂停" } else { "播放" });
            self.ui.label(cx, ids!(action_status)).set_text(
                cx,
                &format!("动作 {}/{}", p.cursor, p.action_count()),
            );
            self.ui.label(cx, ids!(teacher_state)).set_text(cx, state);
            // Narration bubble: narration during playback, summary once complete.
            let bubble = if session.complete() {
                &p.summary
            } else {
                &p.narration
            };
            self.ui.label(cx, ids!(narration)).set_text(cx, bubble);
            self.ui
                .widget(cx, ids!(narration_bubble))
                .set_visible(cx, !self.narration_muted && !bubble.is_empty());
            self.ui
                .widget(cx, ids!(narration_toggle))
                .set_text(cx, if self.narration_muted { "旁白：关" } else { "旁白：开" });
            let action = session.operations[..session.cursor]
                .iter()
                .rev()
                .find(|op| op["type"] == "action.apply")
                .map(|op| &op["action"]);
            let w = self.ui.widget(cx, ids!(spatial));
            if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                if let Err(e) = board.set_state(cx, p, action) {
                    self.error = e;
                }
            };
        }
        let stroke_count = self
            .ui
            .widget(cx, ids!(spatial))
            .borrow::<spatial_board::SpatialBoard>()
            .map(|b| b.ink_count())
            .unwrap_or(0);
        self.ui.label(cx, ids!(ink_status)).set_text(
            cx,
            &format!(
                "{stroke_count} 项笔迹 · {}",
                if self.drawing { "书写中" } else { "浏览" }
            ),
        );
        self.refresh_variable_rows(cx);
        self.ui
            .widget(cx, ids!(error_bar))
            .set_visible(cx, !self.error.is_empty());
        self.ui
            .label(cx, ids!(error_label))
            .set_text(cx, &self.error.clone());
        self.ui.redraw(cx);
    }
}

impl AppMain for App {
    fn script_mod(vm: &mut ScriptVm) -> ScriptValue {
        makepad_widgets::script_mod(vm);
        makepad_plot::script_mod(vm);
        spatial_board::script_mod(vm);
        self::script_mod(vm)
    }
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        if matches!(event, Event::Startup) {
            if let Err(e) = progress_store::Store::start(cx).map(|s| self.store = Some(s)) {
                self.error = e;
            }
            self.pen_color = pen_vec4(PEN_COLORS[0]);
            self.pen_width = PEN_WIDTHS[1];
            self.last_tick = Some(Instant::now());
            self.timer = cx.start_interval(1.0 / 60.0);
            self.rebuild_launcher(cx);
            self.rebuild_ink_tools(cx);
            let logo_loaded = {
                let logo = self.ui.widget(cx, ids!(logo_svg));
                let mut loaded = false;
                if let Some(mut svg) = logo.borrow_mut::<Svg>() {
                    svg.draw_svg.load_from_str(&bake_svg_classes(LAUNCHER_LOGO_SVG));
                    loaded = svg.draw_svg.content_size.x > 0.;
                }
                loaded
            };
            if logo_loaded {
                self.ui.widget(cx, ids!(logo_fallback)).set_visible(cx, false);
            }
        }
        self.poll_storage(cx);
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        let in_learning = self.player.is_some();
        if self.timer.is_event(event).is_some() {
            let now = Instant::now();
            let dt = self
                .last_tick
                .replace(now)
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            if was_playing {
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.advance(cx, dt);
                };
                if let Some(session) = &mut self.player {
                    if let Err(e) = session.tick(dt) {
                        self.error = e;
                    }
                }
            }
            // Strokes commit through pointer hits, not widget actions; watch
            // the count so the toolbar status catches up while paused.
            let ink_count = self
                .ui
                .widget(cx, ids!(spatial))
                .borrow::<spatial_board::SpatialBoard>()
                .map(|b| b.ink_count())
                .unwrap_or(0);
            if ink_count != self.last_ink_count {
                self.last_ink_count = ink_count;
                self.refresh(cx);
            }
        }
        let mut skip_autosave = false;
        if let Event::Actions(actions) = event {
            // Launcher cards: preview stays paused, start/continue autoplay.
            for index in 0..self.course_cards.len() {
                let (pack_id, version) = {
                    let card = &self.course_cards[index];
                    (card.pack_id.clone(), card.version.clone())
                };
                if clicked(&self.course_cards[index].preview, actions) {
                    skip_autosave = true;
                    self.open_course(cx, &pack_id, &version, false);
                }
                if clicked(&self.course_cards[index].start, actions) {
                    skip_autosave = true;
                    self.open_course(cx, &pack_id, &version, true);
                }
            }
            for index in 0..self.session_cards.len() {
                let (pack_id, version) = {
                    let card = &self.session_cards[index];
                    (card.pack_id.clone(), card.version.clone())
                };
                if clicked(&self.session_cards[index].open, actions) {
                    skip_autosave = true;
                    self.open_course(cx, &pack_id, &version, true);
                }
            }
            if self.ui.button(cx, ids!(back)).clicked(actions) {
                skip_autosave = true;
                if let Some(session) = &mut self.player {
                    session.pause();
                }
                self.save_progress(cx);
                self.show_learning(cx, false);
                self.note(cx, "");
                self.rebuild_launcher(cx);
                self.ui.redraw(cx);
            }
            if self.ui.button(cx, ids!(play)).clicked(actions) {
                // Starting playback cancels any in-flight progress restore.
                self.awaiting_restore = false;
                if self.drawing {
                    self.drawing = false;
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.set_drawing(cx, false);
                    };
                }
                if self.player.as_ref().is_some_and(Session::complete) {
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.clear(cx);
                    };
                    match Session::load(&self.course_source) {
                        Ok(session) => self.player = Some(session),
                        Err(e) => self.error = e,
                    }
                }
                if let Some(session) = &mut self.player {
                    if session.playing {
                        session.pause();
                    } else if let Err(e) = session.play() {
                        self.error = e;
                    }
                }
                self.last_tick = Some(Instant::now());
            }
            if self.ui.button(cx, ids!(narration_toggle)).clicked(actions) {
                self.narration_muted = !self.narration_muted;
            }
            // Handwriting toolbar (dynamic buttons, INK_TOOLS order).
            let ink_clicked = |tool: usize, buttons: &[WidgetRef], actions: &Actions| {
                buttons.get(tool).is_some_and(|b| clicked(b, actions))
            };
            let set_drawing = if ink_clicked(INK_TOOL_PEN, &self.ink_tool_buttons, actions) {
                Some(true)
            } else if ink_clicked(INK_TOOL_BROWSE, &self.ink_tool_buttons, actions) {
                Some(false)
            } else {
                None
            };
            if let Some(drawing) = set_drawing {
                self.drawing = drawing;
                if drawing {
                    if let Some(session) = &mut self.player {
                        session.pause();
                    }
                }
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.set_drawing(cx, drawing);
                    board.set_pen(cx, self.pen_color, self.pen_width);
                };
                self.rebuild_ink_tools(cx);
            }
            {
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    if ink_clicked(INK_TOOL_UNDO, &self.ink_tool_buttons, actions) {
                        board.undo_ink(cx);
                    }
                    if ink_clicked(INK_TOOL_REDO, &self.ink_tool_buttons, actions) {
                        board.redo_ink(cx);
                    }
                };
            }
            if ink_clicked(INK_TOOL_PALETTE, &self.ink_tool_buttons, actions) {
                let panel = self.ui.widget(cx, ids!(ink_palette_panel));
                let open = panel.visible();
                panel.set_visible(cx, !open);
            }
            if ink_clicked(INK_TOOL_WIDTH, &self.ink_tool_buttons, actions) {
                let panel = self.ui.widget(cx, ids!(ink_width_panel));
                let open = panel.visible();
                panel.set_visible(cx, !open);
            }
            for (i, id) in [
                ids!(ink_color_0),
                ids!(ink_color_1),
                ids!(ink_color_2),
                ids!(ink_color_3),
                ids!(ink_color_4),
            ]
            .into_iter()
            .enumerate()
            {
                if self.ui.button(cx, id).clicked(actions) {
                    self.pen_color = pen_vec4(PEN_COLORS[i]);
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.set_pen(cx, self.pen_color, self.pen_width);
                    };
                }
            }
            for (i, id) in [
                ids!(ink_width_0),
                ids!(ink_width_1),
                ids!(ink_width_2),
                ids!(ink_width_3),
            ]
            .into_iter()
            .enumerate()
            {
                if self.ui.button(cx, id).clicked(actions) {
                    self.pen_width = PEN_WIDTHS[i];
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.set_pen(cx, self.pen_color, self.pen_width);
                    };
                }
            }
            // Variable panel: slider start/update/commit plus −/+/reset.
            for index in 0..self.variable_rows.len() {
                let slider_uid = self.variable_rows[index].slider.widget_uid();
                if let Some(item) = actions.find_widget_action(slider_uid) {
                    match item.cast() {
                        SliderAction::StartSlide => self.variable_rows[index].sliding = true,
                        SliderAction::Slide(v) | SliderAction::TextSlide(v) => {
                            self.set_variable(cx, index, v)
                        }
                        SliderAction::EndSlide(v) => {
                            self.variable_rows[index].sliding = false;
                            self.set_variable(cx, index, v);
                        }
                        _ => (),
                    }
                }
                let current = self
                    .player
                    .as_ref()
                    .and_then(|s| {
                        s.board
                            .variables
                            .get(&self.variable_rows[index].alias)
                            .copied()
                    })
                    .unwrap_or(self.variable_rows[index].initial);
                let (min, max, step, initial) = {
                    let r = &self.variable_rows[index];
                    (r.min, r.max, r.step, r.initial)
                };
                if clicked(&self.variable_rows[index].minus, actions) {
                    self.set_variable(cx, index, step_value(current, min, max, step, -1.));
                }
                if clicked(&self.variable_rows[index].plus, actions) {
                    self.set_variable(cx, index, step_value(current, min, max, step, 1.));
                }
                if clicked(&self.variable_rows[index].reset, actions) {
                    self.set_variable(cx, index, initial);
                }
            }
        }
        // Autosave once per second while playing, and once when playback pauses.
        if !skip_autosave
            && in_learning
            && self.player.as_ref().is_some_and(|s| s.cursor > 0)
            && was_playing
            && (self
                .last_save
                .is_none_or(|t| t.elapsed().as_secs_f64() >= 1.)
                || self.player.as_ref().is_some_and(|s| !s.playing))
        {
            self.save_progress(cx);
        }
        self.poll_storage(cx);
        if (self.timer.is_event(event).is_some() && was_playing) || control_event {
            self.refresh(cx);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn steppers_snap_to_the_step_grid_from_min() {
        assert_eq!(super::step_value(4., 1., 8., 1., 1.), 5.);
        assert_eq!(super::step_value(1., 1., 8., 1., -1.), 1.);
        assert!((super::step_value(1.02, -5., 5., 0.05, 1.) - 1.05).abs() < 1e-9);
        assert_eq!(super::step_value(4.97, -5., 5., 0.05, 1.), 5.);
        // Continuous sliders fall back to a 1% nudge.
        assert!((super::step_value(0., 0., 10., 0., 1.) - 0.1).abs() < 1e-9);
    }
    #[test]
    fn values_format_with_unit_and_trimmed_decimals() {
        assert_eq!(super::format_value(4., "厘米"), "4 厘米");
        assert_eq!(super::format_value(-2.5, ""), "-2.5");
        assert_eq!(super::format_value(0.30000000000000004, ""), "0.3");
    }
    #[test]
    fn svg_style_classes_are_baked_into_attributes() {
        let svg = r#"<svg><defs><style>
            .st0 { fill: #f7d47b; }
            .st0, .st1 { fill-rule: evenodd; }
            .st1 { fill: #fff; stroke: #000; }
        </style></defs><path class="st0" d="M0 0"/><path class="st1" d="M1 1"/></svg>"#;
        let baked = super::bake_svg_classes(svg);
        assert!(!baked.contains("<style"));
        assert!(baked.contains(r##"<path fill="#f7d47b" fill-rule="evenodd" d="M0 0"/>"##));
        assert!(baked.contains(r##"<path fill-rule="evenodd" fill="#fff" d="M1 1"/>"##));
        // stroke is not baked (logo only needs fill/fill-rule), class attr is gone either way
        assert!(!baked.contains("class="));
    }
}
