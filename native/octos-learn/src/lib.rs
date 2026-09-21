use makepad_widgets::*;
use oll_runtime::session::Session;
use octos_oll_preview::spatial_board;
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
                    width: Fill height: Fill
                    launcher := SolidView {
                        visible: true
                        width: Fill height: Fill
                        flow: Down spacing: 16 padding: 48
                        draw_bg +: { color: #1a1714 }
                        Label { text: "Octos Learn" draw_text.text_style.font_size: 28 draw_text.color: #f8f3ed }
                        Label { text: "从一节课开始，或者从一块空白白板开始。" draw_text.text_style.font_size: 17 draw_text.color: #e4ddd4 }
                        Label { text: "预制课程" draw_text.text_style.font_size: 13 draw_text.color: #a09689 }
                        View { width: Fill height: Fit flow: Right spacing: 24
                            open_rectangle := Button { text: "长方形的面积与周长" }
                            open_slope := Button { text: "一次函数 y = mx + b 的图像与性质" }
                        }
                        launcher_status := Label { text: "" draw_text.color: #a09689 draw_text.text_style.font_size: 11 }
                    }
                    learning := SolidView {
                        visible: false
                        width: Fill height: Fill
                        flow: Down
                        draw_bg +: { color: #f8f7f3 }
                        SolidView { width: Fill height: Fit flow: Right spacing: 12 padding: 10 align: Align{y: 0.5}
                            draw_bg +: { color: #fffdf8 }
                            back := Button { text: "首页" }
                            course_title := Label { width: Fill text: "" }
                            play := Button { text: "播放 / 暂停" }
                            restart := Button { text: "重新播放" }
                            ink_mode := Button { text: "书写 / 浏览" }
                            status := Label { text: "" draw_text.text_style.font_size: 11 }
                        }
                        spatial := SpatialBoard { width: Fill height: Fill }
                        narration := Label { width: Fill height: Fit padding: 12 draw_text.wrap: Words text: "" }
                    }
                }
            }
        }
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
    #[rust]
    drawing: bool,
    #[rust]
    timer: Timer,
    #[rust]
    last_tick: Option<Instant>,
    #[rust]
    error: String,
}

impl App {
    fn open_course(&mut self, cx: &mut Cx, pack_id: &str, version: &str) {
        self.error.clear();
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
                self.course_source = source;
                self.player = Some(session);
                self.show_learning(cx, true);
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
    fn refresh(&mut self, cx: &mut Cx) {
        if let Some(session) = &self.player {
            let p = &session.board;
            self.ui.label(cx, ids!(course_title)).set_text(cx, &p.title);
            self.ui.label(cx, ids!(narration)).set_text(cx, &p.narration);
            self.ui.label(cx, ids!(status)).set_text(
                cx,
                &format!(
                    "{} · 动作 {}/{}",
                    if session.complete() {
                        "播放完成"
                    } else if session.playing {
                        "播放中"
                    } else {
                        "已暂停"
                    },
                    p.cursor,
                    p.action_count()
                ),
            );
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
            self.last_tick = Some(Instant::now());
            self.timer = cx.start_interval(1.0 / 60.0);
        }
        if self.timer.is_event(event).is_some() {
            let now = Instant::now();
            let dt = self
                .last_tick
                .replace(now)
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            if let Some(session) = &mut self.player {
                if session.playing {
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.advance(cx, dt);
                    };
                    if let Err(e) = session.tick(dt) {
                        self.error = e;
                    }
                    self.refresh(cx);
                }
            }
        }
        if let Event::Actions(actions) = event {
            if self.ui.button(cx, ids!(open_rectangle)).clicked(actions) {
                self.open_course(cx, "rectangle-area-from-tiles", "0.1.5");
            }
            if self.ui.button(cx, ids!(open_slope)).clicked(actions) {
                self.open_course(cx, "slope-and-intercept", "0.1.6");
            }
            if self.ui.button(cx, ids!(back)).clicked(actions) {
                if let Some(session) = &mut self.player {
                    session.pause();
                }
                self.show_learning(cx, false);
                self.ui.redraw(cx);
            }
            if self.ui.button(cx, ids!(play)).clicked(actions) {
                if let Some(session) = &mut self.player {
                    if session.playing {
                        session.pause();
                    } else if let Err(e) = session.play() {
                        self.error = e;
                    }
                }
                self.last_tick = Some(Instant::now());
                self.refresh(cx);
            }
            if self.ui.button(cx, ids!(restart)).clicked(actions) {
                if self.player.is_some() {
                    let w = self.ui.widget(cx, ids!(spatial));
                    if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                        board.clear(cx);
                    };
                    match Session::load(&self.course_source) {
                        Ok(session) => self.player = Some(session),
                        Err(e) => self.error = e,
                    }
                }
                self.refresh(cx);
            }
            if self.ui.button(cx, ids!(ink_mode)).clicked(actions) {
                self.drawing = !self.drawing;
                if let Some(session) = &mut self.player {
                    session.pause();
                }
                let w = self.ui.widget(cx, ids!(spatial));
                if let Some(mut board) = w.borrow_mut::<spatial_board::SpatialBoard>() {
                    board.set_drawing(cx, self.drawing);
                };
                self.refresh(cx);
            }
        }
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}
