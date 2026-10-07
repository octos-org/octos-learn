//! Octos Learn macOS product shell: launcher + course playback page.
//! The playback page mirrors the web learning workspace (src/learning/
//! learning-workspace.tsx + oll/oll-lesson-runtime.tsx): full-screen spatial
//! board with floating controls. Differences from the web baseline are marked
//! "DIFF" and collected in the handoff report.
use makepad_widgets::*;
use oll_runtime::session::Session;
use octos_oll_preview::{board_view, controls_view, progress_store, scene3d_view, spatial_board};
use octos_oll_preview::spatial_board::InkTool;
mod svg_image;
mod server;
mod voice;
mod camera;
mod ink_question;
mod settings;
mod perf;
use perf::Perf;
use settings::SettingsState;
mod audio_playback;
use audio_playback::Players;
use camera::Camera;
use makepad_widgets::makepad_platform::file_dialogs::{FileDialog, FileDialogAction};
use voice::Voice;
use server::Server;
use serde_json::json;
mod cjk_fonts;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::time::Instant;

mod course_pack;
mod android_ui;

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
                                launcher_inner := View { width: 1120 height: Fit flow: Down padding: Inset{bottom: 72}
                                    // Text boxes follow the web CSS: font_size = px * 0.75,
                                    // line_spacing = CSS line-height / 1.18, spacing on a
                                    // wrapping View (see web_text).
                                    // 1. Header (web .course-launcher-header).
                                    View { width: Fill height: Fit flow: Down
                                        launcher_header := View { width: Fill height: 82 flow: Right align: Align{y: 0.5} spacing: 10
                                            logo_fallback := RoundedView { width: 34 height: 34 align: Align{x: 0.5 y: 0.5}
                                                draw_bg +: { color: #166a79 border_radius: 4.5 }
                                                Label { text: "O" draw_text.text_style.font_size: 15 draw_text.color: #ffffff }
                                            }
                                            // The logo file is a multi-motif artboard sheet;
                                            // preserve_viewbox crops to the intended motif.
                                            logo_svg := Svg { animating: false width: 34 height: 34 draw_svg +: { preserve_viewbox: true } }
                                            View { width: Fit height: Fit padding: Inset{top: 3.04 bottom: 3.04 left: 0}
    launcher_brand := Label { width: Fit padding: 0 text: "Octos Learn" draw_text.text_style: theme.font_bold{font_size: 14.25 line_spacing: 1.271} draw_text.color: #243b40 } }
                                            View { width: Fill height: 1 }
                                            // Web course-launcher nav (signed in): 设置. DIFF: the solo
                                            // owner is signed in automatically, so there is no 退出.
                                            launcher_settings := Button { height: 36 text: "设置" spacing: 6 padding: Inset{left: 10 right: 10} margin: 0
                                                icon_walk: Walk{width: 17 height: 17} draw_icon +: { color: #244f5a }
                                                draw_text.color: #244f5a draw_text.text_style.font_size: 10.5
                                                draw_bg +: { color: #0000 color_hover: #e9ece6 color_down: #dfe4dd border_radius: 5 border_size: 0 border_color: #0000 } }
                                        }
                                        SolidView { width: Fill height: 1 draw_bg +: { color: #dbddd6 } }
                                    }
                                    // 2. Hero (web .course-launcher-hero), collections home only
                                    // (web: !collectionId).
                                    home_sections := View { width: Fill height: Fit flow: Down padding: Inset{top: 56 bottom: 44}
                                        View { width: Fit height: Fit padding: Inset{top: 1.76 bottom: 1.76 left: 0}
    Label { width: Fit padding: 0 text: "LEARN ON A LIVING WHITEBOARD" draw_text.text_style: theme.font_code{font_size: 8.25 line_spacing: 1.271} draw_text.color: #5a8d94 } }
                                        hero_title_box := View { width: Fill height: Fit padding: Inset{top: 20.92 bottom: 21.92 left: 0}
    hero_title := Label { width: Fill padding: 0 text: "从一组课程，开始新的探索。" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 36.72 line_spacing: 1.136} draw_text.color: #243b40 } }
                                        View { width: Fill height: Fit padding: Inset{top: 4.42 bottom: 4.42 left: 0}
    hero_description := Label { width: Fill padding: 0 text: "跟着准备好的课程探索，也可以写下自己的问题，让小章鱼陪你一起推导。" draw_text.wrap: Words draw_text.text_style: theme.font_regular{font_size: 12.75 line_spacing: 1.441} draw_text.color: #607477 } }
                                        // DIFF: blank whiteboard needs the session system; a tap shows a toast.
                                        blank_board := RoundedView { width: Fit height: 52 flow: Right spacing: 12 align: Align{y: 0.5} margin: Inset{top: 32}
                                            padding: Inset{left: 20 right: 20} draw_bg +: { color: #166a79 border_radius: 7.5 }
                                            blank_plus := Svg { animating: false width: 20 height: 20 draw_svg +: { preserve_viewbox: true } }
                                            View { width: Fit height: Fit padding: Inset{top: 2.56 bottom: 2.56 left: 0}
    blank_label := Label { width: Fit padding: 0 text: "新建空白白板" draw_text.text_style: theme.font_bold{font_size: 12.00 line_spacing: 1.271} draw_text.color: #ffffff } }
                                            blank_arrow := Svg { animating: false width: 18 height: 18 draw_svg +: { preserve_viewbox: true } margin: Inset{left: 18} }
                                        }
                                    }
                                    // 3. Library (web .course-launcher-library): the
                                    // collection grid on home, or one collection's
                                    // course cards (web ?collection=<id>). Recent
                                    // whiteboards (web: blank boards only) are not migrated.
                                    View { width: Fill height: Fit flow: Down
                                        collection_back := View { visible: false width: Fit height: 44 flow: Right spacing: 8 align: Align{y: 0.5} margin: Inset{top: 28 bottom: 28}
                                            back_icon := Svg { animating: false width: 17 height: 17 draw_svg +: { preserve_viewbox: true } }
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
                                            library_icon := Svg { animating: false width: 23 height: 23 draw_svg +: { preserve_viewbox: true } }
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
                        spatial := SpatialBoard { width: Fill height: Fill draw_bg +: { color: #f8f5ed
                            // Web board paper: #d7d1c5 dots (r 1px) at 24px cell centres,
                            // screen-anchored. Drawn per pixel on the GPU: the old CPU
                            // path tessellated ~2,000 circles on every board redraw.
                            pixel: fn() {
                                let p = self.pos * self.rect_size
                                let cell = (fract(p / 24.0) - vec2(0.5, 0.5)) * 24.0
                                let dot = clamp(1.5 - length(cell), 0.0, 1.0)
                                return mix(self.color, #d7d1c5, dot)
                            } } }
                        // Top bar (web .learning-workspace-topbar: left 116,
                        // right 14, top 14; 3-column grid: title block /
                        // centered icon demo controls / mode buttons).
                        topbar_anchor := View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 116 right: 14 top: 14}
                            topbar := RoundedView {
                                width: Fill height: 58 flow: Right spacing: 16 align: Align{y: 0.5}
                                padding: Inset{left: 18 right: 9 top: 7 bottom: 7}
                                draw_bg +: { color: #fffdf8d4 border_radius: 9 border_size: 0.5 border_color: #ece5d9 }
                                View { width: Fill height: Fit flow: Down spacing: 2
                                    // Web span 9px and strong 20px/650;
                                    // Label sizes are points (px * 0.75).
                                    canvas_eyebrow := Label { width: Fit height: Fit padding: 0 text: "OCTOS LEARNING CANVAS" draw_text.text_style.font_size: 6.75 draw_text.color: #8a8074 }
                                    course_title := Label { width: Fill height: Fit padding: 0 text: "" draw_text.text_style: theme.font_bold{font_size: 15} draw_text.color: #332e28 }
                                }
                                demo_controls := View { width: Fit height: Fit flow: Right spacing: 4 align: Align{y: 0.5}
                                    play := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 17 height: 17} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 5.5 border_size: 0 border_color: #0000 } }
                                    // DIFF: runtime has no per-beat seek/restart; clicks show a toast.
                                    next_beat := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 17 height: 17} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 5.5 border_size: 0 border_color: #0000 } }
                                    replay_topic := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 5.5 border_size: 0 border_color: #0000 } }
                                    narration_toggle := Button { width: 34 height: 34 text: ""
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #665e54 }
                                        draw_bg +: { color: #0000 color_hover: #eaf0ee color_down: #dde9e6 border_radius: 5.5 border_size: 0 border_color: #0000 } }
                                }
                                View { width: Fill height: Fit flow: Right spacing: 4 align: Align{x: 1. y: 0.5}
                                    // Course preview (web coursePreview): one action that
                                    // switches to interactive learning.
                                    start_interaction := Button { visible: false height: 34 text: "开始互动学习" spacing: 6
                                        padding: Inset{left: 10 right: 10 top: 7 bottom: 7}
                                        icon_walk: Walk{width: 15 height: 15} draw_icon +: { color: #0c7085 }
                                        draw_text.color: #0c7085 draw_text.text_style.font_size: 6.75
                                        draw_bg +: { color: #dbeceb color_hover: #cfe5e4 color_down: #c3dedd border_radius: 5 border_size: 0 border_color: #0000 } }
                                    // DIFF: voice/camera are not migrated; clicks show a toast.
                                    voice := Button { height: 34 text: "启用语音" spacing: 6
                                        padding: Inset{left: 10 right: 10 top: 7 bottom: 7}
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #507784 }
                                        draw_text.color: #507784 draw_text.text_style.font_size: 6.75
                                        draw_bg +: { color: #ecf1ef color_hover: #dee8e8 color_down: #d2e0e0 border_radius: 5 border_size: 0 border_color: #0000 } }
                                    camera := Button { height: 34 text: "启用摄像头" spacing: 6
                                        padding: Inset{left: 10 right: 10 top: 7 bottom: 7}
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #507784 }
                                        draw_text.color: #507784 draw_text.text_style.font_size: 6.75
                                        draw_bg +: { color: #ecf1ef color_hover: #dee8e8 color_down: #d2e0e0 border_radius: 5 border_size: 0 border_color: #0000 } }
                                }
                            }
                        }
                        // Top-left round page buttons (web .learning-top-action-group:
                        // left 12 top 24, 40px circles with House/Settings icons).
                        page_actions_anchor := View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 12 top: 24}
                            page_actions := View { width: 96 height: Fit flow: Right spacing: 8
                                back := Button { width: 40 height: 40 text: ""
                                    icon_walk: Walk{width: 20 height: 20} draw_icon +: { color: #x57534e }
                                    draw_bg +: { border_radius: 10 color: #ffffffcc color_hover: #f3ede2 border_size: 0.5 border_color: #0000001a } }
                                // 学习记录 (web Menu button) opens the history drawer.
                                settings := Button { width: 40 height: 40 text: ""
                                    icon_walk: Walk{width: 19 height: 19} draw_icon +: { color: #x57534e }
                                    draw_bg +: { border_radius: 10 color: #ffffffcc color_hover: #f3ede2 border_size: 0.5 border_color: #0000001a } }
                            }
                        }
                        // Handwriting toolbar (web .learning-ink-toolbar:
                        // horizontal capsule, top 88 left 20).
                        ink_anchor := View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 20 top: 88}
                            ink_toolbar := RoundedView {
                                width: Fit height: Fit flow: Right spacing: 3 padding: 5 align: Align{y: 0.5}
                                draw_bg +: { color: #fffdf8f0 border_radius: 8 border_size: 0.5 border_color: #e4ded3 }
                                // Buttons are built in Rust (rebuild_ink_tools) so the
                                // browse/pen active state can be highlighted per mode.
                                ink_tools := View { width: Fit height: Fit flow: Right spacing: 3 align: Align{y: 0.5} }
                                // Web selection actions: classification status, quick
                                // tools (rebuilt in Rust) and 问小章鱼.
                                sel_actions := View { visible: false width: Fit height: Fit flow: Right spacing: 3 align: Align{y: 0.5} margin: Inset{left: 4}
                                    sel_status := Label { width: Fit padding: 0 text: "" draw_text.text_style.font_size: 7.5 draw_text.color: #647572 margin: Inset{left: 4 right: 4} }
                                    sel_tools := View { width: Fit height: Fit flow: Right spacing: 3 align: Align{y: 0.5} }
                                    sel_ask := Button { height: 36 text: "问小章鱼" spacing: 5 padding: Inset{left: 9 right: 9} margin: 0
                                        icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #0c7085 }
                                        draw_text.color: #0c7085 draw_text.text_style.font_size: 7.5
                                        draw_bg +: { color: #e3eeec color_hover: #d5e6eb color_down: #c8dee4 border_radius: 5 border_size: 0 border_color: #0000 } }
                                }
                                ink_status := Label { width: Fit padding: 0 text: "0 项笔迹 · 已保存" draw_text.text_style.font_size: 7.5 draw_text.color: #6e766f margin: Inset{left: 8 right: 8} }
                            }
                        }
                        // Variable controls live in the board world (web
                        // .learning-variable-controls.is-world), drawn by SpatialBoard.
                        // Course outline trigger (web .oll-course-outline-trigger:
                        // 48px rounded square above the teacher avatar).
                        outline_anchor := View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 47 bottom: 204}
                            outline_trigger := Button { width: 48 height: 48 text: "" icon_walk: Walk{width: 15 height: 15}
                                draw_icon +: { color: #466d78 }
                                draw_bg +: { color: #f0f9f8f0 color_hover: #e0f2f2 border_radius: 8 border_size: 0.5 border_color: #cfe2e3 } }
                        }
                        // Course outline panel (web .oll-course-outline-panel: 344 wide,
                        // above the trigger, right edge 24px from the window).
                        outline_panel_anchor := View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 264}
                            outline_panel := RoundedView { visible: false width: 344 height: Fit flow: Down
                                draw_bg +: { color: #fffdf8f7 border_radius: 10 border_size: 0.5 border_color: #453d3221 }
                                View { width: Fill height: Fit flow: Right align: Align{y: 1.} padding: Inset{left: 20 right: 20 top: 20 bottom: 14}
                                    View { width: Fill height: Fit flow: Down
                                        Label { width: Fit padding: 0 text: "COURSE OUTLINE" draw_text.text_style.font_size: 7.5 draw_text.color: #8d8275 }
                                        Label { width: Fit padding: Inset{top: 2} text: "本课目录" draw_text.text_style: theme.font_bold{font_size: 15.75} draw_text.color: #2e2a25 }
                                    }
                                    outline_count := Label { width: Fit padding: 0 text: "" draw_text.text_style.font_size: 6.75 draw_text.color: #877c6e }
                                }
                                View { width: Fill height: 1 show_bg: true draw_bg.color: #433c3317 }
                                outline_list := View { width: Fill height: Fit flow: Down padding: Inset{left: 10 right: 10 top: 8 bottom: 12} }
                                View { width: Fill height: 1 show_bg: true draw_bg.color: #433c3314 }
                                View { width: Fill height: Fit align: Align{x: 0.5} padding: Inset{left: 18 right: 18 top: 10 bottom: 12}
                                    Label { width: Fit padding: 0 text: "点击查看完成画面，使用播放按钮从该段重新讲解" draw_text.text_style.font_size: 6.75 draw_text.color: #948a7d }
                                }
                            }
                        }
                        // Teacher (web .octos-teacher: right 24 bottom 98).
                        teacher_anchor := View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 98}
                            View { width: Fit height: Fit flow: Right spacing: 12 align: Align{y: 1.}
                                narration_bubble := RoundedView {
                                    visible: false width: 360 height: Fit margin: Inset{bottom: 26}
                                    padding: Inset{left: 17 right: 17 top: 14 bottom: 14}
                                    draw_bg +: { color: #fffdf8ee border_radius: 9 border_size: 0.5 border_color: #dce3e2 }
                                    // DIFF: the web bubble renders markdown; plain text here.
                                    // Web .octos-teacher-caption: 17px, line-height 1.55.
                                    narration := Label { width: Fill height: Fit padding: 0 text: "" draw_text.wrap: Words draw_text.text_style.font_size: 12.75 draw_text.text_style.line_spacing: 1.31 draw_text.color: #3c3832 }
                                }
                                teacher_avatar := View { width: 94 height: 94 flow: Overlay
                                    // Web .octos-teacher-avatar: 94px, radius 38–46% (~40px;
                                    // sdf.box draws 2 × border_radius), #f2fbfc→#d4edf2.
                                    RoundedView { width: Fill height: Fill
                                        draw_bg +: { color: #e3f4f7 border_radius: 20 border_size: 0.5 border_color: #c2dde6 } }
                                    // DIFF: static avatar; the organic skin animation is a later milestone.
                                    octos_art_holder := View { width: Fill height: Fill align: Align{x: 0.5 y: 0.3}
                                        octos_art := Svg { animating: false width: 56 height: 56 } }
                                    // 3D companions (web model-viewer) show their thumbnail.
                                    octos_png := View { visible: false width: Fill height: Fill align: Align{x: 0.5 y: 0.25}
                                        octos_png_image := Image { width: 62 height: 62 fit: ImageFit.Smallest } }
                                    View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 7}
                                        teacher_state := Label { width: Fit padding: 0 text: "继续播放" draw_text.text_style.font_size: 7.5 draw_text.color: #316979 }
                                    }
                                }
                            }
                        }
                        // Student input dock (web .learning-input-dock: bottom
                        // 22, centered, max-width 720). Text questions go to the
                        // Octos server on a live board; image/camera/voice are
                        // separate milestones.
                        input_anchor := View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 22}
                            input_dock := RoundedView {
                                width: 720 height: Fit flow: Right spacing: 5 align: Align{y: 0.5} padding: 6
                                draw_bg +: { color: #fffdf8e8 border_radius: 10.5 border_size: 0.5 border_color: #e7e0d4 }
                                ask_image := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 19 height: 19}
                                    draw_icon +: { color: #756c61 }
                                    draw_bg +: { color: #0000 color_hover: #e9f0f2 color_down: #dde9ec border_radius: 6.5 border_size: 0 border_color: #0000 } }
                                ask_camera := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 19 height: 19}
                                    draw_icon +: { color: #756c61 }
                                    draw_bg +: { color: #0000 color_hover: #e9f0f2 color_down: #dde9ec border_radius: 6.5 border_size: 0 border_color: #0000 } }
                                ask_mic := Button { width: 44 height: 44 text: "" icon_walk: Walk{width: 21 height: 21}
                                    draw_icon +: { color: #ffffff }
                                    // Web .learning-mic-button:disabled (voice unavailable): #167794 at opacity .38.
                                    draw_bg +: { color: #a6cad2 color_hover: #a6cad2 color_down: #a6cad2 border_radius: 6.5 border_size: 0 border_color: #0000 } }
                                ask_mic_on := Button { visible: false width: 44 height: 44 text: "" icon_walk: Walk{width: 21 height: 21}
                                    draw_icon +: { color: #ffffff }
                                    // Voice on: web .learning-mic-button.
                                    draw_bg +: { color: #167794 color_hover: #12627c color_down: #12627c border_radius: 6.5 border_size: 0 border_color: #0000 } }
                                // Web .learning-input-dock input: 14px #322d27, placeholder
                                // #938a7e, padding 0 12px; Enter or the send button asks.
                                ask_input := TextInput { width: Fill height: Fit padding: Inset{left: 12 right: 12} margin: 0
                                    empty_text: "问一个问题，或告诉 Octos 你卡在哪里…"
                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                    draw_text +: { color: #322d27 color_hover: #322d27 color_focus: #322d27 color_down: #322d27
                                        color_empty: #938a7e color_empty_hover: #938a7e color_empty_focus: #938a7e text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                    draw_cursor +: { color: #322d27 } }
                                ask_send := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 18 height: 18}
                                    draw_icon +: { color: #ffffff }
                                    draw_bg +: { color: #b3b0ab color_hover: #b3b0ab color_down: #b3b0ab border_radius: 6.5 border_size: 0 border_color: #0000 } }
                            }
                        }
                        // Selection question panel (web .learning-selection-question:
                        // top 142 left 18, 420 wide, 14 padding).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 18 top: 142}
                            sel_panel := RoundedView { visible: false width: 420 height: Fit flow: Down padding: 14
                                draw_bg +: { color: #fffef9fa border_radius: 8 border_size: 0.5 border_color: #27686233 }
                                View { width: Fill height: Fit flow: Right spacing: 10 margin: Inset{bottom: 12}
                                    Label { width: Fill padding: 0 text: "针对当前选区提问" draw_text.text_style: theme.font_bold{font_size: 10.5} draw_text.color: #253735 }
                                    sel_panel_note := Label { width: 170 padding: 0 text: "" draw_text.wrap: Words draw_text.text_style.font_size: 9 draw_text.text_style.line_spacing: 1.45 draw_text.color: #687976 }
                                }
                                sel_targets := View { width: Fill height: Fit flow: Down spacing: 5 }
                                View { width: Fill height: Fit flow: Right spacing: 10 align: Align{y: 0.5} margin: Inset{top: 6}
                                    Label { width: Fit padding: 0 text: "我写的内容更像" draw_text.text_style.font_size: 9.75 draw_text.color: #253735 }
                                    sel_kinds := View { width: Fill height: Fit flow: Right spacing: 4 align: Align{x: 1.} }
                                }
                                sel_class_text := Label { width: Fill padding: 0 margin: Inset{top: 7} text: "" draw_text.wrap: Words draw_text.text_style.font_size: 8.25 draw_text.text_style.line_spacing: 1.45 draw_text.color: #667a76 }
                                View { width: Fill height: Fit flow: Down spacing: 2 margin: Inset{top: 12 bottom: 6}
                                    Label { width: Fill padding: 0 text: "接下来让小章鱼做什么？" draw_text.text_style: theme.font_bold{font_size: 9} draw_text.color: #253735 }
                                    Label { width: Fill padding: 0 text: "下面是操作，不会改变上面已经确认的选区。" draw_text.text_style.font_size: 8.25 draw_text.color: #70807d }
                                }
                                sel_suggestions := View { width: Fill height: Fit flow: Right spacing: 7 }
                                View { width: Fill height: Fit flow: Right spacing: 7 align: Align{y: 0.5} margin: Inset{top: 10}
                                    sel_input := TextInput { width: Fill height: Fit padding: Inset{left: 10 right: 10 top: 8 bottom: 8} margin: 0
                                        empty_text: "例如：这一步为什么不对？"
                                        draw_bg +: { color: #ffffff color_hover: #ffffff color_focus: #ffffff color_down: #ffffff color_empty: #ffffff border_radius: 5 border_size: 0.5
                                            border_color: #x2768622e border_color_hover: #x2768622e border_color_focus: #27686266 border_color_down: #x2768622e border_color_empty: #x2768622e }
                                        draw_text +: { color: #253735 color_hover: #253735 color_focus: #253735 color_down: #253735 color_empty: #9aa5a2 color_empty_hover: #9aa5a2 color_empty_focus: #9aa5a2 text_style.font_size: 9.75 }
                                        draw_cursor +: { color: #253735 } }
                                    sel_send := Button { height: 36 text: "发送" padding: Inset{left: 14 right: 14} margin: 0
                                        draw_text.color: #253735 draw_text.text_style.font_size: 9.75
                                        draw_bg +: { color: #ffffff color_hover: #f1f6f5 color_down: #e3eeec border_radius: 5 border_size: 0.5 border_color: #x2768622e } }
                                }
                            }
                        }
                        // Camera monitor (web .learning-camera-monitor: top 86 right 24,
                        // the live frame "老师看到的画面" and the last sent frame).
                        View { width: Fill height: Fill flow: Down align: Align{x: 1. y: 0.} padding: Inset{top: 86 right: 24}
                            camera_monitor := RoundedView { visible: false width: Fit height: Fit flow: Right spacing: 8 padding: 7
                                draw_bg +: { color: #fffdf8e0 border_radius: 8 border_size: 0.5 border_color: #255c6c24 }
                                camera_live := View { width: 192 height: Fit flow: Overlay
                                    camera_image := Image { width: 192 height: Fit fit: ImageFit.Horizontal }
                                    // Web .learning-camera-frame-settings: top-right 30px.
                                    View { width: Fill height: Fit flow: Right align: Align{x: 1.} padding: 6
                                        camera_frame_settings := Button { width: 30 height: 30 text: "" margin: 0 padding: 0 icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #ffffff }
                                            draw_bg +: { color: #x182326a8 color_hover: #x0f6987e0 color_down: #x0f6987e0 border_radius: 4.5 border_size: 0.5 border_color: #ffffff6b } } }
                                    View { width: Fill height: Fill flow: Down align: Align{y: 1.} padding: 5
                                        RoundedView { width: Fill height: Fit align: Align{x: 0.5} padding: Inset{left: 5 right: 5 top: 3 bottom: 3}
                                            draw_bg +: { color: #x1924269e border_radius: 3.5 }
                                            Label { width: Fit padding: 0 text: "老师看到的画面" draw_text.color: #ffffff draw_text.text_style.font_size: 6.75 } }
                                    }
                                }
                                camera_sent := View { visible: false width: 192 height: Fit flow: Overlay
                                    camera_sent_image := Image { width: 192 height: Fit fit: ImageFit.Horizontal }
                                    View { width: Fill height: Fill flow: Down align: Align{y: 1.} padding: 5
                                        RoundedView { width: Fill height: Fit align: Align{x: 0.5} padding: Inset{left: 5 right: 5 top: 3 bottom: 3}
                                            draw_bg +: { color: #x1924269e border_radius: 3.5 }
                                            Label { width: Fit padding: 0 text: "本轮已发送" draw_text.color: #ffffff draw_text.text_style.font_size: 6.75 } }
                                    }
                                }
                            }
                        }
                        // Camera framing dialog (web CameraSettingsDialog).
                        camera_dialog := SolidView { visible: false width: Fill height: Fill align: Align{x: 0.5 y: 0.5} draw_bg.color: #x221f1b6b
                            RoundedView { width: 940 height: Fit flow: Down draw_bg +: { color: #fffdf8 border_radius: 13 border_size: 0.5 border_color: #x32484c33 }
                                View { width: Fill height: Fit flow: Right padding: Inset{left: 24 right: 24 top: 22 bottom: 18}
                                    View { width: Fill height: Fit flow: Down spacing: 4
                                        Label { width: Fit padding: 0 text: "CAMERA FRAMING" draw_text.text_style: theme.font_code{font_size: 7.5} draw_text.color: #7a7064 }
                                        Label { width: Fit padding: 0 text: "调整老师看到的画面" draw_text.text_style: theme.font_bold{font_size: 16.5} draw_text.color: #2f2a24 }
                                        Label { width: Fit padding: 0 text: "这里的方向、缩放和取景会原样应用到发送给老师的图片。" draw_text.text_style.font_size: 9.75 draw_text.color: #6c645a }
                                    }
                                    camera_dialog_close := Button { width: 40 height: 40 text: "" margin: 0 icon_walk: Walk{width: 22 height: 22} draw_icon +: { color: #5e574f }
                                        draw_bg +: { color: #0000 color_hover: #f0ebe2 color_down: #e6e0d6 border_radius: 6 border_size: 0 border_color: #0000 } }
                                }
                                SolidView { width: Fill height: 1 draw_bg.color: #x463e351a }
                                View { width: Fill height: Fit flow: Right spacing: 22 padding: Inset{left: 24 right: 24 top: 22 bottom: 24}
                                    RoundedView { width: Fill height: 400 flow: Overlay align: Align{x: 0.5 y: 0.5} draw_bg +: { color: #202625 border_radius: 10 }
                                        View { width: Fill height: Fill align: Align{x: 0.5 y: 0.5}
                                            camera_dialog_image := Image { width: 520 height: 380 fit: ImageFit.Smallest } }
                                        View { width: Fill height: Fill padding: 14
                                            RoundedView { width: Fit height: Fit flow: Right spacing: 8 padding: Inset{left: 10 right: 10 top: 7 bottom: 7} draw_bg +: { color: #x0f1413ad border_radius: 5 }
                                                Label { width: Fit padding: 0 text: "老师看到的画面" draw_text.text_style: theme.font_bold{font_size: 9} draw_text.color: #ffffff }
                                                camera_dialog_meta := Label { width: Fit padding: 0 text: "0° · 1.0×" draw_text.text_style.font_size: 9 draw_text.color: #ffffffcc } } }
                                    }
                                    View { width: 324 height: Fit flow: Down spacing: 16
                                        View { width: Fill height: Fit flow: Right spacing: 8
                                            camera_dialog_left := Button { width: Fill height: 64 text: "左转" flow: Down spacing: 5 align: Align{x: 0.5 y: 0.5} margin: 0
                                                icon_walk: Walk{width: 19 height: 19} draw_icon +: { color: #315f69 }
                                                draw_text.color: #47413a draw_text.text_style.font_size: 9
                                                draw_bg +: { color: #f2f6f3 color_hover: #e6efec color_down: #dbe8e4 border_radius: 7 border_size: 0.5 border_color: #x275b6626 } }
                                            camera_dialog_right := Button { width: Fill height: 64 text: "右转" flow: Down spacing: 5 align: Align{x: 0.5 y: 0.5} margin: 0
                                                icon_walk: Walk{width: 19 height: 19} draw_icon +: { color: #315f69 }
                                                draw_text.color: #47413a draw_text.text_style.font_size: 9
                                                draw_bg +: { color: #f2f6f3 color_hover: #e6efec color_down: #dbe8e4 border_radius: 7 border_size: 0.5 border_color: #x275b6626 } }
                                            camera_dialog_mirror := Button { width: Fill height: 64 text: "镜像" flow: Down spacing: 5 align: Align{x: 0.5 y: 0.5} margin: 0
                                                icon_walk: Walk{width: 19 height: 19} draw_icon +: { color: #315f69 }
                                                draw_text.color: #47413a draw_text.text_style.font_size: 9
                                                draw_bg +: { color: #f2f6f3 color_hover: #e6efec color_down: #dbe8e4 border_radius: 7 border_size: 0.5 border_color: #x275b6626 } }
                                        }
                                        View { width: Fill height: 46 flow: Right spacing: 10 align: Align{y: 0.5}
                                            Label { width: 40 padding: 0 text: "缩放" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                            camera_dialog_zoom := SliderMinimal { width: Fill height: 30 text: "" min: 1.0 max: 3.0 step: 0.1 margin: 0
                                                draw_bg +: { offset_y: 0.
                                                    // Web <input type=range>: 4px track, teal fill, round thumb.
                                                    pixel: fn() {
                                                        let sdf = Sdf2d.viewport(self.pos * self.rect_size)
                                                        let cy = self.rect_size.y * 0.5
                                                        let r = 8.0
                                                        let w = self.rect_size.x - r * 2.0
                                                        sdf.box(r, cy - 2.0, w, 4.0, 1.0)
                                                        sdf.fill(#d9d3c8)
                                                        sdf.box(r, cy - 2.0, w * self.slide_pos, 4.0, 1.0)
                                                        sdf.fill(#1f7a85)
                                                        sdf.circle(r + w * self.slide_pos, cy, r - 1.0)
                                                        sdf.fill_keep(#ffffff)
                                                        sdf.stroke(#1f7a85, 1.5)
                                                        return sdf.result
                                                    } } }
                                            camera_dialog_zoom_value := Label { width: 40 padding: 0 text: "1.0×" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                        }
                                        View { width: Fill height: 46 flow: Right spacing: 10 align: Align{y: 0.5}
                                            Label { width: 40 padding: 0 text: "左右" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                            camera_dialog_x := SliderMinimal { width: Fill height: 30 text: "" min: -1.0 max: 1.0 step: 0.05 margin: 0
                                                draw_bg +: { offset_y: 0.
                                                    // Web <input type=range>: 4px track, teal fill, round thumb.
                                                    pixel: fn() {
                                                        let sdf = Sdf2d.viewport(self.pos * self.rect_size)
                                                        let cy = self.rect_size.y * 0.5
                                                        let r = 8.0
                                                        let w = self.rect_size.x - r * 2.0
                                                        sdf.box(r, cy - 2.0, w, 4.0, 1.0)
                                                        sdf.fill(#d9d3c8)
                                                        sdf.box(r, cy - 2.0, w * self.slide_pos, 4.0, 1.0)
                                                        sdf.fill(#1f7a85)
                                                        sdf.circle(r + w * self.slide_pos, cy, r - 1.0)
                                                        sdf.fill_keep(#ffffff)
                                                        sdf.stroke(#1f7a85, 1.5)
                                                        return sdf.result
                                                    } } }
                                            camera_dialog_x_value := Label { width: 40 padding: 0 text: "0" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                        }
                                        View { width: Fill height: 46 flow: Right spacing: 10 align: Align{y: 0.5}
                                            Label { width: 40 padding: 0 text: "上下" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                            camera_dialog_y := SliderMinimal { width: Fill height: 30 text: "" min: -1.0 max: 1.0 step: 0.05 margin: 0
                                                draw_bg +: { offset_y: 0.
                                                    // Web <input type=range>: 4px track, teal fill, round thumb.
                                                    pixel: fn() {
                                                        let sdf = Sdf2d.viewport(self.pos * self.rect_size)
                                                        let cy = self.rect_size.y * 0.5
                                                        let r = 8.0
                                                        let w = self.rect_size.x - r * 2.0
                                                        sdf.box(r, cy - 2.0, w, 4.0, 1.0)
                                                        sdf.fill(#d9d3c8)
                                                        sdf.box(r, cy - 2.0, w * self.slide_pos, 4.0, 1.0)
                                                        sdf.fill(#1f7a85)
                                                        sdf.circle(r + w * self.slide_pos, cy, r - 1.0)
                                                        sdf.fill_keep(#ffffff)
                                                        sdf.stroke(#1f7a85, 1.5)
                                                        return sdf.result
                                                    } } }
                                            camera_dialog_y_value := Label { width: 40 padding: 0 text: "0" draw_text.text_style.font_size: 9 draw_text.color: #5e574f }
                                        }
                                        View { width: Fill height: Fit flow: Overlay
                                            RoundedView { width: Fill height: 68 flow: Right align: Align{y: 0.5} padding: Inset{left: 14 right: 14} draw_bg +: { color: #f2f6f3 border_radius: 7.5 border_size: 0.5 border_color: #x275b6626 }
                                                View { width: Fill height: Fit flow: Down spacing: 3
                                                    Label { width: Fit padding: 0 text: "试卷清晰模式" draw_text.text_style: theme.font_bold{font_size: 10.5} draw_text.color: #47413a }
                                                    Label { width: Fit padding: 0 text: "提高发送分辨率与文字清晰度" draw_text.text_style.font_size: 9 draw_text.color: #6c645a } }
                                                camera_dialog_doc_state := Label { width: Fit padding: 0 text: "已开启" draw_text.text_style: theme.font_bold{font_size: 9.75} draw_text.color: #1f7a85 } }
                                            camera_dialog_doc := Button { width: Fill height: 68 text: "" margin: 0 draw_bg +: { color: #0000 color_hover: #0000000a color_down: #00000014 border_radius: 7.5 border_size: 0 border_color: #0000 } }
                                        }
                                        camera_dialog_reset := Button { width: Fill height: 46 text: "恢复默认取景" spacing: 7 margin: 0 icon_walk: Walk{width: 16 height: 16} draw_icon +: { color: #5e574f }
                                            draw_text.color: #5e574f draw_text.text_style.font_size: 10.5
                                            draw_bg +: { color: #0000 color_hover: #f0ebe2 color_down: #e6e0d6 border_radius: 7 border_size: 0.5 border_color: #x463e3533 } }
                                    }
                                }
                            }
                        }
                        // Error bar (web .learning-ink-error bottom toast, simplified).
                        View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 24}
                            error_bar := RoundedView {
                                visible: false width: Fit height: Fit padding: Inset{left: 16 right: 16 top: 10 bottom: 10}
                                draw_bg +: { color: #f9e3df border_radius: 6 }
                                error_label := Label { width: Fit height: Fit text: "" draw_text.text_style.font_size: 11 draw_text.color: #8c3a2b }
                            }
                        }
                        // 大图 dialog (web .oll-plot-dialog / .oll-coordinate-dialog):
                        // backdrop #152c2b88, centered card 1100 wide, padding 20.
                        enlarge_dialog := View { visible: false width: Fill height: Fill flow: Overlay
                            enlarge_backdrop := SolidView { width: Fill height: Fill draw_bg.color: #152c2b88 }
                            // Positioned absolutely by sync_enlarged: aligned layout would
                            // shift text but not DrawVector geometry.
                            View { width: Fill height: Fill
                                enlarge_card := RoundedView { width: 1100 height: Fit flow: Down padding: 20
                                    draw_bg +: { color: #fffdf7 border_radius: 8 border_size: 0.5 border_color: #cec8bd }
                                    enlarge_close := Button { height: 28 text: "关闭大图" padding: Inset{left: 8 right: 8 top: 4 bottom: 4}
                                        draw_text.color: #214c48 draw_text.text_style.font_size: 9
                                        draw_bg +: { color: #fffdf7 color_hover: #f1efe9 border_radius: 3.5 border_size: 0.5 border_color: #cec8bd } }
                                    enlarge_title := Label { width: Fill padding: Inset{top: 6 bottom: 6} text: "" draw_text.text_style.font_size: 13.5 draw_text.color: #214c48 }
                                    // Web .plot-dialog-shell.oll-board-runtime: #f8f5ed, padding 12.
                                    SolidView { width: Fill height: Fit flow: Down padding: 12 draw_bg.color: #f8f5ed
                                        enlarge_plot_box := View { visible: false width: Fill height: Fit enlarge_plot := mod.widgets.PlotView {} }
                                        enlarge_geometry_box := View { visible: false width: Fill height: Fit enlarge_geometry := mod.widgets.GeometryView {} }
                                    }
                                }
                            }
                        }
                        // 学习记录 drawer (web LearningHistory: overlay #152b324d,
                        // 360px panel from the left, padding 24/18).
                        history_drawer := View { visible: false width: Fill height: Fill flow: Overlay
                            history_backdrop := SolidView { width: Fill height: Fill draw_bg.color: #152b324d }
                            history_panel := SolidView { width: 360 height: Fill flow: Down padding: Inset{left: 18 right: 18 top: 24 bottom: 24}
                                draw_bg.color: #fffef9
                                View { width: Fill height: Fit flow: Right spacing: 12
                                    View { width: Fill height: Fit flow: Down
                                        Label { width: Fit padding: 0 text: "学习记录" draw_text.text_style: theme.font_bold{font_size: 16.5} draw_text.color: #243b40 }
                                        Label { width: Fit padding: 0 margin: Inset{top: 8 bottom: 16} text: "继续之前的白板与课程" draw_text.text_style.font_size: 9.75 draw_text.color: #657c7c }
                                    }
                                    history_close := Button { width: 40 height: 40 text: "" icon_walk: Walk{width: 20 height: 20}
                                        draw_icon +: { color: #243b40 }
                                        draw_bg +: { color: #0000 color_hover: #edf4ef color_down: #e3ede6 border_radius: 4 border_size: 0 border_color: #0000 } }
                                }
                                // DIFF: blank whiteboards are not migrated; click shows a toast.
                                history_new := Button { width: Fill height: 44 text: "新建白板" margin: Inset{top: 8 bottom: 18}
                                    align: Align{x: 0.5 y: 0.5} spacing: 8 icon_walk: Walk{width: 18 height: 18}
                                    draw_icon +: { color: #ffffff }
                                    draw_text.color: #ffffff draw_text.text_style.font_size: 10.5
                                    draw_bg +: { color: #166a79 color_hover: #x12606e color_down: #x12606e border_radius: 5 border_size: 0 border_color: #0000 } }
                                RoundedView { width: Fill height: Fit flow: Right spacing: 8 align: Align{y: 0.5} padding: 10
                                    draw_bg +: { color: #0000 border_radius: 5 border_size: 0.5 border_color: #d7dfd9 }
                                    history_search_icon := Svg { animating: false width: 17 height: 17 draw_svg +: { preserve_viewbox: true } }
                                    history_search := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "搜索学习记录"
                                        draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                            border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                        draw_text +: { color: #243b40 color_hover: #243b40 color_focus: #243b40 color_down: #243b40
                                            color_empty: #8a9a98 color_empty_hover: #8a9a98 color_empty_focus: #8a9a98 text_style.font_size: 10.5 }
                                        draw_cursor +: { color: #243b40 } }
                                }
                                ScrollYView { width: Fill height: Fill margin: Inset{top: 16}
                                    history_list := View { width: Fill height: Fit flow: Down }
                                }
                            }
                        }
                    }
                    // Course card "⋯" panel (web .course-launcher-more-panel):
                    // 180 wide, placed above the button by Rust (set_walk).
                    View { width: Fill height: Fill
                        card_menu := RoundedView { visible: false width: 180 height: Fit flow: Down padding: 6
                            draw_bg +: { color: #fffef9 border_radius: 6 border_size: 0.5 border_color: #d8ded6 }
                            menu_restart := RoundedView { width: Fill height: 36 flow: Right spacing: 6 align: Align{y: 0.5} padding: Inset{left: 10}
                                draw_bg +: { color: #0000 border_radius: 4 }
                                menu_restart_icon := Svg { animating: false width: 14 height: 14 draw_svg +: { preserve_viewbox: true } }
                                Label { width: Fit padding: 0 text: "重新开始" draw_text.text_style.font_size: 9.75 draw_text.color: #426568 }
                            }
                            menu_delete := RoundedView { width: Fill height: 36 flow: Right spacing: 6 align: Align{y: 0.5} padding: Inset{left: 10}
                                draw_bg +: { color: #0000 border_radius: 4 }
                                menu_delete_icon := Svg { animating: false width: 14 height: 14 draw_svg +: { preserve_viewbox: true } }
                                Label { width: Fit padding: 0 text: "删除学习记录" draw_text.text_style.font_size: 9.75 draw_text.color: #a84836 }
                            }
                        }
                    }
                    // Web SetupWhiteboard (/setup, `.setup-board`): the first live board
                    // asks for a model (and optional narration TTS) before entering.
                    setup_page := SolidView { visible: false width: Fill height: Fill draw_bg.color: #faf8f0
                        ScrollYView { width: Fill height: Fill
                            setup_inner := View { width: Fill height: Fit flow: Down padding: Inset{left: 58 right: 58 top: 32 bottom: 48}
                                View { width: Fill height: Fit flow: Right spacing: 24 align: Align{y: 0.}
                                    View { width: Fill height: Fit flow: Down
                                        Label { width: Fit padding: 0 text: "O C T O S   L E A R N  ·  第 一 块 白 板" draw_text.text_style.font_size: 8.25 draw_text.color: #867e70 }
                                        setup_heading := Label { width: Fill padding: 0 margin: Inset{top: 8} text: "把白板准备好，就可以开始了" draw_text.text_style: theme.font_bold{font_size: 27} draw_text.color: #303e3b }
                                    }
                                    setup_full_settings := Button { width: Fit height: Fit text: "完整设置" padding: 0 margin: Inset{top: 14}
                                                draw_text.color: #287c77 draw_text.text_style.font_size: 10.5
                                                draw_bg +: { color: #0000 color_hover: #0000 color_down: #0000 border_size: 0 border_color: #0000 } }
                                }
                                setup_intro := Label { width: Fill padding: 0 margin: Inset{top: 22 bottom: 36} text: "写下问题、拍下纸上的题目，或直接开口问。Octos 会在同一块白板上讲解，并陪你一起推导。" draw_text.wrap: Words draw_text.text_style.font_size: 11.25 draw_text.text_style.line_spacing: 1.52 draw_text.color: #69706a }
                                setup_cards := View { width: Fill height: Fit flow: Right spacing: 30
                                    setup_model_card := RoundedView { width: Fill height: Fit flow: Down padding: 26
                                        draw_bg +: { color: #fffdf6 border_radius: 10 border_size: 0.5 border_color: #ded8c9 }
                                        Label { width: Fit padding: 0 text: "01 · AI 讲解需要" draw_text.text_style.font_size: 9 draw_text.color: #987231 }
                                        setup_model_heading := Label { width: Fill padding: 0 margin: Inset{top: 12 bottom: 12} text: "连接你的模型" draw_text.text_style: theme.font_bold{font_size: 17.25} draw_text.color: #303e3b }
                                        Label { width: Fill padding: 0 text: "使用自己的 API Key，模型费用由你的供应商账户承担。没有配置也能先写白板。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                        View { width: Fill height: Fit flow: Down margin: Inset{top: 20}
                                            Label { width: Fit padding: 0 margin: Inset{top: 10} text: "模型平台" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                            RoundedView { width: Fill height: Fit flow: Right padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                Label { width: Fill padding: 0 text: "Google Gemini" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                setup_platform_chevron := Svg { animating: false width: 14 height: 14 draw_svg +: { preserve_viewbox: true } }
                                            }
                                            Label { width: Fit padding: 0 margin: Inset{top: 10} text: "模型名称" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                            RoundedView { width: Fill height: Fit padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                setup_model := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "gemini-3.6-flash" 
                                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                                    draw_text +: { color: #303e3b color_hover: #303e3b color_focus: #303e3b color_down: #303e3b
                                                        color_empty: #9aa09a color_empty_hover: #9aa09a color_empty_focus: #9aa09a text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                                    draw_cursor +: { color: #303e3b } }
                                            }
                                            Label { width: Fit padding: 0 margin: Inset{top: 10} text: "API Key" draw_text.text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) draw_text.color: #303e3b }
                                            RoundedView { width: Fill height: Fit padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                setup_key := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "粘贴你的 API Key" is_password: true
                                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                                    draw_text +: { color: #303e3b color_hover: #303e3b color_focus: #303e3b color_down: #303e3b
                                                        color_empty: #9aa09a color_empty_hover: #9aa09a color_empty_focus: #9aa09a text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                                    draw_cursor +: { color: #303e3b } }
                                            }
                                            setup_save := Button { width: Fit height: Fit text: "测试连接并保存" padding: Inset{left: 18 right: 18 top: 12 bottom: 12} margin: Inset{top: 14}
                                                draw_text.color: #ffffff draw_text.text_style: theme.font_bold{font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 })}
                                                draw_bg +: { color: #216e68 color_hover: #1b5c57 color_down: #1b5c57 border_radius: 6 border_size: 0 border_color: #0000 } }
                                            setup_model_status := Label { width: Fill padding: 0 margin: Inset{top: 10} text: "" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.44 draw_text.color: #4b5a56 }
                                            setup_full_model := Button { width: Fit height: Fit text: "打开完整模型设置 →" padding: 0 margin: Inset{top: 14}
                                                draw_text.color: #287c77 draw_text.text_style.font_size: 10.5
                                                draw_bg +: { color: #0000 color_hover: #0000 color_down: #0000 border_size: 0 border_color: #0000 } }
                                        }
                                    }
                                    setup_tts_card := RoundedView { width: Fill height: Fit flow: Down padding: 26
                                        draw_bg +: { color: #fffdf6 border_radius: 10 border_size: 0.5 border_color: #ded8c9 }
                                        Label { width: Fit padding: 0 text: "02 · 可选" draw_text.text_style.font_size: 9 draw_text.color: #987231 }
                                        setup_tts_heading := Label { width: Fill padding: 0 margin: Inset{top: 12 bottom: 12} text: "听老师讲，也可以只看文字" draw_text.text_style: theme.font_bold{font_size: 17.25} draw_text.color: #303e3b }
                                        Label { width: Fill padding: 0 text: "平台提供有限额的旁白语音。你也可以配置自己的火山 TTS，不占平台额度。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                        View { width: Fill height: Fit flow: Down margin: Inset{top: 6}
                                            setup_listen := Button { width: Fill height: Fit text: "试听当前旁白语音" padding: Inset{left: 18 right: 18 top: 12 bottom: 12} margin: Inset{top: 14}
                                                draw_text.color: #ffffff draw_text.text_style: theme.font_bold{font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 })}
                                                draw_bg +: { color: #216e68 color_hover: #1b5c57 color_down: #1b5c57 border_radius: 6 border_size: 0 border_color: #0000 } }
                                            setup_volc_toggle := Button { width: Fit height: Fit text: "▶ 使用自己的火山 TTS（可选）" padding: Inset{top: 12 bottom: 12} margin: Inset{top: 8}
                                                draw_text.color: #303e3b draw_text.text_style.font_size: 10.5
                                                draw_bg +: { color: #0000 color_hover: #0000 color_down: #0000 border_size: 0 border_color: #0000 } }
                                            setup_volc := View { visible: false width: Fill height: Fit flow: Down
                                                Label { width: Fit padding: 0 margin: Inset{top: 10} text: "App ID" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                RoundedView { width: Fill height: Fit padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                setup_volc_appid := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "" 
                                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                                    draw_text +: { color: #303e3b color_hover: #303e3b color_focus: #303e3b color_down: #303e3b
                                                        color_empty: #9aa09a color_empty_hover: #9aa09a color_empty_focus: #9aa09a text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                                    draw_cursor +: { color: #303e3b } }
                                            }
                                                Label { width: Fit padding: 0 margin: Inset{top: 10} text: "Access Token" draw_text.text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) draw_text.color: #303e3b }
                                                RoundedView { width: Fill height: Fit padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                setup_volc_token := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "留空保留已有凭据" is_password: true
                                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                                    draw_text +: { color: #303e3b color_hover: #303e3b color_focus: #303e3b color_down: #303e3b
                                                        color_empty: #9aa09a color_empty_hover: #9aa09a color_empty_focus: #9aa09a text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                                    draw_cursor +: { color: #303e3b } }
                                            }
                                                Label { width: Fit padding: 0 margin: Inset{top: 10} text: "音色 ID" draw_text.text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) draw_text.color: #303e3b }
                                                RoundedView { width: Fill height: Fit padding: Inset{left: 12 right: 12 top: 10 bottom: 10} margin: Inset{top: 7}
                                                draw_bg +: { color: #ffffff border_radius: 5 border_size: 0.5 border_color: #cbcfc9 }
                                                setup_volc_voice := TextInput { width: Fill height: Fit padding: 0 margin: 0 empty_text: "zh_female_xiaohe_uranus_bigtts" 
                                                    draw_bg +: { color: #0000 color_hover: #0000 color_focus: #0000 color_down: #0000 color_empty: #0000
                                                        border_size: 0. border_color: #0000 border_color_hover: #0000 border_color_focus: #0000 border_color_down: #0000 border_color_empty: #0000 }
                                                    draw_text +: { color: #303e3b color_hover: #303e3b color_focus: #303e3b color_down: #303e3b
                                                        color_empty: #9aa09a color_empty_hover: #9aa09a color_empty_focus: #9aa09a text_style.font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 }) }
                                                    draw_cursor +: { color: #303e3b } }
                                            }
                                                setup_volc_save := Button { width: Fit height: Fit text: "保存个人 TTS 并试听" padding: Inset{left: 18 right: 18 top: 12 bottom: 12} margin: Inset{top: 14}
                                                draw_text.color: #ffffff draw_text.text_style: theme.font_bold{font_size: 10.5}
                                                draw_bg +: { color: #216e68 color_hover: #1b5c57 color_down: #1b5c57 border_radius: 6 border_size: 0 border_color: #0000 } }
                                            }
                                            setup_tts_status := Label { width: Fill padding: 0 margin: Inset{top: 10} text: "" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.44 draw_text.color: #4b5a56 }
                                            setup_voice_settings := Button { width: Fit height: Fit text: "语音设置与用量 →" padding: 0 margin: Inset{top: 14}
                                                draw_text.color: #287c77 draw_text.text_style.font_size: 10.5
                                                draw_bg +: { color: #0000 color_hover: #0000 color_down: #0000 border_size: 0 border_color: #0000 } }
                                        }
                                    }
                                    setup_skin_card := RoundedView { width: Fill height: Fit flow: Down padding: 26
                                        draw_bg +: { color: #fffdf6 border_radius: 10 border_size: 0.5 border_color: #ded8c9 }
                                        Label { width: Fit padding: 0 text: "03 · 随时再开" draw_text.text_style.font_size: 9 draw_text.color: #987231 }
                                        setup_skin_heading := Label { width: Fill padding: 0 margin: Inset{top: 12 bottom: 12} text: "语音和摄像头不影响打字" draw_text.text_style: theme.font_bold{font_size: 17.25} draw_text.color: #303e3b }
                                        
                                        View { width: Fill height: Fit flow: Down
                                            View { width: Fill height: Fit flow: Right spacing: 8 margin: Inset{bottom: 10}
                                                Label { width: Fit padding: 0 text: "•" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                Label { width: Fill padding: 0 text: "进入白板后点击「启用语音」，准备完成后再说话。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                            }
                                            View { width: Fill height: Fit flow: Right spacing: 8 margin: Inset{bottom: 10}
                                                Label { width: Fit padding: 0 text: "•" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                Label { width: Fill padding: 0 text: "语音服务忙碌时，可以继续打字，无需等待。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                            }
                                            View { width: Fill height: Fit flow: Right spacing: 8 margin: Inset{bottom: 10}
                                                Label { width: Fit padding: 0 text: "•" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                Label { width: Fill padding: 0 text: "启用摄像头后，发送问题时可附上纸上的题目。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                            }
                                            View { width: Fill height: Fit flow: Right spacing: 8 margin: Inset{bottom: 10}
                                                Label { width: Fit padding: 0 text: "•" draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                                Label { width: Fill padding: 0 text: "框选笔迹后提问，Octos 会围绕选中内容辅助你。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.text_style.line_spacing: 1.52 draw_text.color: #303e3b }
                                            }
                                        }
                                        SolidView { width: Fill height: Fit padding: 16 draw_bg.color: #fff3bf
                                            Label { width: Fill padding: 0 text: "只会在你主动启用时申请设备权限。" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.color: #303e3b }
                                        }
                                    }
                                }
                                View { width: Fill height: Fit flow: Down align: Align{x: 0.5} margin: Inset{top: 30}
                                    setup_enter := Button { width: Fit height: Fit text: "先用白板，稍后设置 AI" padding: Inset{left: 22 right: 22 top: 12 bottom: 12}
                                        draw_text.color: #ffffff draw_text.text_style: theme.font_bold{font_size: #(if cfg!(target_os = "android") { 7.5 } else { 10.5 })}
                                        draw_bg +: { color: #216e68 color_hover: #1b5c57 color_down: #1b5c57 border_radius: 6 border_size: 0 border_color: #0000 } }
                                    Label { width: Fit padding: 0 margin: Inset{top: 12} text: "以后从「设置 → 新手设置白板」回来，随时调整。API Key 仅发送到 Octos 服务端的凭据设置接口，不写进白板或课程内容。" draw_text.text_style.font_size: 9 draw_text.color: #69706a }
                                }
                            }
                        }
                    }
                    // Confirmation (web window.confirm).
                    // Settings (web /settings: StudioTopbar + sidebar + tab body).
                    settings_page := SolidView { visible: false width: Fill height: Fill flow: Down draw_bg.color: #f1f0ed
                        SolidView { width: Fill height: 82 flow: Right align: Align{y: 0.5} padding: Inset{left: 20 right: 20} spacing: 12 draw_bg.color: #f7f6f3
                            settings_back := Button { width: 36 height: 36 text: "" margin: 0 icon_walk: Walk{width: 18 height: 18} draw_icon +: { color: #3b3b39 }
                                draw_bg +: { color: #0000 color_hover: #e9e8e4 color_down: #deddd9 border_radius: 6 border_size: 0 border_color: #0000 } }
                            RoundedView { width: 40 height: 40 align: Align{x: 0.5 y: 0.5} draw_bg +: { color: #e6e5e1 border_radius: 20 }
                                settings_gear := Button { width: 40 height: 40 text: "" margin: 0 padding: 0 icon_walk: Walk{width: 18 height: 18} draw_icon +: { color: #2b2b29 }
                                    draw_bg +: { color: #0000 color_hover: #0000 color_down: #0000 border_size: 0 border_color: #0000 } } }
                            View { width: Fill height: Fit flow: Down spacing: 2
                                Label { width: Fit padding: 0 text: "OCTOS LEARN" draw_text.text_style: theme.font_code{font_size: 8.25} draw_text.color: #5f5f5b }
                                Label { width: Fit padding: 0 text: "Settings" draw_text.text_style: theme.font_bold{font_size: 13.5} draw_text.color: #1c1c1b }
                                Label { width: Fit padding: 0 text: "Profile, companion, models, voice, and access" draw_text.text_style.font_size: 9 draw_text.color: #5f5f5b }
                            }
                            settings_setup := Button { height: 36 text: "新手设置白板" margin: 0 padding: Inset{left: 10 right: 10}
                                draw_text.color: #1c1c1b draw_text.text_style.font_size: 10.5
                                draw_bg +: { color: #0000 color_hover: #e9e8e4 color_down: #deddd9 border_radius: 6 border_size: 0 border_color: #0000 } }
                        }
                        SolidView { width: Fill height: 1 draw_bg.color: #dcdbd7 }
                        View { width: Fill height: Fill flow: Right
                            SolidView { width: 240 height: Fill flow: Down padding: Inset{left: 12 right: 12 top: 16} draw_bg.color: #ebeae6
                                settings_search := TextInput { width: Fill height: Fit padding: Inset{left: 14 right: 12 top: 10 bottom: 10} margin: Inset{left: 4 right: 0 bottom: 12}
                                    empty_text: "Find a setting..."
                                    draw_bg +: { color: #e6e5e1 color_hover: #e6e5e1 color_focus: #e6e5e1 color_down: #e6e5e1 color_empty: #e6e5e1 border_radius: 6 border_size: 0.5
                                        border_color: #cfceca border_color_hover: #cfceca border_color_focus: #a9a8a4 border_color_down: #cfceca border_color_empty: #cfceca }
                                    draw_text +: { color: #1c1c1b color_hover: #1c1c1b color_focus: #1c1c1b color_down: #1c1c1b color_empty: #8a8a85 color_empty_hover: #8a8a85 color_empty_focus: #8a8a85 text_style.font_size: 10.5 }
                                    draw_cursor +: { color: #1c1c1b } }
                                settings_nav := View { width: Fill height: Fit flow: Down }
                            }
                            SolidView { width: 1 height: Fill draw_bg.color: #dcdbd7 }
                            ScrollYView { width: Fill height: Fill flow: Down
                                View { width: Fill height: Fit flow: Down align: Align{x: 0.5} padding: Inset{top: 24 bottom: 48}
                                    settings_body := View { width: 768 height: Fit flow: Down }
                                }
                            }
                        }
                    }
                    confirm_dialog := View { visible: false width: Fill height: Fill flow: Overlay
                        SolidView { width: Fill height: Fill draw_bg.color: #152c2b55 }
                        View { width: Fill height: Fill align: Align{x: 0.5 y: 0.4}
                            RoundedView { width: 420 height: Fit flow: Down spacing: 18 padding: 22
                                draw_bg +: { color: #fffef9 border_radius: 8 border_size: 0.5 border_color: #d8ded6 }
                                confirm_text := Label { width: Fill padding: 0 text: "" draw_text.wrap: Words draw_text.text_style.font_size: 10.5 draw_text.color: #243b40 }
                                View { width: Fill height: Fit flow: Right spacing: 10 align: Align{x: 1.}
                                    confirm_cancel := Button { height: 36 text: "取消" padding: Inset{left: 16 right: 16}
                                        draw_text.color: #426568 draw_text.text_style.font_size: 9.75
                                        draw_bg +: { color: #f0f3ee color_hover: #e6ebe4 border_radius: 4.5 border_size: 0 border_color: #0000 } }
                                    confirm_ok := Button { height: 36 text: "确定" padding: Inset{left: 16 right: 16}
                                        draw_text.color: #ffffff draw_text.text_style.font_size: 9.75
                                        draw_bg +: { color: #166a79 color_hover: #x12606e border_radius: 4.5 border_size: 0 border_color: #0000 } }
                                }
                            }
                        }
                    }
                    // Neutral toast for "not migrated yet" notices (body level
                    // so it also shows on the launcher page).
                    View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 96}
                        toast := RoundedView {
                            visible: false width: Fit height: Fit padding: Inset{left: 14 right: 14 top: 9 bottom: 9}
                            draw_bg +: { color: #fffdf8f2 border_radius: 6 border_size: 0.5 border_color: #e3d9cb }
                            toast_label := Label { width: Fit height: Fit text: "" draw_text.text_style.font_size: 11 draw_text.color: #5d5952 }
                        }
                    }
                }
            }
        }
    }
}

struct CourseCardRefs {
    pack_id: String,
    version: String,
    /// Tap targets (icon+label pills, hit-tested by area).
    preview: WidgetRef,
    start: WidgetRef,
    /// "⋯" (only when progress is saved): 重新开始 / 删除学习记录.
    more: Option<WidgetRef>,
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
/// A server-backed learning board (web LearningWorkspace with a learn-*
/// session): the learner's questions and the lesson generated for them.
struct Live {
    session_id: String,
    opened: bool,
    titled: bool,
    /// (turn id, question, status: pending | answered | failed).
    questions: Vec<(String, String, String)>,
    /// job id -> turn id.
    jobs: HashMap<String, String>,
    /// A question waiting for login before it can be sent.
    queued: Option<(String, String)>,
    /// A question whose camera frame is uploading: (turn, text, modality).
    uploading: Option<(String, String, String)>,
    /// Image questions run as agent chat turns (web sendImage): turns
    /// waiting for their lesson file, and those whose file was found.
    chat_turns: Vec<String>,
    chat_lessons: Vec<String>,
    /// The latest assistant reply of a chat turn (shown if no lesson came).
    chat_reply: Option<(String, String)>,
    /// Answered lessons in order: (turn id, canonical JSONL materialized
    /// with the web host ids), composed into one classroom for playback.
    lessons: Vec<(String, String)>,
    /// A course board that received questions (web composes the pack's
    /// events with the answers): the pack's canonical source and its key.
    base: Option<String>,
    course: Option<(String, String)>,
    /// Selection enhancement cards (web selection questions answered
    /// beside the ink).
    selection_cards: Vec<SelCard>,
    /// Narration still to synthesize (beat id, text) and the one in flight.
    tts_queue: Vec<(String, String)>,
    tts_inflight: Option<String>,
}
impl Live {
    /// Web composeOllClassroomEvents over the answered lessons.
    fn classroom(&self) -> Result<String, String> {
        let lessons = self
            .base
            .iter()
            .chain(self.lessons.iter().map(|(_, src)| src))
            .map(|src| src.lines().filter(|l| !l.trim().is_empty()).map(|l| serde_json::from_str(l).map_err(|e| e.to_string())).collect())
            .collect::<Result<Vec<Vec<serde_json::Value>>, String>>()?;
        Ok(oll_runtime::classroom::to_jsonl(&oll_runtime::classroom::compose(&lessons, &self.session_id)))
    }
    fn new() -> Self {
        let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis());
        // Web createLearningSessionId: six random base-36 characters.
        let suffix: String = server::random_bytes::<6>().iter().map(|b| char::from_digit((*b % 36) as u32, 36).unwrap_or('0')).collect();
        Self {
            session_id: format!("learn-{ms}-{suffix}"),
            opened: false,
            titled: false,
            questions: Vec::new(),
            jobs: HashMap::new(),
            queued: None,
            uploading: None,
            chat_turns: Vec::new(),
            chat_lessons: Vec::new(),
            chat_reply: None,
            lessons: Vec::new(),
            base: None,
            course: None,
            selection_cards: Vec::new(),
            tts_queue: Vec::new(),
            tts_inflight: None,
        }
    }
    fn pending(&self) -> bool {
        self.questions.iter().any(|q| q.2 == "pending")
    }
}

/// File-safe name for a Beat's narration clip.
fn tts_file_key(beat: &str) -> String {
    beat.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).collect()
}
/// Length of a PCM WAV clip in milliseconds (None for other formats).
fn wav_duration_ms(bytes: &[u8]) -> Option<f64> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let u16_at = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]) as f64;
    let u32_at = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]) as f64;
    let (mut pos, mut rate, mut block) = (12usize, 0., 0.);
    while pos + 8 <= bytes.len() {
        let size = u32_at(pos + 4) as usize;
        match &bytes[pos..pos + 4] {
            b"fmt " if pos + 24 <= bytes.len() => {
                rate = u32_at(pos + 12);
                block = u16_at(pos + 20);
            }
            b"data" if rate > 0. && block > 0. => {
                let size = size.min(bytes.len() - pos - 8);
                return Some(size as f64 / (rate * block) * 1000.);
            }
            _ => {}
        }
        pos += 8 + size + (size & 1);
    }
    None
}

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
    /// Course opened for preview (web course-mode=preview): no ink, no input
    /// dock, and a "开始互动学习" action instead of voice/camera.
    #[rust]
    course_preview: bool,
    /// When the lesson completed (web shows LESSON_COMPLETION_SPEECH for 6s).
    #[rust]
    completed_at: Option<Instant>,
    #[rust]
    pen_color: Vec4,
    #[rust]
    pen_width: f64,
    #[rust]
    narration_muted: bool,
    /// Course whose "⋯" menu is open (pack, version).
    #[rust]
    card_menu_for: Option<(String, String)>,
    /// Action waiting for confirmation: (restart?, pack, version).
    #[rust]
    pending_confirm: Option<(bool, String, String)>,
    /// Open the next course without restoring saved progress (重新开始).
    #[rust]
    skip_restore: bool,
    /// Node shown in the 大图 dialog.
    #[rust]
    enlarged: Option<String>,
    /// Course outline panel (web OllCourseOutline).
    #[rust]
    outline_open: bool,
    #[rust]
    outline_expanded: BTreeSet<String>,
    #[rust]
    outline_buttons: Vec<(WidgetRef, OutlineAction)>,
    #[rust]
    outline_signature: String,
    /// Recorded narration clips of the open course: Beat id -> audio file.
    #[rust]
    narration_audio: BTreeMap<String, std::path::PathBuf>,
    /// The clip being played: (Beat id, player id, playing, seek ms pending
    /// until the player is prepared).
    #[rust]
    audio_now: Option<(String, LiveId, bool, Option<u64>)>,
    #[rust]
    audio_players: Players,
    #[rust]
    speech_audio: Option<LiveId>,
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
    last_ink_revision: u64,
    /// Per-device reflection answers left open, keyed "<pack>:<reflection>"
    /// (web localStorage octos-learn:open-reflections:v1).
    #[rust]
    open_reflections: BTreeMap<String, bool>,
    #[rust]
    last_reflection_revision: u64,
    /// 学习记录 drawer: open flag, search text and (pack, version, row button).
    /// Web pausedLessonSource: the learner paused the lesson (pause button
    /// or a writing tool); play / next Beat / restart claim it back.
    #[rust]
    lesson_released: bool,
    #[rust]
    history_open: bool,
    /// Octos server client (solo login, ui-protocol socket, files).
    #[rust]
    server: Server,
    /// A live (server-backed) learning board: 新建空白白板 and its questions.
    #[rust]
    live: Option<Live>,
    /// Setup page (web SetupWhiteboard): check pending login, profile, form.
    /// Voice questions (web 启用语音): capture, VAD state, default input.
    #[rust]
    voice: Voice,
    /// Camera frames for questions (web 启用摄像头).
    #[rust]
    camera: Camera,
    #[rust]
    camera_textures: Option<(Texture, Texture)>,
    /// Camera framing dialog (web CameraSettingsDialog) and its preview.
    #[rust]
    camera_dialog_open: bool,
    #[rust]
    camera_dialog_texture: Option<Texture>,
    #[rust]
    camera_dialog_poll: u32,
    /// Ink selection questions (web selection toolbar + 问小章鱼 panel).
    #[rust]
    selection: Option<ink_question::SelectionState>,
    #[rust]
    selection_poll: u32,
    #[rust]
    selection_buttons: Vec<(WidgetRef, SelectionAction)>,
    /// The learning session of a course board before it has questions
    /// (classification needs one; the classroom reuses it).
    #[rust]
    course_session: String,
    #[rust]
    opened_sessions: Vec<String>,
    /// learning.selection.enhance arguments waiting for their image upload.
    #[rust]
    enhance_pending: Vec<(String, serde_json::Value)>,
    /// Settings page (web /settings).
    #[rust]
    settings: SettingsState,
    /// Show the setup whiteboard even after it was skipped (新手设置白板).
    #[rust]
    setup_force: bool,
    /// OCTOS_PERF=1 main-thread profiling.
    #[rust]
    perf: Perf,
    #[rust]
    android_viewport: Option<Vec2d>,
    #[rust]
    android_geometry_logged: bool,
    /// Web useTeacherSkin (saved in the data directory).
    #[rust]
    teacher_skin: String,
    #[rust]
    audio_inputs: Vec<AudioDeviceId>,
    /// A voice turn between utterance and transcript (turn id).
    #[rust]
    voice_turn: Option<String>,
    #[rust]
    setup_check: bool,
    #[rust]
    setup_profile: Option<serde_json::Value>,
    #[rust]
    setup_volc_open: bool,
    /// Which setup action a save/test belongs to: "model" | "volc".
    #[rust]
    setup_saving: Option<String>,
    #[rust]
    history_query: String,
    #[rust]
    history_focus_pending: bool,
    #[rust]
    history_items: Vec<(String, String, WidgetRef)>,
    /// Current handwriting tool (web ink toolbar mode).
    #[rust]
    ink_tool: InkTool,
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
/// Course outline panel actions (web OllCourseOutline buttons).
#[derive(Clone, Debug, PartialEq)]
enum OutlineAction {
    ViewStep(String),
    PlayStep(String),
    Toggle(String),
    ViewBeat(String),
    PlayBeat(String),
}

const ICON_MORE: &str = include_str!("../assets/icons/more-horizontal.svg");
const ICON_TRASH: &str = include_str!("../assets/icons/trash-2.svg");
const ICON_CHEVRON_DOWN: &str = include_str!("../assets/icons/chevron-down.svg");
const ICON_CHEVRON_RIGHT: &str = include_str!("../assets/icons/chevron-right.svg");
/// Web LESSON_COMPLETION_SPEECH.
const LESSON_COMPLETION_SPEECH: &str = "这节课讲完了，你可以缩放白板回顾刚才的内容。";
const ICON_PLAY: &str = include_str!("../assets/icons/play.svg");
const ICON_CLOCK: &str = include_str!("../assets/icons/clock-3.svg");
const ICON_EYE: &str = include_str!("../assets/icons/eye.svg");
const ICON_ARROW_RIGHT: &str = include_str!("../assets/icons/arrow-right.svg");
const ICON_PAUSE: &str = include_str!("../assets/icons/pause.svg");
const ICON_MIC: &str = include_str!("../assets/icons/mic.svg");
/// One selection question answered beside the ink (web
/// SelectionEnhancementLayer item).
#[derive(Clone, Debug)]
struct SelCard {
    turn: String,
    question: String,
    /// pending | answered | failed
    status: String,
    error: Option<String>,
    source: (f64, f64, f64, f64),
    artifact: Option<serde_json::Value>,
    pos: Option<(f64, f64)>,
    minimized: bool,
}
impl SelCard {
    fn to_json(&self) -> serde_json::Value {
        json!({"turn": self.turn, "question": self.question, "status": self.status, "error": self.error,
            "source": [self.source.0, self.source.1, self.source.2, self.source.3], "artifact": self.artifact,
            "pos": self.pos.map(|(x, y)| json!([x, y])), "minimized": self.minimized})
    }
    fn from_json(v: &serde_json::Value) -> Option<Self> {
        let n = |v: &serde_json::Value, i: usize| v[i].as_f64().unwrap_or(0.);
        Some(Self {
            turn: v["turn"].as_str()?.to_owned(),
            question: v["question"].as_str().unwrap_or("").to_owned(),
            // An answer in flight when the app closed cannot resume.
            status: match v["status"].as_str() { Some("answered") => "answered", _ => "failed" }.to_owned(),
            error: v["error"].as_str().map(str::to_owned).or_else(|| (v["status"] == "pending").then(|| "回答没有完成，请重新提问".to_owned())),
            source: (n(&v["source"], 0), n(&v["source"], 1), n(&v["source"], 2), n(&v["source"], 3)),
            artifact: v["artifact"].is_object().then(|| v["artifact"].clone()),
            pos: v["pos"].is_array().then(|| (n(&v["pos"], 0), n(&v["pos"], 1))),
            minimized: v["minimized"].as_bool().unwrap_or(false),
        })
    }
}

/// Dynamic buttons of the selection toolbar and panel.
#[derive(Clone, Debug)]
enum SelectionAction {
    Tool(&'static str),
    Target(Option<String>),
    Kind(&'static str),
}

/// Web sendImage prompt.
const IMAGE_PROMPT: &str = "请看我上传的题目，把题目和关键步骤整理到白板上。";
const ICON_MIC_OFF: &str = include_str!("../assets/icons/mic-off.svg");
const ICON_CAMERA: &str = include_str!("../assets/icons/camera.svg");
const ICON_CAMERA_OFF: &str = include_str!("../assets/icons/camera-off.svg");
const ICON_VOLUME_ON: &str = include_str!("../assets/icons/volume-2.svg");
const ICON_VOLUME_OFF: &str = include_str!("../assets/icons/volume-x.svg");

fn load_icons(ui: &WidgetRef, cx: &mut Cx) {
    let icons: [(LiveId, &str); 23] = [
        (live_id!(start_interaction), ICON_PLAY),
        (live_id!(next_beat), include_str!("../assets/icons/chevron-right.svg")),
        (live_id!(replay_topic), include_str!("../assets/icons/rotate-ccw.svg")),
        (live_id!(voice), include_str!("../assets/icons/mic-off.svg")),
        (live_id!(camera), include_str!("../assets/icons/camera-off.svg")),
        (live_id!(sel_ask), include_str!("../assets/icons/message-circle.svg")),
        (live_id!(camera_frame_settings), include_str!("../assets/icons/settings-2.svg")),
        (live_id!(camera_dialog_close), include_str!("../assets/icons/x.svg")),
        (live_id!(camera_dialog_left), include_str!("../assets/icons/rotate-ccw.svg")),
        (live_id!(camera_dialog_right), include_str!("../assets/icons/rotate-cw.svg")),
        (live_id!(camera_dialog_mirror), include_str!("../assets/icons/flip-horizontal-2.svg")),
        (live_id!(camera_dialog_reset), include_str!("../assets/icons/rotate-ccw.svg")),
        (live_id!(launcher_settings), include_str!("../assets/icons/settings.svg")),
        (live_id!(settings_back), include_str!("../assets/icons/arrow-left.svg")),
        (live_id!(settings_gear), include_str!("../assets/icons/settings.svg")),
        (live_id!(back), include_str!("../assets/icons/house.svg")),
        (live_id!(settings), include_str!("../assets/icons/menu.svg")),
        (live_id!(history_close), include_str!("../assets/icons/x.svg")),
        (live_id!(history_new), include_str!("../assets/icons/plus.svg")),
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
    for (id, icon, color) in [
        (live_id!(menu_restart_icon), include_str!("../assets/icons/rotate-ccw.svg"), "#426568"),
        (live_id!(history_search_icon), include_str!("../assets/icons/search.svg"), "#657c7c"),
        (live_id!(setup_platform_chevron), include_str!("../assets/icons/chevron-down.svg"), "#69706a"),
        (live_id!(menu_delete_icon), ICON_TRASH, "#a84836"),
    ] {
        if let Some(mut svg) = ui.widget(cx, &[id]).borrow_mut::<Svg>() {
            svg.draw_svg.load_from_str(&tinted(icon, color));
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
    fn save_progress(&mut self, cx: &mut Cx) {
        // Web: a pack preview is ephemeral and never enters the session index.
        if self.live.is_some() {
            self.save_live(cx);
            return;
        }
        if self.course_preview {
            return;
        }
        if let Some(player) = &self.player {
            match player.checkpoint() {
                Ok(mut value) => {
                    if !self.course_preview {
                        if let Some(b) = self.ui.widget(cx, ids!(spatial)).borrow::<spatial_board::SpatialBoard>() {
                            value["native_ink"] = b.ink_snapshot();
                        }
                    }
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
                progress_store::Reply::Deleted(_) => {
                    // The card falls back to 开始互动.
                    self.rebuild_launcher(cx);
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
                            Ok(mut player) => {
                                // Pack narration clip timing and the voice toggle carry over.
                                if let Some(old) = &self.player {
                                    player.narration_durations = old.narration_durations.clone();
                                    player.narration_enabled = old.narration_enabled;
                                }
                                let w = self.ui.widget(cx, ids!(spatial));
                                if let Some(mut b) = w.borrow_mut::<spatial_board::SpatialBoard>()
                                {
                                    b.clear(cx);
                                    if saved["native_ink"].is_object() {
                                        b.restore_ink(cx, &saved["native_ink"]);
                                    }
                                }
                                self.player = Some(player);
                                self.error.clear();
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
    /// Web LearningHistory: course learning records saved on this device,
    /// newest first, filtered by the search text.
    fn set_history_open(&mut self, cx: &mut Cx, open: bool) {
        self.history_open = open;
        self.ui.widget(cx, ids!(history_drawer)).set_visible(cx, open);
        if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            b.set_input_blocked(open || self.enlarged.is_some());
        }
        if open {
            self.history_query.clear();
            self.ui.text_input(cx, ids!(history_search)).set_text(cx, "");
            self.rebuild_history(cx);
            // Web focuses the search box; it has no area until drawn.
            self.history_focus_pending = true;
        }
        self.ui.redraw(cx);
    }
    fn rebuild_history(&mut self, cx: &mut Cx) {
        let catalog = course_pack::catalog(&course_pack::pack_root()).unwrap_or_default();
        let mut records: Vec<(String, String, String, std::time::SystemTime)> = self
            .store
            .as_ref()
            .and_then(|s| std::fs::read_dir(s.dir()).ok())
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                let (pack, version) = name.strip_suffix(".json")?.rsplit_once('@')?;
                let title = catalog
                    .iter()
                    .find(|p| p["packId"] == pack)
                    .and_then(|p| p["title"].as_str())
                    .unwrap_or(pack)
                    .to_owned();
                let modified = entry.metadata().and_then(|m| m.modified()).ok()?;
                Some((pack.to_owned(), version.to_owned(), title, modified))
            })
            .collect();
        // Live boards (web source-less sessions: 自由白板), id "live:<session>".
        if let Some(dir) = self.live_dir() {
            for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
                let Some(id) = entry.file_name().to_string_lossy().strip_suffix(".json").map(str::to_owned) else { continue };
                let Some(record) = std::fs::read(entry.path()).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()) else { continue };
                let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else { continue };
                // Course classrooms reopen with their course.
                if record["course"].is_array() {
                    continue;
                }
                let title = record["title"].as_str().unwrap_or("学习白板").to_owned();
                records.push((format!("live:{id}"), String::new(), title, modified));
            }
        }
        records.sort_by(|a, b| b.3.cmp(&a.3));
        let query = self.history_query.trim().to_lowercase();
        let current = match &self.live {
            Some(l) => Some((format!("live:{}", l.session_id), String::new())),
            None => (self.learning_visible && self.player.is_some()).then(|| (self.pack_id.clone(), self.pack_version.clone())),
        };
        self.history_items.clear();
        let mut rows = Vec::new();
        for (pack, version, title, modified) in records.into_iter().filter(|r| r.2.to_lowercase().contains(&query)) {
            let is_current = current.as_ref().is_some_and(|(p, v)| *p == pack && *v == version);
            let kind = if pack.starts_with("live:") { "自由白板" } else { "课程学习" };
            let meta = format!("{} · {kind}{}", zh_month_day_time(modified), if is_current { " · 当前" } else { "" });
            let bg = if is_current { "#edf4ef" } else { "#0000" };
            let code = format!(
                "View{{width:Fill height:Fit flow:Down
                    row := RoundedView{{width:Fill height:Fit flow:Down spacing:8 padding:Inset{{left:12 right:12 top:15 bottom:15}}
                        draw_bg +: {{color:{bg} border_radius:4}}
                        Label{{width:Fill padding:0 text:\"{}\" draw_text.wrap:Words draw_text.text_style: theme.font_bold{{font_size:10.5}} draw_text.color:#243b40}}
                        Label{{width:Fill padding:0 text:\"{}\" draw_text.text_style.font_size:9 draw_text.color:#69817d}}
                    }}
                    View{{width:Fill height:1 show_bg:true draw_bg.color:#e6ebe5}}
                }}",
                script_text(&title),
                script_text(&meta)
            );
            if let Ok(row) = board_view::widget(cx, &code) {
                self.history_items.push((pack, version, row.widget(cx, ids!(row))));
                rows.push(row);
            }
        }
        if rows.is_empty() {
            let text = if query.is_empty() { "还没有保存的学习记录" } else { "没有找到匹配的学习记录" };
            if let Ok(empty) = board_view::widget(cx, &format!(
                "Label{{width:Fill padding:Inset{{top:8}} text:\"{text}\" draw_text.text_style.font_size:9.75 draw_text.color:#657c7c}}"
            )) {
                rows.push(empty);
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(history_list)), rows);
    }
    fn open_reflections_path(&self) -> Option<std::path::PathBuf> {
        self.store.as_ref().map(|s| s.dir().join("open-reflections.json"))
    }
    /// Record the current course's open reflections (per-device convenience,
    /// like the web: a failed write is ignored).
    fn save_open_reflections(&mut self, open: &BTreeSet<String>) {
        let prefix = format!("{}:", self.pack_id);
        self.open_reflections.retain(|k, _| !k.starts_with(&prefix));
        self.open_reflections.extend(open.iter().map(|id| (format!("{prefix}{id}"), true)));
        if let (Some(path), Ok(bytes)) = (self.open_reflections_path(), serde_json::to_vec(&self.open_reflections)) {
            let _ = std::fs::create_dir_all(path.parent().unwrap()).and_then(|_| std::fs::write(path, bytes));
        }
    }
    fn open_course(&mut self, cx: &mut Cx, pack_id: &str, version: &str, autoplay: bool) {
        self.error.clear();
        self.selection = None;
        self.course_session.clear();
        self.rebuild_selection_ui(cx);
        self.drawing = false;
        self.lesson_released = false;
        self.narration_muted = false;
        if self.live.take().is_some() {
            if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
                board.set_host_cards(cx, Vec::new());
            }
        }
        self.ui.widget(cx, ids!(outline_trigger)).set_visible(cx, true);
        self.sync_live(cx);
        self.stop_narration_audio(cx);
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
                let prefix = format!("{pack_id}:");
                let open = self
                    .open_reflections
                    .iter()
                    .filter(|(_, open)| **open)
                    .filter_map(|(k, _)| k.strip_prefix(&prefix).map(str::to_owned))
                    .collect();
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.clear(cx);
                    board.set_open_reflections(cx, open);
                    self.last_reflection_revision = board.open_reflections().1;
                };
                self.pack_id = pack_id.into();
                self.pack_version = version.into();
                self.course_source = source;
                let clips = course_pack::narration(&root, pack_id, version);
                self.narration_audio = clips.iter().map(|(b, p, _)| (b.clone(), p.clone())).collect();
                let mut session = session;
                session.narration_durations = clips.into_iter().map(|(b, _, ms)| (b, ms)).collect();
                self.player = Some(session);
                // The launcher's 预览 opens a preview; 开始 opens interactive learning.
                self.course_preview = !autoplay;
                self.apply_course_mode(cx);
                self.show_learning(cx, true);
                self.note(cx, "");
                self.autoplay_pending = autoplay;
                let mut skip_restore = std::mem::take(&mut self.skip_restore) || self.course_preview;
                // A course that received questions resumes as its classroom.
                if !skip_restore && self.restore_course_classroom(cx) {
                    skip_restore = true;
                    self.note(cx, "已恢复进度和提问");
                }
                if let Some(store) = self.store.as_ref().filter(|_| !skip_restore) {
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
    /// Web learning-workspace chrome for preview vs interactive learning.
    /// Web /board?new-board=1: an empty learning whiteboard where questions
    /// become generated lessons (needs a reachable Octos server).
    fn open_live_board(&mut self, cx: &mut Cx) {
        self.save_progress(cx);
        self.selection = None;
        self.course_session.clear();
        self.rebuild_selection_ui(cx);
        self.stop_narration_audio(cx);
        self.error.clear();
        self.drawing = false;
        self.player = None;
        self.pack_id.clear();
        self.pack_version.clear();
        self.course_preview = false;
        self.lesson_released = false;
        self.narration_audio.clear();
        self.live = Some(Live::new());
        if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            board.clear(cx);
            board.set_host_cards(cx, Vec::new());
        }
        self.ui.label(cx, ids!(course_title)).set_text(cx, "新的学习白板");
        self.apply_course_mode(cx);
        self.show_learning(cx, true);
        self.server.ensure_login(cx);
        self.setup_check = true;
        if self.server.logged_in() {
            self.check_setup(cx);
        }
        self.sync_live(cx);
    }
    fn setup_skip_path(&self) -> Option<std::path::PathBuf> {
        let profile = self.server.profile_id.clone()?;
        self.store.as_ref().map(|s| s.dir().join(format!("setup-skipped-{profile}")))
    }
    /// Web LearningSetupGate: until the learner enters once, a live board
    /// opens on the setup page.
    fn check_setup(&mut self, cx: &mut Cx) {
        if !std::mem::take(&mut self.setup_check) {
            return;
        }
        if !std::mem::take(&mut self.setup_force) && self.setup_skip_path().is_some_and(|p| p.exists()) {
            return;
        }
        self.ui.widget(cx, ids!(setup_page)).set_visible(cx, true);
        self.ui.label(cx, ids!(setup_model_status)).set_text(cx, "正在读取你的设置…");
        self.server.get_profile(cx);
        self.ui.redraw(cx);
    }
    /// Web hasLearningModel: a lesson-capable family, a model and its key.
    fn profile_has_model(profile: &serde_json::Value) -> bool {
        let primary = &profile["config"]["llm"]["primary"];
        let family = primary["family_id"].as_str().unwrap_or("").to_lowercase();
        let env = primary["route"]["api_key_env"].as_str().filter(|s| !s.is_empty()).unwrap_or("GEMINI_API_KEY");
        matches!(family.as_str(), "google" | "gemini")
            && primary["model_id"].as_str().is_some_and(|m| !m.trim().is_empty())
            && profile["config"]["env_vars"][env].as_str().is_some_and(|k| !k.trim().is_empty())
    }
    fn apply_setup_profile(&mut self, cx: &mut Cx, profile: serde_json::Value) {
        let model = profile["config"]["llm"]["primary"]["model_id"].as_str().filter(|m| !m.is_empty()).unwrap_or("gemini-3.6-flash").to_owned();
        let key_saved = profile["config"]["env_vars"]["GEMINI_API_KEY"].as_str().is_some_and(|k| !k.is_empty());
        let input = self.ui.text_input(cx, ids!(setup_model));
        if input.text().is_empty() {
            input.set_text(cx, &model);
        }
        if let Some(mut key) = self.ui.widget(cx, ids!(setup_key)).borrow_mut::<TextInput>() {
            key.set_empty_text(cx, if key_saved { "已保存；留空继续使用".into() } else { "粘贴你的 API Key".into() });
        }
        let tts = &profile["config"]["tts_cloud"];
        if let Some(appid) = tts["appid"].as_str() {
            self.ui.text_input(cx, ids!(setup_volc_appid)).set_text(cx, appid);
        }
        if let Some(voice) = tts["voice"].as_str() {
            self.ui.text_input(cx, ids!(setup_volc_voice)).set_text(cx, voice);
        }
        self.ui.button(cx, ids!(setup_enter)).set_text(
            cx,
            if Self::profile_has_model(&profile) { "进入我的白板" } else { "先用白板，稍后设置 AI" },
        );
        self.setup_profile = Some(profile);
        self.ui.redraw(cx);
    }
    /// Web mergeProfileConfig + updateMyProfileConfig.
    fn save_setup_profile(&mut self, cx: &mut Cx, patch: serde_json::Value) {
        let Some(profile) = self.setup_profile.as_ref() else { return };
        let mut config = profile["config"].clone();
        if let (Some(c), Some(p)) = (config.as_object_mut(), patch.as_object()) {
            for (k, v) in p {
                c.insert(k.clone(), v.clone());
            }
        }
        self.server.save_profile(cx, json!({"config": config}));
    }
    fn setup_actions(&mut self, cx: &mut Cx, actions: &Actions) {
        if !self.ui.widget(cx, ids!(setup_page)).visible() {
            return;
        }
        if self.ui.button(cx, ids!(setup_save)).clicked(actions) && self.setup_saving.is_none() {
            let model = self.ui.text_input(cx, ids!(setup_model)).text().trim().to_owned();
            if !model.is_empty() {
                let key = self.ui.text_input(cx, ids!(setup_key)).text().trim().to_owned();
                self.setup_saving = Some("model".into());
                self.ui.button(cx, ids!(setup_save)).set_text(cx, "正在测试并保存…");
                self.ui.label(cx, ids!(setup_model_status)).set_text(cx, "");
                let mut body = json!({
                    "provider": "google",
                    "model": model,
                    "api_key_env": "GEMINI_API_KEY",
                    "profile_id": self.server.profile_id,
                });
                if !key.is_empty() {
                    body["api_key"] = json!(key);
                }
                self.server.test_provider(cx, body);
            }
        }
        if self.ui.button(cx, ids!(setup_listen)).clicked(actions) {
            self.ui.label(cx, ids!(setup_tts_status)).set_text(cx, "正在准备语音…");
            self.server.synthesize(cx, "你好，我是你白板旁的学习伙伴。我们可以一起看图、推导和解决问题。", "preview");
        }
        if self.ui.button(cx, ids!(setup_volc_toggle)).clicked(actions) {
            self.setup_volc_open = !self.setup_volc_open;
            self.ui.widget(cx, ids!(setup_volc)).set_visible(cx, self.setup_volc_open);
            self.ui.button(cx, ids!(setup_volc_toggle)).set_text(
                cx,
                if self.setup_volc_open { "▼ 使用自己的火山 TTS（可选）" } else { "▶ 使用自己的火山 TTS（可选）" },
            );
        }
        if self.ui.button(cx, ids!(setup_volc_save)).clicked(actions) && self.setup_saving.is_none() {
            let appid = self.ui.text_input(cx, ids!(setup_volc_appid)).text().trim().to_owned();
            let token = self.ui.text_input(cx, ids!(setup_volc_token)).text().trim().to_owned();
            let voice = self.ui.text_input(cx, ids!(setup_volc_voice)).text().trim().to_owned();
            let voice = if voice.is_empty() { "zh_female_xiaohe_uranus_bigtts".to_owned() } else { voice };
            let has_token = self.setup_profile.as_ref().is_some_and(|p| p["config"]["env_vars"]["VOLC_TTS_TOKEN"].as_str().is_some_and(|t| !t.is_empty()));
            if appid.is_empty() || (token.is_empty() && !has_token) {
                self.ui.label(cx, ids!(setup_tts_status)).set_text(cx, "请填写 App ID 和 Access Token。");
            } else {
                self.setup_saving = Some("volc".into());
                let mut patch = json!({"tts_provider": "cloud", "tts_cloud": {"appid": appid, "voice": voice}});
                if !token.is_empty() {
                    let mut env = self.setup_profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or(json!({}));
                    env["VOLC_TTS_TOKEN"] = json!(token);
                    patch["env_vars"] = env;
                }
                self.save_setup_profile(cx, patch);
            }
        }
        if self.ui.button(cx, ids!(setup_full_settings)).clicked(actions) {
            self.open_settings(cx, settings::Tab::Profile);
        }
        if self.ui.button(cx, ids!(setup_full_model)).clicked(actions) {
            self.open_settings(cx, settings::Tab::Llm);
        }
        if self.ui.button(cx, ids!(setup_voice_settings)).clicked(actions) {
            self.open_settings(cx, settings::Tab::Voice);
        }
        if self.ui.button(cx, ids!(setup_enter)).clicked(actions) {
            if let Some(path) = self.setup_skip_path() {
                let _ = std::fs::create_dir_all(path.parent().unwrap()).and_then(|_| std::fs::write(path, "yes"));
            }
            self.ui.widget(cx, ids!(setup_page)).set_visible(cx, false);
            self.ui.redraw(cx);
        }
    }
    fn live_tts_dir(&self) -> Option<std::path::PathBuf> {
        let live = self.live.as_ref()?;
        self.store.as_ref().map(|s| s.dir().join("tts").join(&live.session_id))
    }
    /// Web useOllNarrationTts for generated lessons: every narrated Beat is
    /// synthesized with the profile's TTS (/api/voice/synthesize), cached on
    /// this device and played as the Beat's narration clip. Without a
    /// working TTS route the lesson keeps its text-timed, silent narration.
    fn start_live_tts(&mut self, cx: &mut Cx) {
        let Some(player) = self.player.as_ref() else { return };
        let beats: Vec<(String, String)> = player
            .operations
            .iter()
            .filter(|op| op["type"] == "narration.begin")
            .filter_map(|op| Some((op["beat_id"].as_str()?.to_owned(), op["narration"]["text"].as_str()?.to_owned())))
            .filter(|(_, text)| !text.trim().is_empty())
            .collect();
        let dir = self.live_tts_dir();
        // Course classrooms keep the pack's own narration; only answers
        // (beats of `learn-<session>-…` lessons) are synthesized.
        let answer_prefix = self.live.as_ref().filter(|l| l.base.is_some()).map(|l| format!("learn-{}-", l.session_id));
        let mut queue = Vec::new();
        for (beat, text) in beats {
            if self.narration_audio.contains_key(&beat) || answer_prefix.as_ref().is_some_and(|p| !beat.starts_with(p.as_str())) {
                continue;
            }
            let cached = dir.as_ref().map(|d| d.join(format!("{}.audio", tts_file_key(&beat))));
            match cached.filter(|p| p.exists()) {
                Some(path) => self.register_narration_clip(&beat, path),
                None => queue.push((beat, text)),
            }
        }
        if let Some(live) = self.live.as_mut() {
            live.tts_queue = queue;
            live.tts_inflight = None;
        }
        self.next_live_tts(cx);
    }
    fn next_live_tts(&mut self, cx: &mut Cx) {
        let Some(live) = self.live.as_mut() else { return };
        if live.tts_inflight.is_some() || live.tts_queue.is_empty() || self.narration_muted {
            return;
        }
        let (beat, text) = live.tts_queue.remove(0);
        live.tts_inflight = Some(beat.clone());
        self.server.synthesize(cx, &text, &format!("narration:{beat}"));
    }
    fn register_narration_clip(&mut self, beat: &str, path: std::path::PathBuf) {
        if let Some(ms) = std::fs::read(&path).ok().and_then(|b| wav_duration_ms(&b)) {
            if let Some(p) = self.player.as_mut() {
                p.narration_durations.insert(beat.to_owned(), ms);
            }
        }
        self.narration_audio.insert(beat.to_owned(), path);
    }
    /// Play synthesized speech bytes (setup preview / narration).
    fn play_speech(&mut self, cx: &mut Cx, audio: &[u8], tag: &str) -> Result<(), String> {
        let dir = self.store.as_ref().map(|s| s.dir().join("tts")).ok_or("没有本机存储目录")?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{tag}.audio"));
        std::fs::write(&path, audio).map_err(|e| e.to_string())?;
        if let Some(id) = self.speech_audio.take() {
            self.audio_players.stop(cx, id);
        }
        let id = LiveId::from_str(&format!("speech:{tag}:{}", server::uuid()));
        self.audio_players.prepare(cx, id, &path.to_string_lossy(), None)?;
        self.speech_audio = Some(id);
        Ok(())
    }
    /// Ask from the input dock (web StudentInputDock submit).
    fn submit_question(&mut self, cx: &mut Cx) {
        let input = self.ui.text_input(cx, ids!(ask_input));
        let text = input.text().trim().to_owned();
        if text.is_empty() {
            return;
        }
        if self.selection.is_some() {
            // Web sendText with an active ink selection: the typed question
            // becomes a lesson generated from that selection.
            input.set_text(cx, "");
            let targets = self.selection.as_ref().map(|s| s.chosen_targets()).unwrap_or_default();
            let text = oll_runtime::selection::format_lesson_request(&text, &targets, None);
            self.ask_selection_lesson(cx, text);
            return;
        }
        if !self.ensure_classroom(cx) {
            return;
        }
        let Some(live) = self.live.as_mut() else { return };
        if live.pending() {
            self.toast(cx, "上一个问题还在准备中");
            return;
        }
        input.set_text(cx, "");
        let turn_id = server::uuid();
        live.questions.push((turn_id.clone(), text.clone(), "pending".into()));
        if self.server.logged_in() {
            self.dispatch_question(cx, turn_id, text, "text");
        } else {
            live.queued = Some((turn_id, text));
            self.server.ensure_login(cx);
        }
        self.sync_live(cx);
        self.save_live(cx);
    }
    /// Questions need a classroom: a live board already is one; an
    /// interactive course board becomes one whose first lesson is the pack
    /// (web activeOllEvents = compose([packagedOllEvents, ...answers])).
    fn ensure_classroom(&mut self, cx: &mut Cx) -> bool {
        if self.live.is_some() {
            return true;
        }
        if self.player.is_none() || self.pack_id.is_empty() || self.course_preview {
            self.toast(cx, "请先打开一门课程或新建空白白板");
            return false;
        }
        let mut live = Live::new();
        if !self.course_session.is_empty() {
            live.session_id = self.course_session.clone();
            live.opened = self.opened_sessions.contains(&live.session_id);
        }
        live.base = Some(self.course_source.clone());
        live.course = Some((self.pack_id.clone(), self.pack_version.clone()));
        live.titled = true;
        self.live = Some(live);
        self.server.ensure_login(cx);
        true
    }
    /// The board's learning session (web workspace sessionId): the
    /// classroom's, or a course board's before it has questions.
    fn board_session_id(&mut self) -> String {
        if let Some(l) = &self.live {
            return l.session_id.clone();
        }
        if self.course_session.is_empty() {
            self.course_session = Live::new().session_id;
        }
        self.course_session.clone()
    }
    fn ensure_session_open(&mut self, cx: &mut Cx, session_id: &str) {
        if let Some(l) = self.live.as_mut().filter(|l| l.session_id == session_id) {
            if l.opened {
                return;
            }
            l.opened = true;
        } else if self.opened_sessions.iter().any(|s| s == session_id) {
            return;
        }
        self.opened_sessions.push(session_id.to_owned());
        let profile = self.server.profile_id.clone().unwrap_or_default();
        self.server.call(cx, "session/open", json!({"session_id": session_id, "profile_id": profile}), server::Call::Fire);
    }
    /// Web selection toolbar state follows the ink selection: a new
    /// selection is rendered, its board targets found and classified.
    fn sync_selection(&mut self, cx: &mut Cx) {
        let current = self.ui.widget(cx, ids!(spatial)).borrow::<spatial_board::SpatialBoard>().and_then(|b| b.ink_selection().map(|s| (s, b.node_rects())));
        let Some((sel, rects)) = current.filter(|_| !self.course_preview) else {
            if self.selection.take().is_some() {
                self.rebuild_selection_ui(cx);
            }
            return;
        };
        let key = ink_question::SelectionState::key_of(&sel);
        if self.selection.as_ref().is_some_and(|s| s.key == key) {
            return;
        }
        let nodes = self.player.as_ref().map(|p| p.board.nodes.clone()).unwrap_or_default();
        let candidates = oll_runtime::selection::node_candidates(&nodes, &rects, sel.bounds);
        let panel_open = self.selection.as_ref().is_some_and(|s| s.panel_open);
        self.selection = Some(ink_question::SelectionState {
            key,
            source_id: format!("ink-source:{}", server::uuid()),
            png: ink_question::render_png(&sel),
            selection: sel,
            media: None,
            candidates,
            chosen: None,
            class_status: "loading",
            classification: None,
            content_kind: "unknown".into(),
            panel_open,
            pending: false,
        });
        self.start_classification(cx);
        self.rebuild_selection_ui(cx);
    }
    /// Web classifyInkSelection: upload the selection image, then
    /// `learning.selection.classify` (answered synchronously).
    fn start_classification(&mut self, cx: &mut Cx) {
        let Some(state) = self.selection.as_ref() else { return };
        if state.media.is_some() || state.class_status != "loading" {
            return;
        }
        if !self.server.logged_in() {
            self.server.ensure_login(cx);
            return;
        }
        let Some(png) = state.png.clone() else { return };
        let purpose = format!("selclass:{}", state.key);
        let name = format!("{}.png", state.source_id.replace(':', "-"));
        self.server.upload(cx, &name, "image/png", &png, Some("upload"), &purpose);
    }
    fn selection_source(&self) -> Option<serde_json::Value> {
        let s = self.selection.as_ref()?;
        Some(oll_runtime::selection::source_argument(
            &s.source_id,
            &format!("student-ink:{}", self.live.as_ref().map_or(self.course_session.as_str(), |l| l.session_id.as_str())),
            0,
            s.selection.bounds,
            &ink_question::strokes_value(&s.selection),
        ))
    }
    fn classify_selection(&mut self, cx: &mut Cx, key: &str, path: String) {
        let session_id = self.board_session_id();
        let Some(state) = self.selection.as_mut().filter(|s| s.key == key) else { return };
        state.media = Some(path.clone());
        let board = oll_runtime::selection::board_argument(
            &format!("learning-board-{session_id}"),
            self.player.as_ref().map_or(0, |p| p.board.cursor as u64),
            &state.candidates.clone(),
        );
        let Some(source) = self.selection_source() else { return };
        self.ensure_session_open(cx, &session_id);
        self.server.call(
            cx,
            "skill/action/invoke",
            json!({
                "session_id": session_id,
                "action_id": "learning.selection.classify",
                "arguments": {"paths": [path], "turn_id": server::uuid(), "source": source, "board": board},
            }),
            server::Call::Metadata { purpose: format!("selclass:{key}") },
        );
    }
    fn selection_chip(cx: &mut Cx, label: &str, active: bool, strong: bool) -> Option<WidgetRef> {
        let (bg, tint, border) = if active { ("#e3eeec", "#0c7085", "#87bcb4") } else if strong { ("#e3eeec", "#0c7085", "#0000") } else { ("#ffffff", "#253735", "#x2768622e") };
        let label = label.replace(['"', '\\', '\n'], " ");
        board_view::widget(
            cx,
            &format!(
                "Button{{height:34 text:\"{label}\" padding:Inset{{left:10 right:10}} margin:0
                    draw_bg +: {{color:{bg} color_hover:#e3eeec color_down:#d5e6eb border_radius:5 border_size:0.5 border_color:{border}}}
                    draw_text.color:{tint} draw_text.text_style.font_size:7.5}}"
            ),
        )
        .ok()
    }
    /// Toolbar actions and the 问小章鱼 panel from the selection state.
    fn rebuild_selection_ui(&mut self, cx: &mut Cx) {
        self.selection_buttons.clear();
        let Some(state) = self.selection.as_ref() else {
            self.ui.widget(cx, ids!(sel_actions)).set_visible(cx, false);
            self.ui.widget(cx, ids!(sel_panel)).set_visible(cx, false);
            self.ui.redraw(cx);
            return;
        };
        self.ui.widget(cx, ids!(sel_actions)).set_visible(cx, true);
        self.ui.label(cx, ids!(sel_status)).set_text(cx, if state.class_status == "loading" { "正在识别选区…" } else { "" });
        let mut tools = Vec::new();
        for tool in state.quick_tools() {
            if let Some(w) = Self::selection_chip(cx, tool.label, false, true) {
                tools.push(w.clone());
                self.selection_buttons.push((w, SelectionAction::Tool(tool.id)));
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(sel_tools)), tools);
        let state = self.selection.as_ref().unwrap();
        self.ui.widget(cx, ids!(sel_panel)).set_visible(cx, state.panel_open);
        self.ui.label(cx, ids!(sel_panel_note)).set_text(
            cx,
            &format!("将发送 {} 项选中笔迹，以及你在下面明确选择的局部白板内容；不会发送整块白板。", state.selection.strokes.len()),
        );
        // Board targets (web .learning-selection-targets).
        let mut targets = Vec::new();
        if state.candidates.is_empty() {
            if let Ok(w) = board_view::widget(cx, "Label{width:Fill padding:0 margin:Inset{bottom:6} text:\"当前框选没有覆盖课程对象，本次只参考你的原始笔迹。\" draw_text.wrap:Words draw_text.text_style.font_size:8.25 draw_text.color:#70807d}") {
                targets.push(w);
            }
        } else {
            if let Ok(w) = board_view::widget(cx, "Label{width:Fill padding:0 text:\"这段笔迹是在问哪部分白板内容？\" draw_text.text_style.font_size:8.25 draw_text.color:#253735}") {
                targets.push(w);
            }
            let mut options = vec![(None, "只看我的笔迹".to_owned())];
            options.extend(state.candidates.iter().map(|c| {
                (c["target_id"].as_str().map(str::to_owned), format!("{} · 整个内容块", c["label"].as_str().unwrap_or("白板内容")))
            }));
            let chosen = state.chosen.clone();
            for (id, label) in options {
                if let Some(w) = Self::selection_chip(cx, &label, id == chosen, false) {
                    targets.push(w.clone());
                    self.selection_buttons.push((w, SelectionAction::Target(id)));
                }
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(sel_targets)), targets);
        let state = self.selection.as_ref().unwrap();
        let mut kinds = Vec::new();
        let current_kind = state.content_kind.clone();
        for (id, label) in oll_runtime::selection::CONTENT_KINDS {
            if let Some(w) = Self::selection_chip(cx, label, id == current_kind, false) {
                kinds.push(w.clone());
                self.selection_buttons.push((w, SelectionAction::Kind(id)));
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(sel_kinds)), kinds);
        let state = self.selection.as_ref().unwrap();
        let kind_label = |k: &str| oll_runtime::selection::CONTENT_KINDS.iter().find(|(id, _)| *id == k).map_or("", |(_, l)| *l);
        let class_text = match (&state.classification, state.class_status) {
            (Some((kind, content, confidence)), _) => format!(
                "自动识别为：{}{}{}",
                kind_label(kind),
                if content.is_empty() { String::new() } else { format!("（{content}）") },
                if confidence == "low" { "；把握较低，请手动确认" } else { "" }
            ),
            (None, "error") => "没有可靠识别出内容，请手动选择类型。".into(),
            _ => String::new(),
        };
        self.ui.label(cx, ids!(sel_class_text)).set_text(cx, &class_text);
        self.ui.widget(cx, ids!(sel_class_text)).set_visible(cx, !class_text.is_empty());
        let mut suggestions = Vec::new();
        for tool in oll_runtime::selection::available_tools(&current_kind) {
            if let Some(w) = Self::selection_chip(cx, tool.label, false, false) {
                suggestions.push(w.clone());
                self.selection_buttons.push((w, SelectionAction::Tool(tool.id)));
            }
        }
        let _ = board_view::children(cx, &self.ui.widget(cx, ids!(sel_suggestions)), suggestions);
        self.ui.redraw(cx);
    }
    fn selection_action(&mut self, cx: &mut Cx, action: SelectionAction) {
        match action {
            SelectionAction::Tool(id) => {
                let Some(tool) = oll_runtime::selection::TOOLS.iter().find(|t| t.id == id) else { return };
                self.ask_selection(cx, tool.prompt, tool.id);
            }
            SelectionAction::Target(id) => {
                if let Some(s) = self.selection.as_mut() {
                    s.chosen = id;
                }
                self.rebuild_selection_ui(cx);
            }
            SelectionAction::Kind(id) => {
                if let Some(s) = self.selection.as_mut() {
                    s.content_kind = id.into();
                }
                self.rebuild_selection_ui(cx);
            }
        }
    }
    /// Web askSelection: 解释这部分 (and requests for a lesson) generate a
    /// lesson from the selection; other answers are selection cards.
    fn ask_selection(&mut self, cx: &mut Cx, question: &str, tool_id: &str) {
        let question = question.trim();
        let Some(state) = self.selection.as_ref() else { return };
        if question.is_empty() || state.pending {
            return;
        }
        if oll_runtime::selection::answer_presentation(tool_id, question, false) != "lesson" {
            // DIFF: no AI board writing natively, so answers are cards
            // (web without the board_writing capability).
            self.ask_selection_card(cx, question, tool_id);
            return;
        }
        let recognized = state.classification.as_ref().map(|c| c.1.clone());
        let text = oll_runtime::selection::format_lesson_request(question, &state.chosen_targets(), recognized.as_deref());
        if let Some(s) = self.selection.as_mut() {
            s.panel_open = false;
        }
        self.ui.text_input(cx, ids!(sel_input)).set_text(cx, "");
        self.ask_selection_lesson(cx, text);
        self.rebuild_selection_ui(cx);
    }
    /// Web sendSelectionQuestion card branch: `learning.selection.enhance`
    /// with the selection image; the answer artifact becomes a card next to
    /// the ink.
    fn ask_selection_card(&mut self, cx: &mut Cx, question: &str, tool_id: &str) {
        if !self.ensure_classroom(cx) {
            return;
        }
        let session_id = self.board_session_id();
        let Some(source) = self.selection_source() else { return };
        let Some(state) = self.selection.as_ref() else { return };
        let tool = oll_runtime::selection::TOOLS.iter().find(|t| t.id == tool_id);
        let content_hint = tool.and_then(|t| t.request_content_kind).map(str::to_owned).unwrap_or_else(|| state.content_kind.clone());
        let board = oll_runtime::selection::board_argument(
            &format!("learning-board-{session_id}"),
            self.player.as_ref().map_or(0, |p| p.board.cursor as u64),
            &state.chosen_targets(),
        );
        let turn = server::uuid();
        let mut args = json!({
            "turn_id": turn,
            "learner_request": question,
            "source": source,
            "content_hint": content_hint,
            "tool_id": tool_id,
            "delivery_mode": "card",
            "board": board,
        });
        if let Some((_, content, confidence)) = &state.classification {
            if !content.is_empty() {
                args["recognized_content"] = json!(content);
            }
            args["recognition_confidence"] = json!(confidence);
        }
        if let Some(p) = &self.player {
            if !p.board.title.is_empty() {
                args["lesson_title"] = json!(p.board.title);
                args["board_summary"] = json!(format!("{}；进度 {}/{}", p.board.title, p.cursor, p.operations.len()));
            }
        }
        let card = SelCard {
            turn: turn.clone(),
            question: question.to_owned(),
            status: "pending".into(),
            error: None,
            source: state.selection.bounds,
            artifact: None,
            pos: None,
            minimized: false,
        };
        let media = state.media.clone();
        let png = state.png.clone();
        if let Some(live) = self.live.as_mut() {
            live.selection_cards.push(card);
        }
        self.ui.text_input(cx, ids!(sel_input)).set_text(cx, "");
        if let Some(s) = self.selection.as_mut() {
            s.panel_open = false;
        }
        match (media, png) {
            (Some(path), _) if self.server.logged_in() => self.invoke_enhance(cx, &turn, args, path),
            (_, Some(png)) => {
                self.enhance_pending.push((turn.clone(), args));
                self.server.ensure_login(cx);
                self.server.upload(cx, "selection.png", "image/png", &png, Some("upload"), &format!("selenh:{turn}"));
            }
            _ => self.fail_selection_card(cx, &turn, "选区图片生成失败，请重新框选后再试"),
        }
        self.rebuild_selection_ui(cx);
        self.sync_live(cx);
        self.save_live(cx);
    }
    fn invoke_enhance(&mut self, cx: &mut Cx, turn: &str, mut args: serde_json::Value, path: String) {
        args["paths"] = json!([path]);
        let session_id = self.board_session_id();
        self.ensure_session_open(cx, &session_id);
        self.server.call(
            cx,
            "skill/action/invoke",
            json!({"session_id": session_id, "action_id": "learning.selection.enhance", "arguments": args}),
            server::Call::Result { purpose: format!("selenh:{turn}") },
        );
    }
    fn fail_selection_card(&mut self, cx: &mut Cx, turn: &str, message: &str) {
        if let Some(card) = self.live.as_mut().and_then(|l| l.selection_cards.iter_mut().find(|c| c.turn == turn)) {
            card.status = "failed".into();
            card.error = Some(message.to_owned());
        }
        self.sync_live(cx);
        self.save_live(cx);
    }
    /// Card glyph taps reported by the board (minimize / expand / delete).
    fn handle_selection_card_requests(&mut self, cx: &mut Cx) {
        let requests = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>().map(|mut b| b.take_selection_requests()).unwrap_or_default();
        if requests.is_empty() {
            return;
        }
        if let Some(live) = self.live.as_mut() {
            for (id, action) in requests {
                match action {
                    "delete" => live.selection_cards.retain(|c| c.turn != id),
                    _ => {
                        if let Some(c) = live.selection_cards.iter_mut().find(|c| c.turn == id) {
                            c.minimized = action == "minimize";
                        }
                    }
                }
            }
        }
        self.sync_live(cx);
        self.save_live(cx);
    }
    /// Web startDirectLessonGeneration with an ink_selection visual: the
    /// selection image goes along as `paths`.
    fn ask_selection_lesson(&mut self, cx: &mut Cx, text: String) {
        if !self.ensure_classroom(cx) {
            return;
        }
        let Some(live) = self.live.as_mut() else { return };
        if live.pending() {
            self.toast(cx, "上一个问题还在准备中");
            return;
        }
        let turn = server::uuid();
        live.questions.push((turn.clone(), text.clone(), "pending".into()));
        let media = self.selection.as_ref().and_then(|s| s.media.clone());
        match media {
            Some(path) if self.server.logged_in() => self.send_question(cx, turn, text, "text", Some(("ink_selection", path))),
            _ => match self.selection.as_ref().and_then(|s| s.png.clone()) {
                Some(png) => {
                    if let Some(l) = self.live.as_mut() {
                        l.uploading = Some((turn.clone(), text, "text".into()));
                    }
                    self.server.ensure_login(cx);
                    self.server.upload(cx, "selection.png", "image/png", &png, Some("upload"), &format!("selection:{turn}"));
                }
                None => self.fail_question(cx, &turn, "选区图片生成失败，请重新框选后再试"),
            },
        }
        self.sync_live(cx);
        self.save_live(cx);
    }
    /// The newest saved classroom of this course (questions asked on it).
    fn restore_course_classroom(&mut self, cx: &mut Cx) -> bool {
        let Some(dir) = self.live_dir() else { return false };
        let key = json!([self.pack_id, self.pack_version]);
        let newest = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let record = std::fs::read(e.path()).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())?;
                (record["course"] == key).then_some(())?;
                Some((e.metadata().and_then(|m| m.modified()).ok()?, record))
            })
            .max_by_key(|(t, _)| *t)
            .map(|(_, r)| r);
        let Some(record) = newest else { return false };
        let mut live = Live::new();
        live.session_id = record["session_id"].as_str().unwrap_or(&live.session_id).to_owned();
        live.titled = true;
        live.base = Some(self.course_source.clone());
        live.course = Some((self.pack_id.clone(), self.pack_version.clone()));
        live.questions = record["questions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|q| {
                let status = if q[2] == "pending" { "failed" } else { q[2].as_str()? };
                Some((q[0].as_str()?.to_owned(), q[1].as_str()?.to_owned(), status.to_owned()))
            })
            .collect();
        live.selection_cards = record["selection_cards"].as_array().into_iter().flatten().filter_map(SelCard::from_json).collect();
        live.lessons = record["lessons"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|l| Some((l["turn_id"].as_str().unwrap_or("").to_owned(), l["source"].as_str()?.to_owned())))
            .collect();
        let restored = live.classroom().and_then(|source| {
            let checkpoint = &record["checkpoint"];
            match checkpoint.is_object().then(|| Session::restore(&source, checkpoint).ok()).flatten() {
                Some(s) => Ok(s),
                None => Session::load_incremental(&source, true),
            }
        });
        match restored {
            Ok(mut session) => {
                if let Some(old) = &self.player {
                    session.narration_durations = old.narration_durations.clone();
                }
                if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
                    if record["checkpoint"]["native_ink"].is_object() {
                        b.restore_ink(cx, &record["checkpoint"]["native_ink"]);
                    }
                }
                self.player = Some(session);
                self.live = Some(live);
                self.start_live_tts(cx);
                self.sync_live(cx);
                true
            }
            Err(e) => {
                self.note(cx, &format!("无法恢复课程里的提问：{e}"));
                false
            }
        }
    }
    /// Web dock image button: choose a picture of a problem.
    fn pick_question_image(&mut self, cx: &mut Cx) {
        if !self.ensure_classroom(cx) {
            return;
        }
        if self.live.as_ref().is_some_and(|l| l.pending()) {
            self.toast(cx, "上一个问题还在准备中");
            return;
        }
        self.server.ensure_login(cx);
        // Automation hook: a fixed file instead of the system picker.
        if let Some(path) = std::env::var_os("OCTOS_IMAGE_TEST_FILE") {
            self.ask_image(cx, std::path::Path::new(&path));
            return;
        }
        let exts = ["png", "jpg", "jpeg", "gif", "webp", "heic"].iter().map(|e| e.to_string()).collect();
        cx.open_select_file_dialog(
            FileDialog::new().set_id(live_id!(ask_image_pick)).set_title("选择题目图片".into()).add_filter("图片".into(), exts),
        );
    }
    /// Web sendImage: upload the picture, then an agent turn with the fixed
    /// prompt and the picture as media; the lesson arrives as a persisted
    /// assistant file.
    fn ask_image(&mut self, cx: &mut Cx, path: &std::path::Path) {
        let Ok(bytes) = std::fs::read(path) else {
            self.toast(cx, "图片读取失败");
            return;
        };
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "image.png".into());
        let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "heic" => "image/heic",
            _ => "image/png",
        };
        let Some(live) = self.live.as_mut() else { return };
        let turn = server::uuid();
        live.questions.push((turn.clone(), IMAGE_PROMPT.into(), "pending".into()));
        self.server.upload(cx, &name, mime, &bytes, Some("upload"), &format!("image:{turn}"));
        self.sync_live(cx);
        self.save_live(cx);
    }
    fn send_image_turn(&mut self, cx: &mut Cx, turn_id: String, path: String) {
        let Some(live) = self.live.as_mut() else { return };
        let session_id = live.session_id.clone();
        let profile = self.server.profile_id.clone().unwrap_or_default();
        if !live.opened {
            live.opened = true;
            self.server.call(cx, "session/open", json!({"session_id": session_id, "profile_id": profile}), server::Call::Fire);
            // Web workspace mount: hydrate the (empty) transcript first.
            self.server.call(cx, "session/hydrate", json!({"session_id": session_id, "include": ["messages"]}), server::Call::Fire);
        }
        if !live.titled {
            live.titled = true;
            self.server.call(cx, "session/title.set", json!({"session_id": session_id, "title": IMAGE_PROMPT}), server::Call::Fire);
        }
        live.chat_turns.push(turn_id.clone());
        // Web buildTurnText: learning session + context envelopes, then the prompt.
        let text = format!(
            "[[LEARNING_SESSION]]\nversion: 4\nsession_id: {session_id}\nentry: direct\nprovisional: true\nmode: inferred\npreferred_language: zh-CN\n[[/LEARNING_SESSION]]\n\
             [[LEARNING_CONTEXT]]\nactive: true\nsession_id: {session_id}\nturn_id: {turn_id}\nlesson_artifact_tool: oll_generate_lesson\nlesson_artifact_policy: tool_only\ndirect_oll_json: forbidden\nprovisional: true\n[[/LEARNING_CONTEXT]]\n{IMAGE_PROMPT}"
        );
        self.server.call(
            cx,
            "turn/start",
            json!({
                "session_id": session_id,
                "turn_id": turn_id,
                "input": [{"kind": "text", "text": text}],
                "media": [{"path": path, "mime": "application/octet-stream", "size_bytes": 0}],
            }),
            server::Call::Turn { turn_id },
        );
    }
    /// Web 启用摄像头 / 关闭摄像头 (top bar and dock camera button).
    fn toggle_camera(&mut self, cx: &mut Cx) {
        if self.camera.active {
            self.camera.disable(cx);
        } else {
            if !self.ensure_classroom(cx) {
                return;
            }
            if let Err(e) = self.camera.enable(cx) {
                self.toast(cx, &e);
                return;
            }
            self.server.ensure_login(cx);
        }
        let on = self.camera.active;
        self.ui.button(cx, ids!(camera)).set_text(cx, if on { "关闭摄像头" } else { "启用摄像头" });
        for id in [live_id!(camera), live_id!(ask_camera)] {
            if let Some(mut b) = self.ui.widget(cx, &[id]).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(if on { ICON_CAMERA } else { ICON_CAMERA_OFF });
            }
        }
        if !on {
            self.ui.widget(cx, ids!(camera_sent)).set_visible(cx, false);
            self.set_camera_dialog(cx, false);
        }
        self.ui.widget(cx, ids!(camera_live)).set_visible(cx, on);
        self.ui.widget(cx, ids!(camera_monitor)).set_visible(cx, on);
        self.ui.redraw(cx);
    }
    fn camera_settings_path(&self) -> Option<std::path::PathBuf> {
        self.store.as_ref().map(|s| s.dir().join("camera-frame-settings.json"))
    }
    /// Web loadCameraFrameSettings (localStorage there, the data dir here).
    fn load_camera_settings(&mut self) {
        let saved = self.camera_settings_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok());
        self.camera.settings = saved.map(|v| camera::FrameSettings::from_json(&v)).unwrap_or_default();
    }
    fn update_camera_settings(&mut self, cx: &mut Cx, next: camera::FrameSettings) {
        self.camera.settings = next.normalized();
        if let Some(path) = self.camera_settings_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap()).and_then(|_| std::fs::write(path, self.camera.settings.to_json().to_string()));
        }
        self.camera.refresh_preview();
        self.sync_camera_dialog(cx);
    }
    fn sync_camera_dialog(&mut self, cx: &mut Cx) {
        let s = self.camera.settings;
        self.ui.slider(cx, ids!(camera_dialog_zoom)).set_value(cx, s.zoom);
        self.ui.slider(cx, ids!(camera_dialog_x)).set_value(cx, s.offset_x);
        self.ui.slider(cx, ids!(camera_dialog_y)).set_value(cx, s.offset_y);
        self.ui.label(cx, ids!(camera_dialog_zoom_value)).set_text(cx, &format!("{:.1}×", s.zoom));
        self.ui.label(cx, ids!(camera_dialog_x_value)).set_text(cx, &format!("{}", (s.offset_x * 100.).round()));
        self.ui.label(cx, ids!(camera_dialog_y_value)).set_text(cx, &format!("{}", (s.offset_y * 100.).round()));
        self.ui.label(cx, ids!(camera_dialog_meta)).set_text(cx, &format!("{}° · {:.1}×", s.rotation, s.zoom));
        self.ui.label(cx, ids!(camera_dialog_doc_state)).set_text(cx, if s.document_mode { "已开启" } else { "已关闭" });
        self.update_camera_dialog_image(cx);
        self.ui.redraw(cx);
    }
    fn update_camera_dialog_image(&mut self, cx: &mut Cx) {
        let Some((w, h, data)) = self.camera.framed_preview(960) else { return };
        let texture = self.camera_dialog_texture.get_or_insert_with(|| Texture::new_with_format(cx, TextureFormat::VecBGRAu8_32 { width: 1, height: 1, data: None, updated: TextureUpdated::Full })).clone();
        texture.set_data_u32(cx, w, h, data);
        self.ui.image(cx, ids!(camera_dialog_image)).set_texture(cx, Some(texture));
        self.ui.widget(cx, ids!(camera_dialog)).redraw(cx);
    }
    fn set_camera_dialog(&mut self, cx: &mut Cx, open: bool) {
        self.camera_dialog_open = open;
        self.ui.widget(cx, ids!(camera_dialog)).set_visible(cx, open);
        if open {
            self.sync_camera_dialog(cx);
        }
        self.ui.redraw(cx);
    }
    fn camera_dialog_actions(&mut self, cx: &mut Cx, actions: &Actions) {
        if self.ui.button(cx, ids!(camera_frame_settings)).clicked(actions) {
            self.set_camera_dialog(cx, true);
        }
        if !self.camera_dialog_open {
            return;
        }
        if self.ui.button(cx, ids!(camera_dialog_close)).clicked(actions) {
            self.set_camera_dialog(cx, false);
            return;
        }
        let mut s = self.camera.settings;
        let mut changed = false;
        if self.ui.button(cx, ids!(camera_dialog_left)).clicked(actions) {
            s.rotation = (s.rotation + 270) % 360;
            changed = true;
        }
        if self.ui.button(cx, ids!(camera_dialog_right)).clicked(actions) {
            s.rotation = (s.rotation + 90) % 360;
            changed = true;
        }
        if self.ui.button(cx, ids!(camera_dialog_mirror)).clicked(actions) {
            s.mirror = !s.mirror;
            changed = true;
        }
        if let Some(v) = self.ui.slider(cx, ids!(camera_dialog_zoom)).slided(actions) {
            s.zoom = v;
            changed = true;
        }
        // Web: the position sliders are disabled at 1× zoom.
        if let Some(v) = self.ui.slider(cx, ids!(camera_dialog_x)).slided(actions) {
            s.offset_x = if s.zoom > 1. { v } else { 0. };
            changed = true;
        }
        if let Some(v) = self.ui.slider(cx, ids!(camera_dialog_y)).slided(actions) {
            s.offset_y = if s.zoom > 1. { v } else { 0. };
            changed = true;
        }
        if self.ui.button(cx, ids!(camera_dialog_doc)).clicked(actions) {
            s.document_mode = !s.document_mode;
            changed = true;
        }
        if self.ui.button(cx, ids!(camera_dialog_reset)).clicked(actions) {
            s = camera::FrameSettings::default();
            changed = true;
        }
        if changed {
            self.update_camera_settings(cx, s);
        }
    }
    /// Push a BGRA frame into the live (or sent) monitor image.
    fn show_camera_frame(&mut self, cx: &mut Cx, sent: bool, (w, h, data): (usize, usize, Vec<u32>)) {
        let new = || TextureFormat::VecBGRAu8_32 { width: w, height: h, data: None, updated: TextureUpdated::Full };
        let textures = self
            .camera_textures
            .get_or_insert_with(|| (Texture::new_with_format(cx, new()), Texture::new_with_format(cx, new())));
        let texture = if sent { textures.1.clone() } else { textures.0.clone() };
        texture.set_data_u32(cx, w, h, data);
        let image = self.ui.image(cx, if sent { ids!(camera_sent_image) } else { ids!(camera_image) });
        image.set_texture(cx, Some(texture));
        if sent {
            self.ui.widget(cx, ids!(camera_sent)).set_visible(cx, true);
        }
        self.ui.widget(cx, ids!(camera_monitor)).redraw(cx);
    }
    /// Web 启用语音 / 关闭语音 (and the dock mic button).
    fn toggle_voice(&mut self, cx: &mut Cx) {
        if self.voice.enabled {
            self.voice.disable();
            self.voice_turn = None;
            cx.use_audio_inputs(&[]);
        } else {
            if !self.ensure_classroom(cx) {
                return;
            }
            self.server.ensure_login(cx);
            self.voice.enabled = true;
            // The automation hook replays a file instead of the microphone.
            if std::env::var_os("OCTOS_VOICE_TEST_WAV").is_none() {
                self.voice.enable(cx);
                // Voice processing: the OS removes what the speakers play.
                cx.use_audio_inputs_with_options(&self.audio_inputs, AudioInputOptions { echo_cancellation: true });
            }
        }
        let on = self.voice.enabled;
        self.ui.button(cx, ids!(voice)).set_text(cx, if on { "关闭语音" } else { "启用语音" });
        for id in [live_id!(voice), live_id!(ask_mic), live_id!(ask_mic_on)] {
            if let Some(mut b) = self.ui.widget(cx, &[id]).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(if on { ICON_MIC } else { ICON_MIC_OFF });
            }
        }
        // Web .learning-mic-button: #167794 while voice is on, .38 opacity off.
        self.ui.widget(cx, ids!(ask_mic)).set_visible(cx, !on);
        self.ui.widget(cx, ids!(ask_mic_on)).set_visible(cx, on);
        self.sync_live(cx);
    }
    /// A finished utterance: upload it and ask the server to transcribe
    /// (web use-voice-conversation: uploadFiles + voice/admit).
    fn voice_utterance(&mut self, cx: &mut Cx, wav: Vec<u8>) {
        let Some(live) = self.live.as_mut() else { return };
        if self.voice_turn.is_some() || live.pending() || !self.server.logged_in() {
            return;
        }
        let turn = server::uuid();
        self.voice_turn = Some(turn.clone());
        if !live.opened {
            live.opened = true;
            let session = live.session_id.clone();
            let profile = self.server.profile_id.clone().unwrap_or_default();
            self.server.call(cx, "session/open", json!({"session_id": session, "profile_id": profile}), server::Call::Fire);
        }
        self.server.upload(cx, "utterance.wav", "audio/wav", &wav, Some("recording"), &format!("voice:{turn}"));
        self.sync_live(cx);
    }
    /// Ask a transcribed voice question on the live board.
    fn ask_voice(&mut self, cx: &mut Cx, turn: String, text: String) {
        let Some(live) = self.live.as_mut() else { return };
        live.questions.push((turn.clone(), text.clone(), "pending".into()));
        self.dispatch_question(cx, turn, text, "voice");
        self.sync_live(cx);
        self.save_live(cx);
    }
    /// session/open (once) + session/title.set (first question) +
    /// skill/action/invoke learning.lesson.generate, as the web workspace.
    /// With the camera on, the current frame goes along (web sendText /
    /// voice turn: grab → upload → generate-from-camera); else text only.
    fn dispatch_question(&mut self, cx: &mut Cx, turn_id: String, text: String, modality: &str) {
        if !self.camera.active {
            self.send_question(cx, turn_id, text, modality, None);
            return;
        }
        let Some((rgb, jpeg)) = self.camera.grab() else {
            self.fail_question(cx, &turn_id, "摄像头画面没有截取成功，请确认预览正常后重试");
            return;
        };
        self.show_camera_frame(cx, true, camera::to_bgra(&camera::downscale(&rgb, camera::PREVIEW_W, camera::PREVIEW_H)));
        if let Some(live) = self.live.as_mut() {
            live.uploading = Some((turn_id.clone(), text, modality.to_owned()));
        }
        self.server.upload(cx, "camera-frame.jpg", "image/jpeg", &jpeg, Some("upload"), &format!("camera:{turn_id}"));
    }
    /// `visual`: ("camera" | "ink_selection", uploaded image path) — web
    /// startDirectLessonGeneration visualContext.
    fn send_question(&mut self, cx: &mut Cx, turn_id: String, text: String, modality: &str, visual: Option<(&str, String)>) {
        let Some(live) = self.live.as_mut() else { return };
        let session_id = live.session_id.clone();
        let profile = self.server.profile_id.clone().unwrap_or_default();
        if !live.opened {
            live.opened = true;
            self.server.call(cx, "session/open", json!({"session_id": session_id, "profile_id": profile}), server::Call::Fire);
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
        let mut arguments = json!({
            "turn_id": turn_id,
            "learner_request": text,
            "request_source": match &visual { Some(("camera", _)) => "current_image", Some((kind, _)) => kind, None => "self_contained" },
            "language": "zh-CN",
            "input_modality": modality,
            "client_timing": {"submitted_at_epoch_ms": now, "skill_invocation_started_at_epoch_ms": now},
        });
        if let Some((_, path)) = &visual {
            arguments["paths"] = json!([path]);
        }
        let action = match &visual {
            Some(("camera", _)) => "learning.lesson.generate-from-camera",
            Some(_) => "learning.lesson.generate-from-selection",
            None => "learning.lesson.generate",
        };
        self.server.call(
            cx,
            "skill/action/invoke",
            json!({"session_id": session_id, "action_id": action, "arguments": arguments}),
            server::Call::Invoke { turn_id },
        );
    }
    fn fail_question(&mut self, cx: &mut Cx, turn_id: &str, message: &str) {
        if let Some(q) = self.live.as_mut().and_then(|l| l.questions.iter_mut().find(|q| q.0 == turn_id)) {
            q.2 = "failed".into();
        }
        self.toast(cx, message);
        self.sync_live(cx);
        self.save_live(cx);
    }
    fn live_dir(&self) -> Option<std::path::PathBuf> {
        self.store.as_ref().map(|s| s.dir().join("live"))
    }
    /// Web learning-session-store + learning-questions: a live board is kept
    /// on this device (questions, the generated lesson, progress and ink) so
    /// 学习记录 can reopen it offline.
    fn save_live(&mut self, cx: &mut Cx) {
        let positions = self.ui.widget(cx, ids!(spatial)).borrow::<spatial_board::SpatialBoard>().map(|b| b.selection_card_positions()).unwrap_or_default();
        if let Some(live) = self.live.as_mut() {
            for card in &mut live.selection_cards {
                if let Some((_, x, y)) = positions.iter().find(|(id, _, _)| *id == card.turn) {
                    card.pos = Some((*x, *y));
                }
            }
        }
        let (Some(live), Some(dir)) = (self.live.as_ref(), self.live_dir()) else { return };
        if live.questions.is_empty() && live.selection_cards.is_empty() {
            return;
        }
        let mut checkpoint = self.player.as_ref().and_then(|p| p.checkpoint().ok()).unwrap_or(serde_json::Value::Null);
        if checkpoint.is_object() {
            if let Some(b) = self.ui.widget(cx, ids!(spatial)).borrow::<spatial_board::SpatialBoard>() {
                checkpoint["native_ink"] = b.ink_snapshot();
            }
        }
        let title = self
            .player
            .as_ref()
            .map(|p| p.board.title.clone())
            .filter(|t| !t.is_empty())
            .or_else(|| live.questions.first().map(|q| q.1.clone()))
            .unwrap_or_default();
        let record = json!({
            "session_id": live.session_id,
            "title": title,
            "questions": live.questions.iter().map(|(t, q, st)| json!([t, q, st])).collect::<Vec<_>>(),
            "lessons": live.lessons.iter().map(|(t, src)| json!({"turn_id": t, "source": src})).collect::<Vec<_>>(),
            "selection_cards": live.selection_cards.iter().map(SelCard::to_json).collect::<Vec<_>>(),
            "course": live.course.as_ref().map(|(p, v)| json!([p, v])),
            "checkpoint": checkpoint,
        });
        let path = dir.join(format!("{}.json", live.session_id));
        let _ = std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(path, record.to_string()));
    }
    /// Reopen a saved live board from 学习记录 (paused at its saved state).
    fn open_live_record(&mut self, cx: &mut Cx, session_id: &str) {
        let Some(dir) = self.live_dir() else { return };
        let Some(record) = std::fs::read(dir.join(format!("{session_id}.json")))
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        else {
            self.toast(cx, "这条学习记录已损坏或不存在");
            return;
        };
        self.open_live_board(cx);
        let Some(live) = self.live.as_mut() else { return };
        live.session_id = session_id.to_owned();
        live.titled = true;
        live.questions = record["questions"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|q| {
                let status = match q[2].as_str()? {
                    // A generation that was in flight when the app closed.
                    "pending" => "failed",
                    s => s,
                };
                Some((q[0].as_str()?.to_owned(), q[1].as_str()?.to_owned(), status.to_owned()))
            })
            .collect();
        live.selection_cards = record["selection_cards"].as_array().into_iter().flatten().filter_map(SelCard::from_json).collect();
        // Records before topic composition kept one "lesson".
        let entries = record["lessons"].as_array().cloned().unwrap_or_else(|| record["lesson"].is_object().then(|| vec![record["lesson"].clone()]).unwrap_or_default());
        live.lessons = entries
            .iter()
            .filter_map(|l| Some((l["turn_id"].as_str().unwrap_or("").to_owned(), l["source"].as_str()?.to_owned())))
            .collect();
        if !live.lessons.is_empty() {
            let checkpoint = &record["checkpoint"];
            let session = live.classroom().and_then(|source| {
                // A checkpoint of another program (older format) falls back
                // to the composed classroom at its end.
                checkpoint
                    .is_object()
                    .then(|| Session::restore(&source, checkpoint).ok())
                    .flatten()
                    .map_or_else(
                        || {
                            let mut s = Session::load_incremental(&source, true)?;
                            let end = s.outline().last().map_or(0, |st| st.end_cursor);
                            s.seek(end, vec![])?;
                            Ok(s)
                        },
                        Ok,
                    )
            });
            match session {
                Ok(session) => {
                    if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
                        if checkpoint["native_ink"].is_object() {
                            b.restore_ink(cx, &checkpoint["native_ink"]);
                        }
                    }
                    self.player = Some(session);
                    self.start_live_tts(cx);
                }
                Err(e) => self.toast(cx, &format!("无法恢复这节课：{e}")),
            }
        }
        self.sync_live(cx);
        self.refresh(cx);
    }
    fn handle_server(&mut self, cx: &mut Cx, event: &Event) {
        for ev in self.server.handle(cx, event) {
            if self.settings_server_event(cx, &ev) {
                continue;
            }
            match ev {
                server::ServerEvent::LoggedIn => {
                    self.start_classification(cx);
                    if let Some((turn, text)) = self.live.as_mut().and_then(|l| l.queued.take()) {
                        self.dispatch_question(cx, turn, text, "text");
                    }
                    self.check_setup(cx);
                }
                server::ServerEvent::Profile(result) => match result {
                    Ok(profile) => {
                        self.ui.label(cx, ids!(setup_model_status)).set_text(cx, "");
                        self.apply_setup_profile(cx, profile);
                    }
                    Err(e) => self.ui.label(cx, ids!(setup_model_status)).set_text(cx, &format!("读取设置失败：{e}")),
                },
                server::ServerEvent::ProviderTested(result) => match result {
                    Ok(()) => {
                        let model = self.ui.text_input(cx, ids!(setup_model)).text().trim().to_owned();
                        let key = self.ui.text_input(cx, ids!(setup_key)).text().trim().to_owned();
                        let mut patch = json!({"llm": {
                            "primary": {"family_id": "google", "model_id": model, "route": {"api_key_env": "GEMINI_API_KEY", "base_url": null}},
                            "fallbacks": [],
                        }});
                        if !key.is_empty() {
                            let mut env = self.setup_profile.as_ref().map(|p| p["config"]["env_vars"].clone()).unwrap_or(json!({}));
                            env["GEMINI_API_KEY"] = json!(key);
                            patch["env_vars"] = env;
                        }
                        self.save_setup_profile(cx, patch);
                    }
                    Err(e) => {
                        self.setup_saving = None;
                        self.ui.button(cx, ids!(setup_save)).set_text(cx, "测试连接并保存");
                        self.ui.label(cx, ids!(setup_model_status)).set_text(cx, &e);
                    }
                },
                server::ServerEvent::ProfileSaved(result) => {
                    let which = self.setup_saving.take().unwrap_or_default();
                    self.ui.button(cx, ids!(setup_save)).set_text(cx, "测试连接并保存");
                    let status = if which == "volc" { live_id!(setup_tts_status) } else { live_id!(setup_model_status) };
                    match result {
                        Ok(profile) => {
                            // Web profileModelSaveMessage.
                            let message = match profile["runtime_disposition"].as_str() {
                                Some("reloaded") => "已生效，下一次生成使用新模型",
                                Some("restart_required") => "已保存，服务重启后生效",
                                Some("persisted_but_not_live") => "已保存。当前任务结束后，下一次生成将使用新模型",
                                _ => "已保存，下一次生成课程时生效",
                            };
                            if which == "volc" {
                                self.ui.text_input(cx, ids!(setup_volc_token)).set_text(cx, "");
                                self.ui.label(cx, ids!(setup_tts_status)).set_text(cx, "正在准备语音…");
                                self.server.synthesize(cx, "你好，我是你白板旁的学习伙伴。我们可以一起看图、推导和解决问题。", "preview");
                            } else {
                                self.ui.text_input(cx, ids!(setup_key)).set_text(cx, "");
                                self.ui.label(cx, &[status]).set_text(cx, message);
                            }
                            self.apply_setup_profile(cx, profile);
                        }
                        Err(e) => self.ui.label(cx, &[status]).set_text(cx, &e),
                    }
                }
                server::ServerEvent::Uploaded { purpose, paths } if purpose.starts_with("selclass:") => {
                    let key = purpose["selclass:".len()..].to_owned();
                    match paths {
                        Ok(paths) if !paths.is_empty() => self.classify_selection(cx, &key, paths[0].clone()),
                        _ => {
                            if let Some(s) = self.selection.as_mut().filter(|s| s.key == key) {
                                s.class_status = "error";
                            }
                            self.rebuild_selection_ui(cx);
                        }
                    }
                }
                server::ServerEvent::Uploaded { purpose, paths } if purpose.starts_with("selection:") => {
                    let turn = &purpose["selection:".len()..];
                    let Some((turn, text, modality)) = self.live.as_mut().and_then(|l| l.uploading.take_if(|u| u.0 == turn)) else { continue };
                    match paths {
                        Ok(paths) if !paths.is_empty() => {
                            let path = paths[0].clone();
                            self.send_question(cx, turn, text, &modality, Some(("ink_selection", path)));
                        }
                        _ => self.fail_question(cx, &turn, "选区图片上传失败，请重新框选后再试"),
                    }
                }
                server::ServerEvent::Uploaded { purpose, paths } if purpose.starts_with("selenh:") => {
                    let turn = purpose["selenh:".len()..].to_owned();
                    let Some(index) = self.enhance_pending.iter().position(|(t, _)| *t == turn) else { continue };
                    let (_, args) = self.enhance_pending.remove(index);
                    match paths {
                        Ok(paths) if !paths.is_empty() => self.invoke_enhance(cx, &turn, args, paths[0].clone()),
                        _ => self.fail_selection_card(cx, &turn, "选区图片上传失败，请重新框选后再试"),
                    }
                }
                server::ServerEvent::ActionResult { purpose, result } => {
                    let Some(turn) = purpose.strip_prefix("selenh:").map(str::to_owned) else { continue };
                    // The enhancement artifact (web collectPersistedSelectionEnhancementArtifacts).
                    fn find_artifact(v: &serde_json::Value, turn: &str) -> Option<String> {
                        match v {
                            serde_json::Value::String(s) if s.ends_with(".octos-selection-enhancement.json") && s.contains(turn) => Some(s.clone()),
                            serde_json::Value::Array(a) => a.iter().find_map(|x| find_artifact(x, turn)),
                            serde_json::Value::Object(o) => o.get("handle").and_then(|h| h.as_str()).filter(|_| o.values().any(|x| x.as_str().is_some_and(|s| s.ends_with(".octos-selection-enhancement.json")))).map(str::to_owned).or_else(|| o.values().find_map(|x| find_artifact(x, turn))),
                            _ => None,
                        }
                    }
                    match result {
                        Ok(value) => match find_artifact(&value, &turn) {
                            Some(handle) => {
                                let session = self.board_session_id();
                                self.server.fetch_file(cx, &session, &handle, &format!("selenh:{turn}"));
                            }
                            None => self.fail_selection_card(cx, &turn, "没有生成可显示的选区结果。这个内容可能暂不支持，请重试或改用“问小章鱼”查看原因。"),
                        },
                        Err(e) => self.fail_selection_card(cx, &turn, &e),
                    }
                }
                server::ServerEvent::LessonFile { turn_id, body } if turn_id.starts_with("selenh:") => {
                    let turn = &turn_id["selenh:".len()..];
                    let artifact = body.ok().and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok()).filter(|a| a["profile"] == "octos.selection-enhancement" && a["response"].is_object());
                    match artifact {
                        Some(artifact) => {
                            if let Some(card) = self.live.as_mut().and_then(|l| l.selection_cards.iter_mut().find(|c| c.turn == turn)) {
                                card.status = "answered".into();
                                card.artifact = Some(artifact);
                            }
                            self.sync_live(cx);
                            self.save_live(cx);
                        }
                        None => self.fail_selection_card(cx, turn, "选区辅助内容格式无效"),
                    }
                }
                server::ServerEvent::Json { .. } => {}
                server::ServerEvent::Metadata { purpose, result } => {
                    let Some(key) = purpose.strip_prefix("selclass:") else { continue };
                    let Some(s) = self.selection.as_mut().filter(|s| s.key == key) else { continue };
                    match result.and_then(|m| oll_runtime::selection::parse_classification(&m)) {
                        Ok((kind, content, confidence)) => {
                            s.content_kind = if confidence == "low" { "unknown".into() } else { kind.clone() };
                            s.classification = Some((kind, content, confidence));
                            s.class_status = "ready";
                        }
                        Err(_) => {
                            s.classification = None;
                            s.content_kind = "unknown".into();
                            s.class_status = "error";
                        }
                    }
                    self.rebuild_selection_ui(cx);
                }
                server::ServerEvent::Uploaded { purpose, paths } if purpose.starts_with("image:") => {
                    let turn = purpose["image:".len()..].to_owned();
                    match paths {
                        Ok(paths) if !paths.is_empty() => self.send_image_turn(cx, turn, paths[0].clone()),
                        _ => self.fail_question(cx, &turn, "图片上传失败，请重试"),
                    }
                }
                server::ServerEvent::Turn { turn_id, update } => {
                    let Some(live) = self.live.as_mut() else { continue };
                    if !live.chat_turns.contains(&turn_id) {
                        continue;
                    }
                    match update {
                        server::TurnUpdate::Accepted(Err(e)) => self.fail_question(cx, &turn_id, &e),
                        server::TurnUpdate::Accepted(Ok(())) => {}
                        server::TurnUpdate::Reply(text) => live.chat_reply = Some((turn_id, text)),
                        server::TurnUpdate::Lesson(path) => {
                            if !live.chat_lessons.contains(&turn_id) {
                                live.chat_lessons.push(turn_id.clone());
                                let session = live.session_id.clone();
                                self.server.fetch_file(cx, &session, &path, &turn_id);
                            }
                        }
                        server::TurnUpdate::Done(result) => {
                            live.chat_turns.retain(|t| t != &turn_id);
                            let got_lesson = live.chat_lessons.contains(&turn_id);
                            let reply = live.chat_reply.take().filter(|r| r.0 == turn_id).map(|r| r.1);
                            match result {
                                Err(e) if !got_lesson => self.fail_question(cx, &turn_id, &e),
                                // The agent answered without a board lesson:
                                // show its reply (web shows the chat answer).
                                Ok(()) if !got_lesson => {
                                    let text: String = reply.unwrap_or_else(|| "老师这次没有生成白板课程".into()).chars().take(160).collect();
                                    self.fail_question(cx, &turn_id, &text);
                                }
                                _ => {}
                            }
                        }
                    }
                }
                server::ServerEvent::Uploaded { purpose, paths } if purpose.starts_with("camera:") => {
                    let turn = &purpose["camera:".len()..];
                    let Some((turn, text, modality)) = self.live.as_mut().and_then(|l| l.uploading.take_if(|u| u.0 == turn)) else { continue };
                    match paths {
                        Ok(paths) if !paths.is_empty() => {
                            let path = paths[0].clone();
                            self.send_question(cx, turn, text, &modality, Some(("camera", path)));
                        }
                        _ => self.fail_question(cx, &turn, "摄像头画面上传失败，请重试"),
                    }
                }
                server::ServerEvent::Uploaded { purpose, paths } => {
                    let Some(turn) = purpose.strip_prefix("voice:").map(str::to_owned) else { continue };
                    if self.voice_turn.as_deref() != Some(turn.as_str()) {
                        continue;
                    }
                    match paths {
                        Ok(paths) if !paths.is_empty() => {
                            let session = self.live.as_ref().map(|l| l.session_id.clone()).unwrap_or_default();
                            self.server.call(
                                cx,
                                "voice/admit",
                                // Web buildTurnStartExtras media refs (server reads path).
                                json!({
                                    "session_id": session,
                                    "request_id": turn,
                                    "turn_id": turn,
                                    "media": paths.iter().map(|p| json!({"path": p, "mime": "application/octet-stream", "size_bytes": 0})).collect::<Vec<_>>(),
                                }),
                                server::Call::Admit { turn_id: turn },
                            );
                        }
                        Ok(_) | Err(_) => {
                            self.voice_turn = None;
                            self.toast(cx, "语音上传失败，请再说一次或改用打字");
                            self.sync_live(cx);
                        }
                    }
                }
                server::ServerEvent::Admitted { turn_id, result } => {
                    if self.voice_turn.as_deref() != Some(turn_id.as_str()) {
                        continue;
                    }
                    self.voice_turn = None;
                    match result {
                        Ok(Some(text)) => self.ask_voice(cx, turn_id, text),
                        Ok(None) => self.sync_live(cx),
                        Err(e) => {
                            self.toast(cx, &format!("语音识别失败：{e}"));
                            self.sync_live(cx);
                        }
                    }
                }
                server::ServerEvent::Speech { purpose, audio } => {
                    if let Some(beat) = purpose.strip_prefix("narration:") {
                        let current = self.live.as_ref().and_then(|l| l.tts_inflight.clone());
                        if current.as_deref() != Some(beat) {
                            continue;
                        }
                        if let Some(l) = self.live.as_mut() {
                            l.tts_inflight = None;
                        }
                        match audio {
                            Ok(bytes) => {
                                if let Some(dir) = self.live_tts_dir() {
                                    let path = dir.join(format!("{}.audio", tts_file_key(beat)));
                                    if std::fs::create_dir_all(&dir).and_then(|_| std::fs::write(&path, &bytes)).is_ok() {
                                        self.register_narration_clip(beat, path);
                                        self.sync_narration_audio(cx);
                                    }
                                }
                                self.next_live_tts(cx);
                            }
                            Err(e) => {
                                // No TTS route (e.g. no on-device voice): keep
                                // the silent, text-timed narration.
                                if let Some(l) = self.live.as_mut() {
                                    l.tts_queue.clear();
                                }
                                if std::env::var_os("OCTOS_SERVER_DEBUG").is_some() {
                                    eprintln!("[octos-server] narration TTS unavailable: {e}");
                                }
                            }
                        }
                        continue;
                    }
                    if purpose == "preview" {
                        let message = match audio.and_then(|a| self.play_speech(cx, &a, "preview")) {
                            Ok(()) => "试听已播放。如果没有听到，请检查音量和输出设备。".to_owned(),
                            Err(e) => format!("旁白语音暂不可用：{e}"),
                        };
                        self.ui.label(cx, ids!(setup_tts_status)).set_text(cx, &message);
                    }
                }
                server::ServerEvent::Unavailable(message) => {
                    let pending: Vec<String> = self
                        .live
                        .as_ref()
                        .map(|l| l.questions.iter().filter(|q| q.2 == "pending").map(|q| q.0.clone()).collect())
                        .unwrap_or_default();
                    if let Some(l) = self.live.as_mut() {
                        l.queued = None;
                        l.uploading = None;
                    }
                    for turn in &pending {
                        self.fail_question(cx, turn, &message);
                    }
                    if pending.is_empty() && self.live.is_some() {
                        self.toast(cx, &message);
                    }
                }
                server::ServerEvent::Invoked { turn_id, result } => match result {
                    Ok(job) => {
                        if let Some(l) = self.live.as_mut() {
                            l.jobs.insert(job, turn_id);
                        }
                    }
                    Err(e) => self.fail_question(cx, &turn_id, &format!("没有生成成功：{e}")),
                },
                server::ServerEvent::Job(job) => {
                    let Some(live) = self.live.as_ref() else { continue };
                    if job["session_id"] != live.session_id.as_str() {
                        continue;
                    }
                    let Some(turn) = job["job_id"].as_str().and_then(|j| live.jobs.get(j)).cloned() else { continue };
                    match job["status"].as_str() {
                        Some("succeeded") => {
                            let name = format!("{turn}.octos-lesson.json");
                            let handle = job["result"]["artifacts"]
                                .as_array()
                                .into_iter()
                                .flatten()
                                .find(|a| a["display_name"] == name.as_str())
                                .and_then(|a| a["handle"].as_str())
                                .map(str::to_owned);
                            let session = live.session_id.clone();
                            // Web setSessionTitle: the session exists on the
                            // server once its first turn has run.
                            if !live.titled {
                                let title = live.questions.first().map(|q| q.1.clone()).unwrap_or_default();
                                if let Some(l) = self.live.as_mut() {
                                    l.titled = true;
                                }
                                self.server.call(cx, "session/title.set", json!({"session_id": session, "title": title}), server::Call::Fire);
                            }
                            match handle {
                                Some(h) => self.server.fetch_file(cx, &session, &h, &turn),
                                None => self.fail_question(cx, &turn, "没有生成成功：没有收到课程文件"),
                            }
                        }
                        Some("failed") | Some("cancelled") => {
                            let detail = job["error"].as_str().or(job["result"]["output"].as_str()).unwrap_or("生成失败").to_owned();
                            self.fail_question(cx, &turn, &format!("没有生成成功：{detail}"));
                        }
                        _ => {}
                    }
                }
                server::ServerEvent::LessonFile { turn_id, body } => match body {
                    Ok(body) => self.load_live_lesson(cx, &turn_id, &body),
                    Err(e) => self.fail_question(cx, &turn_id, &e),
                },
            }
        }
    }
    /// Web materializeOllLesson + player: the generated authoring lesson is
    /// materialized into canonical JSONL and played on this board.
    fn load_live_lesson(&mut self, cx: &mut Cx, turn_id: &str, body: &str) {
        let Some(live) = self.live.as_ref() else { return };
        let session_id = live.session_id.clone();
        // Web loadOllLessonArtifact + composeOllClassroomEvents: the answer
        // becomes the next topic of this board's classroom; earlier topics
        // stay on the board and playback starts at the new topic.
        let loaded = serde_json::from_str::<serde_json::Value>(body)
            .map_err(|e| format!("课程文件损坏：{e}"))
            .and_then(|doc| {
                let host = oll_runtime::classroom::live_host(&session_id, turn_id, &doc);
                oll_runtime::authoring::materialize_jsonl(&doc, &host)
            })
            .and_then(|jsonl| {
                // Validate on its own first (web materialize asserts).
                Session::load(&jsonl)?;
                let mut candidate = self.live.as_ref().map(|l| l.lessons.clone()).unwrap_or_default();
                candidate.retain(|(t, _)| t != turn_id);
                candidate.push((turn_id.to_owned(), jsonl.clone()));
                let base = self.live.as_ref().and_then(|l| l.base.clone());
                let probe = Live { lessons: candidate.clone(), session_id: session_id.clone(), base, ..Live::new() };
                let source = probe.classroom()?;
                let mut session = Session::load_incremental(&source, true)?;
                // Pack clip timing and the voice toggle carry over.
                if let Some(old) = &self.player {
                    session.narration_durations = old.narration_durations.clone();
                    session.narration_enabled = old.narration_enabled;
                }
                let first_step = jsonl
                    .lines()
                    .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
                    .find(|e| e["event"] == "lesson.step")
                    .and_then(|e| e["step"]["id"].as_str().map(str::to_owned));
                if let Some(start) = first_step.and_then(|id| session.outline().into_iter().find(|s| s.id == id)).map(|s| s.start_cursor) {
                    if start > 0 {
                        session.seek(start, vec![])?;
                    }
                }
                Ok((session, candidate))
            });
        match loaded {
            Ok((session, lessons)) => {
                if let Some(l) = self.live.as_mut() {
                    l.lessons = lessons;
                }
                if let Some(q) = self.live.as_mut().and_then(|l| l.questions.iter_mut().find(|q| q.0 == turn_id)) {
                    q.2 = "answered".into();
                }
                self.player = Some(session);
                self.lesson_released = false;
                self.start_live_tts(cx);
                self.sync_live(cx);
                self.start_playback(cx);
                self.refresh(cx);
                self.save_live(cx);
            }
            Err(e) => self.fail_question(cx, turn_id, &format!("没有生成成功：{e}")),
        }
    }
    /// Live-board chrome: question/loading cards, demo controls only with a
    /// lesson, teacher idle/thinking copy before the lesson.
    fn sync_live(&mut self, cx: &mut Cx) {
        let Some(live) = self.live.as_ref() else {
            self.ui.widget(cx, ids!(demo_controls)).set_visible(cx, true);
            return;
        };
        let has_lesson = self.player.is_some();
        // Web shows the latest question; while it is pending, the loading block.
        let mut cards = Vec::new();
        if let Some((turn, text, status)) = live.questions.last() {
            cards.push(spatial_board::HostCard::Question { id: turn.clone(), text: text.clone(), status: status.clone() });
            if status == "pending" {
                cards.push(spatial_board::HostCard::Loading {
                    id: turn.clone(),
                    title: "正在搭建这节课".into(),
                    detail: "先整理重点，再把讲解和互动画面放到白板上。".into(),
                });
            }
        }
        let pending = live.pending();
        if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            board.set_host_cards(cx, cards);
        }
        let specs: Vec<spatial_board::SelectionCardSpec> = live
            .selection_cards
            .iter()
            .map(|c| spatial_board::SelectionCardSpec {
                id: c.turn.clone(),
                source: c.source,
                pos: c.pos,
                minimized: c.minimized,
                body: json!({"question": c.question, "status": c.status, "error": c.error, "artifact": c.artifact}),
            })
            .collect();
        if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            board.set_selection_cards(cx, specs);
        }
        self.ui.widget(cx, ids!(demo_controls)).set_visible(cx, has_lesson);
        self.ui.widget(cx, ids!(outline_trigger)).set_visible(cx, has_lesson);
        if !has_lesson {
            // Web teacherStateLabel / teacherSpeech before a lesson exists.
            let label = if pending || self.voice_turn.is_some() {
                "正在想"
            } else if self.voice.enabled {
                "我在听"
            } else {
                "轻触开始"
            };
            self.ui.label(cx, ids!(teacher_state)).set_text(cx, label);
            let speech = if pending { "我正在整理这道题，马上写到白板上。" } else { "" };
            self.ui.label(cx, ids!(narration)).set_text(cx, speech);
            self.ui.widget(cx, ids!(narration_bubble)).set_visible(cx, !speech.is_empty());
        }
        self.ui.redraw(cx);
    }
    fn apply_course_mode(&mut self, cx: &mut Cx) {
        let preview = self.course_preview;
        if preview && self.drawing {
            self.drawing = false;
            if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
                board.set_drawing(cx, false);
            }
            self.rebuild_ink_tools(cx);
        }
        self.ui.widget(cx, ids!(start_interaction)).set_visible(cx, preview);
        if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            board.set_ink_hidden(cx, preview);
        }
        for id in [live_id!(voice), live_id!(camera), live_id!(ink_toolbar), live_id!(input_dock)] {
            self.ui.widget(cx, &[id]).set_visible(cx, !preview);
        }
        self.ui.redraw(cx);
    }
    fn show_learning(&mut self, cx: &mut Cx, learning: bool) {
        self.learning_visible = learning;
        if learning {
            // Web: ArrowLeft (返回课程集) when opened from a collection, else Home.
            let icon = if self.collection.is_some() {
                include_str!("../assets/icons/arrow-left.svg")
            } else {
                include_str!("../assets/icons/house.svg")
            };
            if let Some(mut b) = self.ui.widget(cx, ids!(back)).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(icon);
            }
        } else if self.history_open {
            self.set_history_open(cx, false);
        }
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
            let active = match self.ink_tool {
                spatial_board::InkTool::Browse => index == INK_TOOL_BROWSE,
                spatial_board::InkTool::Pen => index == INK_TOOL_PEN,
                spatial_board::InkTool::Erase => index == INK_TOOL_ERASE,
                spatial_board::InkTool::Select => index == INK_TOOL_SELECT,
            };
            let (bg, tint) = if active {
                ("#e3eeec", "#0c7085")
            } else {
                ("#0000", "#686158")
            };
            let code = if icon.is_empty() {
                format!(
                    "Button{{height:36 text:\"{label}\" padding:Inset{{left:9 right:9}}
                        draw_bg +: {{color:{bg} color_hover:#e3eeec color_down:#d5e6eb border_radius:5 border_size:0 border_color:#0000}}
                        draw_text.color:{tint} draw_text.text_style.font_size:7.5}}"
                )
            } else {
                format!(
                    "Button{{width:36 height:36 text:\"\" icon_walk:Walk{{width:16 height:16}}
                        draw_icon +: {{color:{tint}}}
                        draw_bg +: {{color:{bg} color_hover:#e3eeec color_down:#d5e6eb border_radius:5 border_size:0 border_color:#0000}}}}"
                )
            };
            match board_view::widget(cx, &code) {
                Ok(button) => {
                    if cfg!(target_os = "android") {
                        let style = if icon.is_empty() {
                            "{height:27 min_height:27 width:Fit}"
                        } else {
                            "{width:27 height:27 min_height:27 flow:Overlay spacing:0 padding:0 margin:0 align:Align{x:0.5 y:0.5} label_walk:Walk{width:0 height:0} icon_walk:Walk{width:16 height:16}}"
                        };
                        if let Err(error) = android_ui::patch(cx, &button, style) { self.error = error; }
                    }
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
        profile: android_ui::Catalog,
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
        let lesson_label = web_text(&lesson, 11., 1.5, "#648682", false, false, (profile.lesson_margin, 0.));
        let title_label = web_text(&title, profile.course_title, 1.5, "#243b40", false, true, (8., 12.));
        let desc_label = web_text(&desc, profile.course_description, 1.8, "#627579", false, true, (0., profile.description_margin));
        let minutes_label = web_text(&format!("{minutes} 分钟"), 12., 1.5, "#667a7b", false, false, (0., 0.));
        let offline_label = web_text("内置课程 · 可离线", 12., 1.5, "#667a7b", false, false, (0., 0.));
        let preview_label = web_text("预览", 13., 1.5, "#426568", false, false, (0., 0.));
        let start_text = web_text(start_label, 13., 1.5, "#ffffff", true, false, (0., 0.));
        let more = if resume {
            "more := RoundedView{width:40 height:44 align:Align{x:0.5 y:0.5} margin:Inset{right:8} draw_bg +: {color:#0000 border_radius:4}
                more_icon := Svg{animating:false width:20 height:20 draw_svg +: {preserve_viewbox:true}}}"
        } else {
            ""
        };
        let code = format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:9 border_size:0.5 border_color:#dbded9}}
                cover := View{{width:Fill height:{cover_height} flow:Overlay
                    cover_fallback := RoundedView{{width:Fill height:Fill align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#e4f2ee border_radius:8.5}}
                        fallback_char := Label{{text:\"{first_char}\" draw_text.text_style.font_size:40 draw_text.color:#166a79}}
                    }}
                    thumb := mod.widgets.SvgImage{{width:Fill height:Fill}}
                }}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:{body_x} right:{body_x} top:{body_top} bottom:{body_y}}}
                    View{{width:Fill height:Fit flow:Right spacing:8 align:Align{{y:0.5}}
                        RoundedView{{width:Fit height:Fit padding:Inset{{left:8 right:8 top:4 bottom:4}} draw_bg +: {{color:#eaf2ee border_radius:3}}
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
                            clock := Svg{{animating:false width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {minutes_label}
                        }}
                        {offline_label}
                    }}
                    SolidView{{width:Fill height:1 margin:Inset{{top:16}} draw_bg +: {{color:#e7e9e3}}}}
                    View{{width:Fill height:44 flow:Right align:Align{{y:0.5}} margin:Inset{{top:16}}
                        preview := RoundedView{{width:70 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#f0f3ee border_radius:4.5}}
                            eye := Svg{{animating:false width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {preview_label}
                        }}
                        View{{width:Fill height:1}}
                        {more}
                        start := RoundedView{{width:98 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#166a79 border_radius:4.5}}
                            {start_text}
                            arrow := Svg{{animating:false width:16 height:16 draw_svg +: {{preserve_viewbox:true}}}}
                        }}
                    }}
                }}
            }}",
            cover_height = profile.course_cover, body_x = profile.course_padding_x, body_top = profile.course_padding_y, body_y = if cfg!(target_os = "android") { profile.course_padding_y } else { 21. }
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
            (live_id!(more_icon), ICON_MORE, "#607477"),
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
                more: resume.then(|| card.widget(cx, ids!(more))),
            },
        ))
    }
    /// Collection card (web .course-collection-card): 16:10 cover art,
    /// level, title, description and the lesson count / 查看课程 footer; the
    /// whole card is the tap target.
    fn collection_card(cx: &mut Cx, group: &CollectionGroup, profile: android_ui::Catalog) -> Result<(WidgetRef, WidgetRef), String> {
        let title = script_text(&group.title);
        let level = script_text(&group.level);
        let desc = script_text(&group.description);
        let summary = collection_summary(&group.packs);
        let level_label = web_text(&level, 12., 1.5, "#517a75", false, false, (0., 0.));
        let title_label = web_text(&title, profile.collection_title, 1.45, "#243b40", false, true, (profile.title_margin, profile.title_bottom));
        let desc_label = web_text(&desc, profile.collection_description, profile.description_line_height, "#627579", false, true, (0., profile.collection_description_margin));
        let summary_label = web_text(&summary, 12., 1.5, "#667a7b", false, false, (0., 0.));
        let view_label = web_text("查看课程", 12., 1.5, "#166a79", true, false, (0., 0.));
        let code = format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:10 border_size:0.5 border_color:#dbded9}}
                cover := mod.widgets.SvgImage{{width:Fill height:{cover_height}}}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:{body_x} right:{body_x} top:{body_top} bottom:{body_y}}}
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
                            arrow := Svg{{animating:false width:17 height:17 draw_svg +: {{preserve_viewbox:true}}}}
                        }}
                    }}
                }}
            }}",
            cover_height = profile.collection_cover, body_x = profile.collection_padding, body_top = if cfg!(target_os = "android") { profile.collection_padding } else { 24. }, body_y = profile.collection_padding
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
        let columns = self.launcher_profile(cx).columns;
        for chunk in cards.chunks(columns) {
            let row = board_view::widget(
                cx,
                &format!("View{{width:Fill height:Fit flow:Right spacing:{gap}}}"),
            )?;
            let mut members: Vec<WidgetRef> = chunk.iter().map(|(c, _)| c.clone()).collect();
            // Keep column widths when the last row is short.
            for _ in chunk.len()..columns {
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
            self.open_live_board(cx);
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
        // "⋯" panel and its actions.
        if self.card_menu_for.is_some() {
            let restart = tapped(cx, event, &self.ui.widget(cx, ids!(menu_restart)));
            let delete = tapped(cx, event, &self.ui.widget(cx, ids!(menu_delete)));
            if restart || delete {
                let (pack, version) = self.card_menu_for.take().unwrap();
                self.ui.widget(cx, ids!(card_menu)).set_visible(cx, false);
                let text = if restart {
                    "从课程初始白板重新开始？原来的学习记录会保留。"
                } else {
                    "删除这门课程当前保存的学习记录？课程包本身不会被删除。"
                };
                self.ui.label(cx, ids!(confirm_text)).set_text(cx, text);
                self.ui.widget(cx, ids!(confirm_dialog)).set_visible(cx, true);
                self.pending_confirm = Some((restart, pack, version));
                self.ui.redraw(cx);
                return;
            }
            let outside = match event {
                Event::MouseDown(e) => !self.ui.widget(cx, ids!(card_menu)).area().rect(cx).contains(e.abs),
                _ => false,
            };
            if outside {
                self.card_menu_for = None;
                self.ui.widget(cx, ids!(card_menu)).set_visible(cx, false);
                self.ui.redraw(cx);
            }
        }
        let mut menu = None;
        for card in &self.course_cards {
            if let Some(more) = &card.more {
                if tapped(cx, event, more) {
                    menu = Some((card.pack_id.clone(), card.version.clone(), more.area().rect(cx)));
                }
            }
        }
        if let Some((pack, version, r)) = menu {
            self.card_menu_for = Some((pack, version));
            let menu_view = self.ui.view(cx, ids!(card_menu));
            menu_view.set_walk(cx, Walk {
                abs_pos: Some(dvec2(r.pos.x + r.size.x - 180., r.pos.y - 8. - 84.)),
                width: Size::Fixed(180.),
                height: Size::fit(),
                ..Default::default()
            });
            self.ui.widget(cx, ids!(card_menu)).set_visible(cx, true);
            self.ui.redraw(cx);
            return;
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
    fn launcher_viewport(&self, cx: &mut Cx) -> Vec2d {
        let size = self.ui.window(cx, ids!(main_window)).get_inner_size(cx);
        if size.x > 0. && size.y > 0. { size } else { dvec2(960., 540.) }
    }
    fn launcher_profile(&self, cx: &mut Cx) -> android_ui::Catalog {
        android_ui::Catalog::new(self.launcher_viewport(cx), cfg!(target_os = "android"))
    }
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
        let profile = self.launcher_profile(cx);
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
                match Self::course_card(cx, &root, pack, index, resume, profile) {
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
                match Self::collection_card(cx, group, profile) {
                    Ok((widget, spacer)) => {
                        self.collection_cards.push((group.id.clone(), widget.clone()));
                        cards.push((widget, spacer));
                    }
                    Err(e) => self.set_status(cx, &e),
                }
            }
        }
        let gap = if cfg!(target_os = "android") { profile.gap } else { gap };
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
    /// Slider models for the board's world control panels (web
    /// variableControlModels: slider-controlled variables only).
    fn control_models(&self) -> Vec<controls_view::ControlModel> {
        let Some(session) = &self.player else { return vec![] };
        let p = &session.board;
        let animating = p
            .animation_state()
            .and_then(|a| a["variable"].as_str().map(str::to_owned));
        p.variable_declarations()
            .iter()
            .filter(|d| d["control"]["kind"] == "slider")
            .filter_map(|d| {
                let alias = d["as"].as_str()?.to_owned();
                let min = d["min"].as_f64().unwrap_or(0.);
                let max = d["max"].as_f64().unwrap_or(1.);
                let initial = d["initial"].as_f64().unwrap_or(min);
                Some(controls_view::ControlModel {
                    label: d["label"].as_str().unwrap_or(&alias).to_owned(),
                    value: p.variables.get(&alias).copied().unwrap_or(initial),
                    min,
                    max,
                    step: d["control"]["step"].as_f64().unwrap_or((max - min) / 100.),
                    unit: d["unit"].as_str().unwrap_or("").to_owned(),
                    initial,
                    animating: animating.as_deref() == Some(alias.as_str()),
                    alias,
                })
            })
            .collect()
    }
    /// Web handleStudentVariableInput for the world control panels: apply
    /// the value; a commit snaps a pointer drag to the active task target
    /// and evaluates the task.
    fn control_request(&mut self, cx: &mut Cx, request: spatial_board::ControlRequest) {
        let Some(session) = &self.player else { return };
        if session.practice_transition() {
            return;
        }
        let mut value = request.value;
        if request.commit && request.snap_distance > 0. {
            if let Some(d) = session.board.variable_declarations().iter().find(|d| d["as"] == request.alias.as_str()) {
                let (min, max) = (d["min"].as_f64().unwrap_or(0.), d["max"].as_f64().unwrap_or(1.));
                let distance = request.snap_distance;
                value = session.practice.snap(
                    session.complete(),
                    &request.alias,
                    request.control,
                    value,
                    distance,
                    &session.board.variables,
                    (min, max, d["control"]["step"].as_f64()),
                );
            }
        }
        self.set_variable(cx, &request.alias, value);
        if request.commit {
            if let Some(session) = &mut self.player {
                match session.commit_student_variable(&request.alias, request.control) {
                    Ok(true) => self.save_progress(cx),
                    Ok(false) => {}
                    Err(e) => self.error = e,
                }
            }
            self.refresh(cx);
        }
    }
    /// Web expand: the 大图 dialog with the same explorer state, sized like
    /// the web (plot ≤1000×520, geometry ≤900×700 viewBox).
    fn open_enlarged(&mut self, cx: &mut Cx, id: String) {
        self.enlarged = Some(id);
        self.ui.widget(cx, ids!(enlarge_dialog)).set_visible(cx, true);
        if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            b.set_input_blocked(true);
        }
        self.sync_enlarged(cx, true);
    }
    fn sync_enlarged(&mut self, cx: &mut Cx, reset_state: bool) {
        let Some(id) = self.enlarged.clone() else { return };
        let Some((node, state)) = self
            .ui
            .widget(cx, ids!(spatial))
            .borrow::<spatial_board::SpatialBoard>()
            .and_then(|b| b.explorer(&id))
        else {
            return;
        };
        let variables = self.player.as_ref().map(|s| s.board.variables.clone()).unwrap_or_default();
        let plot = node["kind"] == "plot";
        let board_rect = self.ui.widget(cx, ids!(spatial)).area().rect(cx);
        let board = board_rect.size;
        let win = dvec2(board.x.max(1100.), board.y.max(700.));
        // Center the 1100-wide card (web: fixed, translate(-50%, -50%)).
        let (vw, vh) = if plot {
            ((win.x - 80.).clamp(360., 1000.), (win.y - 220.).clamp(260., 520.))
        } else {
            ((win.x - 80.).clamp(400., 900.), (win.y - 210.).clamp(360., 700.))
        };
        let card_h = 40. + 28. + 37. + 24. + 30. + vh * (1036. / vw) + if plot { 70. } else { 40. };
        let pos = dvec2(
            board_rect.pos.x + ((board.x - 1100.) / 2.).max(0.),
            board_rect.pos.y + ((board.y - card_h) / 2.).max(8.),
        );
        self.ui.view(cx, ids!(enlarge_card)).set_walk(cx, Walk {
            abs_pos: Some(pos),
            width: Size::Fixed(1100.),
            height: Size::fit(),
            ..Default::default()
        });
        let title = node["content"]["title"].as_str().unwrap_or(if plot { "函数图" } else { "几何图" }).to_owned();
        self.ui.label(cx, ids!(enlarge_title)).set_text(cx, &title);
        self.ui.widget(cx, ids!(enlarge_plot_box)).set_visible(cx, plot);
        self.ui.widget(cx, ids!(enlarge_geometry_box)).set_visible(cx, !plot);
        if plot {
            if let Some(mut v) = self.ui.widget(cx, ids!(enlarge_plot)).borrow_mut::<octos_oll_preview::plot_view::PlotView>() {
                v.large = Some((vw, vh));
                let current = if reset_state { state } else { v.state.clone() };
                v.set_node(cx, &node, &variables, &current);
            }
        } else if let Some(mut v) = self.ui.widget(cx, ids!(enlarge_geometry)).borrow_mut::<octos_oll_preview::geometry_view::GeometryView>() {
            v.large = Some((vw, vh));
            let current = if reset_state { state } else { v.state.clone() };
            v.set_node(cx, &node, &current);
        }
        self.ui.redraw(cx);
    }
    fn close_enlarged(&mut self, cx: &mut Cx) {
        let Some(id) = self.enlarged.take() else { return };
        let state = self
            .ui
            .widget(cx, ids!(enlarge_plot))
            .borrow::<octos_oll_preview::plot_view::PlotView>()
            .filter(|_| self.ui.widget(cx, ids!(enlarge_plot_box)).visible())
            .map(|v| v.state.clone())
            .or_else(|| {
                self.ui
                    .widget(cx, ids!(enlarge_geometry))
                    .borrow::<octos_oll_preview::geometry_view::GeometryView>()
                    .map(|v| v.state.clone())
            });
        if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            b.set_input_blocked(false);
            if let Some(state) = state {
                b.set_explorer_state(cx, &id, state);
            }
        }
        self.ui.widget(cx, ids!(enlarge_dialog)).set_visible(cx, false);
        self.ui.redraw(cx);
    }
    /// Rebuild the outline panel (web OllCourseOutline) for the current
    /// lesson position; cheap no-op when nothing changed.
    fn rebuild_outline(&mut self, cx: &mut Cx) {
        self.ui.widget(cx, ids!(outline_panel)).set_visible(cx, self.outline_open);
        let Some(session) = self.player.as_ref().filter(|_| self.outline_open) else {
            self.outline_signature.clear();
            return;
        };
        let outline = session.outline();
        let (step_now, beat_now) = session.current_ids();
        let cursor = session.cursor;
        let signature = format!("{cursor}|{step_now:?}|{beat_now:?}|{:?}", self.outline_expanded);
        if signature == self.outline_signature {
            return;
        }
        self.outline_signature = signature;
        self.ui.label(cx, ids!(outline_count)).set_text(cx, &format!("{} 个步骤", outline.len()));
        self.outline_buttons.clear();
        let mut rows = Vec::new();
        let state = |id: &str, end: usize, current: &Option<String>| {
            if current.as_deref() == Some(id) {
                "current"
            } else if cursor >= end {
                "completed"
            } else {
                "upcoming"
            }
        };
        // Topic header (packaged courses have one topic: the lesson).
        let topic = board_view::widget(cx, &format!(
            "View{{width:Fill height:Fit flow:Right spacing:9 align:Align{{y:1.}} padding:Inset{{left:11 right:11 top:10 bottom:7}}
                Label{{width:Fit padding:0 text:\"01\" draw_text.text_style: theme.font_bold{{font_size:7.5}} draw_text.color:#99a6a3}}
                Label{{width:Fill padding:0 max_lines:1 text:\"{}\" draw_text.text_overflow:TextOverflow.Ellipsis draw_text.text_style: theme.font_bold{{font_size:9}} draw_text.color:#6d6255}}}}",
            session.board.title.replace(['"', '\\'], " ")
        ));
        if let Ok(t) = topic {
            rows.push(t);
        }
        for (index, step) in outline.iter().enumerate() {
            let st = state(&step.id, step.end_cursor, &step_now);
            let (circle_bg, circle_border, circle_text) = match st {
                "current" => ("#17829a", "#17829a", "#ffffff"),
                "completed" => ("#deefeab8", "#47857c5c", "#4d847d"),
                _ => ("#0000", "#c9c2b8", "#8e8478"),
            };
            let status = if st == "completed" { "✓".to_owned() } else { (index + 1).to_string() };
            let expanded = self.outline_expanded.contains(&step.id);
            let row_bg = if st == "current" { "#e0f2f1d4" } else { "#0000" };
            let code = format!(
                "RoundedView{{width:Fill height:Fit flow:Down margin:Inset{{top:3}} draw_bg +: {{color:{row_bg} border_radius:6.5}}
                    View{{width:Fill height:Fit flow:Overlay
                        View{{width:3 height:43 show_bg:true draw_bg.color:{}}}
                        View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}} padding:Inset{{left:5 right:5 top:3 bottom:3}}
                            main := Button{{width:Fill height:37 text:\"\" padding:0 margin:0 draw_bg +: {{color:#0000 color_hover:#0000 color_down:#0000 border_size:0 border_color:#0000}}
                                flow:Overlay}}
                            expand := Button{{width:28 height:28 text:\"\" padding:0 margin:0 icon_walk:Walk{{width:12 height:12}} draw_icon +: {{color:#948a7e}} draw_bg +: {{color:#0000 color_hover:#13708917 border_radius:4 border_size:0 border_color:#0000}}}}{}
                            play := Button{{width:28 height:28 text:\"▶\" padding:0 margin:0 draw_text.text_style.font_size:7.5 draw_text.color:#2e2a25 draw_bg +: {{color:#0000 color_hover:#13708917 border_radius:4 border_size:0 border_color:#0000}}}}
                        }}
                        View{{width:Fill height:43 flow:Right spacing:10 align:Align{{y:0.5}} padding:Inset{{left:11 right:66}}
                            RoundedView{{width:20 height:20 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:{circle_bg} border_radius:5 border_size:0.5 border_color:{circle_border}}}
                                Label{{width:Fit padding:0 text:\"{status}\" draw_text.text_style.font_size:7.5 draw_text.color:{circle_text}}}}}
                            Label{{width:Fill padding:0 max_lines:1 text:\"{}\" draw_text.text_overflow:TextOverflow.Ellipsis draw_text.text_style: theme.font_bold{{font_size:9}} draw_text.color:#3f3932}}
                        }}
                    }}
                    beats := View{{width:Fill height:Fit flow:Down margin:Inset{{left:39 right:7 bottom:{}}}}}
                }}",
                if st == "current" { "#17829a" } else { "#0000" },
                "",
                step.title.replace(['"', '\\'], " "),
                // Web .oll-course-beats (margin-bottom 7) exists only when expanded.
                if expanded { 7 } else { 0 }
            );
            let Ok(row) = board_view::widget(cx, &code) else { continue };
            if let Some(mut b) = row.widget(cx, ids!(expand)).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(if expanded { ICON_CHEVRON_DOWN } else { ICON_CHEVRON_RIGHT });
            }
            self.outline_buttons.push((row.widget(cx, ids!(main)), OutlineAction::ViewStep(step.id.clone())));
            self.outline_buttons.push((row.widget(cx, ids!(expand)), OutlineAction::Toggle(step.id.clone())));
            self.outline_buttons.push((row.widget(cx, ids!(play)), OutlineAction::PlayStep(step.id.clone())));
            if expanded {
                let mut beats = Vec::new();
                for (bi, beat) in step.beats.iter().enumerate() {
                    let bs = state(&beat.id, beat.end_cursor, &beat_now);
                    let code = format!(
                        "RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:{} border_radius:4.5}}
                            View{{width:Fill height:Fit flow:Right spacing:5 padding:Inset{{left:16 right:29 top:6 bottom:6}}
                                Label{{width:18 padding:0 text:\"{}\" draw_text.text_style.font_size:7.5 draw_text.color:#a49a8d}}
                                Label{{width:Fill padding:0 max_lines:2 text:\"{}\" draw_text.wrap:Words draw_text.text_overflow:TextOverflow.Ellipsis draw_text.text_style.font_size:7.5 draw_text.color:#71685d}}
                            }}
                            View{{width:Fill height:Fill flow:Right align:Align{{y:0.5}}
                                main := Button{{width:Fill height:Fill text:\"\" padding:0 margin:0 draw_bg +: {{color:#0000 color_hover:#0000 color_down:#0000 border_size:0 border_color:#0000}}}}
                                play := Button{{width:25 height:25 text:\"▶\" padding:0 margin:0 draw_text.text_style.font_size:6 draw_text.color:#948a7e draw_bg +: {{color:#0000 color_hover:#13708917 border_radius:4 border_size:0 border_color:#0000}}}}
                            }}
                        }}",
                        if bs == "current" { "#ffffffad" } else { "#0000" },
                        bi + 1,
                        beat.title.replace(['"', '\\'], " ")
                    );
                    if let Ok(b) = board_view::widget(cx, &code) {
                        self.outline_buttons.push((b.widget(cx, ids!(main)), OutlineAction::ViewBeat(beat.id.clone())));
                        self.outline_buttons.push((b.widget(cx, ids!(play)), OutlineAction::PlayBeat(beat.id.clone())));
                        beats.push(b);
                    }
                }
                let _ = board_view::children(cx, &row.widget(cx, ids!(beats)), beats);
            }
            rows.push(row);
        }
        let list = self.ui.widget(cx, ids!(outline_list));
        let _ = board_view::children(cx, &list, rows);
        self.ui.redraw(cx);
    }
    /// Web viewStep / playStep / viewBeat / playBeat: seek to the end (view,
    /// paused) or the start (play) of a step or Beat; the camera shows its
    /// focus targets.
    fn outline_action(&mut self, cx: &mut Cx, action: OutlineAction) {
        if let OutlineAction::Toggle(id) = &action {
            if !self.outline_expanded.remove(id) {
                self.outline_expanded.insert(id.clone());
            }
            self.rebuild_outline(cx);
            return;
        }
        let Some(session) = self.player.as_mut() else { return };
        let outline = session.outline();
        let step = |id: &str| outline.iter().find(|s| s.id == id);
        let beat = |id: &str| outline.iter().flat_map(|s| &s.beats).find(|b| b.id == id);
        let (cursor, focus, play) = match &action {
            OutlineAction::ViewStep(id) => step(id).map(|s| (s.end_cursor, s.focus_targets.clone(), false)),
            OutlineAction::PlayStep(id) => step(id).map(|s| (s.start_cursor, s.focus_targets.clone(), true)),
            OutlineAction::ViewBeat(id) => beat(id).map(|b| (b.end_cursor, b.focus_targets.clone(), false)),
            OutlineAction::PlayBeat(id) => beat(id).map(|b| (b.start_cursor, b.focus_targets.clone(), true)),
            OutlineAction::Toggle(_) => None,
        }
        .unwrap_or((session.cursor, vec![], false));
        self.awaiting_restore = false;
        if let Err(e) = session.seek(cursor, focus.clone()) {
            self.error = e;
        }
        if let Some(mut board) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
            board.focus_after_update(focus);
        }
        if play {
            self.lesson_released = false;
            if let Err(e) = session.play() {
                self.error = e;
            }
        }
        self.outline_open = false;
        self.rebuild_outline(cx);
        self.stop_narration_audio(cx);
        self.save_progress(cx);
        self.refresh(cx);
    }
    fn stop_narration_audio(&mut self, cx: &mut Cx) {
        if let Some((_, id, ..)) = self.audio_now.take() {
            self.audio_players.stop(cx, id);
        }
    }
    /// Play the recorded clip of the narration being spoken (web packaged
    /// narration audio): start it at the current narration position, pause
    /// and resume it with the lesson, stop it when the narration ends.
    fn sync_narration_audio(&mut self, cx: &mut Cx) {
        let desired = self.player.as_ref().and_then(|s| {
            if !s.playing || self.narration_muted || !self.learning_visible {
                return None;
            }
            let (beat, ms) = s.narration_position()?;
            self.narration_audio.contains_key(beat).then(|| (beat.to_owned(), ms))
        });
        let paused_same = self.player.as_ref().and_then(|s| s.narration_position()).map(|(b, _)| b.to_owned());
        match (&mut self.audio_now, desired) {
            (Some((beat, id, playing, _)), Some((want, _))) if *beat == want => {
                if !*playing {
                    self.audio_players.resume(cx, *id);
                    *playing = true;
                }
            }
            (Some((beat, id, playing, _)), None) if paused_same.as_deref() == Some(beat.as_str()) && !self.narration_muted => {
                // Paused mid-narration: keep the clip at its position.
                if *playing {
                    self.audio_players.pause(cx, *id);
                    *playing = false;
                }
            }
            (_, desired) => {
                self.stop_narration_audio(cx);
                if let Some((beat, ms)) = desired {
                    let path = self.narration_audio[&beat].to_string_lossy().to_string();
                    let id = LiveId::from_str(&format!("narration:{beat}:{}", self.audio_epoch()));
                    let seek = (ms > 250.).then_some(ms as u64);
                    match self.audio_players.prepare(cx, id, &path, seek) {
                        Ok(()) => self.audio_now = Some((beat, id, true, seek)),
                        Err(e) => self.error = e,
                    }
                }
            }
        }
    }
    fn audio_epoch(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64)
    }
    fn set_variable(&mut self, cx: &mut Cx, alias: &str, value: f64) {
        if self.player.as_ref().is_some_and(|s| s.board.animating()) {
            // Teacher demo in progress: sliders stay locked (web parity).
            return;
        }
        if let Some(session) = &mut self.player {
            if let Err(e) = session.board.set_variable(alias, value) {
                self.error = e;
            }
        }
        self.refresh(cx);
    }
    /// Web learningBoardInsets (desktop): fixed bands plus the rectangles of
    /// the floating UI marked as board occlusions, viewport-local.
    fn board_insets(&self, cx: &mut Cx) -> oll_runtime::camera::Insets {
        let board = self.ui.widget(cx, ids!(spatial)).area().rect(cx);
        let compact = board.size.x <= 900.;
        let mut occlusions = Vec::new();
        for id in [
            live_id!(topbar),
            live_id!(back),
            live_id!(settings),
            live_id!(ink_toolbar),
            live_id!(input_dock),
            live_id!(teacher_avatar),
        ] {
            let w = self.ui.widget(cx, &[id]);
            if !w.visible() {
                continue;
            }
            let r = w.area().rect(cx);
            let left = r.pos.x.max(board.pos.x);
            let top = r.pos.y.max(board.pos.y);
            let right = (r.pos.x + r.size.x).min(board.pos.x + board.size.x);
            let bottom = (r.pos.y + r.size.y).min(board.pos.y + board.size.y);
            if right > left && bottom > top {
                occlusions.push(oll_runtime::spatial::Rect {
                    x: left - board.pos.x,
                    y: top - board.pos.y,
                    width: right - left,
                    height: bottom - top,
                });
            }
        }
        // Desktop keeps modest bands as floors; chrome along the top edge and
        // the dock across the bottom middle widen them (web boardChromeInsets).
        let (top, bottom, occlusions) = board_chrome_insets(board.size.x, board.size.y, occlusions);
        if cfg!(target_os = "android") {
            return oll_runtime::camera::Insets {
                top: top.round(), bottom: bottom.round(), left: 8., right: 8.,
                focus_margin: None, occlusions,
            };
        }
        oll_runtime::camera::Insets {
            top: top.max(if compact { 78. } else { 92. }).round(),
            right: if compact { 18. } else { 28. },
            bottom: bottom.max(if compact { 180. } else { 120. }).round(),
            left: if compact { 18. } else { 28. },
            focus_margin: None,
            occlusions,
        }
    }
    fn refresh(&mut self, cx: &mut Cx) {
        if self.enlarged.is_some() {
            // Variables may change while the dialog is open (sliders, animation).
            self.sync_enlarged(cx, false);
        }
        if self.outline_open {
            self.rebuild_outline(cx);
        }
        if let Some(session) = &self.player {
            let p = &session.board;
            self.ui.label(cx, ids!(course_title)).set_text(cx, &p.title);
            // Web teacherStateLabel: the lesson owns the narration unless the
            // learner paused it (lessonOwnsNarration in live mode); once
            // delivery settles the course is complete.
            let state = if session.complete() {
                "课程完成"
            } else if session.playing || !self.lesson_released {
                "课程播放中"
            } else {
                "继续播放"
            };
            for id in [live_id!(play), live_id!(next_beat)] {
                self.ui.button(cx, &[id]).set_enabled(cx, !session.complete());
                // Web .learning-demo-controls > button:disabled { opacity: .28 }.
                if let Some(mut b) = self.ui.widget(cx, &[id]).borrow_mut::<Button>() {
                    let opacity = if session.complete() { 0.28 } else { 1. };
                    if b.draw_icon.opacity != opacity {
                        b.draw_icon.opacity = opacity;
                        b.redraw(cx);
                    }
                }
            }
            if self.play_icon_state != Some(session.playing) {
                self.play_icon_state = Some(session.playing);
                let w = self.ui.widget(cx, ids!(play));
                if let Some(mut b) = w.borrow_mut::<Button>() {
                    b.draw_icon
                        .load_from_str(if session.playing { ICON_PAUSE } else { ICON_PLAY });
                };
            }
            self.ui.label(cx, ids!(teacher_state)).set_text(cx, state);
            // Web teacherSpeech: the current narration (none while a practice
            // start transition runs); after the lesson a short completion
            // prompt for LESSON_COMPLETION_BUBBLE_DURATION_MS.
            if !session.complete() {
                self.completed_at = None;
            } else if self.completed_at.is_none() {
                self.completed_at = Some(Instant::now());
            }
            let completion_prompt = self.completed_at.is_some_and(|t| t.elapsed().as_secs_f64() < 6.);
            let bubble: &str = if session.practice_transition() {
                ""
            } else if session.complete() {
                if completion_prompt { LESSON_COMPLETION_SPEECH } else { "" }
            } else {
                &p.narration
            };
            self.ui.label(cx, ids!(narration)).set_text(cx, bubble);
            self.ui
                .widget(cx, ids!(narration_bubble))
                .set_visible(cx, !bubble.is_empty());
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
            let controls = self.control_models();
            let w = self.ui.widget(cx, ids!(spatial));
            let boundary = session
                .cursor
                .checked_sub(1)
                .and_then(|i| session.operations.get(i))
                .is_some_and(|op| op["type"] == "beat.end" || op["type"] == "step.commit");
            let tasks: Vec<_> = session.tasks().into_iter().filter(|t| t.available).collect();
            if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                board.set_operation_boundary(boundary);
                board.set_latest_operation(session.cursor.checked_sub(1).and_then(|i| session.operations.get(i)));
                board.set_tasks(cx, session.practice.definitions(), tasks);
                board.set_controls(cx, controls);
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
            .set_text(cx, &match self.selection.as_ref().map(|s| s.selection.strokes.len()) {
                Some(n) => format!("{stroke_count} 项笔迹 · 已选 {n} · 已保存"),
                None => format!("{stroke_count} 项笔迹 · 已保存"),
            });
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
        cjk_fonts::install(vm);
        makepad_plot::script_mod(vm);
        controls_view::script_mod(vm);
        scene3d_view::script_mod(vm);
        octos_oll_preview::plot_view::script_mod(vm);
        octos_oll_preview::geometry_view::script_mod(vm);
        octos_oll_preview::diagram_view::script_mod(vm);
        octos_oll_preview::selection_plot::script_mod(vm);
        octos_oll_preview::loading_fx::script_mod(vm);
        octos_oll_preview::group_view::script_mod(vm);
        svg_image::script_mod(vm);
        spatial_board::script_mod(vm);
        self::script_mod(vm)
    }
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        if !self.perf.enabled() {
            return self.handle_app_event(cx, event);
        }
        let t0 = Instant::now();
        self.handle_app_event(cx, event);
        self.perf.record(cx, event.name(), t0.elapsed());
    }
}

impl App {
    fn handle_app_event(&mut self, cx: &mut Cx, event: &Event) {
        if let Event::VideoPlaybackPrepared(e) = event {
            if std::env::var_os("OCTOS_AUDIO_DEBUG").is_some() {
                eprintln!("[audio] prepared {:?} duration {}ms", e.video_id, e.duration);
            }
            if let Some((_, id, _, seek)) = &mut self.audio_now {
                if *id == e.video_id {
                    if let Some(ms) = seek.take() {
                        cx.seek_video_playback(*id, ms);
                    }
                }
            }
        }
        if matches!(event, Event::Startup) {
            if let Err(e) = progress_store::Store::start(cx).map(|s| self.store = Some(s)) {
                self.error = e;
            }
            self.open_reflections = self
                .open_reflections_path()
                .and_then(|p| std::fs::read(p).ok())
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            self.pen_color = pen_vec4(PEN_COLORS[0]);
            self.pen_width = PEN_WIDTHS[1];
            self.last_tick = Some(Instant::now());
            self.timer = cx.start_interval(1.0 / 60.0);
            self.rebuild_launcher(cx);
            self.rebuild_ink_tools(cx);
            // Verification hook: OCTOS_LEARN_OPEN=<packId>[@<version>] opens a
            // course paused on startup (scripts drive playback from there).
            if let Ok(target) = std::env::var("OCTOS_LEARN_OPEN") {
                let (pack, version) = target.split_once('@').unwrap_or((target.as_str(), ""));
                let root = course_pack::pack_root();
                let version = if version.is_empty() {
                    course_pack::catalog(&root)
                        .ok()
                        .and_then(|packs| {
                            packs
                                .iter()
                                .find(|p| p["packId"] == pack)
                                .and_then(|p| p["version"].as_str().map(str::to_owned))
                        })
                        .unwrap_or_default()
                } else {
                    version.to_owned()
                };
                self.open_course(cx, pack, &version, false);
            }
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
            self.load_teacher_skin(cx);
            self.load_camera_settings();
        }
        self.poll_storage(cx);
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        let in_learning = self.player.is_some();
        if self.timer.is_event(event).is_some() && self.learning_visible {
            // Poll the ink selection a few times a second (web inkState).
            self.selection_poll = (self.selection_poll + 1) % 12;
            if self.selection_poll == 0 {
                self.sync_selection(cx);
            }
            self.handle_selection_card_requests(cx);
        }
        if let Event::VideoInputs(inputs) = event {
            self.camera.on_video_inputs(cx, inputs);
        }
        if let Event::PermissionResult(result) = event {
            if result.permission == makepad_widgets::makepad_platform::permission::Permission::Camera {
                self.camera.on_permission(result.status);
                if self.camera.active && self.camera.denied() {
                    self.toggle_camera(cx);
                    self.toast(cx, "摄像头权限被拒绝，请在系统设置 > 隐私与安全性 > 摄像头中允许 Octos Learn");
                }
            }
        }
        if self.timer.is_event(event).is_some() && self.camera.active {
            if let Some(frame) = self.camera.preview() {
                self.show_camera_frame(cx, false, frame);
                if self.camera_dialog_open {
                    self.camera_dialog_poll = (self.camera_dialog_poll + 1) % 3;
                    if self.camera_dialog_poll == 0 {
                        self.update_camera_dialog_image(cx);
                    }
                }
            }
        }
        if let Event::AudioDevices(devices) = event {
            self.audio_inputs = devices.default_input();
            if self.voice.enabled && std::env::var_os("OCTOS_VOICE_TEST_WAV").is_none() {
                cx.use_audio_inputs_with_options(&self.audio_inputs, AudioInputOptions { echo_cancellation: true });
            }
        }
        if self.timer.is_event(event).is_some() && self.voice.enabled {
            // Test hook (no microphone in automation): inject one utterance.
            static INJECTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
            if let Some(path) = std::env::var_os("OCTOS_VOICE_TEST_WAV") {
                if self.voice_turn.is_none()
                    && self.server.logged_in()
                    && self.live.as_ref().is_some_and(|l| l.questions.is_empty())
                    && !INJECTED.swap(true, std::sync::atomic::Ordering::Relaxed)
                {
                    if let Ok(wav) = std::fs::read(path) {
                        self.voice_utterance(cx, wav);
                    }
                }
            }
            let speaking = self.voice.state() == voice::VadState::Speaking;
            if let Some(wav) = self.voice.poll() {
                self.voice_utterance(cx, wav);
            }
            if speaking != (self.voice.state() == voice::VadState::Speaking) {
                self.sync_live(cx);
            }
        }
        if self.timer.is_event(event).is_some() && self.history_focus_pending {
            let search = self.ui.widget(cx, ids!(history_search));
            if !search.area().rect(cx).size.x.eq(&0.) {
                self.history_focus_pending = false;
                if let Some(mut input) = search.borrow_mut::<TextInput>() {
                    input.take_key_focus(cx);
                }
            }
        }
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
            // Camera transitions run whenever the lesson is on screen: 下一 Beat,
            // replies and slider changes move the camera while paused too.
            if self.learning_visible {
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.advance(cx, dt);
                };
            }
            if was_playing {
                if let Some(session) = &mut self.player {
                    if let Err(e) = session.tick(dt) {
                        self.error = e;
                    }
                }
            }
            // Narration voice follows the lesson (play / pause / next Beat).
            self.sync_narration_audio(cx);
            // After the lesson: practice start states animate into place.
            if self.learning_visible {
                let changed = match self.player.as_mut().filter(|s| s.complete()) {
                    Some(session) => match session.step_practice(dt) {
                        Ok(changed) => changed,
                        Err(e) => {
                            self.error = e;
                            false
                        }
                    },
                    None => false,
                };
                if changed {
                    if self.player.as_ref().is_some_and(|s| !s.practice_transition()) {
                        self.save_progress(cx);
                    }
                    self.refresh(cx);
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
            let ink_revision = self
                .ui
                .widget(cx, ids!(spatial))
                .borrow::<spatial_board::SpatialBoard>()
                .map(|b| b.ink_revision())
                .unwrap_or(0);
            let reflections = self
                .ui
                .widget(cx, ids!(spatial))
                .borrow::<spatial_board::SpatialBoard>()
                .map(|b| (b.open_reflections().0.clone(), b.open_reflections().1));
            if let Some((open, revision)) = reflections.filter(|(_, r)| *r != self.last_reflection_revision) {
                self.last_reflection_revision = revision;
                self.save_open_reflections(&open);
            }
            if ink_count != self.last_ink_count || ink_revision != self.last_ink_revision {
                self.last_ink_count = ink_count;
                // Handwriting is saved with the learning progress (web
                // oll.student-ink per learning instance).
                if ink_revision != self.last_ink_revision {
                    self.last_ink_revision = ink_revision;
                    self.save_progress(cx);
                }
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
                        self.lesson_released = true;
                    } else if let Err(e) = session.play() {
                        self.error = e;
                    } else {
                        self.lesson_released = false;
                    }
                }
                self.last_tick = Some(Instant::now());
            }
            if self.ui.button(cx, ids!(narration_toggle)).clicked(actions) {
                // Web: the toggle turns the narration voice off; the lesson no
                // longer waits for narration, the bubble still shows it.
                self.narration_muted = !self.narration_muted;
                let enabled = !self.narration_muted;
                if let Some(session) = &mut self.player {
                    session.set_narration_enabled(enabled);
                }
                self.sync_narration_audio(cx);
                self.refresh(cx);
            }
            // Web-identical controls whose backing feature is not migrated:
            // they stay clickable and explain themselves through the toast.
            if self.ui.button(cx, ids!(next_beat)).clicked(actions) {
                // Web advanceBeat: jump to the end of the current Beat, paused.
                self.awaiting_restore = false;
                self.lesson_released = false;
                if let Some(session) = &mut self.player {
                    if let Err(e) = session.advance_beat() {
                        self.error = e;
                    }
                }
                self.refresh(cx);
            }
            if self.ui.button(cx, ids!(replay_topic)).clicked(actions) {
                // Web restart: back to the start of the lesson and play.
                self.awaiting_restore = false;
                self.lesson_released = false;
                if let Some(session) = &mut self.player {
                    if let Err(e) = session.restart() {
                        self.error = e;
                    }
                }
                self.stop_narration_audio(cx);
                self.last_tick = Some(Instant::now());
                self.save_progress(cx);
                self.refresh(cx);
            }
            if self.ui.button(cx, ids!(start_interaction)).clicked(actions) {
                // Web startCourseInteraction: a new learning instance of the
                // pack replaces the preview board.
                let (pack, version) = (self.pack_id.clone(), self.pack_version.clone());
                self.skip_restore = true;
                self.open_course(cx, &pack, &version, true);
            }
            if self.ui.button(cx, ids!(voice)).clicked(actions)
                || self.ui.button(cx, ids!(ask_mic)).clicked(actions)
                || self.ui.button(cx, ids!(ask_mic_on)).clicked(actions)
            {
                self.toggle_voice(cx);
            }
            if self.ui.button(cx, ids!(camera)).clicked(actions)
                || self.ui.button(cx, ids!(ask_camera)).clicked(actions)
            {
                self.toggle_camera(cx);
            }
            if self.ui.button(cx, ids!(settings)).clicked(actions) {
                self.set_history_open(cx, true);
            }
            if self.history_open {
                if self.ui.button(cx, ids!(history_close)).clicked(actions) {
                    self.set_history_open(cx, false);
                }
                if self.ui.button(cx, ids!(history_new)).clicked(actions) {
                    self.set_history_open(cx, false);
                    self.open_live_board(cx);
                }
                if let Some(query) = self.ui.text_input(cx, ids!(history_search)).changed(actions) {
                    self.history_query = query;
                    self.rebuild_history(cx);
                }
            }
            self.setup_actions(cx, actions);
            self.settings_actions(cx, actions);
            self.camera_dialog_actions(cx, actions);
            if self.ui.button(cx, ids!(ask_send)).clicked(actions)
                || self.ui.text_input(cx, ids!(ask_input)).returned(actions).is_some()
            {
                self.submit_question(cx);
            }
            if self.ui.button(cx, ids!(ask_image)).clicked(actions) {
                self.pick_question_image(cx);
            }
            // Ink selection toolbar and 问小章鱼 panel.
            let chosen = self.selection_buttons.iter().find(|(w, _)| w.as_button().clicked(actions)).map(|(_, a)| a.clone());
            if let Some(action) = chosen {
                self.selection_action(cx, action);
            }
            if self.ui.button(cx, ids!(sel_ask)).clicked(actions) {
                if let Some(s) = self.selection.as_mut() {
                    s.panel_open = !s.panel_open;
                }
                self.rebuild_selection_ui(cx);
            }
            if self.ui.button(cx, ids!(sel_send)).clicked(actions) || self.ui.text_input(cx, ids!(sel_input)).returned(actions).is_some() {
                let text = self.ui.text_input(cx, ids!(sel_input)).text();
                self.ask_selection(cx, &text, "custom-question");
            }
            for action in actions.iter() {
                if let Some(picked) = action.downcast_ref::<FileDialogAction>() {
                    if picked.id() == live_id!(ask_image_pick) {
                        if let Some(path) = picked.path().cloned() {
                            self.ask_image(cx, &path);
                        }
                    }
                }
            }
            if self.ui.button(cx, ids!(outline_trigger)).clicked(actions) {
                self.outline_open = !self.outline_open;
                self.rebuild_outline(cx);
            }
            let chosen = self
                .outline_buttons
                .iter()
                .find(|(w, _)| w.as_button().clicked(actions))
                .map(|(_, a)| a.clone());
            if let Some(action) = chosen {
                self.outline_action(cx, action);
            }
            // Handwriting toolbar (dynamic buttons, INK_TOOLS order).
            let ink_clicked = |tool: usize, buttons: &[WidgetRef], actions: &Actions| {
                buttons.get(tool).is_some_and(|b| clicked(b, actions))
            };

            let tool = [
                (INK_TOOL_BROWSE, InkTool::Browse),
                (INK_TOOL_PEN, InkTool::Pen),
                (INK_TOOL_ERASE, InkTool::Erase),
                (INK_TOOL_SELECT, InkTool::Select),
                (INK_TOOL_SELECT_ALL, InkTool::Select),
            ]
            .into_iter()
            .find(|(i, _)| ink_clicked(*i, &self.ink_tool_buttons, actions));
            if let Some((index, tool)) = tool {
                self.ink_tool = tool;
                self.drawing = tool != InkTool::Browse;
                if self.drawing {
                    if let Some(session) = &mut self.player {
                        session.pause();
                    }
                    self.lesson_released = true;
                }
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.set_ink_tool(cx, tool);
                    board.set_pen(cx, self.pen_color, self.pen_width);
                    if index == INK_TOOL_SELECT_ALL {
                        board.select_all_ink(cx);
                    }
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
        // The completion prompt hides after 6s (web LESSON_COMPLETION_BUBBLE_DURATION_MS).
        let prompt_expired = self.timer.is_event(event).is_some()
            && self.completed_at.is_some_and(|t| (6.0..6.6).contains(&t.elapsed().as_secs_f64()));
        if (self.timer.is_event(event).is_some() && was_playing) || control_event || prompt_expired {
            self.refresh(cx);
        }
        // Web LearningHistory: a click on the overlay or Escape closes it.
        if self.history_open {
            let backdrop = self.ui.widget(cx, ids!(history_backdrop));
            let panel = self.ui.widget(cx, ids!(history_panel)).area().rect(cx);
            if let Event::MouseUp(e) = event {
                if !panel.contains(e.abs) && backdrop.area().rect(cx).contains(e.abs) {
                    self.set_history_open(cx, false);
                }
            }
            if let Event::KeyDown(k) = event {
                if k.key_code == KeyCode::Escape {
                    self.set_history_open(cx, false);
                }
            }
            let items = self.history_items.clone();
            let picked = items.into_iter().find(|(_, _, row)| tapped(cx, event, row));
            if let Some((pack, version, _)) = picked {
                self.set_history_open(cx, false);
                if let Some(session) = pack.strip_prefix("live:") {
                    if self.live.as_ref().is_none_or(|l| l.session_id != session) {
                        if let Some(p) = &mut self.player {
                            p.pause();
                        }
                        self.save_progress(cx);
                        self.open_live_record(cx, session);
                    }
                } else if pack != self.pack_id || version != self.pack_version {
                    if let Some(session) = &mut self.player {
                        session.pause();
                    }
                    self.save_progress(cx);
                    self.open_course(cx, &pack, &version, true);
                }
            }
        }
        // Web OllCourseOutline: a pointer down outside the panel closes it.
        if self.outline_open {
            if let Event::MouseDown(e) = event {
                let inside = |id: LiveId, ui: &WidgetRef, cx: &mut Cx| ui.widget(cx, &[id]).area().rect(cx).contains(e.abs);
                if !inside(live_id!(outline_panel), &self.ui, cx) && !inside(live_id!(outline_trigger), &self.ui, cx) {
                    self.outline_open = false;
                    self.rebuild_outline(cx);
                }
            }
        }
        self.handle_server(cx, event);
        // Launcher pills/cards are plain views: hit-test them before the UI
        // tree so the scroll view does not capture the finger first.
        if !self.learning_visible {
            self.handle_launcher_taps(cx, event);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
        if cfg!(target_os = "android") && !self.android_geometry_logged
            && matches!(event, Event::Draw(_)) && std::env::var_os("OCTOS_PERF").is_some()
        {
            android_ui::log_geometry(cx, &self.ui);
            self.android_geometry_logged = true;
        }
        if cfg!(target_os = "android")
            && matches!(event, Event::Startup | Event::WindowGeomChange(_) | Event::LiveEdit | Event::ScriptReapply)
        {
            let size = self.launcher_viewport(cx);
            if self.android_viewport != Some(size) || matches!(event, Event::Startup | Event::LiveEdit | Event::ScriptReapply) {
                if let Err(error) = android_ui::apply(cx, &self.ui, size) {
                    self.error = error;
                }
                self.android_viewport = Some(size);
                // Applying icon walks can invalidate the SVG document. Reload
                // it once after the profile, rather than on each timer tick.
                load_icons(&self.ui, cx);
                self.load_teacher_skin(cx);
                self.rebuild_launcher(cx);
                self.rebuild_ink_tools(cx);
            }
        }
        // World control panels (drawn and hit-tested by the board).
        let requests = self
            .ui
            .widget(cx, ids!(spatial))
            .borrow_mut::<spatial_board::SpatialBoard>()
            .map(|mut b| b.take_control_requests())
            .unwrap_or_default();
        for request in requests {
            self.control_request(cx, request);
        }
        let expand = self
            .ui
            .widget(cx, ids!(spatial))
            .borrow_mut::<spatial_board::SpatialBoard>()
            .map(|mut b| b.take_plot_expand())
            .unwrap_or_default();
        if let Some(id) = expand.into_iter().last() {
            self.open_enlarged(cx, id);
        }
        if let Event::Actions(actions) = event {
            if self.enlarged.is_some() && self.ui.button(cx, ids!(enlarge_close)).clicked(actions) {
                self.close_enlarged(cx);
            }
            let ok = self.ui.button(cx, ids!(confirm_ok)).clicked(actions);
            if ok || self.ui.button(cx, ids!(confirm_cancel)).clicked(actions) {
                self.ui.widget(cx, ids!(confirm_dialog)).set_visible(cx, false);
                if let (true, Some((restart, pack, version))) = (ok, self.pending_confirm.take()) {
                    if restart {
                        // Web: a fresh learning instance from the course's
                        // initial board (the saved record stays until replaced).
                        self.skip_restore = true;
                        self.open_course(cx, &pack, &version, true);
                    } else if let Some(store) = &self.store {
                        let _ = store.send(progress_store::Request::Delete(format!("{pack}@{version}")));
                    }
                }
                self.pending_confirm = None;
                self.ui.redraw(cx);
            }
        }
        let task_requests = self
            .ui
            .widget(cx, ids!(spatial))
            .borrow_mut::<spatial_board::SpatialBoard>()
            .map(|mut b| b.take_task_requests())
            .unwrap_or_default();
        for request in task_requests {
            if let Some(session) = &mut self.player {
                let result = match &request {
                    spatial_board::TaskRequest::Hint(id) => session.task_hint(id),
                    spatial_board::TaskRequest::Retry(id) => session.task_retry(id),
                };
                if let Err(e) = result {
                    self.toast(cx, &e);
                }
            }
            self.save_progress(cx);
            self.refresh(cx);
        }
        // Floating UI occludes the board: keep the teaching camera and the
        // composition clear of it (web learningBoardInsets).
        if self.learning_visible
            && (self.timer.is_event(event).is_some() || matches!(event, Event::WindowGeomChange(_)))
        {
            let insets = self.board_insets(cx);
            if let Some(mut b) = self.ui.widget(cx, ids!(spatial)).borrow_mut::<spatial_board::SpatialBoard>() {
                b.set_insets(cx, insets);
            }
        }
        if self.equalize_frame.is_event(event).is_some() {
            self.equalize_card_rows(cx);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn wav_duration_reads_pcm_headers() {
        // 16 kHz mono 16-bit, 32000 data bytes = 1000 ms.
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + 32000).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&16000u32.to_le_bytes());
        wav.extend_from_slice(&32000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&32000u32.to_le_bytes());
        wav.resize(wav.len() + 32000, 0);
        assert_eq!(super::wav_duration_ms(&wav), Some(1000.));
        assert_eq!(super::wav_duration_ms(b"ID3 not a wav file at all, mp3 bytes........"), None);
    }

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

/// octos-learn boardChromeInsets: chrome anchored to the top edge becomes the
/// top band, chrome across the middle of the bottom edge becomes the bottom
/// band, and the rest (e.g. the teacher avatar in a corner) stays an occlusion.
fn board_chrome_insets(
    width: f64,
    height: f64,
    chrome: Vec<oll_runtime::spatial::Rect>,
) -> (f64, f64, Vec<oll_runtime::spatial::Rect>) {
    let (mut top, mut bottom) = (0f64, 0f64);
    let mut occlusions = Vec::new();
    let (middle_left, middle_right) = (width * 0.3, width * 0.7);
    for r in chrome {
        let rect_bottom = r.y + r.height;
        if r.y <= height * 0.2 && rect_bottom <= height * 0.35 {
            top = top.max(rect_bottom);
            continue;
        }
        let spans_middle = r.x < middle_right && r.x + r.width > middle_left;
        if spans_middle && r.y >= height * 0.65 {
            bottom = bottom.max(height - r.y);
            continue;
        }
        occlusions.push(r);
    }
    (top, bottom, occlusions)
}

/// Web toLocaleString("zh-CN", {month: "short", day: "numeric", hour:
/// "2-digit", minute: "2-digit"}), e.g. "10月6日 11:05", in local time.
fn zh_month_day_time(at: std::time::SystemTime) -> String {
    #[repr(C)]
    struct Tm {
        sec: i32,
        min: i32,
        hour: i32,
        mday: i32,
        mon: i32,
        year: i32,
        wday: i32,
        yday: i32,
        isdst: i32,
        gmtoff: std::ffi::c_long,
        zone: *const std::ffi::c_char,
    }
    extern "C" {
        fn localtime_r(time: *const i64, out: *mut Tm) -> *mut Tm;
    }
    let secs = at.duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
    let mut tm = Tm { sec: 0, min: 0, hour: 0, mday: 1, mon: 0, year: 0, wday: 0, yday: 0, isdst: 0, gmtoff: 0, zone: std::ptr::null() };
    // SAFETY: localtime_r only writes the caller-owned Tm.
    if unsafe { localtime_r(&secs, &mut tm) }.is_null() {
        return String::new();
    }
    format!("{}月{}日 {:02}:{:02}", tm.mon + 1, tm.mday, tm.hour, tm.min)
}
