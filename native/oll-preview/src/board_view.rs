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
        "Label{width:Fill height:Fit draw_text.wrap:Words draw_text.text_style.font_size:11}",
    )?;
    w.set_text(cx, text);
    Ok(w)
}
fn values<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v[key].as_array().map(Vec::as_slice).unwrap_or(&[])
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
            .filter_map(|v| v["latex"].as_str())
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
pub fn math_node(cx: &mut Cx, node: &Value) -> Result<WidgetRef, String> {
    let row=widget(cx,"RectView{width:Fill height:Fill flow:Down padding:12 spacing:6 draw_bg.color:#303844 draw_bg.border_size:1 draw_bg.border_color:#536273}")?;
    let caption = node["content"]["caption"].as_str().unwrap_or("");
    let equation = widget(cx, "View{width:Fill height:45 flow:Right spacing:0}")?;
    let max_ascent = values(&node["content"], "fragments")
        .iter()
        .map(|f| ascent(f["latex"].as_str().unwrap_or("")))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .fold(0.0_f32, f32::max);
    let mut fragments = Vec::new();
    for fragment in values(&node["content"], "fragments") {
        let emphasis = values(node, "emphasis").iter().rev().find(|e| {
            e["target"]["fragment_id"].is_null() || e["target"]["fragment_id"] == fragment["id"]
        });
        let color = match emphasis.and_then(|e| e["emphasis"].as_str()) {
            Some("focus") => "#665020",
            Some("supporting") => "#245846",
            _ => "#0000",
        };
        let top = 4.0 + max_ascent - ascent(fragment["latex"].as_str().unwrap_or(""))?;
        let code=format!("SolidView{{width:Fit height:45 flow:Right padding:Inset{{left:3 right:3 top:{top} bottom:0}} draw_bg.color:{color}}}");
        let f = widget(cx, &code)?;
        formula_view::set_formula(
            cx,
            &f,
            fragment["latex"].as_str().ok_or("公式片段缺少 latex")?,
        )?;
        fragments.push(f);
    }
    children(cx, &equation, fragments)?;
    let caption = label(cx, caption)?;
    children(cx, &row, vec![caption, equation])?;
    Ok(row)
}
pub fn measure(node: &Value) -> Result<(f64, f64), String> {
    match node["kind"].as_str().unwrap_or("") {
        "math" => {
            let font = include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../../makepad/widgets/resources/NewCMMath-Regular.otf"
            ));
            let mut width = 0.;
            for f in values(&node["content"], "fragments") {
                let layout = makepad_latex_math::layout(
                    &makepad_latex_math::parse(f["latex"].as_str().ok_or("公式缺少 latex")?),
                    font,
                    26.25,
                    makepad_latex_math::MathStyle::Display,
                )
                .ok_or("无法测量公式")?;
                width += layout.width as f64 + 6.;
            }
            Ok(((width + 32.).max(280.), 112.))
        }
        "plot" => Ok((440., 390.)),
        "geometry" => Ok((440., 440.)),
        "note" | "text" => {
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
    lines.join("\n")
}
