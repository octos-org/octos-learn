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
use std::collections::{BTreeMap, BTreeSet};
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
                                                draw_bg +: { color: #166a79 border_radius: 4.5 }
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
                                            padding: Inset{left: 20 right: 20} draw_bg +: { color: #166a79 border_radius: 7.5 }
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
                                draw_bg +: { color: #fffdf8d4 border_radius: 9 border_size: 0.5 border_color: #ece5d9 }
                                View { width: Fill height: Fit flow: Down spacing: 2
                                    // Web span 9px and strong 20px/650;
                                    // Label sizes are points (px * 0.75).
                                    Label { width: Fit height: Fit padding: 0 text: "OCTOS LEARNING CANVAS" draw_text.text_style.font_size: 6.75 draw_text.color: #8a8074 }
                                    course_title := Label { width: Fill height: Fit padding: 0 text: "" draw_text.text_style: theme.font_bold{font_size: 15} draw_text.color: #332e28 }
                                }
                                View { width: Fit height: Fit flow: Right spacing: 4 align: Align{y: 0.5}
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
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 12 top: 24}
                            View { width: 96 height: Fit flow: Right spacing: 8
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
                        View { width: Fill height: Fill flow: Down align: Align{x: 0. y: 0.} padding: Inset{left: 20 top: 88}
                            ink_toolbar := RoundedView {
                                width: Fit height: Fit flow: Right spacing: 3 padding: 5 align: Align{y: 0.5}
                                draw_bg +: { color: #fffdf8f0 border_radius: 8 border_size: 0.5 border_color: #e4ded3 }
                                // Buttons are built in Rust (rebuild_ink_tools) so the
                                // browse/pen active state can be highlighted per mode.
                                ink_tools := View { width: Fit height: Fit flow: Right spacing: 3 align: Align{y: 0.5} }
                                ink_status := Label { width: Fit padding: 0 text: "0 项笔迹 · 已保存" draw_text.text_style.font_size: 7.5 draw_text.color: #6e766f margin: Inset{left: 8 right: 8} }
                            }
                        }
                        // Variable controls live in the board world (web
                        // .learning-variable-controls.is-world), drawn by SpatialBoard.
                        // Course outline trigger (web .oll-course-outline-trigger:
                        // 48px rounded square above the teacher avatar).
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 47 bottom: 204}
                            outline_trigger := Button { width: 48 height: 48 text: "" icon_walk: Walk{width: 15 height: 15}
                                draw_icon +: { color: #466d78 }
                                draw_bg +: { color: #f0f9f8f0 color_hover: #e0f2f2 border_radius: 8 border_size: 0.5 border_color: #cfe2e3 } }
                        }
                        // Course outline panel (web .oll-course-outline-panel: 344 wide,
                        // above the trigger, right edge 24px from the window).
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 264}
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
                                    View { width: Fill height: Fit flow: Down padding: 12
                                        enlarge_plot_box := View { visible: false width: Fill height: Fit enlarge_plot := mod.widgets.PlotView {} }
                                        enlarge_geometry_box := View { visible: false width: Fill height: Fit enlarge_geometry := mod.widgets.GeometryView {} }
                                    }
                                }
                            }
                        }
                        // Teacher (web .octos-teacher: right 24 bottom 98).
                        View { width: Fill height: Fill flow: Right align: Align{x: 1. y: 1.} padding: Inset{right: 24 bottom: 98}
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
                                    View { width: Fill height: Fill align: Align{x: 0.5 y: 0.3}
                                        octos_art := Svg { width: 56 height: 56 } }
                                    View { width: Fill height: Fill flow: Down align: Align{x: 0.5 y: 1.} padding: Inset{bottom: 7}
                                        teacher_state := Label { width: Fit padding: 0 text: "继续播放" draw_text.text_style.font_size: 7.5 draw_text.color: #316979 }
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
                                // Web placeholder: 14px #938a7e, input padding 0 12px.
                                Label { width: Fill padding: 0 text: "问一个问题，或告诉 Octos 你卡在哪里…"
                                    draw_text.text_style.font_size: 10.5 draw_text.color: #938a7e margin: Inset{left: 12} }
                                ask_send := Button { width: 39 height: 39 text: "" icon_walk: Walk{width: 18 height: 18}
                                    draw_icon +: { color: #ffffff }
                                    draw_bg +: { color: #b3b0ab color_hover: #b3b0ab color_down: #b3b0ab border_radius: 6.5 border_size: 0 border_color: #0000 } }
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
                                    history_search_icon := Svg { width: 17 height: 17 draw_svg +: { preserve_viewbox: true } }
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
                                menu_restart_icon := Svg { width: 14 height: 14 draw_svg +: { preserve_viewbox: true } }
                                Label { width: Fit padding: 0 text: "重新开始" draw_text.text_style.font_size: 9.75 draw_text.color: #426568 }
                            }
                            menu_delete := RoundedView { width: Fill height: 36 flow: Right spacing: 6 align: Align{y: 0.5} padding: Inset{left: 10}
                                draw_bg +: { color: #0000 border_radius: 4 }
                                menu_delete_icon := Svg { width: 14 height: 14 draw_svg +: { preserve_viewbox: true } }
                                Label { width: Fit padding: 0 text: "删除学习记录" draw_text.text_style.font_size: 9.75 draw_text.color: #a84836 }
                            }
                        }
                    }
                    // Confirmation (web window.confirm).
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
const ICON_VOLUME_ON: &str = include_str!("../assets/icons/volume-2.svg");
const ICON_VOLUME_OFF: &str = include_str!("../assets/icons/volume-x.svg");

fn load_icons(ui: &WidgetRef, cx: &mut Cx) {
    let icons: [(LiveId, &str); 13] = [
        (live_id!(start_interaction), ICON_PLAY),
        (live_id!(next_beat), include_str!("../assets/icons/chevron-right.svg")),
        (live_id!(replay_topic), include_str!("../assets/icons/rotate-ccw.svg")),
        (live_id!(voice), include_str!("../assets/icons/mic-off.svg")),
        (live_id!(camera), include_str!("../assets/icons/camera-off.svg")),
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
        records.sort_by(|a, b| b.3.cmp(&a.3));
        let query = self.history_query.trim().to_lowercase();
        let current = (self.learning_visible && self.player.is_some()).then(|| (self.pack_id.clone(), self.pack_version.clone()));
        self.history_items.clear();
        let mut rows = Vec::new();
        for (pack, version, title, modified) in records.into_iter().filter(|r| r.2.to_lowercase().contains(&query)) {
            let is_current = current.as_ref().is_some_and(|(p, v)| *p == pack && *v == version);
            let meta = format!("{} · 课程学习{}", zh_month_day_time(modified), if is_current { " · 当前" } else { "" });
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
        self.drawing = false;
        self.lesson_released = false;
        self.narration_muted = false;
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
                let skip_restore = std::mem::take(&mut self.skip_restore) || self.course_preview;
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
        let more = if resume {
            "more := RoundedView{width:40 height:44 align:Align{x:0.5 y:0.5} margin:Inset{right:8} draw_bg +: {color:#0000 border_radius:4}
                more_icon := Svg{width:20 height:20 draw_svg +: {preserve_viewbox:true}}}"
        } else {
            ""
        };
        let code = format!(
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:9 border_size:0.5 border_color:#dbded9}}
                cover := View{{width:Fill height:201 flow:Overlay
                    cover_fallback := RoundedView{{width:Fill height:Fill align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#e4f2ee border_radius:8.5}}
                        fallback_char := Label{{text:\"{first_char}\" draw_text.text_style.font_size:40 draw_text.color:#166a79}}
                    }}
                    thumb := mod.widgets.SvgImage{{width:Fill height:Fill}}
                }}
                View{{width:Fill height:Fit flow:Down padding:Inset{{left:21 right:21 top:22 bottom:21}}
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
                            clock := Svg{{width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {minutes_label}
                        }}
                        {offline_label}
                    }}
                    SolidView{{width:Fill height:1 margin:Inset{{top:16}} draw_bg +: {{color:#e7e9e3}}}}
                    View{{width:Fill height:44 flow:Right align:Align{{y:0.5}} margin:Inset{{top:16}}
                        preview := RoundedView{{width:70 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#f0f3ee border_radius:4.5}}
                            eye := Svg{{width:14 height:14 draw_svg +: {{preserve_viewbox:true}}}}
                            {preview_label}
                        }}
                        View{{width:Fill height:1}}
                        {more}
                        start := RoundedView{{width:98 height:44 flow:Right spacing:6 align:Align{{x:0.5 y:0.5}} draw_bg +: {{color:#166a79 border_radius:4.5}}
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
            "RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:1 right:1 top:1 bottom:1}} draw_bg +: {{color:#fffef9 border_radius:10 border_size:0.5 border_color:#dbded9}}
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
            cx.cleanup_video_playback_resources(id);
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
                    cx.resume_video_playback(*id);
                    *playing = true;
                }
            }
            (Some((beat, id, playing, _)), None) if paused_same.as_deref() == Some(beat.as_str()) && !self.narration_muted => {
                // Paused mid-narration: keep the clip at its position.
                if *playing {
                    cx.pause_video_playback(*id);
                    *playing = false;
                }
            }
            (_, desired) => {
                self.stop_narration_audio(cx);
                if let Some((beat, ms)) = desired {
                    let path = self.narration_audio[&beat].to_string_lossy().to_string();
                    let id = LiveId::from_str(&format!("narration:{beat}:{}", self.audio_epoch()));
                    cx.prepare_audio_playback(id, makepad_widgets::makepad_platform::event::VideoSource::Filesystem(path), true, false);
                    let seek = (ms > 250.).then_some(ms as u64);
                    self.audio_now = Some((beat, id, true, seek));
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
            .set_text(cx, &format!("{stroke_count} 项笔迹 · 已保存"));
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
        controls_view::script_mod(vm);
        scene3d_view::script_mod(vm);
        octos_oll_preview::plot_view::script_mod(vm);
        octos_oll_preview::geometry_view::script_mod(vm);
        octos_oll_preview::group_view::script_mod(vm);
        svg_image::script_mod(vm);
        spatial_board::script_mod(vm);
        self::script_mod(vm)
    }
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
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
        }
        self.poll_storage(cx);
        let control_event = matches!(event, Event::Actions(_));
        let was_playing = self.player.as_ref().is_some_and(|s| s.playing);
        let in_learning = self.player.is_some();
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
                || self.ui.button(cx, ids!(camera)).clicked(actions)
            {
                self.toast(cx, "语音与摄像头尚未迁移，仅网页版可用");
            }
            if self.ui.button(cx, ids!(settings)).clicked(actions) {
                self.set_history_open(cx, true);
            }
            if self.history_open {
                if self.ui.button(cx, ids!(history_close)).clicked(actions) {
                    self.set_history_open(cx, false);
                }
                if self.ui.button(cx, ids!(history_new)).clicked(actions) {
                    self.toast(cx, "空白白板尚未迁移，仅网页版可用");
                }
                if let Some(query) = self.ui.text_input(cx, ids!(history_search)).changed(actions) {
                    self.history_query = query;
                    self.rebuild_history(cx);
                }
            }
            if self.ui.button(cx, ids!(ask_image)).clicked(actions)
                || self.ui.button(cx, ids!(ask_camera)).clicked(actions)
                || self.ui.button(cx, ids!(ask_mic)).clicked(actions)
                || self.ui.button(cx, ids!(ask_send)).clicked(actions)
            {
                self.toast(cx, "语音与提问尚未迁移，仅网页版可用");
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
                if pack != self.pack_id || version != self.pack_version {
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
        // Launcher pills/cards are plain views: hit-test them before the UI
        // tree so the scroll view does not capture the finger first.
        if !self.learning_visible {
            self.handle_launcher_taps(cx, event);
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
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
