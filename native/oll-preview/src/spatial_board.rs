use crate::board_view;
use crate::controls_view::{self, ControlModel, ControlsCard, Part};
use crate::geometry_view::GeometryView;
use crate::plot_view::{PlotState, PlotView, Tool};
use crate::scene3d_view::Scene3dView;
use makepad_plot::LinePlot;
use makepad_widgets::*;
use oll_runtime::ink::Ink;
use oll_runtime::scene3d::View as SceneView;
use oll_runtime::{
    camera::{self, Insets, Mode},
    focus::{self, Policy},
    preview::Preview,
    spatial::{self, BoardLayout, Camera, Rect as WorldRect},
    teaching,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

/// Camera scale the desktop host plans teaching rows for (web teachingReadingScale).
const TEACHING_READING_SCALE: f64 = 0.9;
/// Zoom ceiling of automatic teaching focus (web teachingCameraCeiling).
const TEACHING_CAMERA_CEILING: f64 = 1.1;
/// Reflection card height reserved before it is measured.
const REFLECTION_ESTIMATED_HEIGHT: f64 = 150.;

/// A learner change of a lesson variable from a world control panel (web
/// handleStudentVariableInput). `commit` ends the operation; `track_px` is
/// the task snap distance (0: no snapping, e.g. the − + buttons which the web
/// treats as keyboard input).
#[derive(Clone, Debug, PartialEq)]
pub struct ControlRequest {
    pub alias: String,
    pub value: f64,
    pub control: &'static str,
    pub commit: bool,
    /// Task snap distance in variable units for a pointer commit (web
    /// sliderTaskSnapDistance / geometryTaskSnapDistance); 0: no snapping.
    pub snap_distance: f64,
}
/// A practice panel action.
#[derive(Clone, Debug, PartialEq)]
pub enum TaskRequest {
    Hint(String),
    Retry(String),
}

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
    /// Teaching camera requested during a pointer gesture (web
    /// pendingCameraFocus), applied when the gesture ends.
    #[rust]
    pending_camera: Option<Camera>,
    /// Host viewport insets and floating-UI occlusions (web
    /// learningBoardInsets), in viewport-local pixels.
    #[rust]
    insets: Insets,
    #[rust]
    policy: Policy,
    /// Course slider models supplied by the host each refresh.
    #[rust]
    controls: Vec<ControlModel>,
    /// Control panels laid out in the world: (attachment, slider aliases,
    /// rect, card).
    #[rust]
    attachment_cards: Vec<(teaching::Attachment, Vec<String>, WorldRect, WidgetRef)>,
    /// Variable changes requested from the world panels, for the host.
    #[rust]
    control_requests: Vec<ControlRequest>,
    /// Practice task definitions and the available task snapshots (host).
    #[rust]
    task_defs: Vec<Value>,
    #[rust]
    tasks: Vec<oll_runtime::tasks::Snapshot>,
    /// Practice panels laid out in the world: (attachment id, task ids, rect, card).
    #[rust]
    task_cards: Vec<(String, Vec<String>, WorldRect, WidgetRef)>,
    /// Rendered practice panel heights by attachment id.
    #[rust]
    task_heights: BTreeMap<String, f64>,
    #[rust]
    task_requests: Vec<TaskRequest>,
    /// Active slider drag: (panel index, row).
    #[rust]
    control_drag: Option<(usize, usize)>,
    /// Viewport changed: relayout (composition) and reframe next frame.
    #[rust]
    relayout_frame: NextFrame,
    /// The viewport or insets changed: re-plan the camera after relayout
    /// (web resize). Measurement relayouts keep the camera.
    #[rust]
    reframe_pending: bool,
    /// Camera policy and camera before the current operation's first render.
    /// The Web measures cards before it decides the camera, so a relayout
    /// caused by measured sizes re-decides this operation from here.
    #[rust]
    operation_start: Option<(Policy, Camera)>,
    /// The pending relayout comes from measured card sizes.
    #[rust]
    measure_relayout: bool,
    /// Rendered card sizes (web syncNodes): layout width and rendered height
    /// of content-sized cards, fed back into the next layout.
    #[rust]
    measured: BTreeMap<String, (f64, f64)>,
    /// Content-sized card ids (drawn at natural height, then measured).
    #[rust]
    content_ids: BTreeSet<String>,
    /// Measure/relayout passes spent on the current operation (web: 3).
    #[rust]
    measure_passes: u8,
    /// The host's current operation is a Beat/step boundary (see
    /// focus::Policy::render).
    #[rust]
    at_boundary: bool,
    /// Student-adjusted scene3d cameras by node id (web scene3dViews);
    /// absent means the authored camera.
    #[rust]
    scene_views: BTreeMap<String, SceneView>,
    /// Active scene3d orbit drag: node id and the view at pointer down.
    #[rust]
    orbit: Option<(String, SceneView)>,
    /// Thinking-question cards laid out under their anchors after the
    /// lesson: (attachment id, reflection id, rect, card).
    #[rust]
    reflection_cards: Vec<(String, String, WorldRect, WidgetRef)>,
    /// Plot explorer state by node id (web PlotExplorer state).
    #[rust]
    plot_states: BTreeMap<String, PlotState>,
    /// Active explore-mode pan: node id, ranges and pointer at the start.
    #[rust]
    plot_drag: Option<(String, (oll_runtime::plot::Range, oll_runtime::plot::Range), DVec2)>,
    /// Angle controls in world coordinates (debug snapshots), refreshed on draw.
    #[rust]
    angle_controls: Vec<Value>,
    /// A modal (e.g. the 大图 dialog) covers the board: ignore pointer input.
    #[rust]
    input_blocked: bool,
    /// Targets to frame once the next state is laid out.
    #[rust]
    pending_focus: Option<Vec<String>>,
    /// Active angle-control drag: node id, control, last value.
    #[rust]
    geometry_drag: Option<(String, oll_runtime::geometry::AngleControl, f64)>,
    /// 大图 requests for the host (node id).
    #[rust]
    plot_expand: Vec<String>,
    /// Rendered reflection card heights (web ResizeObserver), by attachment id.
    #[rust]
    reflection_heights: BTreeMap<String, f64>,
    /// Reflections whose answer the learner opened.
    #[rust]
    open_reflections: BTreeSet<String>,
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
    /// Host floating UI (web learningBoardInsets). A change re-composes the
    /// teaching layout, whose readable width and height follow the insets.
    pub fn set_insets(&mut self, cx: &mut Cx, insets: Insets) {
        if self.insets != insets {
            self.insets = insets;
            self.reframe_pending = true;
            self.relayout_frame = cx.new_next_frame();
        }
    }
    /// Course slider state; panels show the models of their cluster.
    pub fn set_controls(&mut self, cx: &mut Cx, controls: Vec<ControlModel>) {
        if self.controls != controls {
            self.controls = controls;
            self.sync_control_cards(cx);
        }
    }
    /// Host playback position: true when the current operation is a
    /// `beat.end`/`step.commit` rather than an applied action.
    pub fn set_operation_boundary(&mut self, boundary: bool) {
        self.at_boundary = boundary;
    }
    pub fn take_control_requests(&mut self) -> Vec<ControlRequest> {
        std::mem::take(&mut self.control_requests)
    }
    pub fn set_input_blocked(&mut self, blocked: bool) {
        self.input_blocked = blocked;
    }
    /// Frame these targets after the next state update (web host attention
    /// focus, e.g. after an outline seek).
    pub fn focus_after_update(&mut self, targets: Vec<String>) {
        self.pending_focus = Some(targets);
    }
    pub fn take_task_requests(&mut self) -> Vec<TaskRequest> {
        std::mem::take(&mut self.task_requests)
    }
    /// Practice tasks (definitions for cluster ownership, available
    /// snapshots for the panels). A change re-composes the board.
    pub fn set_tasks(&mut self, cx: &mut Cx, defs: &[Value], tasks: Vec<oll_runtime::tasks::Snapshot>) {
        if self.task_defs != defs || self.tasks != tasks {
            self.task_defs = defs.to_vec();
            self.tasks = tasks;
            self.relayout_frame = cx.new_next_frame();
        }
    }
    fn sync_control_cards(&mut self, cx: &mut Cx) {
        for (_, aliases, _, card) in &self.attachment_cards {
            let rows: Vec<ControlModel> = self
                .controls
                .iter()
                .filter(|c| aliases.contains(&c.alias))
                .cloned()
                .collect();
            if let Some(mut c) = card.borrow_mut::<ControlsCard>() {
                c.set_rows(cx, rows);
            }
        }
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
        self.policy.reset();
        self.attachment_cards.clear();
        self.reflection_cards.clear();
        self.reflection_heights.clear();
        self.control_drag = None;
        self.control_requests.clear();
        self.task_cards.clear();
        self.task_heights.clear();
        self.task_requests.clear();
        self.plot_states.clear();
        self.plot_drag = None;
        self.geometry_drag = None;
        self.camera = Camera::default();
        self.from = self.camera;
        self.destination = self.camera;
        self.elapsed = 0.68;
        self.manual = false;
        self.drag = None;
        self.pending_camera = None;
        self.scene_views.clear();
        self.orbit = None;
        self.redraw(cx);
    }

    fn resolve(&self, id: &str, seen: &mut BTreeSet<String>) -> Option<WorldRect> {
        resolve_geometry(&self.geometry, self.board.as_ref()?, id, seen)
    }
    /// Viewport and host inputs for the teaching camera.
    fn camera_view<'a>(&'a self, panels: &'a [(String, Vec<String>, f64)]) -> focus::View<'a> {
        focus::View {
            width: self.viewport.size.x.max(1.),
            height: self.viewport.size.y.max(1.),
            insets: &self.insets,
            attachments: panels,
            scale_floor: camera::MIN_AUTOMATIC_SCALE,
            scale_ceiling: TEACHING_CAMERA_CEILING,
        }
    }
    fn panel_focus(&self) -> Vec<(String, Vec<String>, f64)> {
        self.attachment_cards
            .iter()
            .map(|(a, aliases, _, _)| (a.id.clone(), a.anchor_node_ids.clone(), controls_view::panel_height(aliases.len())))
            // Practice panels count with their whole height (web focusHeight unset).
            .chain(self.task_cards.iter().map(|(id, _, r, _)| {
                let anchors = self
                    .geometry
                    .attachments
                    .get(id)
                    .map(|_| self.task_anchor_ids(id))
                    .unwrap_or_default();
                (id.clone(), anchors, r.height)
            }))
            .collect()
    }
    /// Start the Web .world transition (cubic-bezier .22,1,.36,1, 680ms).
    fn animate_to(&mut self, to: Camera) {
        if self.drag.is_some() || self.orbit.is_some() || self.control_drag.is_some() {
            self.pending_camera = Some(to);
            return;
        }
        self.from = self.camera;
        self.destination = to;
        self.elapsed = 0.;
        self.manual = false;
    }
    fn jump_to(&mut self, to: Camera) {
        self.camera = to;
        self.from = to;
        self.destination = to;
        self.elapsed = 0.68;
    }
    /// Web resize(): after a viewport change re-plan the last attention.
    fn reframe(&mut self) {
        let Some(p) = self.board.clone() else { return };
        let panels = self.panel_focus();
        let mut policy = std::mem::take(&mut self.policy);
        let to = policy.refocus(&p, &self.geometry, self.destination, &self.camera_view(&panels));
        self.policy = policy;
        if let Some(to) = to {
            self.jump_to(to);
        }
    }
    fn task_anchor_ids(&self, attachment: &str) -> Vec<String> {
        let Some(p) = &self.board else { return vec![] };
        let region = p.nodes.first().and_then(|n| n["region_id"].as_str()).filter(|r| !r.is_empty()).unwrap_or("__legacy__");
        let nodes: Vec<String> = p.node_sections().into_iter().map(|(id, _)| id).collect();
        teaching::interaction_clusters(p, region, &nodes, p.variable_declarations(), &self.task_defs)
            .into_iter()
            .find(|c| format!("{}:tasks", c.id) == attachment)
            .map(|c| c.node_ids)
            .unwrap_or_default()
    }
    /// Thinking questions available after the lesson: (attachment id,
    /// reflection id, anchor node id).
    fn reflection_specs(&self, p: &Preview, region: &str) -> Vec<(String, String, String)> {
        if !p.complete() {
            return vec![];
        }
        p.reflections()
            .into_iter()
            .filter(|(_, _, _, anchor)| p.nodes.iter().any(|n| n["id"] == anchor.as_str()))
            .map(|(id, _, _, anchor)| (format!("reflection:{region}:{id}"), id, anchor))
            .collect()
    }
    /// Web captureReflowAnchor: the visible card nearest the viewport
    /// centre (focused cards first), with its world position.
    fn reflow_anchor(&self) -> Option<(String, f64, f64)> {
        let p = self.board.as_ref()?;
        let c = self.destination;
        let (w, h) = (self.viewport.size.x, self.viewport.size.y);
        let mut visible: Vec<(&String, &WorldRect)> = self
            .geometry
            .nodes
            .iter()
            .filter(|(_, r)| {
                let x = c.x + r.x * c.scale;
                let y = c.y + r.y * c.scale;
                x < w && y < h && x + r.width * c.scale > 0. && y + r.height * c.scale > 0.
            })
            .collect();
        let distance = |r: &WorldRect| {
            (c.x + (r.x + r.width / 2.) * c.scale - w / 2.).hypot(c.y + (r.y + r.height / 2.) * c.scale - h / 2.)
        };
        visible.sort_by(|(a, ra), (b, rb)| {
            let fa = p.focus.iter().any(|f| f == *a);
            let fb = p.focus.iter().any(|f| f == *b);
            fb.cmp(&fa).then(distance(ra).total_cmp(&distance(rb)))
        });
        visible.first().map(|(id, r)| ((*id).clone(), r.x, r.y))
    }
    /// Relayout with the Web composition: the teaching region is the course
    /// region, composed for the viewport and host insets, with the control
    /// panels as attachments. Text cards re-measured at their column width
    /// (web: up to three passes).
    #[allow(clippy::type_complexity)]
    fn compute_layout(
        &self,
        p: &Preview,
    ) -> Result<(BoardLayout, Vec<(teaching::Attachment, Vec<String>)>, Vec<(teaching::Attachment, Vec<String>)>), String> {
        let region = p
            .nodes
            .first()
            .and_then(|n| n["region_id"].as_str())
            .filter(|r| !r.is_empty())
            .unwrap_or("__legacy__")
            .to_owned();
        let sections = p.node_sections();
        let course_nodes: Vec<String> = sections.iter().map(|(id, _)| id.clone()).collect();
        let interaction = teaching::interaction_clusters(p, &region, &course_nodes, p.variable_declarations(), &self.task_defs);
        let clusters: Vec<(teaching::Attachment, Vec<String>)> = interaction
            .iter()
            .filter(|c| !c.sliders.is_empty())
            .map(|c| (c.controls_attachment(), c.sliders.clone()))
            .collect();
        // Practice panels: a cluster's available tasks, measured once rendered.
        let task_panels: Vec<(teaching::Attachment, Vec<String>)> = interaction
            .iter()
            .filter_map(|c| {
                let open: Vec<String> = c
                    .task_ids
                    .iter()
                    .filter(|id| self.tasks.iter().any(|t| &t.progress.task_id == *id))
                    .cloned()
                    .collect();
                if open.is_empty() {
                    return None;
                }
                let id = format!("{}:tasks", c.id);
                let measured = self.task_heights.get(&id).copied();
                Some((c.tasks_attachment(open.len(), measured), open))
            })
            .collect();
        let insets = &self.insets;
        let reflections: Vec<Value> = self
            .reflection_specs(p, &region)
            .into_iter()
            .map(|(id, _, anchor)| json!({
                "id": id, "kind": "reflection", "anchorNodeId": anchor, "width": 330,
                "height": self.reflection_heights.get(&id).copied().unwrap_or(REFLECTION_ESTIMATED_HEIGHT),
            }))
            .collect();
        let options = json!({"regions": {region: {
            "x": 20, "y": 20, "flow": "teaching",
            "nodeSections": sections.iter().map(|(id, s)| (id.clone(), json!(s))).collect::<serde_json::Map<_, _>>(),
            "plannedSteps": p.planned_steps().iter().map(|(s, c)| (s.clone(), json!({"visual": c.visual, "math": c.math, "text": c.text}))).collect::<serde_json::Map<_, _>>(),
            "composition": {
                "width": self.viewport.size.x.max(320.),
                "height": self.viewport.size.y.max(240.),
                "mode": if p.complete() { "overview" } else { "progressive" },
                "insets": {"top": insets.top, "right": insets.right, "bottom": insets.bottom, "left": insets.left},
                "readingScale": TEACHING_READING_SCALE,
            },
            "reservedWidth": 1300,
            // The host reports the rendered panel height (web measured size).
            "attachments": clusters.iter().map(|(a, aliases)| json!({
                "id": a.id, "kind": "control", "anchorNodeId": a.anchor_node_id,
                "ownerNodeId": a.owner_node_id, "anchorNodeIds": a.anchor_node_ids,
                "width": a.width, "height": controls_view::panel_height(aliases.len()),
                "focusHeight": controls_view::panel_height(aliases.len()), "gap": 24,
            }))
            // Thinking questions open with the after-lesson window, under the
            // card that poses them.
            .chain(task_panels.iter().map(|(a, _)| json!({
                "id": a.id, "kind": "task", "anchorNodeId": a.anchor_node_id,
                "ownerNodeId": a.owner_node_id, "anchorNodeIds": a.anchor_node_ids,
                "width": a.width, "height": a.height, "gap": 28,
            })))
            .chain(reflections)
            .collect::<Vec<_>>(),
        }}});
        // Web render(): provisional layout from measureSemanticNode estimates,
        // then syncNodes sizes: rendered heights for content cards, rendered
        // formula width for math (capped at the layout width on later
        // passes), and the natural (estimate) width for every other card —
        // a width stretched to its column is never fed back. Re-laid out
        // while widths move.
        let estimates: BTreeMap<String, (f64, f64)> = p
            .nodes
            .iter()
            .filter_map(|n| Some((n["id"].as_str()?.to_owned(), board_view::estimate(n))))
            .collect();
        let mut layout = spatial::layout_with_options(p, &estimates, &options)?;
        for pass in 0..4 {
            let mut next = BTreeMap::new();
            for n in &p.nodes {
                let Some(id) = n["id"].as_str() else { continue };
                let provisional = layout.nodes.get(id).copied().unwrap_or_default();
                let width = if n["kind"] == "math" {
                    let w = board_view::math_width(n)?;
                    if pass > 0 { w.min(provisional.width) } else { w }
                } else {
                    estimates[id].0
                };
                let height = board_view::fixed_height(n)
                    .or_else(|| self.measured.get(id).map(|m| m.1))
                    .unwrap_or(estimates[id].1);
                next.insert(id.to_owned(), (width, height));
            }
            let next_layout = spatial::layout_with_options(p, &next, &options)?;
            // Web: stop once every card was measured at its final width.
            let settled = pass > 0
                && next_layout.nodes.iter().all(|(id, r)| layout.nodes.get(id).is_none_or(|l| (l.width - r.width).abs() < 0.5));
            layout = next_layout;
            if settled {
                break;
            }
        }
        Ok((layout, clusters, task_panels))
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
            self.measured.clear();
            self.signature.clear();
            self.last_action = 0;
            self.targets.clear();
            self.policy.reset();
            self.jump_to(Camera::default());
            self.manual = false;
            self.pending_camera = None;
            self.scene_views.clear();
            self.orbit = None;
        }
        let signature = json!([
            p.cursor, p.title, p.groups, p.focus, p.complete(),
            self.viewport.size.x, self.viewport.size.y,
            [self.insets.top, self.insets.right, self.insets.bottom, self.insets.left],
            self.reflection_heights, self.open_reflections, self.task_heights,
            self.tasks.iter().map(|t| format!("{:?}", t)).collect::<Vec<_>>(),
        ])
        .to_string();
        let changed = signature != self.signature;
        self.pointer_target = action
            .filter(|a| a["op"] == "teacher.point")
            .map(|a| a["target"].clone());
        let anchor = (!reset && changed).then(|| self.reflow_anchor()).flatten();
        if self.last_action != p.cursor || reset {
            self.measure_passes = 0;
            self.operation_start = Some((self.policy.clone(), self.destination));
        }
        let remeasure = std::mem::take(&mut self.measure_relayout) && !self.manual;
        self.board = Some(p.clone());
        if changed {
            let (geometry, clusters, task_panels) = self.compute_layout(p)?;
            self.geometry = geometry;
            self.entries.clear();
            self.groups.clear();
            self.content_ids = p
                .nodes
                .iter()
                .filter(|n| board_view::content_sized(n))
                .filter_map(|n| n["id"].as_str().map(str::to_owned))
                .collect();
            for node in &p.nodes {
                let id = node["id"].as_str().unwrap();
                let w = match node["kind"].as_str().unwrap_or("") {
                    "math" => board_view::math_node(cx, node)?,
                    "text" if node["content"]["fragments"].is_array() => {
                        board_view::text_node(cx, node)?
                    }
                    "plot" => board_view::plot_node(cx, node)?,
                    "geometry" => board_view::geometry_node(cx, node)?,
                    "scene3d" => board_view::scene3d_node(cx, node)?,
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
            let previous = std::mem::take(&mut self.attachment_cards);
            for (spec, aliases) in clusters {
                let Some(rect) = self.geometry.attachments.get(&spec.id).copied() else { continue };
                // Keep the panel widget across relayouts so a slider drag survives.
                let card = previous
                    .iter()
                    .find(|(a, _, _, _)| a.id == spec.id)
                    .map(|(_, _, _, w)| w.clone())
                    .map_or_else(|| board_view::widget(cx, "mod.widgets.ControlsCard{width:Fill height:Fill}"), Ok)?;
                self.attachment_cards.push((spec, aliases, rect, card));
            }
            self.sync_control_cards(cx);
            self.task_cards.clear();
            for (spec, ids) in task_panels {
                let Some(rect) = self.geometry.attachments.get(&spec.id).copied() else { continue };
                let snapshots: Vec<_> = self.tasks.iter().filter(|t| ids.contains(&t.progress.task_id)).cloned().collect();
                let card = board_view::tasks_card(cx, &snapshots)?;
                self.task_cards.push((spec.id.clone(), ids, rect, card));
            }
            self.reflection_cards.clear();
            let region = p.nodes.first().and_then(|n| n["region_id"].as_str()).filter(|r| !r.is_empty()).unwrap_or("__legacy__");
            let texts = p.reflections();
            for (attachment, id, _) in self.reflection_specs(p, region) {
                let Some(rect) = self.geometry.attachments.get(&attachment).copied() else { continue };
                let Some((_, prompt, answer, _)) = texts.iter().find(|r| r.0 == id) else { continue };
                let card = board_view::reflection_card(cx, prompt, answer, self.open_reflections.contains(&id))?;
                self.reflection_cards.push((attachment, id, rect, card));
            }
            for group in &p.groups {
                let id = group["id"].as_str().unwrap();
                let Some(rect) = self.geometry.groups.get(id).copied() else { continue };
                // Web syncGroups: a frame renders only when its members form a
                // contiguous block (no other card or attachment intrudes).
                let members = group_members(p, id);
                let overlap = |a: &WorldRect, slack: f64| {
                    let ox = (a.x + a.width).min(rect.x + rect.width) - a.x.max(rect.x);
                    let oy = (a.y + a.height).min(rect.y + rect.height) - a.y.max(rect.y);
                    ox > slack && oy > slack
                };
                let intrudes = self.geometry.nodes.iter().any(|(nid, r)| !members.contains(nid) && overlap(r, 12.))
                    || self.geometry.attachments.values().any(|r| overlap(r, 0.));
                if intrudes {
                    continue;
                }
                let w = board_view::widget(cx, "mod.widgets.GroupFrame{width:Fill height:Fill}")?;
                if let Some(mut f) = w.borrow_mut::<crate::group_view::GroupFrame>() {
                    f.title = group["title"].as_str().or(group["role"].as_str()).unwrap_or("知识组").to_owned();
                    f.focused = p.focus.iter().any(|t| t == id);
                }
                self.groups.push((rect, w));
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
            if kind == "scene3d" {
                if let Some(mut scene) = w.widget(cx, ids!(scene)).borrow_mut::<Scene3dView>() {
                    scene.set_content(cx, &node["content"], &p.variables);
                    scene.set_view(cx, self.scene_views.get(id).copied());
                }
                continue;
            }
            if kind == "plot" {
                let state = self.plot_states.get(id).cloned().unwrap_or_default();
                if let Some(mut plot) = w.widget(cx, ids!(plot)).borrow_mut::<PlotView>() {
                    plot.set_node(cx, node, &p.variables, &state);
                }
                continue;
            }
            if kind == "geometry" {
                let state = self.plot_states.get(id).cloned().unwrap_or_default();
                let active = self.geometry_drag.as_ref().filter(|d| &d.0 == id).map(|d| d.1.variable.clone());
                if let Some(mut g) = w.widget(cx, ids!(geometry)).borrow_mut::<GeometryView>() {
                    g.set_node(cx, node, &state);
                    g.active_control = active;
                }
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
        for (_, _, _, card) in &self.attachment_cards {
            card.redraw(cx);
        }
        // Teaching camera: the board's render focus plus the host Beat
        // composition, then the course-end overview once playback completes.
        let panels = self.panel_focus();
        let restart = self.operation_start.clone().filter(|_| remeasure);
        let current = restart.as_ref().map_or(self.destination, |(_, c)| *c);
        let mut policy = match &restart {
            Some((start, _)) => start.clone(),
            None => std::mem::take(&mut self.policy),
        };
        let planned = {
            let view = self.camera_view(&panels);
            let mut to = policy.render(p, &self.geometry, current, &view, self.at_boundary);
            if let Some(end) = policy.course_end(p, &self.geometry, to.unwrap_or(current), &view) {
                to = Some(end);
            }
            to
        };
        let mut planned = planned;
        if let Some(targets) = self.pending_focus.take() {
            let view = self.camera_view(&panels);
            if let Some(to) = policy.focus_targets(p, &self.geometry, &targets, planned.unwrap_or(current), &view) {
                planned = Some(to);
            }
        }
        self.policy = policy;
        if restart.is_some() {
            // Same operation, measured sizes: the decision replaces the one
            // made from estimates (no passive anchor compensation).
            let to = planned.unwrap_or(current);
            if to != self.destination {
                self.animate_to(to);
            }
        } else if let Some(to) = planned {
            self.animate_to(to);
        } else if let Some((id, x, y)) = anchor {
            // Passive layout change: keep the anchor card where it was on
            // screen (web stable-anchor compensation, no transition).
            if let Some(r) = self.geometry.nodes.get(&id) {
                let s = self.destination.scale;
                let (dx, dy) = ((x - r.x) * s, (y - r.y) * s);
                if dx.abs() > 0.01 || dy.abs() > 0.01 {
                    for c in [&mut self.camera, &mut self.from, &mut self.destination] {
                        c.x += dx;
                        c.y += dy;
                    }
                }
            }
        }
        self.last_action = p.cursor;
        self.targets = self.policy.last_attention().to_vec();
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
    /// Whole-course frame (web course framing: small margin, no floor).
    pub fn overview(&mut self, cx: &mut Cx) {
        let rs = self
            .geometry
            .nodes
            .values()
            .chain(self.geometry.groups.values())
            .chain(self.geometry.attachments.values())
            .copied()
            .collect::<Vec<_>>();
        if let Some(bounds) = WorldRect::union(&rs, 0.) {
            let to = camera::plan_focus(
                &[bounds],
                self.destination,
                self.viewport.size.x,
                self.viewport.size.y,
                Mode::Course,
                &self.insets,
                camera::MIN_AUTOMATIC_SCALE,
                TEACHING_CAMERA_CEILING,
                Some(&rs),
            );
            self.animate_to(to);
        }
        self.manual = true;
        self.redraw(cx);
    }
    pub fn follow(&mut self, cx: &mut Cx) {
        self.manual = false;
        self.reframe();
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
impl SpatialBoard {
    /// The scene3d panel under a screen position, if any (topmost card last).
    fn scene_at(&self, cx: &mut Cx, abs: DVec2) -> Option<(String, WidgetRef, DVec2)> {
        let local = abs - self.viewport.pos;
        let (x, y) = self.camera.view_to_world(local.x, local.y);
        let world = dvec2(x, y);
        self.entries.iter().rev().find_map(|(id, r, w)| {
            let inside = world.x >= r.x
                && world.x <= r.x + r.width
                && world.y >= r.y
                && world.y <= r.y + r.height;
            if !inside {
                return None;
            }
            let scene = w.widget(cx, ids!(scene));
            let is_scene = scene.borrow::<Scene3dView>().is_some();
            is_scene.then(|| (id.clone(), scene, world))
        })
    }
    fn set_scene_view(&mut self, cx: &mut Cx, id: &str, scene: &WidgetRef, view: SceneView) {
        self.scene_views.insert(id.into(), view);
        if let Some(mut s) = scene.borrow_mut::<Scene3dView>() {
            s.set_view(cx, Some(view));
        }
        self.redraw(cx);
    }
    /// Web scene3d pointer handling; true when the event belongs to a scene.
    /// A plot/geometry node and its explorer state (for the 大图 dialog).
    pub fn explorer(&self, id: &str) -> Option<(Value, PlotState)> {
        let node = self.board.as_ref()?.nodes.iter().find(|n| n["id"] == id)?.clone();
        Some((node, self.plot_states.get(id).cloned().unwrap_or_default()))
    }
    /// Explorer state edited in the 大图 dialog (web: the card and the dialog
    /// share one explorer state).
    pub fn set_explorer_state(&mut self, cx: &mut Cx, id: &str, state: PlotState) {
        self.plot_states.insert(id.to_owned(), state);
        self.measure_relayout = true;
        self.relayout_frame = cx.new_next_frame();
    }
    pub fn take_plot_expand(&mut self) -> Vec<String> {
        std::mem::take(&mut self.plot_expand)
    }
    /// Plot card under a screen point: (node id, PlotView, world point).
    fn plot_at(&self, cx: &mut Cx, abs: DVec2) -> Option<(String, WidgetRef, DVec2)> {
        let world = self.world_point(abs);
        self.entries.iter().find_map(|(id, r, w)| {
            let inside = world.x >= r.x && world.x <= r.x + r.width && world.y >= r.y && world.y <= r.y + r.height;
            let plot = w.widget(cx, ids!(plot));
            (inside && plot.borrow::<PlotView>().is_some()).then(|| (id.clone(), plot, world))
        })
    }
    /// Geometry card under a screen point: (node id, GeometryView, world point).
    fn geometry_at(&self, cx: &mut Cx, abs: DVec2) -> Option<(String, WidgetRef, DVec2)> {
        let world = self.world_point(abs);
        self.entries.iter().find_map(|(id, r, w)| {
            let inside = world.x >= r.x && world.x <= r.x + r.width && world.y >= r.y && world.y <= r.y + r.height;
            let g = w.widget(cx, ids!(geometry));
            (inside && g.borrow::<GeometryView>().is_some()).then(|| (id.clone(), g, world))
        })
    }
    /// Angle value for a control at a world point (web angleControlValue),
    /// with the variable's (min, max) for snapping.
    fn angle_value(&self, control: &oll_runtime::geometry::AngleControl, angle: f64) -> Option<(f64, f64, f64, String)> {
        let p = self.board.as_ref()?;
        let d = p.variable_declarations().iter().find(|d| d["as"] == control.variable.as_str())?;
        let (min, max) = (d["min"].as_f64()?, d["max"].as_f64()?);
        let unit = d["unit"].as_str().unwrap_or("").to_owned();
        let current = p.variables.get(&control.variable).copied().unwrap_or(min);
        Some((oll_runtime::geometry::angle_control_value(angle, current, min, max, &unit), min, max, unit))
    }
    /// Geometry explorer input: toolbar, wheel zoom, explore pan, and
    /// dragging angle-control points (control "geometry_point").
    fn geometry_event(&mut self, cx: &mut Cx, hit: &Hit) -> bool {
        use oll_runtime::plot;
        match hit {
            Hit::FingerDown(e) => {
                let Some((id, view, world)) = self.geometry_at(cx, e.abs) else { return false };
                let (tool, control, fraction, ranges, current) = {
                    let g = view.borrow::<GeometryView>().unwrap();
                    (g.tool_at(world), g.control_at(world), g.frame_fraction(world), g.current_ranges(), g.state.clone())
                };
                let mut state = self.plot_states.get(&id).cloned().unwrap_or(current);
                if let Some(tool) = tool {
                    match tool {
                        Tool::Explore => state.exploring = !state.exploring,
                        Tool::Restore => state.ranges = None,
                        Tool::Expand => self.plot_expand.push(id.clone()),
                    }
                    self.set_geometry_state(cx, &id, &view, state);
                    return true;
                }
                if let Some(control) = control {
                    let angle = view.borrow::<GeometryView>().unwrap().pointer_angle(&control, world);
                    if let Some((value, ..)) = self.angle_value(&control, angle) {
                        self.control_requests.push(ControlRequest {
                            alias: control.variable.clone(),
                            value,
                            control: "geometry_point",
                            commit: false,
                            snap_distance: 0.,
                        });
                        self.geometry_drag = Some((id, control, value));
                        cx.set_cursor(MouseCursor::Grabbing);
                    }
                    return true;
                }
                if state.exploring && fraction.is_some() {
                    if let Some(r) = ranges {
                        self.plot_drag = Some((id, r, e.abs));
                        return true;
                    }
                }
                false
            }
            Hit::FingerMove(e) => {
                if let Some((id, control, _)) = self.geometry_drag.clone() {
                    let world = self.world_point(e.abs);
                    let Some((_, _, w)) = self.entries.iter().find(|(i, _, _)| *i == id) else { return true };
                    let view = w.widget(cx, ids!(geometry));
                    let angle = view.borrow::<GeometryView>().map(|g| g.pointer_angle(&control, world));
                    if let Some((value, ..)) = angle.and_then(|a| self.angle_value(&control, a)) {
                        self.control_requests.push(ControlRequest {
                            alias: control.variable.clone(),
                            value,
                            control: "geometry_point",
                            commit: false,
                            snap_distance: 0.,
                        });
                        self.geometry_drag = Some((id, control, value));
                    }
                    return true;
                }
                let Some((id, start, at)) = self.plot_drag.clone() else { return false };
                let Some((_, _, w)) = self.entries.iter().find(|(i, _, _)| *i == id) else { return false };
                let view = w.widget(cx, ids!(geometry));
                let Some((px, py)) = view.borrow::<GeometryView>().and_then(|g| g.data_per_world()) else { return false };
                let delta = (e.abs - at) / self.camera.scale;
                let mut state = self.plot_states.get(&id).cloned().unwrap_or_default();
                state.ranges = Some(plot::pan(start.0, start.1, -delta.x * px, delta.y * py));
                self.set_geometry_view(cx, &id, &view, state);
                true
            }
            Hit::FingerUp(_) => {
                let Some((id, control, value)) = self.geometry_drag.take() else { return false };
                // Commit (web geometry point commit) with the task snap
                // distance: 12px along the circle, at most 4% of the range.
                let radius = self
                    .entries
                    .iter()
                    .find(|(i, _, _)| *i == id)
                    .and_then(|(_, _, w)| w.widget(cx, ids!(geometry)).borrow::<GeometryView>().map(|g| g.control_radius(&control)))
                    .unwrap_or(0.)
                    * self.camera.scale;
                let snap_distance = self.angle_value(&control, 0.).map_or(0., |(_, min, max, unit)| {
                    let u = unit.to_lowercase();
                    let degrees = !(u.contains('弧') || u.contains("rad")) && (u.contains('度') || u.contains('°') || u.contains("deg"));
                    let turn = if degrees { 360. } else { std::f64::consts::TAU };
                    if radius > 0. { (12. * turn / (std::f64::consts::TAU * radius)).min((max - min) * 0.04) } else { 0. }
                });
                self.control_requests.push(ControlRequest {
                    alias: control.variable.clone(),
                    value,
                    control: "geometry_point",
                    commit: true,
                    snap_distance,
                });
                cx.set_cursor(MouseCursor::Grab);
                self.replay_pending_camera(cx);
                true
            }
            Hit::FingerScroll(e) => {
                let Some((id, view, world)) = self.geometry_at(cx, e.abs) else { return false };
                let (fraction, ranges, current) = {
                    let g = view.borrow::<GeometryView>().unwrap();
                    (g.frame_fraction(world), g.current_ranges(), g.state.clone())
                };
                let (Some(anchor), Some((x, y))) = (fraction, ranges) else { return false };
                let mut state = self.plot_states.get(&id).cloned().unwrap_or(current);
                state.ranges = Some(plot::zoom(x, y, plot::wheel_zoom_factor(e.scroll.y), anchor));
                self.set_geometry_view(cx, &id, &view, state);
                true
            }
            _ => false,
        }
    }
    fn set_geometry_view(&mut self, cx: &mut Cx, id: &str, view: &WidgetRef, state: PlotState) {
        if let Some(mut g) = view.borrow_mut::<GeometryView>() {
            g.state = state.clone();
            g.redraw(cx);
        }
        self.plot_states.insert(id.to_owned(), state);
    }
    fn set_geometry_state(&mut self, cx: &mut Cx, id: &str, view: &WidgetRef, state: PlotState) {
        self.set_geometry_view(cx, id, view, state);
    }
    fn set_plot_state(&mut self, cx: &mut Cx, id: &str, plot: &WidgetRef, state: PlotState) {
        if let Some(mut v) = plot.borrow_mut::<PlotView>() {
            v.state = state.clone();
            v.redraw(cx);
        }
        self.plot_states.insert(id.to_owned(), state);
        // The card height may change (details, restore): re-measure.
        self.measure_relayout = true;
        self.relayout_frame = cx.new_next_frame();
    }
    /// Plot explorer input (web renderPlotExplorer): toolbar, 说明 toggle,
    /// wheel zoom inside the frame, drag-pan while exploring.
    fn plot_event(&mut self, cx: &mut Cx, hit: &Hit) -> bool {
        use oll_runtime::plot;
        match hit {
            Hit::FingerDown(e) => {
                let Some((id, view, world)) = self.plot_at(cx, e.abs) else { return false };
                let (tool, details, fraction, ranges, recommended_state) = {
                    let v = view.borrow::<PlotView>().unwrap();
                    (v.tool_at(world), v.details_contains(world), v.frame_fraction(world), v.current_ranges(), v.state.clone())
                };
                let mut state = self.plot_states.get(&id).cloned().unwrap_or(recommended_state);
                if let Some(tool) = tool {
                    match tool {
                        Tool::Explore => state.exploring = !state.exploring,
                        Tool::Restore => {
                            state.ranges = None;
                            state.hidden.clear();
                        }
                        Tool::Expand => self.plot_expand.push(id.clone()),
                    }
                    self.set_plot_state(cx, &id, &view, state);
                    return true;
                }
                if details {
                    state.details_open = !state.details_open;
                    self.set_plot_state(cx, &id, &view, state);
                    return true;
                }
                if state.exploring && fraction.is_some() {
                    if let Some(r) = ranges {
                        self.plot_drag = Some((id, r, e.abs));
                        cx.set_cursor(MouseCursor::Grabbing);
                        return true;
                    }
                }
                false
            }
            Hit::FingerMove(e) => {
                let Some((id, start, at)) = self.plot_drag.clone() else { return false };
                let Some((_, _, w)) = self.entries.iter().find(|(i, _, _)| *i == id) else { return true };
                let view = w.widget(cx, ids!(plot));
                let Some((px, py)) = view.borrow::<PlotView>().and_then(|v| v.data_per_world()) else { return true };
                let delta = (e.abs - at) / self.camera.scale;
                let next = plot::pan(start.0, start.1, -delta.x * px, delta.y * py);
                let mut state = self.plot_states.get(&id).cloned().unwrap_or_default();
                state.ranges = Some(next);
                if let Some(mut v) = view.borrow_mut::<PlotView>() {
                    v.state = state.clone();
                    v.redraw(cx);
                }
                self.plot_states.insert(id, state);
                true
            }
            Hit::FingerUp(_) => {
                if self.plot_drag.take().is_none() {
                    return false;
                }
                cx.set_cursor(MouseCursor::Grab);
                true
            }
            Hit::FingerScroll(e) => {
                let Some((id, view, world)) = self.plot_at(cx, e.abs) else { return false };
                let (fraction, ranges, current) = {
                    let v = view.borrow::<PlotView>().unwrap();
                    (v.frame_fraction(world), v.current_ranges(), v.state.clone())
                };
                let (Some(anchor), Some((x, y))) = (fraction, ranges) else { return false };
                let mut state = self.plot_states.get(&id).cloned().unwrap_or(current);
                state.ranges = Some(plot::zoom(x, y, plot::wheel_zoom_factor(e.scroll.y), anchor));
                if let Some(mut v) = view.borrow_mut::<PlotView>() {
                    v.state = state.clone();
                    v.redraw(cx);
                }
                self.plot_states.insert(id, state);
                true
            }
            _ => false,
        }
    }
    fn scene_event(&mut self, cx: &mut Cx, hit: &Hit) -> bool {
        match hit {
            Hit::FingerDown(e) => {
                let Some((id, scene, world)) = self.scene_at(cx, e.abs) else {
                    return false;
                };
                let (button, inside, current) = {
                    let s = scene.borrow::<Scene3dView>().unwrap();
                    (s.button_at(world), s.scene_contains(world), s.view())
                };
                if let Some(index) = button {
                    let view = scene.borrow::<Scene3dView>().unwrap().control_view(index);
                    self.set_scene_view(cx, &id, &scene, view);
                    return true;
                }
                if inside {
                    self.orbit = Some((id, current));
                    cx.set_cursor(MouseCursor::Grabbing);
                    return true;
                }
                false
            }
            Hit::FingerMove(e) => {
                let Some((id, start)) = self.orbit.clone() else {
                    return false;
                };
                let delta = e.abs - e.abs_start;
                if let Some((_, _, w)) = self.entries.iter().find(|(i, _, _)| *i == id) {
                    let scene = w.widget(cx, ids!(scene));
                    self.set_scene_view(cx, &id, &scene, start.orbit(delta.x, delta.y));
                }
                true
            }
            Hit::FingerUp(_) => {
                if self.orbit.take().is_none() {
                    return false;
                }
                self.replay_pending_camera(cx);
                cx.set_cursor(MouseCursor::Grab);
                true
            }
            Hit::FingerScroll(e) => {
                let Some((id, scene, world)) = self.scene_at(cx, e.abs) else {
                    return false;
                };
                let (inside, current) = {
                    let s = scene.borrow::<Scene3dView>().unwrap();
                    (s.scene_contains(world), s.view())
                };
                if !inside {
                    return false;
                }
                // Same sign convention as the board zoom (scroll.y < 0 zooms
                // in), which is the web wheel deltaY convention.
                self.set_scene_view(cx, &id, &scene, current.wheel(e.scroll.y));
                true
            }
            _ => false,
        }
    }
}
impl SpatialBoard {
    fn replay_pending_camera(&mut self, cx: &mut Cx) {
        if let Some(to) = self.pending_camera.take() {
            self.animate_to(to);
            self.redraw(cx);
        }
    }
    fn world_point(&self, abs: DVec2) -> DVec2 {
        let local = abs - self.viewport.pos;
        let (x, y) = self.camera.view_to_world(local.x, local.y);
        dvec2(x, y)
    }
    /// A slider value for a track fraction, snapped to the step grid from
    /// min like an <input type=range>.
    fn track_value(row: &ControlModel, t: f64) -> f64 {
        let raw = row.min + t * (row.max - row.min);
        let v = if row.step > 0. {
            row.min + ((raw - row.min) / row.step).round() * row.step
        } else {
            raw
        };
        (v.clamp(row.min, row.max) * 1e12).round() / 1e12
    }
    fn stepped(row: &ControlModel, direction: f64) -> f64 {
        let step = if row.step > 0. { row.step } else { (row.max - row.min) / 100. };
        let index = ((row.value - row.min) / step).round() + direction;
        let v = (row.min + index * step).clamp(row.min, row.max);
        format!("{v:.15}").parse().unwrap_or(v)
    }
    /// World control panels: slider drags and the − + ↺ buttons.
    fn control_event(&mut self, cx: &mut Cx, hit: &Hit) -> bool {
        match hit {
            Hit::FingerDown(e) => {
                let world = self.world_point(e.abs);
                // Reflection "查看答案/收起答案" toggles (card areas are in world space).
                let toggled = self.reflection_cards.iter().find_map(|(_, id, _, card)| {
                    card.widget(cx, ids!(toggle)).area().rect(cx).contains(world).then(|| id.clone())
                });
                if let Some(id) = toggled {
                    if !self.open_reflections.remove(&id) {
                        self.open_reflections.insert(id);
                    }
                    self.relayout_frame = cx.new_next_frame();
                    return true;
                }
                // Practice panel actions.
                for (_, ids, _, card) in &self.task_cards {
                    for (i, task) in ids.iter().enumerate() {
                        let hit = |name: &str| {
                            card.widget(cx, &[LiveId::from_str(&format!("{name}_{i}"))])
                                .area()
                                .rect(cx)
                                .contains(world)
                        };
                        if hit("hint") {
                            self.task_requests.push(TaskRequest::Hint(task.clone()));
                            return true;
                        }
                        if hit("retry") {
                            self.task_requests.push(TaskRequest::Retry(task.clone()));
                            return true;
                        }
                    }
                }
                for (i, (_, _, _, card)) in self.attachment_cards.iter().enumerate() {
                    let Some((row, part, model)) = card.borrow::<ControlsCard>().and_then(|c| {
                        let (row, part) = c.hit(world)?;
                        Some((row, part, c.rows().get(row)?.clone()))
                    }) else {
                        continue;
                    };
                    let (value, control, commit) = match part {
                        Part::Track(t) => {
                            self.control_drag = Some((i, row));
                            (Self::track_value(&model, t), "slider", false)
                        }
                        Part::Minus => (Self::stepped(&model, -1.), "slider", true),
                        Part::Plus => (Self::stepped(&model, 1.), "slider", true),
                        Part::Reset => (model.initial, "reset", true),
                    };
                    self.control_requests.push(ControlRequest { alias: model.alias, value, control, commit, snap_distance: 0. });
                    if let (Part::Track(_), Some(mut c)) = (part, card.borrow_mut::<ControlsCard>()) {
                        c.set_dragging(cx, Some(row));
                    }
                    cx.set_cursor(MouseCursor::EwResize);
                    return true;
                }
                false
            }
            Hit::FingerMove(e) => {
                let Some((i, row)) = self.control_drag else { return false };
                let world = self.world_point(e.abs);
                if let Some(c) = self.attachment_cards.get(i).and_then(|(_, _, _, card)| card.borrow::<ControlsCard>()) {
                    if let Some(model) = c.rows().get(row) {
                        let value = Self::track_value(model, c.track_fraction(row, world.x));
                        self.control_requests.push(ControlRequest {
                            alias: model.alias.clone(),
                            value,
                            control: "slider",
                            commit: false,
                            snap_distance: 0.,
                        });
                    }
                }
                true
            }
            Hit::FingerUp(_) => {
                let Some((i, row)) = self.control_drag.take() else {
                    return false;
                };
                let scale = self.camera.scale;
                if let Some(mut c) = self.attachment_cards.get(i).and_then(|(_, _, _, card)| card.borrow_mut::<ControlsCard>()) {
                    c.set_dragging(cx, None);
                    // Commit the drag (web commitSliderOperation): the host snaps
                    // to an active task target within the on-screen snap radius.
                    let last = self.control_requests.iter().rev().find(|r| !r.commit).cloned();
                    if let Some(model) = c.rows().get(row) {
                        let value = last.filter(|r| r.alias == model.alias).map_or(model.value, |r| r.value);
                        self.control_requests.push(ControlRequest {
                            alias: model.alias.clone(),
                            value,
                            control: "slider",
                            commit: true,
                            // Web: 12px on screen, at most 4% of the range.
                            snap_distance: {
                                let range = model.max - model.min;
                                let px = c.track_width(row) * scale;
                                if px > 0. { (range * 12. / px).min(range * 0.04) } else { 0. }
                            },
                        });
                    }
                }
                self.replay_pending_camera(cx);
                true
            }
            _ => false,
        }
    }
}
/// Node members of a group, recursively (web syncGroups collect).
fn group_members(p: &Preview, id: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut stack = vec![id.to_owned()];
    let mut seen = BTreeSet::new();
    while let Some(g) = stack.pop() {
        if !seen.insert(g.clone()) {
            continue;
        }
        let Some(group) = p.groups.iter().find(|x| x["id"] == g.as_str()) else { continue };
        for m in group["members"].as_array().into_iter().flatten().filter_map(Value::as_str) {
            if p.nodes.iter().any(|n| n["id"] == m) {
                out.insert(m.to_owned());
            } else {
                stack.push(m.to_owned());
            }
        }
    }
    out
}
impl Widget for SpatialBoard {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event, _scope: &mut Scope) {
        if self.relayout_frame.is_event(event).is_some() {
            // The composition follows the viewport and host insets.
            if let Some(p) = self.board.clone() {
                self.signature.clear();
                if let Err(e) = self.set_state(cx, &p, None) {
                    eprintln!("Board relayout: {e}");
                }
                if std::mem::take(&mut self.reframe_pending) && !self.manual {
                    self.reframe();
                }
                self.redraw(cx);
            }
        }
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
        if self.input_blocked {
            return;
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
        if self.control_event(cx, &hit)
            || self.geometry_event(cx, &hit)
            || self.plot_event(cx, &hit)
            || self.scene_event(cx, &hit)
        {
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
                    self.jump_to(Camera {
                        x: start.x + delta.x,
                        y: start.y + delta.y,
                        ..start
                    });
                    self.redraw(cx);
                }
            }
            Hit::FingerUp(_) => {
                self.drag = None;
                self.replay_pending_camera(cx);
                cx.set_cursor(MouseCursor::Grab);
            }
            Hit::FingerScroll(e) => {
                let at = e.abs - self.viewport.pos;
                let to = self
                    .camera
                    .zoom_at(if e.scroll.y < 0. { 1.1 } else { 0.9 }, at.x, at.y);
                self.jump_to(to);
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
            self.reframe_pending = true;
            self.relayout_frame = cx.new_next_frame();
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
        let mut remeasured = false;
        let mut reflection_resized = false;
        for (id, r, w) in self
            .groups
            .iter()
            .map(|(r, w)| (None, r, w))
            .chain(self.entries.iter().map(|(id, r, w)| (Some(id), r, w)))
            .chain(self.attachment_cards.iter().map(|(_, _, r, w)| (None, r, w)))
            .chain(self.reflection_cards.iter().map(|(id, _, r, w)| (Some(id), r, w)))
            .chain(self.task_cards.iter().map(|(id, _, r, w)| (Some(id), r, w)))
        {
            let reflection = id.is_some_and(|id| id.starts_with("reflection:") || id.ends_with(":tasks"));
            let natural = reflection || id.is_some_and(|id| self.content_ids.contains(id));
            w.draw_walk_all(
                cx,
                scope,
                Walk {
                    abs_pos: Some(dvec2(r.x, r.y)),
                    width: Size::Fixed(r.width),
                    height: if natural { Size::fit() } else { Size::Fixed(r.height) },
                    ..Default::default()
                },
            );
            if let (Some(id), true) = (id, reflection) {
                // Web ResizeObserver on the rendered reflection card.
                let h = w.area().rect(cx).size.y;
                if h > 0. && (h - r.height).abs() > 1. {
                    if id.ends_with(":tasks") {
                        self.task_heights.insert(id.clone(), h);
                    } else {
                        self.reflection_heights.insert(id.clone(), h);
                    }
                    reflection_resized = true;
                }
            } else if let (Some(id), true) = (id, natural) {
                // Web syncNodes: max(72, rendered height) at the layout width.
                let h = w.area().rect(cx).size.y.max(72.);
                if (h - r.height).abs() >= 1. {
                    self.measured.insert(id.clone(), (r.width, h));
                    remeasured = true;
                }
            }
        }
        self.angle_controls = self
            .entries
            .iter()
            .filter_map(|(id, _, w)| {
                let g = w.widget(cx, ids!(geometry));
                let g = g.borrow::<GeometryView>()?;
                Some(json!({"node": id, "controls": g.debug_controls()}))
            })
            .collect();
        if (remeasured && self.measure_passes < 3) || reflection_resized {
            if remeasured {
                self.measure_passes += 1;
            }
            self.measure_relayout = true;
            self.relayout_frame = cx.new_next_frame();
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
        let attachments = self
            .geometry
            .attachments
            .iter()
            .map(|(id, r)| json!({"id":id,"x":r.x,"y":r.y,"width":r.width,"height":r.height}))
            .collect::<Vec<_>>();
        let (cursor, complete) = self.board.as_ref().map_or((0, false), |p| (p.cursor, p.complete()));
        json!({"cursor":cursor,"complete":complete,"camera":{"x":self.camera.x,"y":self.camera.y,"scale":self.camera.scale},"destination":{"x":self.destination.x,"y":self.destination.y,"scale":self.destination.scale},"attachments":attachments,"tracks":self.attachment_cards.iter().filter_map(|(a, _, _, card)| card.borrow::<ControlsCard>().map(|c| json!({"id": a.id, "rows": c.rows().iter().map(|r| &r.alias).collect::<Vec<_>>(), "tracks": c.track_rects()}))).collect::<Vec<_>>(),"angle_controls":self.angle_controls,"tasks":self.tasks.iter().map(|t| json!({"id": t.progress.task_id, "status": t.progress.status.as_str(), "attempts": t.progress.attempts.len(), "hint": t.current_hint})).collect::<Vec<_>>(),"insets":{"top":self.insets.top,"right":self.insets.right,"bottom":self.insets.bottom,"left":self.insets.left,"occlusions":self.insets.occlusions.iter().map(|o|json!([o.x,o.y,o.width,o.height])).collect::<Vec<_>>()},"manual":self.manual,"targets":self.targets,"nodes":nodes,"ink":self.ink.snapshot(),"drawing":self.drawing,"groups":self.geometry.groups.len(),"connections":self.routes.len(),"connection_segments":self.routes.iter().map(|r|r.points.len().saturating_sub(1)).sum::<usize>(),"transition":!self.manual && self.elapsed<0.68,"viewport":{"x":self.viewport.pos.x,"y":self.viewport.pos.y,"width":self.viewport.size.x,"height":self.viewport.size.y}}).to_string()
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
