//! A compact native review board. Logical groups and relations are listed;
//! this is not yet a spatial layout/zoom implementation of OLL placement.
use crate::formula_view;
use makepad_widgets::*;
use oll_runtime::preview::Preview;
use serde_json::Value;

fn widget(cx: &mut Cx, code: &str) -> Result<WidgetRef, String> {
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
fn children(cx: &mut Cx, parent: &WidgetRef, values: Vec<WidgetRef>) -> Result<(), String> {
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
fn label(cx: &mut Cx, text: &str) -> Result<WidgetRef, String> {
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
pub fn set_board(cx: &mut Cx, container: &WidgetRef, p: &Preview) -> Result<(), String> {
    let mut rows = Vec::new();
    for node in p.nodes.iter().filter(|n| n["kind"] == "math") {
        let row = widget(cx, "View{width:Fill height:80 flow:Down spacing:3}")?;
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
        rows.push(row);
    }
    children(cx, container, rows)
}
pub fn notes(p: &Preview) -> String {
    p.nodes
        .iter()
        .filter(|n| n["kind"] == "note" || n["kind"] == "text")
        .map(|n| {
            let c = &n["content"];
            let mut lines = Vec::new();
            for key in ["title", "text"] {
                if let Some(s) = c[key].as_str() {
                    lines.push(s.to_owned());
                }
            }
            for key in ["details", "items"] {
                lines.extend(
                    values(c, key)
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned),
                );
            }
            lines.join(" · ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}
