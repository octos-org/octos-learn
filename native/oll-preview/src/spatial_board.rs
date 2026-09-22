use crate::board_view;
use makepad_plot::LinePlot;
use makepad_widgets::*;
use oll_runtime::ink::Ink;
use oll_runtime::{
    preview::Preview,
    spatial::{self, BoardLayout, Camera, Rect as WorldRect},
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.SpatialBoard = set_type_default() do #(SpatialBoard::register_widget(vm)) {
        width:Fill height:450
        draw_bg +: {color:#222831}
        draw_vector +: {draw_depth:0.0}
        draw_dots +: {draw_depth:0.0}
    }
}
#[derive(Script, ScriptHook, Widget)]
pub struct SpatialBoard {
    #[uid]
    uid: WidgetUid,
    #[source]
    source: ScriptObjectRef,
    #[walk]
    walk: Walk,
    #[redraw]
    #[live]
    draw_bg: DrawColor,
    #[live]
    draw_vector: DrawVector,
    #[live]
    draw_dots: DrawVector,
    /// Web learning board paper: fixed dot grid over the background color
    /// (learning-workspace board: #f8f5ed with #d7d1c5 dots, 24px grid).
    /// Off by default so the preview app's dark board is unaffected.
    #[live]
    dot_grid: bool,
    #[rust]
    routes: Vec<oll_runtime::connections::Route>,
    #[rust]
    badges: Vec<(WorldRect, WidgetRef)>,
    #[rust]
    ink: Ink,
    #[rust]
    pen_color: Vec4,
    #[rust]
    pen_width: f64,
    #[rust]
    stroke_styles: BTreeMap<u64, (Vec4, f64)>,
    #[rust]
    drawing: bool,
    #[rust]
    stroke_id: u64,
    #[rust]
    ink_to_ack: Vec<u64>,
    #[rust]
    ink_drawn: Vec<u64>,
    #[rust]
    ink_ack_frame: NextFrame,
    #[rust]
    ink_ack_pass: u8,
    #[rust]
    list: Option<DrawList2d>,
    #[rust]
    entries: Vec<(String, WorldRect, WidgetRef)>,
    #[rust]
    groups: Vec<(WorldRect, WidgetRef)>,
    #[rust]
    board: Option<Preview>,
    #[rust]
    geometry: BoardLayout,
    #[rust]
    signature: String,
    #[rust]
    pointer_target: Option<Value>,
    #[rust]
    last_action: usize,
    #[rust]
    last_focus: Vec<String>,
    #[rust]
    targets: Vec<String>,
    #[rust]
    camera: Camera,
    #[rust]
    from: Camera,
    #[rust]
    destination: Camera,
    #[rust]
    elapsed: f64,
    #[rust]
    manual: bool,
    #[rust]
    viewport: Rect,
    #[rust]
    left_inset: f64,
    #[rust]
    drag: Option<Camera>,
    #[rust]
    pending_focus: bool,
}
fn resolve_geometry(
    geometry: &BoardLayout,
    board: &Preview,
    id: &str,
    seen: &mut BTreeSet<String>,
) -> Option<WorldRect> {
    if !seen.insert(id.into()) {
        return None;
    }
    if let Some(r) = geometry.nodes.get(id).or(geometry.groups.get(id)) {
        return Some(*r);
    }
    let connection = board.connections.iter().find(|c| c["id"] == id)?;
    let mut rects = Vec::new();
    for end in ["from", "to"] {
        let t = &connection[end];
        let id = t["node_id"]
            .as_str()
            .or(t["group_id"].as_str())
            .or(t["connection_id"].as_str())?;
        rects.push(resolve_geometry(geometry, board, id, &mut seen.clone())?);
    }
    WorldRect::union(&rects, 0.)
}

impl SpatialBoard {
    /// Web default pen (#176b62, 3px). Ink strokes keep no color in the
    /// runtime; the board owns per-stroke style side state so undo/redo keep
    /// working by stroke id without touching oll-runtime.
    pub fn default_pen() -> (Vec4, f64) {
        (
            vec4(0x17 as f32 / 255., 0x6b as f32 / 255., 0x62 as f32 / 255., 1.),
            3.,
        )
    }
    pub fn pen(&self) -> (Vec4, f64) {
        if self.pen_width <= 0. {
            Self::default_pen()
        } else {
            (self.pen_color, self.pen_width)
        }
    }
    pub fn set_pen(&mut self, cx: &mut Cx, color: Vec4, width: f64) {
        self.pen_color = color;
        self.pen_width = width;
        self.redraw(cx);
    }
    pub fn ink_count(&self) -> usize {
        self.ink.strokes.len()
    }
    pub fn ink_batch(&mut self, cx: &mut Cx, batch: &Value) -> Result<(), String> {
        if let Some(id) = batch["pointerId"].as_u64() {
            let pen = self.pen();
            self.stroke_styles.entry(id).or_insert(pen);
        }
        if let Some(id) = self.ink.batch(
            batch,
            self.camera,
            (self.viewport.pos.x, self.viewport.pos.y),
        )? {
            self.ink_to_ack.push(id);
        }
        self.redraw(cx);
        Ok(())
    }
    pub fn set_left_inset(&mut self, inset: f64) {
        self.left_inset = inset.max(0.);
    }
    pub fn set_drawing(&mut self, cx: &mut Cx, enabled: bool) {
        self.drawing = enabled;
        self.ink.cancel();
        self.manual = true;
        self.drag = None;
        self.configure_ink(cx);
        self.redraw(cx);
    }
    fn configure_ink(&self, cx: &mut Cx) {
        #[cfg(target_os = "android")]
        {
            let ratio = cx.get_dpi_factor_of(&self.draw_bg.area());
            let v = self.viewport;
            cx.android_integration("oll.ink",&json!({"op":"configure","enabled":self.drawing,"ratio":ratio,"left":v.pos.x,"top":v.pos.y,"right":v.pos.x+v.size.x,"bottom":v.pos.y+v.size.y}).to_string());
        }
        #[cfg(not(target_os = "android"))]
        let _ = cx;
    }
    pub fn undo_ink(&mut self, cx: &mut Cx) {
        self.ink.undo();
        self.redraw(cx);
    }
    pub fn redo_ink(&mut self, cx: &mut Cx) {
        self.ink.redo();
        self.redraw(cx);
    }
    fn desktop_ink(&mut self, cx: &mut Cx, action: &str, position: Vec2d, time: f64) {
        let batch = json!({"action":action,"pointerId":self.stroke_id,"points":[{"x":position.x,"y":position.y,"time":time*1000.,"pressure":0.5}]});
        if let Err(e) = self.ink_batch(cx, &batch) {
            eprintln!("Ink: {e}");
            self.ink.cancel();
        }
    }
    pub fn clear(&mut self, cx: &mut Cx) {
        self.drawing = false;
        self.configure_ink(cx);
        self.ink = Default::default();
        self.stroke_styles.clear();
        self.ink_to_ack.clear();
        self.ink_drawn.clear();
        self.board = None;
        self.signature.clear();
        self.entries.clear();
        self.groups.clear();
        self.routes.clear();
        self.badges.clear();
        self.geometry = BoardLayout::default();
        self.targets.clear();
        self.pointer_target = None;
        self.last_action = 0;
        self.last_focus.clear();
        self.camera = Camera::default();
        self.from = self.camera;
        self.destination = self.camera;
        self.elapsed = 0.68;
        self.manual = false;
        self.drag = None;
        self.pending_focus = false;
        self.redraw(cx);
    }

    fn resolve(&self, id: &str, seen: &mut BTreeSet<String>) -> Option<WorldRect> {
        resolve_geometry(&self.geometry, self.board.as_ref()?, id, seen)
    }
    fn focus(&mut self, animate: bool) {
        let rects = self
            .targets
            .iter()
            .filter_map(|id| self.resolve(id, &mut BTreeSet::new()))
            .collect::<Vec<_>>();
        if rects.is_empty() {
            return;
        }
        let mode = if rects.len() > 1 {
            "relationship"
        } else if self
            .targets
            .iter()
            .any(|id| self.geometry.groups.contains_key(id))
        {
            "overview"
        } else {
            "detail"
        };
        let mut to = spatial::focus_camera(
            &rects,
            self.camera,
            self.viewport.size.x.max(300.),
            self.viewport.size.y.max(240.),
            mode,
        );
        // Keep the focused scene clear of the floating top bar: when the
        // scaled scene fits, nudge it into the safe band; when it is taller,
        // top-anchor it so the primary card is fully visible (the rest can be
        // dragged into view).
        if let Some(scene) = WorldRect::union(&rects, 0.) {
            let min_top = 108.;
            let min_bottom = (self.viewport.size.y - 24.).max(min_top + 1.);
            let top = to.y + scene.y * to.scale;
            let bottom = to.y + (scene.y + scene.height) * to.scale;
            if bottom - top <= min_bottom - min_top {
                to.y += (min_top - top).max(0.);
                let bottom = to.y + (scene.y + scene.height) * to.scale;
                to.y -= (bottom - min_bottom).max(0.);
            } else {
                to.y = min_top - scene.y * to.scale;
            }
            // Same treatment on the x axis when the host reserves a left band
            // for floating UI (e.g. the variable panel): keep the scene right
            // of the inset, left-anchoring when the scene is wider.
            let min_left = self.left_inset.min(self.viewport.size.x - 61.);
            if min_left > 0. {
                let min_right = (self.viewport.size.x - 24.).max(min_left + 1.);
                let left = to.x + scene.x * to.scale;
                let right = to.x + (scene.x + scene.width) * to.scale;
                if right - left <= min_right - min_left {
                    to.x += (min_left - left).max(0.);
                    let right = to.x + (scene.x + scene.width) * to.scale;
                    to.x -= (right - min_right).max(0.);
                } else {
                    to.x = min_left - scene.x * to.scale;
                }
            }
        }
        self.from = self.camera;
        self.destination = to;
        self.elapsed = if animate { 0. } else { 0.68 };
        if !animate {
            self.camera = to;
        }
    }
    pub fn set_state(
        &mut self,
        cx: &mut Cx,
        p: &Preview,
        action: Option<&Value>,
    ) -> Result<(), String> {
        let reset = self
            .board
            .as_ref()
            .is_none_or(|b| b.title != p.title || p.cursor < b.cursor);
        if reset {
            self.signature.clear();
            self.last_action = 0;
            self.last_focus.clear();
            self.targets.clear();
            self.camera = Camera::default();
            self.destination = self.camera;
            self.from = self.camera;
            self.elapsed = 0.68;
            self.manual = false;
        }
        let signature = json!([p.cursor, p.title, p.groups, p.focus]).to_string();
        let changed = signature != self.signature;
        self.pointer_target = action
            .filter(|a| a["op"] == "teacher.point")
            .map(|a| a["target"].clone());
        self.board = Some(p.clone());
        if changed {
            let sizes = p
                .nodes
                .iter()
                .map(|n| {
                    Ok((
                        n["id"].as_str().ok_or("节点没有 id")?.to_owned(),
                        board_view::measure(n)?,
                    ))
                })
                .collect::<Result<BTreeMap<_, _>, String>>()?;
            self.geometry = spatial::layout(p, &sizes)?;
            self.entries.clear();
            self.groups.clear();
            for node in &p.nodes {
                let id = node["id"].as_str().unwrap();
                let w = match node["kind"].as_str().unwrap_or("") {
                    "math" => board_view::math_node(cx, node)?,
                    "text" if node["content"]["fragments"].is_array() => {
                        board_view::text_node(cx, node)?
                    }
                    "plot" | "geometry" => board_view::chart_node(cx, node)?,
                    "note" | "diagram" => board_view::note_node(cx, node)?,
                    _ => {
                        let w=board_view::widget(cx,"RectView{width:Fill height:Fill flow:Down padding:14 draw_bg.color:#fffdf8 draw_bg.border_size:1 draw_bg.border_color:#e3d9cb}")?;
                        let label = board_view::label(cx, &board_view::node_notes(node))?;
                        board_view::children(cx, &w, vec![label])?;
                        w
                    }
                };
                self.entries.push((id.into(), self.geometry.nodes[id], w));
            }
            for group in &p.groups {
                let id = group["id"].as_str().unwrap();
                if let Some(rect) = self.geometry.groups.get(id) {
                    let w=board_view::widget(cx,"RectView{width:Fill height:Fill flow:Down padding:8 draw_bg.color:#0000 draw_bg.border_size:2 draw_bg.border_color:#a8bdd0}")?;
                    let title = board_view::label(cx, group["title"].as_str().unwrap_or(""))?;
                    board_view::children(cx, &w, vec![title])?;
                    self.groups.push((*rect, w));
                }
            }
            self.groups
                .sort_by(|a, b| (b.0.width * b.0.height).total_cmp(&(a.0.width * a.0.height)));
            self.routes.clear();
            self.badges.clear();
            let mut occupied_labels = self.geometry.nodes.values().copied().collect::<Vec<_>>();
            for connection in &p.connections {
                let resolve_target = |t: &Value| {
                    let id = t["node_id"]
                        .as_str()
                        .or(t["group_id"].as_str())
                        .or(t["connection_id"].as_str())?;
                    resolve_geometry(&self.geometry, p, id, &mut BTreeSet::new())
                };
                let from = resolve_target(&connection["from"]).ok_or("无法定位连线起点")?;
                let to = resolve_target(&connection["to"]).ok_or("无法定位连线终点")?;
                let obstacles = self
                    .geometry
                    .nodes
                    .iter()
                    .filter(|(id, _)| {
                        connection["from"]["node_id"] != id.as_str()
                            && connection["to"]["node_id"] != id.as_str()
                    })
                    .map(|(_, r)| *r)
                    .collect::<Vec<_>>();
                let label = connection["label"].as_str().unwrap_or("");
                let internal = connection["from"]["node_id"] == connection["to"]["node_id"]
                    && connection["from"]["fragment_id"].is_string()
                    && connection["to"]["fragment_id"].is_string();
                let route = oll_runtime::connections::route(
                    from,
                    to,
                    label,
                    internal,
                    &obstacles,
                    &mut occupied_labels,
                );
                if let Some(rect) = route.label {
                    let badge = board_view::widget(
                        cx,
                        "SolidView{width:Fill height:Fill padding:3 draw_bg.color:#fffdf8f0}",
                    )?;
                    let text = board_view::label(cx, label)?;
                    board_view::children(cx, &badge, vec![text])?;
                    self.badges.push((rect, badge));
                }
                self.routes.push(route);
            }
            self.signature = signature;
        }
        for (id, rect, w) in &self.entries {
            let Some(node) = p.nodes.iter().find(|n| n["id"] == id.as_str()) else {
                continue;
            };
            let kind = node["kind"].as_str().unwrap_or("");
            if kind != "plot" && kind != "geometry" {
                continue;
            }
            let plot_ref = w.widget(cx, ids!(plot));
            if let Some(mut plot) = plot_ref.borrow_mut::<LinePlot>() {
                // Card chrome owns the title/badge now; the plot area itself
                // stays untitled (web parity) and starts below the header.
                let plot_px = (
                    (rect.width - 68.).max(1.),
                    (rect.height - 112. - board_view::caption_extra(node)).max(1.),
                );
                plot.clear();
                crate::render(&mut plot, node, p, plot_px)?;
                plot.set_title("");
            }
            let caption = crate::chart_caption(node);
            w.label(cx, ids!(caption)).set_text(cx, &caption);
            w.widget(cx, ids!(caption_box))
                .set_visible(cx, !caption.is_empty());
        }
        let mut requested = Vec::new();
        if self.last_action != p.cursor {
            if let Some(a) = action {
                match a["op"].as_str().unwrap_or("") {
                    "board.focus" => {
                        requested = a["focus"]["targets"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(Value::as_str)
                            .map(str::to_owned)
                            .collect()
                    }
                    "board.connect" => {
                        if let Some(id) = a["connection"]["id"].as_str() {
                            requested.push(id.into());
                        }
                    }
                    "board.create" => {
                        if let Some(id) = a["node"]["id"].as_str() {
                            requested.push(id.into());
                        }
                    }
                    "board.revise" | "board.emphasize" | "teacher.point" => {
                        let t = &a["target"];
                        if let Some(id) = t["node_id"]
                            .as_str()
                            .or(t["group_id"].as_str())
                            .or(t["connection_id"].as_str())
                        {
                            requested.push(id.into());
                        }
                    }
                    "lesson.variable.animate" => {
                        requested = spatial::variable_targets(
                            p,
                            a["animation"]["variable"].as_str().unwrap_or(""),
                        );
                    }
                    _ => (),
                }
            }
        }
        if self.last_focus != p.focus && requested.is_empty() {
            requested = p.focus.clone();
        }
        self.last_action = p.cursor;
        self.last_focus = p.focus.clone();
        if !requested.is_empty() {
            self.targets = requested;
            if self.drag.is_some() {
                self.pending_focus = true;
            } else {
                self.manual = false;
                self.focus(true);
            }
        }
        self.redraw(cx);
        Ok(())
    }
    pub fn advance(&mut self, cx: &mut Cx, dt: f64) {
        if !self.manual && self.elapsed < 0.68 {
            self.elapsed = (self.elapsed + dt).min(0.68);
            self.camera = self.from.interpolate(self.destination, self.elapsed / 0.68);
            self.redraw(cx);
        }
    }
    pub fn overview(&mut self, cx: &mut Cx) {
        let rs = self
            .geometry
            .nodes
            .values()
            .chain(self.geometry.groups.values())
            .copied()
            .collect::<Vec<_>>();
        self.camera = spatial::focus_camera(
            &rs,
            self.camera,
            self.viewport.size.x,
            self.viewport.size.y,
            "course",
        );
        self.manual = true;
        self.redraw(cx);
    }
    pub fn follow(&mut self, cx: &mut Cx) {
        self.manual = false;
        self.focus(false);
        self.redraw(cx);
    }
    pub fn zoom(&mut self, cx: &mut Cx, factor: f64) {
        self.camera =
            self.camera
                .zoom_at(factor, self.viewport.size.x / 2., self.viewport.size.y / 2.);
        self.manual = true;
        self.redraw(cx);
    }
}
impl Widget for SpatialBoard {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event, _scope: &mut Scope) {
        if self.ink_ack_frame.is_event(event).is_some() {
            if self.ink_ack_pass == 0 {
                self.ink_ack_pass = 1;
                self.ink_ack_frame = cx.new_next_frame();
            } else {
                for id in self.ink_drawn.drain(..) {
                    #[cfg(target_os = "android")]
                    cx.android_integration(
                        "oll.ink",
                        &json!({"op":"displayed","pointerId":id}).to_string(),
                    );
                    #[cfg(not(target_os = "android"))]
                    let _ = id;
                }
            }
        }
        let hit = event.hits(cx, self.draw_bg.area());
        if self.drawing {
            match hit {
                Hit::FingerDown(e) => {
                    self.stroke_id += 1;
                    let pen = self.pen();
                    self.stroke_styles.insert(self.stroke_id, pen);
                    self.desktop_ink(cx, "down", e.abs, e.time);
                }
                Hit::FingerMove(e) => self.desktop_ink(cx, "move", e.abs, e.time),
                Hit::FingerUp(e) => self.desktop_ink(cx, "up", e.abs, e.time),
                _ => (),
            }
            return;
        }
        match hit {
            Hit::FingerDown(_) => {
                self.drag = Some(self.camera);
                self.manual = true;
                cx.set_cursor(MouseCursor::Grabbing);
            }
            Hit::FingerMove(e) => {
                if let Some(start) = self.drag {
                    let delta = e.abs - e.abs_start;
                    self.camera = Camera {
                        x: start.x + delta.x,
                        y: start.y + delta.y,
                        ..start
                    };
                    self.redraw(cx);
                }
            }
            Hit::FingerUp(_) => {
                self.drag = None;
                if self.pending_focus {
                    self.pending_focus = false;
                    self.manual = false;
                    self.focus(true);
                    self.redraw(cx);
                }
                cx.set_cursor(MouseCursor::Grab);
            }
            Hit::FingerScroll(e) => {
                let at = e.abs - self.viewport.pos;
                self.camera =
                    self.camera
                        .zoom_at(if e.scroll.y < 0. { 1.1 } else { 0.9 }, at.x, at.y);
                self.manual = true;
                self.redraw(cx);
            }
            _ => (),
        }
    }
    fn draw_walk(&mut self, cx: &mut Cx2d, scope: &mut Scope, walk: Walk) -> DrawStep {
        self.draw_bg.draw_walk(cx, walk);
        let viewport = self.draw_bg.area().rect(cx);
        if self.dot_grid {
            // Screen-anchored dot paper: 1px dots at 24px cell centers,
            // matching the web learning board background.
            self.draw_dots.begin();
            self.draw_dots.set_color_hex(0xd7d1c5, 1.0);
            let mut y = 12.0f32;
            while y < viewport.size.y as f32 {
                let mut x = 12.0f32;
                while x < viewport.size.x as f32 {
                    self.draw_dots.circle(x, y, 1.0);
                    x += 24.0;
                }
                y += 24.0;
            }
            self.draw_dots.fill();
            self.draw_dots.end(cx);
        }
        let viewport_changed = self.viewport != viewport;
        if self.viewport.size != viewport.size {
            self.viewport = viewport;
            if !self.manual {
                self.focus(false);
            }
        } else {
            self.viewport = viewport;
        }
        if viewport_changed {
            self.configure_ink(cx);
        }
        let mut list = self.list.take().unwrap_or_else(|| DrawList2d::new(cx));
        list.begin_always(cx);
        cx.begin_root_turtle(dvec2(131072., 131072.), Layout::flow_overlay());
        let (x, y) = self.camera.view_to_world(0., 0.);
        cx.push_clip_rect(rect(
            x,
            y,
            viewport.size.x / self.camera.scale,
            viewport.size.y / self.camera.scale,
        ));
        for (r, w) in self
            .groups
            .iter()
            .map(|(r, w)| (r, w))
            .chain(self.entries.iter().map(|(_, r, w)| (r, w)))
        {
            w.draw_walk_all(
                cx,
                scope,
                Walk {
                    abs_pos: Some(dvec2(r.x, r.y)),
                    width: Size::Fixed(r.width),
                    height: Size::Fixed(r.height),
                    ..Default::default()
                },
            );
        }
        self.draw_vector.begin();
        self.draw_vector.set_color(0.48, 0.74, 0.69, 1.);
        for route in &self.routes {
            if let Some(&(x, y)) = route.points.first() {
                self.draw_vector.move_to(x as f32, y as f32);
                for &(x, y) in route.points.iter().skip(1) {
                    self.draw_vector.line_to(x as f32, y as f32);
                }
                self.draw_vector.stroke(2.);
                if route.points.len() > 1 {
                    let end = route.points[route.points.len() - 1];
                    let before = route.points[route.points.len() - 2];
                    let angle = (end.1 - before.1).atan2(end.0 - before.0);
                    self.draw_vector.move_to(end.0 as f32, end.1 as f32);
                    for offset in [-0.48_f64, 0.48] {
                        self.draw_vector.line_to(
                            (end.0 - 10. * (angle + offset).cos()) as f32,
                            (end.1 - 10. * (angle + offset).sin()) as f32,
                        );
                    }
                    self.draw_vector.close();
                    self.draw_vector.fill();
                }
            }
        }
        if let Some(t) = self.pointer_target.as_ref() {
            if let Some(id) = t["node_id"]
                .as_str()
                .or(t["group_id"].as_str())
                .or(t["connection_id"].as_str())
            {
                if let Some(r) = self.resolve(id, &mut BTreeSet::new()) {
                    self.draw_vector.set_color(1., 0.79, 0.26, 1.);
                    let x = (r.x + r.width - 8.) as f32;
                    let y = (r.y - 18.) as f32;
                    self.draw_vector.move_to(x, y);
                    self.draw_vector.line_to(x + 20., y - 5.);
                    self.draw_vector.line_to(x + 5., y + 20.);
                    self.draw_vector.close();
                    self.draw_vector.fill();
                }
            }
        }
        for stroke in &self.ink.strokes {
            let (color, width) = self
                .stroke_styles
                .get(&stroke.id)
                .copied()
                .unwrap_or_else(|| Self::default_pen());
            self.draw_vector.set_color(color.x, color.y, color.z, color.w);
            if let Some(p) = stroke.points.first() {
                self.draw_vector.move_to(p.x as f32, p.y as f32);
                if stroke.points.len() == 1 {
                    self.draw_vector.line_to((p.x + 0.01) as f32, p.y as f32);
                }
                for p in stroke.points.iter().skip(1) {
                    self.draw_vector.line_to(p.x as f32, p.y as f32);
                }
                self.draw_vector.stroke((width / self.camera.scale) as f32);
            }
        }
        #[cfg(not(target_os = "android"))]
        if let Some(points) = self.ink.active_points() {
            let (color, width) = self.pen();
            self.draw_vector.set_color(color.x, color.y, color.z, color.w);
            if let Some(p) = points.first() {
                self.draw_vector.move_to(p.x as f32, p.y as f32);
                for p in points.iter().skip(1) {
                    self.draw_vector.line_to(p.x as f32, p.y as f32);
                }
                self.draw_vector.stroke((width / self.camera.scale) as f32);
            }
        }
        self.draw_vector.end(cx);
        if !self.ink_to_ack.is_empty() {
            self.ink_drawn.append(&mut self.ink_to_ack);
            self.ink_ack_pass = 0;
            self.ink_ack_frame = cx.new_next_frame();
        }
        for (r, w) in &self.badges {
            w.draw_walk_all(
                cx,
                scope,
                Walk {
                    abs_pos: Some(dvec2(r.x, r.y)),
                    width: Size::Fixed(r.width),
                    height: Size::Fixed(r.height),
                    ..Default::default()
                },
            );
        }
        cx.pop_clip_rect();
        cx.end_pass_sized_turtle();
        list.end(cx);
        let mut matrix = Mat4f::identity();
        matrix.v[0] = self.camera.scale as f32;
        matrix.v[5] = self.camera.scale as f32;
        matrix.v[12] = (viewport.pos.x + self.camera.x) as f32;
        matrix.v[13] = (viewport.pos.y + self.camera.y) as f32;
        list.set_view_transform(cx, &matrix);
        self.list = Some(list);
        DrawStep::done()
    }
    fn text(&self) -> String {
        let nodes = self
            .geometry
            .nodes
            .iter()
            .map(|(id, r)| json!({"id":id,"x":r.x,"y":r.y,"width":r.width,"height":r.height}))
            .collect::<Vec<_>>();
        json!({"camera":{"x":self.camera.x,"y":self.camera.y,"scale":self.camera.scale},"manual":self.manual,"targets":self.targets,"nodes":nodes,"ink":self.ink.snapshot(),"drawing":self.drawing,"groups":self.geometry.groups.len(),"connections":self.routes.len(),"connection_segments":self.routes.iter().map(|r|r.points.len().saturating_sub(1)).sum::<usize>(),"transition":!self.manual && self.elapsed<0.68,"viewport":{"x":self.viewport.pos.x,"y":self.viewport.pos.y,"width":self.viewport.size.x,"height":self.viewport.size.y}}).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn connection_focus_can_use_two_fragments_of_the_same_node_and_rejects_cycles() {
        let mut p = Preview::load(crate::QUADRATIC).unwrap();
        p.connections = vec![
            json!({"id":"cancel","from":{"node_id":"formula","fragment_id":"plus"},"to":{"node_id":"formula","fragment_id":"minus"}}),
            json!({"id":"cycle","from":{"connection_id":"cycle"},"to":{"node_id":"formula"}}),
        ];
        let rect = WorldRect {
            x: 10.,
            y: 20.,
            width: 300.,
            height: 100.,
        };
        let geometry = BoardLayout {
            nodes: BTreeMap::from([("formula".into(), rect)]),
            ..Default::default()
        };
        assert_eq!(
            resolve_geometry(&geometry, &p, "cancel", &mut BTreeSet::new()),
            Some(rect)
        );
        assert!(resolve_geometry(&geometry, &p, "cycle", &mut BTreeSet::new()).is_none());
    }
}
