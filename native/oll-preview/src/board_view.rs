//! Native card construction and font measurement for the spatial board.
use crate::formula_view;
use makepad_widgets::*;
use oll_runtime::preview::Preview;
use serde_json::Value;

pub fn widget(cx: &mut Cx, code: &str) -> Result<WidgetRef, String> {
    cx.with_vm(|vm| {
        let value = vm
            .eval_checked(
                ScriptMod {
                    cargo_manifest_path: env!("CARGO_MANIFEST_DIR").into(),
                    module_path: module_path!().into(),
                    file: file!().into(),
                    line: 1,
                    column: 0,
                    code: format!("use mod.prelude.widgets.*\nreturn {code}"),
                    values: Vec::new(),
                },
                100_000,
            )
            .ok_or("无法创建白板组件")?;
        Ok(WidgetRef::script_from_value(vm, value))
    })
}
pub fn children(cx: &mut Cx, parent: &WidgetRef, values: Vec<WidgetRef>) -> Result<(), String> {
    let mut view = parent.borrow_mut::<View>().ok_or("白板容器不是 View")?;
    view.children.clear();
    view.children.extend(
        values
            .into_iter()
            .enumerate()
            .map(|(i, w)| (LiveId::from_str(&format!("board_item_{i}")), w)),
    );
    view.redraw(cx);
    Ok(())
}
pub fn label(cx: &mut Cx, text: &str) -> Result<WidgetRef, String> {
    let w = widget(
        cx,
        "Label{width:Fill height:Fit draw_text.wrap:Words draw_text.text_style.font_size:11 draw_text.color:#3c3832}",
    )?;
    w.set_text(cx, text);
    Ok(w)
}
fn values<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v[key].as_array().map(Vec::as_slice).unwrap_or(&[])
}
/// Text embedded into eval'd widget code must not break the string literal.
fn script_text(text: &str) -> String {
    text.replace(['"', '\\', '\n'], " ")
}
pub fn name(p: &Preview, id: &str) -> String {
    if let Some(g) = p.groups.iter().find(|n| n["id"] == id) {
        return g["title"].as_str().unwrap_or(id).into();
    }
    if let Some(n) = p.nodes.iter().find(|n| n["id"] == id) {
        let c = &n["content"];
        for k in ["caption", "title", "text"] {
            if let Some(s) = c[k].as_str() {
                return s.into();
            }
        }
        let formula = values(c, "fragments")
            .iter()
            .filter_map(|v| v["latex"].as_str().or(v["text"].as_str()))
            .collect::<String>();
        if !formula.is_empty() {
            return formula;
        }
        if n["kind"] == "plot" {
            return "函数图像".into();
        }
    }
    id.rsplit(':').next().unwrap_or(id).into()
}
pub fn target_name(p: &Preview, target: &Value) -> String {
    let id = target["node_id"]
        .as_str()
        .or(target["group_id"].as_str())
        .or(target["connection_id"].as_str())
        .unwrap_or("");
    let mut result = name(p, id);
    if let Some(fragment) = target["fragment_id"].as_str() {
        if let Some(n) = p.nodes.iter().find(|v| v["id"] == id) {
            for key in ["fragments", "points", "guides", "curves"] {
                if let Some(f) = values(&n["content"], key)
                    .iter()
                    .find(|v| v["id"] == fragment)
                {
                    result.push_str(" · ");
                    result.push_str(
                        f["latex"]
                            .as_str()
                            .or(f["label"].as_str())
                            .or(f["text"].as_str())
                            .unwrap_or(fragment),
                    );
                    break;
                }
            }
        }
    }
    result
}
/// Latex runs of a math node: fragment-based courses use content.fragments;
/// simpler packs (slope) put a single string in content.latex.
fn math_latex(node: &Value) -> Vec<String> {
    let c = &node["content"];
    let fragments = values(c, "fragments");
    if !fragments.is_empty() {
        return fragments
            .iter()
            .map(|f| f["latex"].as_str().unwrap_or("").to_owned())
            .collect();
    }
    c["latex"]
        .as_str()
        .map(|latex| vec![latex.to_owned()])
        .unwrap_or_default()
}
/// Web text box: CSS px size and line-height; spacing lives on the wrapping
/// View because Label applies its own padding twice (see octos-learn
/// web_text). `fill` wraps at the card width.
fn text_box(text: &str, px: f64, line_height: f64, color: &str, bold: bool, fill: bool, margin: (f64, f64)) -> String {
    let style = if bold { "theme.font_bold" } else { "theme.font_regular" };
    let leading = ((line_height - 1.18) * px / 2.).max(0.);
    let (width, wrap) = if fill { ("Fill", "draw_text.wrap:Words") } else { ("Fit", "") };
    format!(
        "View{{width:{width} height:Fit padding:Inset{{top:{:.2} bottom:{:.2}}} Label{{width:{width} padding:0 text:\"{}\" {wrap} draw_text.text_style: {style}{{font_size:{:.2} line_spacing:{:.3}}} draw_text.color:{color}}}}}",
        margin.0 + leading,
        margin.1 + leading,
        script_text(text),
        px * 0.75,
        line_height / 1.18
    )
}
/// Web `.board-node::before` kind badge: 9px monospace, top 8 right 10,
/// out of flow (the card root is an Overlay).
fn badge(kind: &str, color: &str) -> String {
    format!("View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} padding:Inset{{right:10 top:8}}
        kind_badge := Label{{width:Fit padding:0 text:\"{}\" draw_text.text_style: theme.font_code{{font_size:6.75}} draw_text.color:{color}}}}}", kind.to_uppercase())
}
/// Web math cards: 24px card font, KaTeX renders at 1.04em = 24.96px for
/// both math and \\text runs.
const KATEX_EM: f32 = 24.96;
fn formula_metrics(latex: &str) -> Result<(f32, f32, f32), String> {
    let font = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../makepad/widgets/resources/NewCMMath-Regular.otf"
    ));
    makepad_latex_math::layout(
        &makepad_latex_math::parse(&formula_view::parser_safe(latex)),
        font,
        KATEX_EM,
        makepad_latex_math::MathStyle::Display,
    )
    .map(|l| (l.width, l.ascent, l.descent))
    .ok_or("公式基线计算失败".into())
}
/// Math card (web `.board-node.kind-math`): padding 12px 18px around the
/// display formula, badge out of flow, optional caption below. Height and width follow the
/// rendered formula (web measuredMathWidth / offsetHeight).
pub fn math_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let caption = node["content"]["caption"].as_str().unwrap_or("");
    let rows = math_rows(node);
    let card_width = math_width(node)?;
    let caption_box = if caption.is_empty() {
        String::new()
    } else {
        text_box(caption, 14., 1.5, "#6b6258", false, true, (0., 0.))
    };
    let root = widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:#fffdf7 border_radius:16 border_size:1 border_color:#d8d0c2}}
        View{{width:Fill height:Fit flow:Down padding:Inset{{left:18 right:18 top:12 bottom:12}}
            lines := View{{width:Fill height:Fit flow:Down}}
            {caption_box}
        }}
        {}
    }}", badge("math", "#aaa194")))?;
    let fragment_ids = values(&node["content"], "fragments");
    let mut line_views = Vec::new();
    let mut index = 0;
    for row in &rows {
        // Web fitRenderedMath: scale a display line down to the card width.
        let row_width = row.iter().map(|l| line_width(l)).sum::<Result<f64, String>>()?;
        let scale = ((card_width - MATH_INSETS) / row_width).min(1.);
        let metrics = row.iter().map(|l| formula_metrics(l)).collect::<Result<Vec<_>, _>>()?;
        let max_ascent = metrics.iter().map(|m| m.1).fold(0.0_f32, f32::max) as f64 * scale;
        let max_descent = metrics.iter().map(|m| m.2).fold(0.0_f32, f32::max) as f64 * scale;
        // Web resets KaTeX display margins; a single line clamps the card at
        // 72px (row 46 + padding/border).
        let min_row = if rows.len() == 1 { 46. } else { 0. };
        let row_height = (max_ascent + max_descent + 4.).max(min_row);
        // Web: display lines of a split formula are centred; a single
        // display formula is left-aligned (.katex-display text-align: left).
        let align_x = if rows.len() > 1 { 0.5 } else { 0. };
        let line = widget(cx, &format!("View{{width:Fill height:{row_height} flow:Right spacing:0 align:Align{{x:{align_x} y:0.5}}}}"))?;
        let mut fragments = Vec::new();
        for (k, latex) in row.iter().enumerate() {
            let emphasis = values(node, "emphasis").iter().rev().find(|e| {
                e["target"]["fragment_id"].is_null()
                    || fragment_ids
                        .get(index)
                        .is_some_and(|f| e["target"]["fragment_id"] == f["id"])
            });
            let color = match emphasis.and_then(|e| e["emphasis"].as_str()) {
                Some("focus") => "#f4e0ac",
                Some("supporting") => "#d3e7d6",
                _ => "#0000",
            };
            let top = max_ascent - metrics[k].1 as f64 * scale;
            let height = max_ascent + max_descent + 4.;
            let f = widget(cx, &format!("SolidView{{width:Fit height:{height} flow:Right padding:Inset{{left:3 right:3 top:{top} bottom:0}} draw_bg.color:{color}}}"))?;
            // MathView font_size is em / 1.75; Label sizes are points (px * 0.75).
            formula_view::set_formula_scaled(
                cx,
                &f,
                latex,
                "#163f3a",
                KATEX_EM as f64 / 1.75 * scale,
                KATEX_EM as f64 * 0.75 * scale,
            )?;
            fragments.push(f);
            index += 1;
        }
        children(cx, &line, fragments)?;
        line_views.push(line);
    }
    children(cx, &root.widget(cx, ids!(lines)), line_views)?;
    Ok(root)
}
/// Chart card (web board card chrome): white rounded card with the title
/// top-left, a muted kind badge top-right, the small 探索/大图 pills under
/// the badge, then the LinePlot and an optional caption row. The caption
/// text/visibility is refreshed by SpatialBoard::set_state (chart_caption),
/// because secant measurements follow variable bindings.
/// DIFF: the 探索/大图 pills are visual only — board cards get no events.
pub fn chart_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let kind = node["kind"].as_str().unwrap_or("");
    let badge = kind.to_uppercase();
    let title = script_text(
        node["content"]["title"]
            .as_str()
            .or_else(|| {
                values(&node["content"], "curves")
                    .first()
                    .and_then(|v| v["label"].as_str())
            })
            .unwrap_or(""),
    );
    widget(cx,&format!("RoundedView{{width:Fill height:Fill flow:Down draw_bg +: {{color: #ffffff border_radius: 16 border_size: 1 border_color: #e7e2d8}}
        View{{width:Fill height:Fit flow:Down padding:Inset{{left:18 right:14 top:12 bottom:2}}
            View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}}
                card_title := Label{{width:Fill height:20 text:\"{title}\" draw_text.text_style.font_size:15 draw_text.color:#243b40}}
                kind_badge := Label{{width:Fit text:\"{badge}\" draw_text.text_style.font_size:8 draw_text.color:#a8b0ac}}
            }}
            View{{width:Fill height:Fit flow:Right spacing:6 align:Align{{x:1. y:0.5}} margin:Inset{{top:4}}
                card_explore := Button{{text:\"探索\" padding:Inset{{left:9 right:9 top:3 bottom:3}} draw_text.text_style.font_size:11 draw_text.color:#6b6258 draw_bg +: {{color:#0000 color_hover:#f1efe9 border_radius:8 border_size:1 border_color:#dcd8cf}}}}
                card_expand := Button{{text:\"大图\" padding:Inset{{left:9 right:9 top:3 bottom:3}} draw_text.text_style.font_size:11 draw_text.color:#6b6258 draw_bg +: {{color:#0000 color_hover:#f1efe9 border_radius:8 border_size:1 border_color:#dcd8cf}}}}
            }}
        }}
        plot := mod.plot.LinePlot{{width:Fill height:Fill demo_data:false interactive:false plot_margin:Inset{{left:52 right:16 top:8 bottom:40}}}}
        caption_box := View{{visible:false width:Fill height:Fit padding:Inset{{left:18 right:18 bottom:10}} caption := Label{{width:Fill height:Fit draw_text.wrap:Words draw_text.text_style.font_size:10 draw_text.color:#6b6258 text:\"\"}}}}}}"))
}
/// scene3d card (web `.board-node.kind-scene3d`): 16px/18px padding, bold
/// 16px node title, SCENE3D badge pinned top-right, then the scene panel
/// (Scene3dView), which fills calc(100% - 24px) and is clipped by the card
/// bottom padding exactly as the web overflow does. The panel's content,
/// variables and camera are pushed by SpatialBoard::set_state.
pub fn scene3d_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let title = script_text(
        node["content"]["title"]
            .as_str()
            .or(node["content"]["label"].as_str())
            .unwrap_or(""),
    );
    widget(cx,&format!("RoundedView{{width:Fill height:Fill flow:Overlay draw_bg +: {{color:#fffdf7 border_radius:16 border_size:1 border_color:#d8d0c2}}
        View{{width:Fill height:Fill flow:Down padding:Inset{{left:18 right:18 top:16 bottom:6}}
            card_title := Label{{width:Fill height:24 text:\"{title}\" draw_text.text_style: theme.font_bold{{font_size:12}} draw_text.color:#243b40}}
            scene := mod.widgets.Scene3dView{{width:Fill height:Fill margin:Inset{{top:10}}}}
        }}
        View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} padding:Inset{{right:10 top:8}}
            kind_badge := Label{{width:Fit text:\"SCENE3D\" draw_text.text_style: theme.font_code{{font_size:6.75}} draw_text.color:#aaa194}}
        }}
    }}"))
}
/// Note card (web sticky note): pale yellow card, bold title, body lines,
/// NOTE badge top-right.
pub fn note_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let c = &node["content"];
    let title = c["title"].as_str().or(c["caption"].as_str()).unwrap_or("");
    // Web renders text as a paragraph and details/items as a bullet list.
    let mut paragraphs = Vec::new();
    let mut items = Vec::new();
    match &c["text"] {
        Value::String(s) => paragraphs.push(s.clone()),
        Value::Array(list) => items.extend(list.iter().filter_map(Value::as_str).map(str::to_owned)),
        _ => (),
    }
    for k in ["details", "items"] {
        match &c[k] {
            Value::String(s) => paragraphs.push(s.clone()),
            Value::Array(list) => items.extend(list.iter().filter_map(Value::as_str).map(str::to_owned)),
            _ => (),
        }
    }
    let fragments = values(c, "fragments")
        .iter()
        .filter_map(|f| f["text"].as_str())
        .collect::<String>();
    if !fragments.is_empty() {
        paragraphs.push(fragments);
    }
    for (i, step) in values(c, "sequence").iter().enumerate() {
        if let Some(step) = step.as_str() {
            items.push(format!("{}. {}", i + 1, step));
        }
    }
    let mut body = String::new();
    if !title.is_empty() {
        // .node-title: 16px/24px, weight 750, margin-bottom 8.
        body.push_str(&text_box(title, 16., 1.5, "#2f2b26", true, true, (0., 8.)));
    }
    for paragraph in &paragraphs {
        body.push_str(&text_box(paragraph, 14., 1.5, "#3f3a33", false, true, (0., 3.)));
    }
    for item in &items {
        // ul.content-list li: 14px/21px with a bullet in the list indent.
        body.push_str(&format!(
            "View{{width:Fill height:Fit flow:Right padding:Inset{{bottom:3}}
                View{{width:18 height:21 align:Align{{x:0.3 y:0.5}} Label{{padding:0 text:\"•\" draw_text.text_style.font_size:10.5 draw_text.color:#3f3a33}}}}
                {}
            }}",
            text_box(item, 14., 1.5, "#3f3a33", false, true, (0., 0.))
        ));
    }
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:#fff7cd border_radius:16 border_size:1 border_color:#d8d0c2}}
        View{{width:Fill height:Fit flow:Down padding:Inset{{left:18 right:18 top:16 bottom:13}}
            {body}
        }}
        {}
    }}", badge("note", "#aaa194")))
}
/// Thinking-question card (web `.learning-reflection-card.is-world`): header
/// "想一想" with a hint, the prompt, and a "查看答案" toggle; the reference
/// answer shows only when open. The toggle is `toggle` for hit-testing.
pub fn reflection_card(cx: &mut Cx, prompt: &str, answer: &str, open: bool) -> Result<WidgetRef, String> {
    let answer_box = if open {
        format!(
            "RoundedView{{width:Fill height:Fit padding:Inset{{left:12 right:12 top:10 bottom:10}} draw_bg +: {{color:#f5eed8cc border_radius:12}} {}}}",
            text_box(answer, 13., 1.55, "#4a4336", false, true, (0., 0.))
        )
    } else {
        String::new()
    };
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Down spacing:8 padding:14 draw_bg +: {{color:#fffaebf7 border_radius:18 border_size:1 border_color:#9a762638}}
        View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:1.}}
            {}
            View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} {}}}
        }}
        {}
        toggle := RoundedView{{width:Fit height:Fit padding:Inset{{left:12 right:12 top:5 bottom:5}} draw_bg +: {{color:#ffffff border_radius:12 border_size:1 border_color:#9a76264d}}
            {}
        }}
        {answer_box}
    }}",
        text_box("想一想", 13., 1.18, "#8a6212", true, false, (0., 0.)),
        text_box("先独立思考，再展开答案核对", 9., 1.18, "#827b72", false, false, (0., 0.)),
        text_box(prompt, 14., 1.5, "#373c38", true, true, (0., 0.)),
        text_box(if open { "收起答案" } else { "查看答案" }, 12., 1.18, "#8a6212", true, false, (0., 0.)),
    ))
}
/// Extra card height reserved for the caption label below a chart.
pub fn caption_extra(node: &Value) -> f64 {
    let caption = crate::chart_caption(node);
    if caption.is_empty() {
        return 0.;
    }
    let lines = (caption.chars().count() as f64 / 34.).ceil().max(1.);
    21. + lines * 18.
}
/// Header height reserved above a chart (title row + action pills).
pub const CHART_HEADER: f64 = 64.;
/// Web visibleContentLength: characters of every visible content string,
/// number and boolean (UTF-16 units), ignoring identifier fields.
fn visible_length(v: &Value) -> usize {
    match v {
        Value::Null => 0,
        Value::String(s) => s.encode_utf16().count(),
        Value::Number(n) => n.to_string().encode_utf16().count(),
        Value::Bool(b) => b.to_string().len(),
        Value::Array(items) => items.iter().map(visible_length).sum(),
        Value::Object(map) => map
            .iter()
            .filter(|(k, _)| !matches!(k.as_str(), "id" | "as" | "asset_id" | "source_region"))
            .map(|(_, v)| visible_length(v))
            .sum(),
    }
}
/// Web measureSemanticNode: the provisional size of every card before
/// anything is rendered (fixed visuals keep it; content cards are then
/// measured, see SpatialBoard::compute_layout).
pub fn estimate(node: &Value) -> (f64, f64) {
    let c = &node["content"];
    let length = visible_length(c) as f64;
    match node["kind"].as_str().unwrap_or("") {
        "geometry" => (440., if c["caption"].is_string() { 420. } else { 380. }),
        "scene3d" => (460., 360.),
        "plot" => (440., 390.),
        "diagram" => ((length * 3.2).clamp(280., 480.), (105. + (length / 60.).ceil() * 28.).min(260.)),
        "math" => ((length * 11.2).clamp(280., 680.), if length > 65. { 136. } else { 96. }),
        _ => ((length * 5.4).clamp(240., 440.), (82. + (length / 48.).ceil() * 24.).min(260.)),
    }
}
/// Web mathDisplayLines: long implication chains become display lines,
/// each continuation starting with \\Rightarrow.
pub fn math_display_lines(source: &str) -> Vec<String> {
    // Separators tried longest first so \\Longrightarrow is not read as
    // \\Rightarrow; surrounding whitespace belongs to the separator.
    const SEPARATORS: [&str; 6] = ["\\Longrightarrow", "\\Rightarrow", "\\implies", "=>", "⟹", "⇒"];
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut rest = source;
    while !rest.is_empty() {
        if let Some(sep) = SEPARATORS.iter().find(|s| rest.starts_with(**s)) {
            // A control word must end at a non-letter (\\Rightarrowx is not ours).
            let after = &rest[sep.len()..];
            let word_ends = !sep.starts_with('\\') || !after.starts_with(|c: char| c.is_ascii_alphabetic());
            if word_ends {
                parts.push(std::mem::take(&mut current));
                rest = after;
                continue;
            }
        }
        let c = rest.chars().next().unwrap();
        current.push(c);
        rest = &rest[c.len_utf8()..];
    }
    parts.push(current);
    let parts: Vec<&str> = parts.iter().map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    if parts.len() < 2 || (parts.len() == 2 && source.encode_utf16().count() < 52) {
        return vec![source.to_owned()];
    }
    std::iter::once(parts[0].to_owned())
        .chain(parts[1..].iter().map(|p| format!("\\Rightarrow {p}")))
        .collect()
}
/// Native width of one display line (math runs + 24px text runs).
fn line_width(latex: &str) -> Result<f64, String> {
    let mut width = 0.;
    match formula_view::runs(latex) {
        Ok(runs) => {
            for run in runs {
                width += match run {
                    formula_view::Run::Math(m) => formula_metrics(&m)?.0 as f64,
                    formula_view::Run::Text(t) => t
                        .chars()
                        .map(|c| if c == ' ' { 0.25 } else if c.is_ascii() { 0.55 } else { 1. } * KATEX_EM as f64)
                        .sum(),
                };
            }
        }
        Err(_) => width += formula_metrics(latex)?.0 as f64,
    }
    Ok(width + 6.)
}
/// Web math card: 18px padding + 1px border on each side, at most 680.
const MATH_INSETS: f64 = 38.;
const MATH_MAX_WIDTH: f64 = 680.;
/// The display lines of a math card: fragments stay on one inline row.
fn math_rows(node: &Value) -> Vec<Vec<String>> {
    let latex = math_latex(node);
    if values(&node["content"], "fragments").is_empty() && latex.len() == 1 {
        math_display_lines(&latex[0]).into_iter().map(|l| vec![l]).collect()
    } else {
        vec![latex]
    }
}
/// Rendered formula card width (web measuredMathWidth / mathCardWidth).
pub fn math_width(node: &Value) -> Result<f64, String> {
    let mut widest: f64 = 0.;
    for row in math_rows(node) {
        let w = row.iter().map(|l| line_width(l)).sum::<Result<f64, String>>()?;
        widest = widest.max(w);
    }
    Ok((widest + MATH_INSETS).min(MATH_MAX_WIDTH).ceil())
}
/// Height of a fixed-size card (visuals keep their provisional height; plots
/// size to content: 360 plus caption rows).
pub fn fixed_height(node: &Value) -> Option<f64> {
    match node["kind"].as_str().unwrap_or("") {
        "plot" => Some(360. + caption_extra(node)),
        "geometry" | "scene3d" => Some(estimate(node).1),
        "diagram" if node["content"]["elements"].is_array() => Some(estimate(node).1),
        _ => None,
    }
}
/// Kinds whose height the Web measures from the rendered card.
pub fn content_sized(node: &Value) -> bool {
    matches!(node["kind"].as_str().unwrap_or(""), "math" | "note" | "text")
        || (node["kind"] == "diagram" && !node["content"]["elements"].is_array())
}
pub fn node_notes(node: &Value) -> String {
    let c = &node["content"];
    let mut lines = Vec::new();
    for k in ["caption", "title", "text"] {
        if let Some(s) = c[k].as_str() {
            lines.push(s.to_owned());
        }
    }
    for k in ["details", "items"] {
        lines.extend(
            values(c, k)
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
    let fragments = values(c, "fragments")
        .iter()
        .filter_map(|f| f["text"].as_str())
        .collect::<String>();
    if !fragments.is_empty() {
        lines.push(fragments);
    }
    for (i, step) in values(c, "sequence").iter().enumerate() {
        if let Some(step) = step.as_str() {
            lines.push(format!("{}. {}", i + 1, step));
        }
    }
    lines.extend(
        values(c, "labels")
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned),
    );
    lines.join("\n")
}

/// Fragment cards retain the original text and emphasis; wrapping is owned by Makepad.
pub fn text_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let row=widget(cx,"RectView{width:Fill height:Fit flow:Down padding:14 spacing:8 draw_bg.color:#fffdf8 draw_bg.border_size:1 draw_bg.border_color:#e3d9cb}")?;
    let flow = widget(
        cx,
        "View{width:Fill height:Fit flow:Flow.Right{wrap:true} spacing:0}",
    )?;
    let mut children_list = vec![];
    for f in values(&node["content"], "fragments") {
        let e = values(node, "emphasis").iter().rev().find(|e| {
            e["target"]["fragment_id"].is_null() || e["target"]["fragment_id"] == f["id"]
        });
        let color = match e.and_then(|e| e["emphasis"].as_str()) {
            Some("focus") => "#f4e0ac",
            Some("supporting") => "#d3e7d6",
            _ => "#0000",
        };
        let box_view = widget(
            cx,
            &format!("SolidView{{width:Fit height:Fit padding:3 draw_bg.color:{color}}}"),
        )?;
        let text = widget(
            cx,
            "Label{width:Fit height:Fit draw_text.text_style.font_size:12 draw_text.color:#3c3832}",
        )?;
        text.set_text(cx, f["text"].as_str().unwrap_or(""));
        children(cx, &box_view, vec![text])?;
        children_list.push(box_view);
    }
    children(cx, &flow, children_list)?;
    let labels = label(
        cx,
        &values(&node["content"], "labels")
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(" · "),
    )?;
    children(cx, &row, vec![flow, labels])?;
    Ok(row)
}
