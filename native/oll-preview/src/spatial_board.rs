use crate::board_view;
use makepad_plot::LinePlot;
use makepad_widgets::*;
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
        draw_vector +: {draw_depth:4.0}
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
    #[rust]
    routes: Vec<oll_runtime::connections::Route>,
    #[rust]
    badges: Vec<(WorldRect, WidgetRef)>,
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
    pub fn clear(&mut self, cx: &mut Cx) {
        self.board = None;
        self.signature.clear();
        self.entries.clear();
        self.groups.clear();
        self.routes.clear();
        self.badges.clear();
        self.geometry = BoardLayout::default();
        self.targets.clear();
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
        let to = spatial::focus_camera(
            &rects,
            self.camera,
            self.viewport.size.x.max(300.),
            self.viewport.size.y.max(240.),
            mode,
        );
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
                    "plot" | "geometry" => {
                        let top = if node["kind"] == "geometry" { 28 } else { 36 };
                        board_view::widget(cx,&format!("mod.plot.LinePlot{{width:Fill height:Fill demo_data:false interactive:false plot_margin:Inset{{left:52 right:16 top:{top} bottom:40}}}}"))?
                    }
                    _ => {
                        let w=board_view::widget(cx,"RectView{width:Fill height:Fill flow:Down padding:14 draw_bg.color:#303844 draw_bg.border_size:1 draw_bg.border_color:#536273}")?;
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
                    let w=board_view::widget(cx,"RectView{width:Fill height:Fill flow:Down padding:8 draw_bg.color:#0000 draw_bg.border_size:2 draw_bg.border_color:#7794b0}")?;
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
                        "SolidView{width:Fill height:Fill padding:3 draw_bg.color:#263a40}",
                    )?;
                    let text = board_view::label(cx, label)?;
                    board_view::children(cx, &badge, vec![text])?;
                    self.badges.push((rect, badge));
                }
                self.routes.push(route);
            }
            self.signature = signature;
        }
        for (id, _, w) in &self.entries {
            if let Some(mut plot) = w.borrow_mut::<LinePlot>() {
                if let Some(node) = p.nodes.iter().find(|n| n["id"] == id.as_str()) {
                    plot.clear();
                    crate::render(&mut plot, node, p)?;
                }
            }
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
        match event.hits(cx, self.draw_bg.area()) {
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
        if self.viewport.size != viewport.size {
            self.viewport = viewport;
            if !self.manual {
                self.focus(false);
            }
        } else {
            self.viewport = viewport;
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
        if let Some(t) = self.board.as_ref().and_then(|b| b.last_point.as_ref()) {
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
        self.draw_vector.end(cx);
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
        json!({"camera":{"x":self.camera.x,"y":self.camera.y,"scale":self.camera.scale},"manual":self.manual,"targets":self.targets,"nodes":nodes,"groups":self.geometry.groups.len(),"connections":self.routes.len(),"connection_segments":self.routes.iter().map(|r|r.points.len().saturating_sub(1)).sum::<usize>(),"transition":!self.manual && self.elapsed<0.68,"viewport":{"x":self.viewport.pos.x,"y":self.viewport.pos.y,"width":self.viewport.size.x,"height":self.viewport.size.y}}).to_string()
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
