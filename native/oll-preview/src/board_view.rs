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
    let root = widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:#fffdf7 border_radius:8 border_size:0.5 border_color:#d8d0c2}}
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
        // Web: KaTeX's .katex-display > .katex { text-align: center } wins
        // over the runtime's text-align: left, and the display block spans
        // the card, so a formula narrower than its (stretched) card is centred.
        let align_x = 0.5;
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
    widget(cx,&format!("RoundedView{{width:Fill height:Fill flow:Down draw_bg +: {{color: #ffffff border_radius: 8 border_size: 0.5 border_color: #e7e2d8}}
        View{{width:Fill height:Fit flow:Down padding:Inset{{left:18 right:14 top:12 bottom:2}}
            View{{width:Fill height:Fit flow:Right align:Align{{y:0.5}}
                card_title := Label{{width:Fill height:20 text:\"{title}\" draw_text.text_style.font_size:15 draw_text.color:#243b40}}
                kind_badge := Label{{width:Fit text:\"{badge}\" draw_text.text_style.font_size:8 draw_text.color:#a8b0ac}}
            }}
            View{{width:Fill height:Fit flow:Right spacing:6 align:Align{{x:1. y:0.5}} margin:Inset{{top:4}}
                card_explore := Button{{text:\"探索\" padding:Inset{{left:9 right:9 top:3 bottom:3}} draw_text.text_style.font_size:11 draw_text.color:#6b6258 draw_bg +: {{color:#0000 color_hover:#f1efe9 border_radius:4 border_size:0.5 border_color:#dcd8cf}}}}
                card_expand := Button{{text:\"大图\" padding:Inset{{left:9 right:9 top:3 bottom:3}} draw_text.text_style.font_size:11 draw_text.color:#6b6258 draw_bg +: {{color:#0000 color_hover:#f1efe9 border_radius:4 border_size:0.5 border_color:#dcd8cf}}}}
            }}
        }}
        plot := mod.plot.LinePlot{{width:Fill height:Fill demo_data:false interactive:false plot_margin:Inset{{left:52 right:16 top:8 bottom:40}}}}
        caption_box := View{{visible:false width:Fill height:Fit padding:Inset{{left:18 right:18 bottom:10}} caption := Label{{width:Fill height:Fit draw_text.wrap:Words draw_text.text_style.font_size:10 draw_text.color:#6b6258 text:\"\"}}}}}}"))
}
/// Web renderContent node title: content.title / label, else the role
/// when it differs from the kind.
pub fn node_title(node: &Value) -> String {
    let c = &node["content"];
    let role = node["role"].as_str().unwrap_or("");
    let kind = node["kind"].as_str().unwrap_or("");
    c["title"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or(c["label"].as_str().filter(|s| !s.is_empty()))
        .map(str::to_owned)
        .unwrap_or_else(|| if !role.is_empty() && kind != "math" && role != kind { role.to_owned() } else { String::new() })
}
/// Plot card (web `.board-node.kind-plot`): padding 16/18, bold 16px node
/// title (margin-bottom 8), then the explorer body (`PlotView`: toolbar,
/// plot, measurement, details, legend). Content-sized: the Web measures
/// scrollHeight + 8, mirrored by an extra 8px bottom padding.
pub fn plot_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let title = node_title(node);
    let title_box = if title.is_empty() {
        String::new()
    } else {
        text_box(&title, 16., 1.4, "#243b40", true, true, (0., 8.))
    };
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:#fffdf7f7 border_radius:8 border_size:0.5 border_color:#d8d0c2}}
        View{{width:Fill height:Fit flow:Down padding:Inset{{left:18 right:18 top:16 bottom:24}}
            {title_box}
            plot := mod.widgets.PlotView{{}}
        }}
        {}
    }}", badge("plot", "#aaa194")))
}
/// Geometry card (web `.board-node.kind-geometry`): fixed card size (web
/// fixedVisualSize), padding 16/18, title, then the explorer body
/// (`GeometryView`), clipped by the card like the web overflow.
pub fn geometry_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let title = node_title(node);
    let title_box = if title.is_empty() {
        String::new()
    } else {
        text_box(&title, 16., 1.4, "#243b40", true, true, (0., 8.))
    };
    widget(cx, &format!("RoundedView{{width:Fill height:Fill flow:Overlay draw_bg +: {{color:#fffdf7f7 border_radius:8 border_size:0.5 border_color:#d8d0c2}}
        View{{width:Fill height:Fill flow:Down padding:Inset{{left:18 right:18 top:16 bottom:16}}
            {title_box}
            geometry := mod.widgets.GeometryView{{}}
        }}
        {}
    }}", badge("geometry", "#aaa194")))
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
    widget(cx,&format!("RoundedView{{width:Fill height:Fill flow:Overlay draw_bg +: {{color:#fffdf7 border_radius:8 border_size:0.5 border_color:#d8d0c2}}
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
        // ul.content-list li: 14px/21px in the 20px list indent; the
        // product's CSS reset removes list markers.
        body.push_str(&format!(
            "View{{width:Fill height:Fit flow:Right padding:Inset{{bottom:3}}
                View{{width:20 height:21}}
                {}
            }}",
            text_box(item, 14., 1.5, "#3f3a33", false, true, (0., 0.))
        ));
    }
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Overlay draw_bg +: {{color:#fff7cd border_radius:8 border_size:0.5 border_color:#d8d0c2}}
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
            "RoundedView{{width:Fill height:Fit padding:Inset{{left:12 right:12 top:10 bottom:10}} draw_bg +: {{color:#f5eed8cc border_radius:6}} {}}}",
            text_box(answer, 13., 1.55, "#4a4336", false, true, (0., 0.))
        )
    } else {
        String::new()
    };
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Down spacing:8 padding:14 draw_bg +: {{color:#fffaebf7 border_radius:9 border_size:0.5 border_color:#9a762638}}
        View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:1.}}
            {}
            View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} {}}}
        }}
        {}
        toggle := RoundedView{{width:Fit height:Fit padding:Inset{{left:12 right:12 top:5 bottom:5}} draw_bg +: {{color:#ffffff border_radius:6 border_size:0.5 border_color:#9a76264d}}
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
/// Web WhiteboardQuestionCard (`.learning-whiteboard-question-card`): 270
/// wide, 4px gold left edge, 我的问题 + status pill, the question (4 lines).
pub fn question_card(cx: &mut Cx, text: &str, status: &str) -> Result<WidgetRef, String> {
    let (label, fg, bg) = match status {
        "answered" => ("已回答", "#66736f", "#52706814"),
        "failed" => ("没有生成成功", "#9a4c38", "#ac4c331a"),
        _ => ("正在准备回答", "#23786f", "#23786f1a"),
    };
    widget(cx, &format!("RoundedView{{width:Fill height:Fit draw_bg +: {{color:#c7aa58 border_radius:7.5}}
        RoundedView{{width:Fill height:Fit flow:Down margin:Inset{{left:4}} padding:Inset{{left:12 right:16 top:15 bottom:14}}
            draw_bg +: {{color:#fffaf0 border_radius:7.5 border_size:0.5 border_color:#6f613e38}}
            View{{width:Fill height:Fit flow:Right spacing:10 align:Align{{y:0.5}}
                View{{width:Fill height:Fit {}}}
                RoundedView{{width:Fit height:Fit padding:Inset{{left:7 right:7 top:3 bottom:3}} draw_bg +: {{color:{bg} border_radius:6}}
                    {}}}
            }}
            View{{width:Fill height:Fit margin:Inset{{top:10}}
                Label{{width:Fill padding:0 max_lines:4 text:\"{}\" draw_text.wrap:Words draw_text.text_style.font_size:9.75 draw_text.text_style.line_spacing:1.37 draw_text.color:#3f4946}}}}
        }}
    }}",
        text_box("我的问题", 13., 1.18, "#5a4c2b", true, false, (0., 0.)),
        text_box(label, 10., 1.18, fg, false, false, (0., 0.)),
        script_text(text),
    ))
}

/// Web WhiteboardLoadingBlock (`.learning-whiteboard-loading-block`, lesson
/// kind): 360 wide, min 194 tall, OCTOS 正在准备 / title / detail and three
/// placeholder lines. DIFF: no particles or shimmer animation.
pub fn loading_card(cx: &mut Cx, title: &str, detail: &str) -> Result<WidgetRef, String> {
    let line = |w: f64| format!("RoundedView{{width:{w} height:5 draw_bg +: {{color:#5b71681a border_radius:2.5}}}}");
    widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Down padding:Inset{{left:24 right:24 top:22 bottom:21}}
        draw_bg +: {{color:#fffdf7 border_radius:9 border_size:0.5 border_color:#2d676033}}
        View{{width:Fill height:Fit flow:Down spacing:7
            {}
            {}
            View{{width:290 height:Fit {}}}
        }}
        View{{width:Fill height:Fit flow:Down spacing:8 margin:Inset{{top:17}}
            {} {} {}
        }}
    }}",
        text_box("O C T O S  正 在 准 备", 9., 1.18, "#4b827b", true, false, (0., 0.)),
        text_box(title, 18., 1.18, "#334d49", true, false, (0., 0.)),
        text_box(detail, 12., 1.7, "#687873", false, true, (0., 0.)),
        line(312.), line(243.), line(175.),
    ))
}

const ICON_LIGHTBULB: &str = include_str!("../../octos-learn/assets/icons/lightbulb.svg");
const ICON_CHECK: &str = include_str!("../../octos-learn/assets/icons/circle-check.svg");
const ICON_RETRY: &str = include_str!("../../octos-learn/assets/icons/rotate-ccw.svg");

/// An icon-only Button used as a static glyph inside a world card.
fn glyph(name: &str, size: f64, color: &str) -> String {
    format!("{name} := Button{{width:{size} height:{size} padding:0 text:\"\" icon_walk:Walk{{width:{size} height:{size}}} draw_icon +: {{color:{color}}} draw_bg +: {{color:#0000 color_hover:#0000 color_down:#0000 border_size:0 border_color:#0000}}}}")
}
/// A practice action button (web .learning-student-task-actions > button).
fn action_button(name: &str, label: &str) -> String {
    format!("{name} := Button{{height:30 text:\"{}\" spacing:5 padding:Inset{{left:9 right:9 top:5 bottom:5}}
        icon_walk:Walk{{width:15 height:15}} draw_icon +: {{color:#0d7082}}
        draw_text.color:#0d7082 draw_text.text_style.font_size:7.5
        draw_bg +: {{color:#16839812 color_hover:#16839824 color_down:#16839830 border_radius:4.5 border_size:0.5 border_color:#0d70822e}}}}", script_text(label))
}

/// Practice panel (web `.learning-student-tasks.is-world`, "动手试一试"):
/// one article per available task with its feedback, current hint and the
/// hint/retry actions. Buttons are `hint_<i>` / `retry_<i>` for hit-testing
/// by task index.
pub fn tasks_card(cx: &mut Cx, tasks: &[oll_runtime::tasks::Snapshot]) -> Result<WidgetRef, String> {
    use oll_runtime::tasks::Status;
    let mut body = String::new();
    for (i, t) in tasks.iter().enumerate() {
        let status = t.progress.status;
        let attempts = t.progress.attempts.len();
        let feedback = if status == Status::Succeeded {
            format!(
                "View{{width:Fill height:Fit flow:Right spacing:7 {} {}}}",
                glyph(&format!("ok_{i}"), 17., "#167251"),
                text_box(t.success_message.as_deref().unwrap_or("完成得很好，已经达到目标。"), 11., 1.45, "#167251", true, true, (0., 0.))
            )
        } else if attempts > 0 {
            let message = if status == Status::NeedsHint {
                "还没达到目标，可以查看提示后再试。"
            } else {
                "已经记录这次操作，再调整一下试试。"
            };
            format!(
                "View{{width:Fill height:Fit flow:Right spacing:7 {} {}}}",
                text_box(message, 11., 1.45, "#6f6a62", false, true, (0., 0.)),
                text_box(&format!("已尝试 {attempts} 次"), 9., 1.45, "#938c82", false, false, (0., 0.))
            )
        } else {
            text_box("轮到你操作了，完成后这里会立即反馈。", 11., 1.45, "#6f6a62", false, true, (0., 0.))
        };
        let hint = t.current_hint.as_ref().map_or(String::new(), |h| {
            format!(
                "RoundedView{{width:Fill height:Fit flow:Right spacing:7 padding:Inset{{left:9 right:9 top:8 bottom:8}} draw_bg +: {{color:#f4cf5f2e border_radius:5}} {} {}}}",
                glyph(&format!("bulb_{i}"), 16., "#745d23"),
                text_box(h, 11., 1.45, "#745d23", false, true, (0., 0.))
            )
        });
        let actions = if status != Status::Succeeded && attempts > 0 {
            let more_hints = t.progress.hints_revealed < t.hints.len();
            format!(
                "View{{width:Fill height:Fit flow:Right spacing:7 {} {}}}",
                if more_hints {
                    action_button(&format!("hint_{i}"), if t.current_hint.is_some() { "下一个提示" } else { "给我提示" })
                } else {
                    String::new()
                },
                action_button(&format!("retry_{i}"), "重新开始")
            )
        } else {
            String::new()
        };
        let (bg, border) = if status == Status::Succeeded {
            ("#e7f7efe6", "#1e846140")
        } else {
            ("#f5faf7d1", "#176b6224")
        };
        body.push_str(&format!(
            "RoundedView{{width:Fill height:Fit flow:Down spacing:9 padding:12 draw_bg +: {{color:{bg} border_radius:7 border_size:0.5 border_color:{border}}}
                {} {feedback} {hint} {actions}}}\n",
            text_box(&t.prompt, 14., 1.5, "#373c38", true, true, (0., 0.))
        ));
    }
    let card = widget(cx, &format!("RoundedView{{width:Fill height:Fit flow:Down spacing:10 padding:14 draw_bg +: {{color:#fffdf8f5 border_radius:9 border_size:0.5 border_color:#3f494324}}
        View{{width:Fill height:Fit flow:Right spacing:12 align:Align{{y:1.}}
            {}
            View{{width:Fill height:Fit flow:Right align:Align{{x:1.}} {}}}
        }}
        {body}
    }}",
        text_box("动手试一试", 13., 1.18, "#176b62", true, false, (0., 0.)),
        text_box("直接操作白板上的图形、视角或控制器", 9., 1.18, "#827b72", false, false, (0., 0.)),
    ))?;
    for i in 0..tasks.len() {
        for (prefix, icon) in [("ok", ICON_CHECK), ("bulb", ICON_LIGHTBULB), ("hint", ICON_LIGHTBULB), ("retry", ICON_RETRY)] {
            let id = LiveId::from_str(&format!("{prefix}_{i}"));
            if let Some(mut b) = card.widget(cx, &[id]).borrow_mut::<Button>() {
                b.draw_icon.load_from_str(icon);
            }
        }
    }
    Ok(card)
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
            // Empirical slack where a \text run meets a math run (Label vs
            // MathView side bearings): mixed CJK/math cards clipped by ~0.6em
            // otherwise. Errs toward a slightly wider card.
            width += runs.len().saturating_sub(1) as f64 * 0.3 * KATEX_EM as f64;
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
        "geometry" | "scene3d" => Some(estimate(node).1),
        "diagram" if node["content"]["elements"].is_array() => Some(estimate(node).1),
        _ => None,
    }
}
/// Kinds whose height the Web measures from the rendered card.
pub fn content_sized(node: &Value) -> bool {
    matches!(node["kind"].as_str().unwrap_or(""), "math" | "note" | "text" | "plot")
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
    let row=widget(cx,"RectView{width:Fill height:Fit flow:Down padding:14 spacing:8 draw_bg.color:#fffdf8 draw_bg.border_size:0.5 draw_bg.border_color:#e3d9cb}")?;
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
