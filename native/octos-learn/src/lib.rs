//! Octos Learn macOS product shell: launcher + course playback page.
//! The playback page mirrors the web learning workspace (src/learning/
//! learning-workspace.tsx + oll/oll-lesson-runtime.tsx): full-screen spatial
//! board with floating controls. Differences from the web baseline are marked
//! "DIFF" and collected in the handoff report.
use makepad_widgets::*;
use oll_runtime::session::Session;
use octos_oll_preview::{board_view, progress_store, scene3d_view, spatial_board};
mod svg_image;
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
                                    // Text boxes follow the web CSS: font_size = px * 0.75,
                                    // line_spacing = CSS line-height / 1.18, spacing on a
                                    // wrapping View (see web_text).
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
                                            View { width: Fit height: Fit padding: Inset{top: 3.04 bottom: 3.04 left: 0}
    Label { width: Fit padding: 0 text: "Octos Learn" draw_text.text_style: theme.font_bold{font_size: 14.25 line_spacing: 1.271} draw_text.color: #243b40 } }
                                            View { width: Fill height: 1 }
                                            // DIFF: no login/account system in this version.
                                            View { width: Fit height: Fit padding: Inset{top: 2.24 bottom: 2.24 left: 0}
    Label { width: Fit padding: 0 text: "登录" draw_text.text_style: theme.font_regular{font_size: 10.50 line_spacing: 1.271} draw_text.color: #244f5a } }
                                        }
                                        SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } }
                                    }
                                    // 2. Hero (web .course-launcher-hero), collections home only
                                    // (web: !collectionId).
                                    home_sections := View { width: Fill height: Fit flow: Down padding: Inset{top: 56 bottom: 44}
                                        View { width: Fit height: Fit padding: Inset{top: 1.76 bottom: 1.76 left: 0}
    Label { width: Fit padding: 0 text: "LEARN ON A LIVING WHITEBOARD" draw_text.text_style: theme.font_code{font_size: 8.25 line_spacing: 1.271} draw_text.color: #5a8d94 } }
                                        View { width: Fill height: Fit padding: Inset{top: 20.92 bottom: 21.92 left: 0}
    Label { width: Fill padding: 0 text: "从一组课程，开始新的探索。" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 36.72 line_spacing: 1.136} draw_text.color: #243b40 } }
                                        View { width: Fill height: Fit padding: Inset{top: 4.42 bottom: 4.42 left: 0}
    Label { width: Fill padding: 0 text: "跟着准备好的课程探索，也可以写下自己的问题，让小章鱼陪你一起推导。" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 12.75 line_spacing: 1.441} draw_text.color: #607477 } }
                                        // DIFF: blank whiteboard needs the session system; a tap shows a toast.
                                        blank_board := RoundedView { width: Fit height: 52 flow: Right spacing: 12 align: Align{y: 0.5} margin: Inset{top: 32}
                                            padding: Inset{left: 20 right: 20} draw_bg +: { color: #166a79 border_radius: 15 }
                                            blank_plus := Svg { width: 20 height: 20 draw_svg +: { preserve_viewbox: true } }
                                            View { width: Fit height: Fit padding: Inset{top: 2.56 bottom: 2.56 left: 0}
    Label { width: Fit padding: 0 text: "新建空白白板" draw_text.text_style: theme.font_bold{font_size: 12.00 line_spacing: 1.271} draw_text.color: #ffffff } }
                                            blank_arrow := Svg { width: 18 height: 18 draw_svg +: { preserve_viewbox: true } margin: Inset{left: 18} }
                                        }
                                    }
                                    // 3. Library (web .course-launcher-library): the
                                    // collection grid on home, or one collection's
                                    // course cards (web ?collection=<id>). Recent
                                    // whiteboards (web: blank boards only) are not migrated.
                                    View { width: Fill height: Fit flow: Down
                                        collection_back := View { visible: false width: Fit height: 44 flow: Right spacing: 8 align: Align{y: 0.5} margin: Inset{top: 28 bottom: 28}
                                            back_icon := Svg { width: 17 height: 17 draw_svg +: { preserve_viewbox: true } }
                                            View { width: Fit height: Fit padding: Inset{top: 2.24 bottom: 2.24 left: 0}
    Label { width: Fit padding: 0 text: "全部课程集" draw_text.text_style: theme.font_regular{font_size: 10.50 line_spacing: 1.271} draw_text.color: #426568 } }
                                        }
                                        View { width: Fill height: Fit flow: Right align: Align{y: 1.0} padding: Inset{bottom: 15}
                                            View { width: Fill height: Fit flow: Down
                                                View { width: Fit height: Fit padding: Inset{top: 1.76 bottom: 1.76 left: 0}
    library_eyebrow := Label { width: Fit padding: 0 text: "CURATED COLLECTIONS" draw_text.text_style: theme.font_code{font_size: 8.25 line_spacing: 1.271} draw_text.color: #5a8d94 }
    // The mono code font has no CJK glyphs; collection levels use the UI font.
    library_level := Label { visible: false width: Fit padding: 0 text: "" draw_text.text_style: theme.font_bold{font_size: 8.25 line_spacing: 1.271} draw_text.color: #5a8d94 } }
                                                View { width: Fit height: Fit padding: Inset{top: 6.27 bottom: 0.27 left: 0}
    library_title := Label { width: Fit padding: 0 text: "课程集" draw_text.text_style: theme.font_regular{font_size: 20.25 line_spacing: 1.017} draw_text.color: #243b40 } }
                                            }
                                            library_icon := Svg { width: 23 height: 23 draw_svg +: { preserve_viewbox: true } }
                                        }
                                        SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } margin: Inset{bottom: 22} }
                                        collection_intro := View { visible: false width: Fill height: Fit flow: Down margin: Inset{bottom: 30}
                                            View { width: Fill height: Fit padding: Inset{top: 4.96 bottom: 4.96 left: 0}
    intro_text := Label { width: Fill padding: 0 text: "" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 12.00 line_spacing: 1.525} draw_text.color: #607477 } }
                                            View { width: Fill height: Fit padding: Inset{top: 16.03 bottom: 4.03 left: 0}
    intro_meta := Label { width: Fill padding: 0 text: "" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 9.75 line_spacing: 1.525} draw_text.color: #607477 } }
                                        }
                                        launcher_status := View { visible: false width: Fill height: Fit padding: Inset{top: 2.94 bottom: 20.94 left: 0}
    launcher_status_text := Label { width: Fill padding: 0 text: "" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 10.50 line_spacing: 1.356} draw_text.color: #815d40 } }
                                        course_list := View { width: Fill height: Fit flow: Down spacing: 22 }
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
                        spatial := SpatialBoard { width: Fill height: Fill dot_grid: true draw_bg +: { color: #f8f5ed } }
                        // Top bar (web .learning-workspace-topbar: left 116,
                        // right 14, top 14; 3-column grid: title block /
                        // centered icon demo controls / mode buttons).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 116 right: 14 top: 14}
                            topbar := RoundedView {
                                width: Fill height: 58 flow: Right spacing: 16 align: Align{y: 0.5}
                                padding: Inset{left: 18 right: 9 top: 7 bottom: 7}
                                draw_bg +: { color: #fffdf8d4 border_radius: 18 border_size: 1 border_color: #ece5d9 }
                                View { width: Fill height: Fit flow: Down spacing: 2
                                    Label { height: 12 text: "OCTOS LEARNING CANVAS" draw_text.text_style.font_size: 9 draw_text.color: #8a8074 }
                                    course_title := Label { height: 26 text: "" draw_text.text_style.font_size: 20 draw_text.color: #332e28 }
                                }
                                View { width: Fit height: Fit flow: Right spacing: 4 align: Align{y: 0.5}
                                    play := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 17 height: 17} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 11 border_size: 0 border_color: #0000 } }
                                    // DIFF: runtime has no per-beat seek/restart; clicks show a toast.
                                    next_beat := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 17 height: 17} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 11 border_size: 0 border_color: #0000 } }
                                    replay_topic := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 11 border_size: 0 border_color: #0000 } }
                                    narration_toggle := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 11 border_size: 0 border_color: #0000 } }
                                }
                                View { width: Fill height: Fit flow: Right spacing: 4 align: Align{x: 1. y: 0.5}
                                    // DIFF: voice/camera are not migrated; clicks show a toast.
                                    voice := Button { height: 34 text: "启用语音" spacing: 6
                                        padding: Inset{left: 10 right: 10 top: 7 bottom: 7}
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #507784 }
                                        draw_text.color: #507784 draw_text.text_style.font_size: 9
                                        draw_bg +: { color: #ecf1ef color_hover: #dee8e8 color_down: #d2e0e0 border_radius: 10 border_size: 0 border_color: #0000 } }
                                    camera := Button { height: 34 text: "启用摄像头" spacing: 6
                                        padding: Inset{left: 10 right: 10 top: 7 bottom: 7}
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #507784 }
                                        draw_text.color: #507784 draw_text.text_style.font_size: 9
                                        draw_bg +: { color: #ecf1ef color_hover: #dee8e8 color_down: #d2e0e0 border_radius: 10 border_size: 0 border_color: #0000 } }
                                }
                            }
                        }
                        // Top-left round page buttons (web .learning-top-action-group:
                        // left 12 top 24, 40px circles with House/Settings icons).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 12 top: 24}
                            View { width: 96 height: Fit flow: Right spacing: 8
                                back := Button { width: 40 height: 40 text: ""
                                    icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #x57534e }
                                    draw_bg +: { border_radius: 20 color: #ffffffcc color_hover: #f3ede2 border_size: 1 border_color: #0000001a } }
                                // DIFF: settings page not migrated; click shows a toast.
                                settings := Button { width: 40 height: 40 text: ""
                                    icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #x57534e }
                                    draw_bg +: { border_radius: 20 color: #ffffffcc color_hover: #f3ede2 border_size: 1 border_color: #0000001a } }
                            }
                        }
                        // Handwriting toolbar (web .learning-ink-toolbar:
                        // horizontal capsule, top 88 left 20).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 20 top: 88}
                            ink_toolbar := RoundedView {
                                width: Fit height: Fit flow: Right spacing: 3 padding: 5 align: Align{y: 0.5}
                                draw_bg +: { color: #fffdf8f0 border_radius: 16 border_size: 1 border_color: #e4ded3 }
                                // Buttons are built in Rust (rebuild_ink_tools) so the
                                // browse/pen active state can be highlighted per mode.
                                ink_tools := View { width: Fit height: Fit flow: Right spacing: 3 align: Align{y: 0.5} }
                                ink_status := Label { width: Fit text: "0 项笔迹 · 已保存" draw_text.text_style.font_size: 10 draw_text.color: #6e766f margin: Inset{left: 8 right: 8} }
                            }
                        }
                        // Variable controls. DIFF: the web panel is world-anchored next to
                        // the plot card; this version pins it to a fixed floating slot
                        // (web default slot: left 28, bottom 182).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 1.} padding: Inset{left: 28 bottom: 182}
                            variable_panel := RoundedView {
                                visible: false width: 360 height: Fit flow: Down spacing: 6
                                padding: Inset{left: 12 right: 12 top: 10 bottom: 10}
                                draw_bg +: { color: #fffdf8f2 border_radius: 18 border_size: 1 border_color: #e4ded3 }
                                variable_list := View { width: Fill height: Fit flow: Down spacing: 6 }
                                variable_note := Label { visible: false width: Fill height: Fit text: "老师正在演示这个变量，结束后即可继续拖动"
                                    draw_text.wrap: Words draw_text.text_style.font_size: 9 draw_text.color: #827b72 }
                            }
                        }
                        // Course outline trigger (web .oll-course-outline-trigger:
                        // 48px rounded square above the teacher avatar).
                        // DIFF: the outline panel is not migrated; click shows a toast.
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 47 bottom: 204}
                            outline_trigger := Button { width: 48 height: 48 text: "" icon_walk: Walk{width: 15 height: 15}
                                draw_icon +: { color: #466d78 }
                                draw_bg +: { color: #f0f9f8f0 color_hover: #e0f2f2 border_radius: 16 border_size: 1 border_color: #cfe2e3 } }
                        }
                        // Teacher (web .octos-teacher: right 24 bottom 98).
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 98}
                            View { width: Fit height: Fit flow: Right spacing: 12 align: Align{y: 1.}
                                narration_bubble := RoundedView {
                                    visible: false width: 360 height: Fit margin: Inset{bottom: 26}
                                    padding: Inset{left: 17 right: 17 top: 14 bottom: 14}
                                    draw_bg +: { color: #fffdf8ee border_radius: 18 border_size: 1 border_color: #dce3e2 }
                                    // DIFF: the web bubble renders markdown; plain text here.
                                    narration := Label { width: Fill height: Fit text: "" draw_text.wrap: Words draw_text.text_style.font_size: 16 draw_text.color: #3c3832 }
                                }
                                View { width: 94 height: 94 flow: Overlay
                                    CircleView { width: Fill height: Fill
                                        draw_bg +: { color: #e6f4f7 border_size: 1 border_color: #c2dde6 } }
                                    // DIFF: static avatar; the organic skin animation is a later milestone.
                                    View { width: Fill height: Fill align: Align{x: 0.5 y: 0.3}
                                        octos_art := Svg { width: 56 height: 56 } }
                                    View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 7}
                                        teacher_state := Label { width: Fit text: "已暂停" draw_text.text_style.font_size: 10 draw_text.color: #316979 }
                                    }
                                }
                            }
                        }
                        // Student input dock (web .learning-input-dock: bottom
                        // 22, centered, max-width 720). DIFF: ask/voice input is
                        // not migrated; every control shows the toast.
                        View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 22}
                            input_dock := RoundedView {
                                width: 720 height: Fit flow: Right spacing: 5 align: Align{y: 0.5} padding: 6
                                draw_bg +: { color: #fffdf8e8 border_radius: 21 border_size: 1 border_color: #e7e0d4 }
                                ask_image := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 19 height: 19}
                                    draw_icon +: { color: #756c61 }
                                    draw_bg +: { color: #0000 color_hover: #e9f0f2 color_down: #dde9ec border_radius: 13 border_size: 0 border_color: #0000 } }
                                ask_camera := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 19 height: 19}
                                    draw_icon +: { color: #756c61 }
                                    draw_bg +: { color: #0000 color_hover: #e9f0f2 color_down: #dde9ec border_radius: 13 border_size: 0 border_color: #0000 } }
                                ask_mic := Button { width: 44 height: 44 text: "" icon_walk: Walk{width: 21 height: 21}
                                    draw_icon +: { color: #ffffff }
                                    draw_bg +: { color: #167794 color_hover: #12627c color_down: #12627c border_radius: 13 border_size: 0 border_color: #0000 } }
                                Label { width: Fill text: "问一个问题，或告诉 Octos 你卡在哪里…"
                                    draw_text.text_style.font_size: 14 draw_text.color: #938a7e margin: Inset{left: 12} }
                                ask_send := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 18 height: 18}
                                    draw_icon +: { color: #ffffff }
                                    draw_bg +: { color: #b3b0ab color_hover: #b3b0ab color_down: #b3b0ab border_radius: 13 border_size: 0 border_color: #0000 } }
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
                    // Neutral toast for "not migrated yet" notices (body level
                    // so it also shows on the launcher page).
                    View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 96}
                        toast := RoundedView {
                            visible: false width: Fit height: Fit padding: Inset{left: 14 right: 14 top: 9 bottom: 9}
                            draw_bg +: { color: #fffdf8f2 border_radius: 12 border_size: 1 border_color: #e3d9cb }
                            toast_label := Label { width: Fit height: Fit text: "" draw_text.text_style.font_size: 11 draw_text.color: #5d5952 }
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
    /// Tap targets (icon+label pills, hit-tested by area).
    preview: WidgetRef,
    start: WidgetRef,
}

/// Editorial collections (web src/learning/course-collections.ts); packs not
/// listed fall into 其他课程. Membership is by packId, independent of version.
struct CourseCollection {
    id: &'static str,
    title: &'static str,
    level: &'static str,
    description: &'static str,
    cover: &'static str,
    pack_ids: &'static [&'static str],
}
const COURSE_COLLECTIONS: [CourseCollection; 3] = [
    CourseCollection { id: "linear-functions", title: "读懂一次函数", level: "初中数学", description: "从斜率与截距出发，把函数图像、变化关系和方程联系起来。", cover: include_str!("../assets/collections/linear.svg"), pack_ids: &["linear-intro-and-slope", "slope-and-intercept", "linear-simultaneous-intersections"] },
    CourseCollection { id: "trigonometry", title: "从单位圆理解三角函数", level: "高中数学", description: "让圆上的运动变成曲线，理解正弦、余弦与周期变化。", cover: include_str!("../assets/collections/trig.svg"), pack_ids: &["trig-unit-circle-to-sine", "trig-cosine-and-phase-shift", "trig-quadrants-and-monotonicity"] },
    CourseCollection { id: "multivariable-calculus", title: "用截面理解多元函数", level: "大学微积分", description: "从三维曲面的截面入手，逐步认识等高线、偏导数与鞍点。", cover: include_str!("../assets/collections/surface.svg"), pack_ids: &["surface-paraboloid-level-sets", "surface-partial-derivative-slice", "surface-saddle-point-analysis"] },
];
struct CollectionGroup {
    id: String,
    title: String,
    level: String,
    description: String,
    cover: &'static str,
    packs: Vec<serde_json::Value>,
}
/// Web groupCoursePacks: editorial order, missing packs dropped, leftovers
/// in a trailing 其他课程 group, empty groups removed.
fn group_course_packs(packs: &[serde_json::Value]) -> Vec<CollectionGroup> {
    let find = |id: &str| packs.iter().find(|p| p["packId"] == id).cloned();
    let mut groups: Vec<CollectionGroup> = COURSE_COLLECTIONS
        .iter()
        .map(|c| CollectionGroup {
            id: c.id.into(),
            title: c.title.into(),
            level: c.level.into(),
            description: c.description.into(),
            cover: c.cover,
            packs: c.pack_ids.iter().filter_map(|id| find(id)).collect(),
        })
        .collect();
    let assigned = |id: &str| COURSE_COLLECTIONS.iter().any(|c| c.pack_ids.contains(&id));
    let remaining: Vec<_> = packs
        .iter()
        .filter(|p| !assigned(p["packId"].as_str().unwrap_or("")))
        .cloned()
        .collect();
    if !remaining.is_empty() {
        groups.push(CollectionGroup {
            id: "other".into(),
            title: "其他课程".into(),
            level: "探索学习".into(),
            description: "更多可以独立学习的互动课程。".into(),
            cover: COURSE_COLLECTIONS[0].cover,
            packs: remaining,
        });
    }
    groups.retain(|g| !g.packs.is_empty());
    groups
}
/// "3 节课 · 约 5 分钟" (web sums durationSeconds, then rounds up minutes).
fn collection_summary(packs: &[serde_json::Value]) -> String {
    let seconds: f64 = packs.iter().map(|p| p["durationSeconds"].as_f64().unwrap_or(0.)).sum();
    format!("{} 节课 · 约 {} 分钟", packs.len(), (seconds / 60.).ceil() as u64)
}
/// A Makepad text row box is (ascent + descent) = about 1.18 em for the UI
/// fonts, and `line_spacing` scales only the advance between wrapped rows.
/// CSS line boxes are `line-height` x px with the leading split above and
/// below, so a web text box is: line_spacing = line-height / 1.18 plus
/// half-leading padding on the label.
const EM_BOX: f64 = 1.18;
/// A web text box (CSS px size, line-height ratio, vertical margins).
/// Label folds its own padding/margin into the walk twice, so spacing lives
/// on a wrapping View and the Label keeps none. `fill` = block width with
/// word wrap; otherwise the box hugs the text.
fn web_text(text: &str, px: f64, line_height: f64, color: &str, bold: bool, fill: bool, margin: (f64, f64)) -> String {
    let style = if bold { "theme.font_bold" } else { "theme.font_regular" };
    let leading = ((line_height - EM_BOX) * px / 2.).max(0.);
    let (width, wrap) = if fill { ("Fill", "draw_text.wrap:Words") } else { ("Fit", "") };
    format!(
        "View{{width:{width} height:Fit padding:Inset{{top:{:.2} bottom:{:.2}}} Label{{width:{width} padding:0 text:\"{text}\" {wrap} draw_text.text_style: {style}{{font_size:{:.2} line_spacing:{:.3}}} draw_text.color:{color}}}}}",
        margin.0 + leading,
        margin.1 + leading,
        px * 0.75,
        line_height / EM_BOX
    )
}
/// Lucide icons are black-stroked; tint them for Svg widgets.
fn tinted(icon: &str, color: &str) -> String {
    icon.replace("#000000", color)
}
/// Web covers sit in a card with rounded top corners (overflow hidden);
/// Makepad cannot clip to a rounded rect, so round the SVG's full-size
/// background rect instead (bottom corners stay square under the card body).
/// `radius_px` is the on-screen radius at `width_px`.
fn round_cover_top(svg: &str, radius_px: f64, width_px: f64) -> String {
    let Some(vb) = svg.find("viewBox=\"").map(|i| &svg[i + 9..]) else {
        return svg.into();
    };
    let dims: Vec<f64> = vb[..vb.find('"').unwrap_or(0)]
        .split_whitespace()
        .filter_map(|v| v.parse().ok())
        .collect();
    let [_, _, w, h] = dims[..] else {
        return svg.into();
    };
    let (ws, hs) = (format!("width=\"{}\"", w), format!("height=\"{}\"", h));
    let Some(start) = svg
        .match_indices("<rect")
        .map(|(i, _)| i)
        .find(|&i| {
            let tag = &svg[i..i + svg[i..].find('>').unwrap_or(0)];
            tag.contains(&ws) && tag.contains(&hs) && !tag.contains(" x=") && !tag.contains(" y=")
        })
    else {
        return svg.into();
    };
    let end = start + svg[start..].find('>').unwrap_or(0) + 1;
    let tag = &svg[start..end];
    let fill = tag
        .find("fill=\"")
        .map(|i| &tag[i + 6..])
        .and_then(|t| t.find('"').map(|e| &t[..e]))
        .unwrap_or("#ffffff");
    let r = radius_px * w / width_px;
    format!(
        "{}<rect width=\"{w}\" height=\"{h}\" rx=\"{r}\" ry=\"{r}\" fill=\"{fill}\"/><rect y=\"{}\" width=\"{w}\" height=\"{r}\" fill=\"{fill}\"/>{}",
        &svg[..start],
        h - r,
        &svg[end..]
    )
}
/// A tap on an icon+label pill or card (FingerUp over it, little travel).
fn tapped(cx: &mut Cx, event: &Event, target: &WidgetRef) -> bool {
    match event.hits(cx, target.area()) {
        Hit::FingerHoverIn(_) => {
            cx.set_cursor(MouseCursor::Hand);
            false
        }
        Hit::FingerUp(e) => e.is_over && (e.abs - e.abs_start).length() < 8.,
        _ => false,
    }
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
    /// Selected collection (web ?collection=<id>); None = collections home.
    #[rust]
    collection: Option<String>,
    /// Collection card tap targets on the home page, by collection id.
    #[rust]
    collection_cards: Vec<(String, WidgetRef)>,
    /// Card rows awaiting the web grid's equal-height stretch: per row the
    /// (card, spacer) pairs; resolved one frame after the cards first draw.
    #[rust]
    card_rows: Vec<Vec<(WidgetRef, WidgetRef)>>,
    #[rust]
    equalize_frame: NextFrame,
    #[rust]
    equalize_tries: u8,
    #[rust]
    learning_visible: bool,
    // Ink toolbar buttons in INK_TOOLS order, rebuilt when the mode changes.
    #[rust]
    ink_tool_buttons: Vec<WidgetRef>,
    // Set by "开始互动"/"继续学习": playback starts once the restore reply
    // resolves (restored checkpoint, or fresh when none exists).
    #[rust]
    autoplay_pending: bool,
    // Neutral bottom toast (feature-not-migrated notices); hidden after 3s.
    #[rust]
    toast_until: Option<Instant>,
    // Last playback/mute state baked into the toggle button icons, so the
    // SVG is only re-parsed on an actual state change.
    #[rust]
    play_icon_state: Option<bool>,
    #[rust]
    volume_icon_state: Option<bool>,
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
// Ink toolbar order (web .learning-ink-toolbar): Hand, PenLine, Eraser,
// BoxSelect, 全选, Undo2, Redo2. Erase/select/select-all have no Ink
// backing in oll-runtime; they keep the web look and show a toast.
const INK_TOOLS: [(&str, &str); 7] = [
    ("", include_str!("../assets/icons/hand.svg")),
    ("", include_str!("../assets/icons/pen-line.svg")),
    ("", include_str!("../assets/icons/eraser.svg")),
    ("", include_str!("../assets/icons/box-select.svg")),
    ("全选", ""),
    ("", include_str!("../assets/icons/undo-2.svg")),
    ("", include_str!("../assets/icons/redo-2.svg")),
];
const INK_TOOL_BROWSE: usize = 0;
const INK_TOOL_PEN: usize = 1;
const INK_TOOL_ERASE: usize = 2;
const INK_TOOL_SELECT: usize = 3;
const INK_TOOL_SELECT_ALL: usize = 4;
const INK_TOOL_UNDO: usize = 5;
const INK_TOOL_REDO: usize = 6;

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
/// Web courseTags: localized grade (unspecified hidden) · subject.
fn course_tags(pack: &serde_json::Value) -> String {
    let grade = pack["grade"].as_str().unwrap_or("").trim();
    let grade = match grade {
        "primary-age-8-9" => "小学（8–9岁）",
        "secondary-age-12-14" => "初中（12–14岁）",
        "highschool-mathematics" => "高中",
        "college-calculus" => "大学微积分",
        g if g.eq_ignore_ascii_case("unspecified") => "",
        g => g,
    };
    let subject = pack["subject"].as_str().unwrap_or("").trim();
    let subject = if subject == "mathematics" { "数学" } else { subject };
    script_text(
        &[grade, subject]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
    )
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

/// Lucide icons (24x24 stroke icons extracted from the web app's
/// lucide-react package) rendered through Button::draw_icon; the script
/// sets draw_icon.color so strokes tint to the control color.
const ICON_PLAY: &str = include_str!("../assets/icons/play.svg");
const ICON_CLOCK: &str = include_str!("../assets/icons/clock-3.svg");
const ICON_EYE: &str = include_str!("../assets/icons/eye.svg");
const ICON_ARROW_RIGHT: &str = include_str!("../assets/icons/arrow-right.svg");
const ICON_PAUSE: &str = include_str!("../assets/icons/pause.svg");
const ICON_VOLUME_ON: &str = include_str!("../assets/icons/volume-2.svg");
const ICON_VOLUME_OFF: &str = include_str!("../assets/icons/volume-x.svg");

fn load_icons(ui: &WidgetRef, cx: &mut Cx) {
    let icons: [(LiveId, &str); 10] = [
        (live_id!(next_beat), include_str!("../assets/icons/chevron-right.svg")),
        (live_id!(replay_topic), include_str!("../assets/icons/rotate-ccw.svg")),
        (live_id!(voice), include_str!("../assets/icons/mic-off.svg")),
        (live_id!(camera), include_str!("../assets/icons/camera-off.svg")),
        (live_id!(back), include_str!("../assets/icons/house.svg")),
        (live_id!(settings), include_str!("../assets/icons/settings.svg")),
        (live_id!(ask_image), include_str!("../assets/icons/image-plus.svg")),
        (live_id!(ask_camera), include_str!("../assets/icons/camera-off.svg")),
        (live_id!(ask_mic), include_str!("../assets/icons/mic.svg")),
        (live_id!(ask_send), include_str!("../assets/icons/send.svg")),
    ];
    for (id, src) in icons {
        if let Some(mut button) = ui.widget(cx, &[id]).borrow_mut::<Button>() {
            button.draw_icon.load_from_str(src);
        }
    }
    if let Some(mut button) = ui.widget(cx, ids!(outline_trigger)).borrow_mut::<Button>() {
        button
            .draw_icon
            .load_from_str(include_str!("../assets/icons/list-tree.svg"));
    }
    for (id, icon, color) in [
        (live_id!(back_icon), include_str!("../assets/icons/arrow-left.svg"), "#426568"),
        (live_id!(library_icon), include_str!("../assets/icons/book-open.svg"), "#243b40"),
        (live_id!(blank_plus), include_str!("../assets/icons/plus.svg"), "#ffffff"),
        (live_id!(blank_arrow), include_str!("../assets/icons/arrow-right.svg"), "#ffffff"),
    ] {
        if let Some(mut svg) = ui.widget(cx, &[id]).borrow_mut::<Svg>() {
            svg.draw_svg.load_from_str(&tinted(icon, color));
        }
    }
    // The mascot keeps its original gradient fills (no tint).
    if let Some(mut svg) = ui.widget(cx, ids!(octos_art)).borrow_mut::<Svg>() {
        svg.draw_svg
            .load_from_str(include_str!("../assets/octos-avatar.svg"));
    }
}

impl App {
    fn course_key(&self) -> String {
        format!("{}@{}", self.pack_id, self.pack_version)
    }
    /// Neutral bottom toast for "not migrated yet" notices (replaces the old
    /// disabled-button footnotes; web parity keeps the controls looking live).
    fn toast(&mut self, cx: &mut Cx, message: &str) {
        self.ui.label(cx, ids!(toast_label)).set_text(cx, message);
        self.ui.widget(cx, ids!(toast)).set_visible(cx, true);
        self.toast_until = Some(Instant::now() + std::time::Duration::from_secs(3));
        self.ui.redraw(cx);
    }
    /// Progress-store replies carry no user-visible equivalent on the web
    /// learning page, so they no longer surface in the top bar.
    fn note(&mut self, _cx: &mut Cx, _message: &str) {}
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
                self.set_status(cx, &e);
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
                self.set_status(cx, &e);
            }
        }
        self.refresh(cx);
    }
    fn show_learning(&mut self, cx: &mut Cx, learning: bool) {
        self.learning_visible = learning;
        self.ui.widget(cx, ids!(launcher)).set_visible(cx, !learning);
        self.ui.widget(cx, ids!(learning)).set_visible(cx, learning);
    }
    /// Ink toolbar buttons with the current browse/pen mode highlighted
    /// (web .learning-ink-toolbar is-active: teal icon on a faint teal wash).
    /// Rebuilt on every mode change because script-shader buttons cannot be
    /// recoloured from Rust without dropping state.
    fn rebuild_ink_tools(&mut self, cx: &mut Cx) {
        self.ink_tool_buttons.clear();
        let mut widgets = Vec::new();
        for (index, (label, icon)) in INK_TOOLS.iter().enumerate() {
            let active = (index == INK_TOOL_PEN) == self.drawing
                && (index == INK_TOOL_PEN || index == INK_TOOL_BROWSE);
            let (bg, tint) = if active {
                ("#e3eeec", "#0c7085")
            } else {
                ("#0000", "#686158")
            };
            let code = if icon.is_empty() {
                format!(
                    "Button{{height:36 text:\"{label}\" padding:Inset{{left:9 right:9}}
                        draw_bg +: {{color:{bg} color_hover:#e3eeec color_down:#d5e6eb border_radius:10 border_size:0 border_color:#0000}}
                        draw_text.color:{tint} draw_text.text_style.font_size:10}}"
                )
            } else {
                format!(
                    "Button{{width:36 height:36 text:\"\" icon_walk:Walk{{width:16 height:16}}
                        draw_icon +: {{color:{tint}}}
                        draw_bg +: {{color:{bg} color_hover:#e3eeec color_down:#d5e6eb border_radius:10 border_size:0 border_color:#0000}}}}"
                )
            };
            match board_view::widget(cx, &code) {
                Ok(button) => {
                    if !icon.is_empty() {
                        if let Some(mut b) = button.borrow_mut::<Button>() {
                            b.draw_icon.load_from_str(icon);
                        }
                    }
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
    /// Course card (web CourseCard, collections redesign): 16:9 cover with
    /// the pack thumbnail (object-fit contain), grade chip + version, 第 NN 课,
    /// title, description, duration/offline facts and the 预览 / 开始互动
    /// (继续学习 when progress is saved) pills. `spacer` absorbs the extra
    /// height when a row is stretched to its tallest card.
    fn course_card(
        cx: &mut Cx,
        root: &std::path::Path,
        pack: &serde_json::Value,
        index: usize,
        resume: bool,
    ) -> Result<(WidgetRef, WidgetRef, CourseCardRefs), String> {
        let pack_id = pack["packId"].as_str().unwrap_or("").to_owned();
        let version = pack["version"].as_str().unwrap_or("").to_owned();
        let title = script_text(pack["title"].as_str().unwrap_or(&pack_id));
        let desc = script_text(pack["description"].as_str().unwrap_or(""));
        let tags = course_tags(pack);
        let minutes = ((pack["durationSeconds"].as_f64().unwrap_or(0.) / 60.).ceil() as u64).max(1);
        let lesson = format!("第 {:02} 课", index + 1);
        let start_label = if resume { "继续学习" } else { "开始互动" };
        let first_char = title.chars().next().unwrap_or('课');
        let tags_label = web_text(&tags, 11., 1.5, "#285c60", false, false, (0., 0.));
        let version_label = web_text(&format!("课程包 v{version}"), 11., 1.5, "#778583", false, false, (0., 0.));
        let lesson_label = web_text(&lesson, 11., 1.5, "#648682", false, false, (22., 0.));
        let title_label = web_text(&title, 20., 1.5, "#243b40", false, true, (8., 12.));
        let desc_label = web_text(&desc, 13., 1.8, "#627579", false, true, (0., 24.));
        let minutes_label = web_text(&format!("{minutes} 分钟"), 12., 1.5, "#667a7b", false, false, (0., 0.));
        let offline_label = web_text("内置课程 · 可离线", 12., 1.5, "#667a7b", false, false, (0., 0.));
        let preview_label = web_text("预览", 13., 1.5, "#426568", false, false, (0., 0.));
        let start_text = web_text(start_label, 13., 1.5, "#ffffff", true, false, (0., 0.));
        let code = format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:18 border_size:1 border_color:#dbded9}}
                cover := View{{width:Fill height:201 flow:Overlay
                    cover_fallback := RoundedView{{width:Fill height:Fill align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#e4f2ee border_radius:17}}
                        fallback_char := Label{{text:\"{first_char}\" draw_text.text_style.font_size:40 draw_text.color:#166a79}}
                    }}
                    thumb := mod.widgets.SvgImage{{width:Fill height:Fill}}
                }}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:21 right:21 top:22 bottom:21}}
                    View{{width:Fill height:Fit flow:Right spacing:8 align:Align{{y:0.5}}
                        RoundedView{{width:Fit height:Fit padding:Inset{{left:8 right:8 top:4 bottom:4}} draw_bg +: {{color:#eaf2ee border_radius:6}}
                            {tags_label}
                        }}
                        {version_label}
                    }}
                    {lesson_label}
                    {title_label}
                    {desc_label}
                    spacer := View{{width:Fill height:0}}
                    View{{width:Fill height:Fit flow:Right spacing:14 align:Align{{y:0.5}} padding:Inset{{top:8}}
                        View{{width:Fit height:Fit flow:Right spacing:5 align:Align{{y:0.5}}
                            clock := Svg{{width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {minutes_label}
                        }}
                        {offline_label}
                    }}
                    SolidView{{width:Fill height:1 margin:Inset{{top:16}} draw_bg +: {{color:#e7e9e3}}}}
                    View{{width:Fill height:44 flow:Right align:Align{{y:0.5}} margin:Inset{{top:16}}
                        preview := RoundedView{{width:70 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#f0f3ee border_radius:9}}
                            eye := Svg{{width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {preview_label}
                        }}
                        View{{width:Fill height:1}}
                        start := RoundedView{{width:98 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#166a79 border_radius:9}}
                            {start_text}
                            arrow := Svg{{width:16 height:16 draw_svg +: {{preserve_viewbox:true}}}}
                        }}
                    }}
                }}
            }}"
        );
        let card = board_view::widget(cx, &code)?;
        // Thumbnail: the pack SVG with its text runs (SvgImage); the accent
        // block with the first title character stays when it is missing.
        let thumb_name = pack["thumbnail"].as_str().unwrap_or("thumbnail.svg");
        let thumb_text = std::fs::read_to_string(root.join(&pack_id).join(&version).join(thumb_name))
            .ok()
            .filter(|text| text.contains("<svg"));
        if let Some(text) = thumb_text {
            if let Some(mut svg) = card.widget(cx, ids!(thumb)).borrow_mut::<svg_image::SvgImage>() {
                svg.load(cx, &round_cover_top(&text, 17., 357.));
            }
            card.widget(cx, ids!(cover_fallback)).set_visible(cx, false);
        }
        for (id, icon, color) in [
            (live_id!(clock), ICON_CLOCK, "#667a7b"),
            (live_id!(eye), ICON_EYE, "#426568"),
            (live_id!(arrow), ICON_ARROW_RIGHT, "#ffffff"),
        ] {
            if let Some(mut svg) = card.widget(cx, &[id]).borrow_mut::<Svg>() {
                svg.draw_svg.load_from_str(&tinted(icon, color));
            }
        }
        let spacer = card.widget(cx, ids!(spacer));
        Ok((
            card.clone(),
            spacer,
            CourseCardRefs {
                pack_id,
                version,
                preview: card.widget(cx, ids!(preview)),
                start: card.widget(cx, ids!(start)),
            },
        ))
    }
    /// Collection card (web .course-collection-card): 16:10 cover art,
    /// level, title, description and the lesson count / 查看课程 footer; the
    /// whole card is the tap target.
    fn collection_card(cx: &mut Cx, group: &CollectionGroup) -> Result<(WidgetRef, WidgetRef), String> {
        let title = script_text(&group.title);
        let level = script_text(&group.level);
        let desc = script_text(&group.description);
        let summary = collection_summary(&group.packs);
        let level_label = web_text(&level, 12., 1.5, "#517a75", false, false, (0., 0.));
        let title_label = web_text(&title, 23., 1.45, "#243b40", false, true, (10., 12.));
        let desc_label = web_text(&desc, 14., 1.8, "#627579", false, true, (0., 28.));
        let summary_label = web_text(&summary, 12., 1.5, "#667a7b", false, false, (0., 0.));
        let view_label = web_text("查看课程", 12., 1.5, "#166a79", true, false, (0., 0.));
        let code = format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:20 border_size:1 border_color:#dbded9}}
                cover := mod.widgets.SvgImage{{width:Fill height:222}}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:23 right:23 top:24 bottom:23}}
                    {level_label}
                    {title_label}
                    {desc_label}
                    spacer := View{{width:Fill height:0}}
                    SolidView{{width:Fill height:1 draw_bg +: {{color:#e7e9e3}}}}
                    View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} padding:Inset{{top:20}}
                        {summary_label}
                        View{{width:Fill height:1}}
                        View{{width:Fit height:Fit flow:Right spacing:6 align:Align{{y:0.5}}
                            {view_label}
                            arrow := Svg{{width:17 height:17 draw_svg +: {{preserve_viewbox:true}}}}
                        }}
                    }}
                }}
            }}"
        );
        let card = board_view::widget(cx, &code)?;
        if let Some(mut svg) = card.widget(cx, ids!(cover)).borrow_mut::<svg_image::SvgImage>() {
            svg.load(cx, &round_cover_top(group.cover, 19., 355.));
        }
        if let Some(mut svg) = card.widget(cx, ids!(arrow)).borrow_mut::<Svg>() {
            svg.draw_svg.load_from_str(&tinted(ICON_ARROW_RIGHT, "#166a79"));
        }
        let spacer = card.widget(cx, ids!(spacer));
        Ok((card, spacer))
    }
    /// Lay cards into web-grid rows of three (gap 22 / 24) and queue the
    /// equal-height pass.
    fn card_grid(
        &mut self,
        cx: &mut Cx,
        cards: Vec<(WidgetRef, WidgetRef)>,
        gap: f64,
    ) -> Result<Vec<WidgetRef>, String> {
        let mut rows = Vec::new();
        self.card_rows.clear();
        for chunk in cards.chunks(3) {
            let row = board_view::widget(
                cx,
                &format!("View{{width:Fill height:Fit flow:Right spacing:{gap}}}"),
            )?;
            let mut members: Vec<WidgetRef> = chunk.iter().map(|(c, _)| c.clone()).collect();
            // Keep column widths when the last row is short.
            for _ in chunk.len()..3 {
                members.push(board_view::widget(cx, "View{width:Fill height:1}")?);
            }
            board_view::children(cx, &row, members)?;
            rows.push(row);
            self.card_rows.push(chunk.to_vec());
        }
        self.equalize_tries = 0;
        self.equalize_frame = cx.new_next_frame();
        Ok(rows)
    }
    /// Web grid rows stretch every card to the tallest one; Makepad Fit
    /// cards are measured after their first draw and padded via `spacer`.
    fn equalize_card_rows(&mut self, cx: &mut Cx) {
        let mut pending = false;
        for row in &self.card_rows {
            let heights: Vec<f64> = row
                .iter()
                .map(|(card, spacer)| {
                    let current = spacer
                        .borrow::<View>()
                        .map(|v| match v.walk.height {
                            Size::Fixed(h) => h,
                            _ => 0.,
                        })
                        .unwrap_or(0.);
                    card.area().rect(cx).size.y - current
                })
                .collect();
            if heights.iter().any(|h| *h <= 1.) {
                pending = true;
                continue;
            }
            let max = heights.iter().cloned().fold(0., f64::max);
            for ((_, spacer), h) in row.iter().zip(heights) {
                if let Some(mut v) = spacer.borrow_mut::<View>() {
                    v.walk.height = Size::Fixed((max - h).max(0.));
                }
            }
        }
        if pending && self.equalize_tries < 10 {
            self.equalize_tries += 1;
            self.equalize_frame = cx.new_next_frame();
        }
        self.ui.redraw(cx);
    }
    /// Launcher navigation (web links): collection cards open a collection,
    /// 全部课程集 returns home; course pills open the course (预览 paused,
    /// 开始互动/继续学习 autoplay).
    fn handle_launcher_taps(&mut self, cx: &mut Cx, event: &Event) {
        let blank = self.ui.widget(cx, ids!(blank_board));
        if self.collection.is_none() && tapped(cx, event, &blank) {
            self.toast(cx, "空白白板尚未迁移，仅网页版可用");
            return;
        }
        let back = self.ui.widget(cx, ids!(collection_back));
        if self.collection.is_some() && tapped(cx, event, &back) {
            self.set_collection(cx, None);
            return;
        }
        let collections = self.collection_cards.clone();
        for (id, card) in collections {
            if tapped(cx, event, &card) {
                self.set_collection(cx, Some(id));
                return;
            }
        }
        let mut open = None;
        for card in &self.course_cards {
            if tapped(cx, event, &card.preview) {
                open = Some((card.pack_id.clone(), card.version.clone(), false));
            } else if tapped(cx, event, &card.start) {
                open = Some((card.pack_id.clone(), card.version.clone(), true));
            }
        }
        if let Some((pack_id, version, autoplay)) = open {
            self.open_course(cx, &pack_id, &version, autoplay);
        }
    }
    /// Launcher notice line (web .course-launcher-notice); hidden when empty
    /// so it adds no gap above the grid.
    fn set_status(&mut self, cx: &mut Cx, text: &str) {
        self.ui.label(cx, ids!(launcher_status_text)).set_text(cx, text);
        self.ui.widget(cx, ids!(launcher_status)).set_visible(cx, !text.is_empty());
    }
    fn set_collection(&mut self, cx: &mut Cx, collection: Option<String>) {
        self.collection = collection;
        self.rebuild_launcher(cx);
        // Web scrolls the launcher to the top on every collection change.
        if let Some(mut scroll) = self.ui.widget(cx, ids!(launcher_scroll)).borrow_mut::<View>() {
            scroll.set_scroll_pos(cx, dvec2(0., 0.));
        }
    }
    /// Rebuild the launcher library from the pack catalog.
    /// Called at startup and whenever the user returns from the learning page.
    fn rebuild_launcher(&mut self, cx: &mut Cx) {
        self.course_cards.clear();
        let root = course_pack::pack_root();
        let packs = match course_pack::catalog(&root) {
            Ok(packs) => {
                self.set_status(cx, "");
                packs
            }
            Err(e) => {
                self.set_status(cx, &e);
                Vec::new()
            }
        };
        // Recent whiteboards (web) lists blank whiteboards only, which are
        // not migrated; course progress surfaces as 继续学习 on its card.
        // Library: collections home, or the selected collection's courses.
        let groups = group_course_packs(&packs);
        let selected = self
            .collection
            .as_ref()
            .and_then(|id| groups.iter().find(|g| &g.id == id));
        let home = self.collection.is_none();
        self.ui.widget(cx, ids!(home_sections)).set_visible(cx, home);
        self.ui.widget(cx, ids!(collection_back)).set_visible(cx, !home);
        self.ui.widget(cx, ids!(collection_intro)).set_visible(cx, selected.is_some());
        self.ui.widget(cx, ids!(library_eyebrow)).set_visible(cx, selected.is_none());
        self.ui.widget(cx, ids!(library_level)).set_visible(cx, selected.is_some());
        self.ui
            .label(cx, ids!(library_level))
            .set_text(cx, selected.map_or("", |g| g.level.as_str()));
        self.ui
            .label(cx, ids!(library_title))
            .set_text(cx, selected.map_or("课程集", |g| g.title.as_str()));
        self.collection_cards.clear();
        let store_dir = self.store.as_ref().map(|s| s.dir().to_path_buf());
        let saved = |pack_id: &str, version: &str| {
            store_dir
                .as_ref()
                .is_some_and(|d| d.join(format!("{pack_id}@{version}.json")).is_file())
        };
        let mut cards = Vec::new();
        let mut gap = 24.;
        if let Some(group) = selected {
            gap = 22.;
            self.ui.label(cx, ids!(intro_text)).set_text(cx, &group.description);
            self.ui.label(cx, ids!(intro_meta)).set_text(
                cx,
                &format!("{} · 按顺序循序学习", collection_summary(&group.packs)),
            );
            for (index, pack) in group.packs.iter().enumerate() {
                let resume = saved(
                    pack["packId"].as_str().unwrap_or(""),
                    pack["version"].as_str().unwrap_or(""),
                );
                match Self::course_card(cx, &root, pack, index, resume) {
                    Ok((widget, spacer, refs)) => {
                        cards.push((widget, spacer));
                        self.course_cards.push(refs);
                    }
                    Err(e) => self.set_status(cx, &e),
                }
            }
        } else if !home {
            self.set_status(cx, "这个课程集暂不可用，请选择其他课程集。");
        } else {
            for group in &groups {
                match Self::collection_card(cx, group) {
                    Ok((widget, spacer)) => {
                        self.collection_cards.push((group.id.clone(), widget.clone()));
                        cards.push((widget, spacer));
                    }
                    Err(e) => self.set_status(cx, &e),
                }
            }
        }
        match self.card_grid(cx, cards, gap) {
            Ok(rows) => {
                if let Err(e) = board_view::children(cx, &self.ui.widget(cx, ids!(course_list)), rows) {
                    self.error = e;
                }
            }
            Err(e) => self.error = e,
        }
        if packs.is_empty() && self.error.is_empty() {
            self.set_status(cx, "课程包还在准备中。首批经过审核的课程发布后会出现在这里。");
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
                    "View{{width:Fill height:Fit flow:Right spacing:4 align: Align{{y: 0.5}}
                        row_label := Label{{width:Fit height:Fit text:\"{label}\" draw_text.text_style.font_size:11 draw_text.color:#5d5952}}
                        row_slider := mod.widgets.Slider{{width:Fill height:25 margin: Inset{{top: -7}} min:{min} max:{max} step:{step} default:{initial}
                            draw_bg +: {{
                                color: #eae6de color_hover: #eae6de color_focus: #eae6de color_drag: #eae6de
                                border_size: 0.5 border_color: #d8d2c7 border_color_hover: #d8d2c7 border_color_focus: #d8d2c7 border_color_drag: #d8d2c7
                                val_padding: 1.
                                val_color: #168398 val_color_hover: #168398 val_color_focus: #168398 val_color_drag: #168398
                                handle_color: #168398 handle_color_hover: #126a7c handle_color_focus: #126a7c handle_color_drag: #126a7c
                                handle_size: 12.
                            }}}}
                        row_value := Label{{width:48 height:Fit text:\"\" draw_text.text_style.font_size:11 draw_text.color:#0d7082}}
                        row_minus := Button{{width:24 height:24 text:\"\" icon_walk:Walk{{width:12 height:12}}
                            draw_icon +: {{color:#0d7082}}
                            draw_bg +: {{color:#eaf3f4 color_hover:#d8e9eb color_down:#c8dfe2 border_radius:7 border_size:1 border_color:#d0e0e2}}}}
                        row_plus := Button{{width:24 height:24 text:\"\" icon_walk:Walk{{width:12 height:12}}
                            draw_icon +: {{color:#0d7082}}
                            draw_bg +: {{color:#eaf3f4 color_hover:#d8e9eb color_down:#c8dfe2 border_radius:7 border_size:1 border_color:#d0e0e2}}}}
                        row_reset := Button{{width:24 height:24 text:\"\" icon_walk:Walk{{width:12 height:12}}
                            draw_icon +: {{color:#0d7082}}
                            draw_bg +: {{color:#eaf3f4 color_hover:#d8e9eb color_down:#c8dfe2 border_radius:7 border_size:1 border_color:#d0e0e2}}}}
                    }}"
                );
                match board_view::widget(cx, &code) {
                    Ok(root) => {
                        for (id, icon) in [
                            (live_id!(row_minus), include_str!("../assets/icons/minus.svg")),
                            (live_id!(row_plus), include_str!("../assets/icons/plus.svg")),
                            (live_id!(row_reset), include_str!("../assets/icons/rotate-ccw.svg")),
                        ] {
                            if let Some(mut b) = root.widget(cx, &[id]).borrow_mut::<Button>() {
                                b.draw_icon.load_from_str(icon);
                            }
                        }
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
            if self.play_icon_state != Some(session.playing) {
                self.play_icon_state = Some(session.playing);
                let w = self.ui.widget(cx, ids!(play));
                if let Some(mut b) = w.borrow_mut::<Button>() {
                    b.draw_icon
                        .load_from_str(if session.playing { ICON_PAUSE } else { ICON_PLAY });
                };
            }
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
            if self.volume_icon_state != Some(self.narration_muted) {
                self.volume_icon_state = Some(self.narration_muted);
                let w = self.ui.widget(cx, ids!(narration_toggle));
                if let Some(mut b) = w.borrow_mut::<Button>() {
                    b.draw_icon.load_from_str(
                        if self.narration_muted { ICON_VOLUME_OFF } else { ICON_VOLUME_ON },
                    );
                };
            }
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
        // Web ink status: "{n} 项笔迹 · 已保存" (saved refers to course
        // progress, which autosaves every second while playing).
        self.ui
            .label(cx, ids!(ink_status))
            .set_text(cx, &format!("{stroke_count} 项笔迹 · 已保存"));
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
        scene3d_view::script_mod(vm);
        svg_image::script_mod(vm);
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
            load_icons(&self.ui, cx);
        }
        self.poll_storage(cx);
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        let in_learning = self.player.is_some();
        if self.timer.is_event(event).is_some() {
            if self
                .toast_until
                .is_some_and(|until| Instant::now() >= until)
            {
                self.toast_until = None;
                self.ui.widget(cx, ids!(toast)).set_visible(cx, false);
            }
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
            // Web-identical controls whose backing feature is not migrated:
            // they stay clickable and explain themselves through the toast.
            if self.ui.button(cx, ids!(next_beat)).clicked(actions)
                || self.ui.button(cx, ids!(replay_topic)).clicked(actions)
            {
                self.toast(cx, "逐 Beat 控制尚未迁移，仅网页版可用");
            }
            if self.ui.button(cx, ids!(voice)).clicked(actions)
                || self.ui.button(cx, ids!(camera)).clicked(actions)
            {
                self.toast(cx, "语音与摄像头尚未迁移，仅网页版可用");
            }
            if self.ui.button(cx, ids!(settings)).clicked(actions) {
                self.toast(cx, "设置页尚未迁移，仅网页版可用");
            }
            if self.ui.button(cx, ids!(ask_image)).clicked(actions)
                || self.ui.button(cx, ids!(ask_camera)).clicked(actions)
                || self.ui.button(cx, ids!(ask_mic)).clicked(actions)
                || self.ui.button(cx, ids!(ask_send)).clicked(actions)
            {
                self.toast(cx, "语音与提问尚未迁移，仅网页版可用");
            }
            if self.ui.button(cx, ids!(outline_trigger)).clicked(actions) {
                self.toast(cx, "课程目录尚未迁移，仅网页版可用");
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
            // DIFF: oll-runtime Ink has no erase/select; strokes are also
            // memory-only. Web-identical buttons explain via the toast.
            if ink_clicked(INK_TOOL_ERASE, &self.ink_tool_buttons, actions)
                || ink_clicked(INK_TOOL_SELECT, &self.ink_tool_buttons, actions)
                || ink_clicked(INK_TOOL_SELECT_ALL, &self.ink_tool_buttons, actions)
            {
                self.toast(cx, "擦除与框选尚未迁移，仅网页版可用");
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
        // Launcher pills/cards are plain views: hit-test them before the UI
        // tree so the scroll view does not capture the finger first.
        if !self.learning_visible {
            self.handle_launcher_taps(cx, event);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
        if self.equalize_frame.is_event(event).is_some() {
            self.equalize_card_rows(cx);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    #[test]
    fn packs_group_into_editorial_collections_like_the_web() {
        let packs = vec![
            json!({"packId":"surface-saddle-point-analysis","durationSeconds":200}),
            json!({"packId":"slope-and-intercept","durationSeconds":90}),
            json!({"packId":"linear-intro-and-slope","durationSeconds":100}),
            json!({"packId":"fraction-halves","durationSeconds":60}),
        ];
        let groups = super::group_course_packs(&packs);
        let ids: Vec<_> = groups.iter().map(|g| g.id.as_str()).collect();
        // Editorial order, empty trigonometry dropped, leftovers last.
        assert_eq!(ids, ["linear-functions", "multivariable-calculus", "other"]);
        // Membership order follows the collection, not the catalog.
        assert_eq!(groups[0].packs[0]["packId"], "linear-intro-and-slope");
        assert_eq!(super::collection_summary(&groups[0].packs), "2 节课 · 约 4 分钟");
    }
    #[test]
    fn course_tags_follow_the_web_labels() {
        let tags = |grade: &str| super::course_tags(&json!({"grade": grade, "subject": "mathematics"}));
        assert_eq!(tags("secondary-age-12-14"), "初中（12–14岁） · 数学");
        assert_eq!(tags("college-calculus"), "大学微积分 · 数学");
        assert_eq!(tags("unspecified"), "数学");
    }
    #[test]
    fn cover_background_gets_rounded_top_and_square_bottom() {
        let svg = r##"<svg viewBox="0 0 640 400"><rect width="640" height="400" fill="#e4eee7"/><path d="M0 0"/></svg>"##;
        let out = super::round_cover_top(svg, 20., 320.);
        assert!(out.contains(r##"rx="40" ry="40" fill="#e4eee7""##));
        assert!(out.contains(r##"<rect y="360" width="640" height="40" fill="#e4eee7"/>"##));
        assert!(out.ends_with(r#"<path d="M0 0"/></svg>"#));
        // No full-size background rect: unchanged.
        let plain = r#"<svg viewBox="0 0 10 10"><circle r="1"/></svg>"#;
        assert_eq!(super::round_cover_top(plain, 5., 10.), plain);
    }
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
