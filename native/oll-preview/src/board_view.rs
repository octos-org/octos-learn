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
fn ascent(latex: &str) -> Result<f32, String> {
    // Same pinned font, display style and 15 * 1.75 scale used by MathView.
    let font = include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../makepad/widgets/resources/NewCMMath-Regular.otf"
    ));
    makepad_latex_math::layout(
        &makepad_latex_math::parse(latex),
        font,
        26.25,
        makepad_latex_math::MathStyle::Display,
    )
    .map(|l| l.ascent)
    .ok_or("公式基线计算失败".into())
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
pub fn math_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let row=widget(cx,"RoundedView{width:Fill height:Fill flow:Down padding:Inset{left:14 right:12 top:8 bottom:10} spacing:2 draw_bg +: {color:#fffdf8 border_radius:16 border_size:1 border_color:#e7e2d8}}")?;
    let caption = node["content"]["caption"].as_str().unwrap_or("");
    let header = widget(cx,"View{width:Fill height:Fit flow:Right align:Align{y:0.5} View{width:Fill height:1} kind_badge := Label{width:Fit text:\"MATH\" draw_text.text_style.font_size:8 draw_text.color:#a8b0ac}}")?;
    let equation = widget(cx, "View{width:Fill height:45 flow:Right spacing:0 align:Align{x:0.5}}")?;
    let latex = math_latex(node);
    let max_ascent = latex
        .iter()
        .map(|l| ascent(l))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .fold(0.0_f32, f32::max);
    let fragment_ids = values(&node["content"], "fragments");
    let mut fragments = Vec::new();
    for (index, latex) in latex.iter().enumerate() {
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
        let top = 4.0 + max_ascent - ascent(latex)?;
        let code=format!("SolidView{{width:Fit height:45 flow:Right padding:Inset{{left:3 right:3 top:{top} bottom:0}} draw_bg.color:{color}}}");
        let f = widget(cx, &code)?;
        formula_view::set_formula_color(cx, &f, latex, "#243b40")?;
        fragments.push(f);
    }
    children(cx, &equation, fragments)?;
    let caption = label(cx, caption)?;
    children(cx, &row, vec![header, equation, caption])?;
    Ok(row)
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
/// Note card (web sticky note): pale yellow card, bold title, body lines,
/// NOTE badge top-right.
pub fn note_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let c = &node["content"];
    let title = script_text(
        c["title"]
            .as_str()
            .or(c["caption"].as_str())
            .unwrap_or(""),
    );
    let mut body = Vec::new();
    for k in ["text", "details", "items"] {
        match &c[k] {
            Value::String(s) => body.push(script_text(s)),
            Value::Array(items) => {
                body.extend(items.iter().filter_map(Value::as_str).map(script_text))
            }
            _ => (),
        }
    }
    let fragments = values(c, "fragments")
        .iter()
        .filter_map(|f| f["text"].as_str())
        .collect::<String>();
    if !fragments.is_empty() {
        body.push(script_text(&fragments));
    }
    for (i, step) in values(c, "sequence").iter().enumerate() {
        if let Some(step) = step.as_str() {
            body.push(format!("{}. {}", i + 1, script_text(step)));
        }
    }
    let body = body.join("\\n");
    let title_row = if title.is_empty() {
        String::new()
    } else {
        format!("card_title := Label{{width:Fill height:Fit text:\"{title}\" draw_text.wrap:Words draw_text.text_style.font_size:13 draw_text.color:#3f3a28}}")
    };
    widget(cx,&format!("RoundedView{{width:Fill height:Fill flow:Down spacing:5 padding:Inset{{left:16 right:14 top:12 bottom:12}} draw_bg +: {{color:#fef9c3 border_radius:14 border_size:1 border_color:#f0e28a}}
        View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}}
            View{{width:Fill height:1}}
            kind_badge := Label{{width:Fit text:\"NOTE\" draw_text.text_style.font_size:8 draw_text.color:#a89c52}}
        }}
        {title_row}
        card_body := Label{{width:Fill height:Fit text:\"{body}\" draw_text.wrap:Words draw_text.text_style.font_size:11 draw_text.color:#57533a}}
    }}"))
}
/// Extra card height reserved for the caption label below a chart.
pub fn caption_extra(node: &Value) -> f64 {
    let caption = crate::chart_caption(node);
    if caption.is_empty() {
        return 0.;
    }
    let lines = (caption.chars().count() as f64 / 34.).ceil().max(1.);
    lines * 15. + 10.
}
/// Header height reserved above a chart (title row + action pills).
pub const CHART_HEADER: f64 = 64.;
pub fn measure(node: &Value) -> Result<(f64, f64), String> {
    match node["kind"].as_str().unwrap_or("") {
        "math" => {
            let font = include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../../makepad/widgets/resources/NewCMMath-Regular.otf"
            ));
            let mut width = 0.;
            for latex in math_latex(node) {
                let layout = makepad_latex_math::layout(
                    &makepad_latex_math::parse(&latex),
                    font,
                    26.25,
                    makepad_latex_math::MathStyle::Display,
                )
                .ok_or("无法测量公式")?;
                width += layout.width as f64 + 6.;
            }
            Ok(((width + 32.).max(280.), 112.))
        }
        "plot" => Ok((440., 390. + CHART_HEADER + caption_extra(node))),
        "geometry" => Ok((440., 440. + CHART_HEADER + caption_extra(node))),
        "note" | "text" | "diagram" => {
            let text = node_notes(node);
            let lines = text
                .split('\n')
                .map(|l| (l.chars().count() as f64 / 25.).ceil().max(1.))
                .sum::<f64>();
            Ok((400., (lines * 26. + 32.).max(100.)))
        }
        _ => Err("暂不支持此节点的原生空间测量".into()),
    }
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
    let row=widget(cx,"RectView{width:Fill height:Fill flow:Down padding:14 spacing:8 draw_bg.color:#fffdf8 draw_bg.border_size:1 draw_bg.border_color:#e3d9cb}")?;
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
