//! Native composition for top-level LaTeX text runs. Math stays in MathView;
//! text uses Makepad's normal font fallback. No course string is rewritten.
use makepad_widgets::*;

#[derive(Debug, PartialEq)]
pub enum Run {
    Math(String),
    Text(String),
}

pub fn runs(source: &str) -> Result<Vec<Run>, String> {
    if source.contains("\\text{")
        && ["\\begin", "\\left", "\\right", "_\\text", "^\\text"]
            .iter()
            .any(|token| source.contains(token))
    {
        return Err("环境、定界符或上下标中的文字暂不支持混排，保留完整公式原文".into());
    }

    let mut result = Vec::new();
    let mut cursor = 0;
    let mut start = 0;
    let mut depth = 0usize;
    while cursor < source.len() {
        let rest = &source[cursor..];
        if rest.starts_with("\\text{") {
            if depth != 0 {
                return Err("嵌套的文字片段暂不支持混排，保留完整公式原文".into());
            }
            if start < cursor {
                result.push(Run::Math(source[start..cursor].into()));
            }
            cursor += 6;
            let mut value = String::new();
            let mut closed = false;
            while cursor < source.len() {
                let c = source[cursor..].chars().next().unwrap();
                cursor += c.len_utf8();
                match c {
                    '}' => {
                        closed = true;
                        break;
                    }
                    '{' => return Err("文字片段内的嵌套分组暂不支持，保留完整公式原文".into()),
                    '\\' => {
                        let next = source[cursor..].chars().next().ok_or("不完整的文字转义")?;
                        if !matches!(next, '{' | '}' | '%' | '_' | '#' | '&' | '$' | '\\') {
                            return Err("文字片段内的命令暂不支持，保留完整公式原文".into());
                        }
                        value.push(next);
                        cursor += next.len_utf8();
                    }
                    _ => value.push(c),
                }
            }
            if !closed {
                return Err("文字片段缺少右花括号".into());
            }
            result.push(Run::Text(value));
            start = cursor;
            continue;
        }
        let c = rest.chars().next().unwrap();
        cursor += c.len_utf8();
        match c {
            '\\' => {
                // Skip a control sequence, including escaped braces.
                if let Some(next) = source[cursor..].chars().next() {
                    cursor += next.len_utf8();
                    if next.is_ascii_alphabetic() {
                        while cursor < source.len()
                            && source.as_bytes()[cursor].is_ascii_alphabetic()
                        {
                            cursor += 1;
                        }
                    }
                }
            }
            '{' => depth += 1,
            '}' => depth = depth.checked_sub(1).ok_or("公式花括号不匹配")?,
            _ => (),
        }
    }
    if depth != 0 {
        return Err("公式花括号不匹配".into());
    }
    if start < source.len() {
        result.push(Run::Math(source[start..].into()));
    }
    Ok(result)
}

/// Rebuild only when the source changes. Unhandled text nesting is shown verbatim
/// with a visible diagnostic, never passed to MathView where glyphs could vanish.
pub fn set_formula(cx: &mut Cx, container: &WidgetRef, source: &str) -> Result<(), String> {
    let parsed = runs(source);
    let (segments, diagnostic) = match parsed {
        Ok(r) => (r, None),
        Err(e) => (vec![Run::Text(source.into())], Some(e)),
    };
    let mut children = Vec::new();
    for (i, run) in segments.into_iter().enumerate() {
        let (code,value)=match run {
            Run::Math(text)=>("use mod.prelude.widgets.*\nreturn MathView{font_size:15 baseline_offset:0}",text),
            Run::Text(text)=>("use mod.prelude.widgets.*\nreturn Label{padding:0 draw_text.color:#fff draw_text.text_style.font_size:18}",text),
        };
        let widget = cx.with_vm(|vm| {
            let value = vm
                .eval_checked(
                    ScriptMod {
                        cargo_manifest_path: env!("CARGO_MANIFEST_DIR").into(),
                        module_path: module_path!().into(),
                        file: file!().into(),
                        line: 1,
                        column: 0,
                        code: code.into(),
                        values: Vec::new(),
                    },
                    100_000,
                )
                .ok_or("无法创建原生公式组件")?;
            Ok::<_, String>(WidgetRef::script_from_value(vm, value))
        })?;
        widget.set_text(cx, &value);
        children.push((LiveId::from_str(&format!("formula_run_{i}")), widget));
    }
    if let Some(mut view) = container.borrow_mut::<View>() {
        view.children.clear();
        view.children.extend(children);
        view.redraw(cx);
    } else {
        return Err("公式容器不是 View".into());
    }
    if let Some(e) = diagnostic {
        Err(e)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_course_preserves_text_and_math_order() {
        let input = r"\angle BAD=\angle CAD\Rightarrow AD\text{ 平分 }\angle A";
        assert_eq!(
            runs(input).unwrap(),
            vec![
                Run::Math(r"\angle BAD=\angle CAD\Rightarrow AD".into()),
                Run::Text(" 平分 ".into()),
                Run::Math(r"\angle A".into())
            ]
        );
    }
    #[test]
    fn multiple_runs_unicode_and_escaped_braces() {
        assert_eq!(
            runs(r"x\text{ 中文\{值\} }+y\text{长度}").unwrap(),
            vec![
                Run::Math("x".into()),
                Run::Text(" 中文{值} ".into()),
                Run::Math("+y".into()),
                Run::Text("长度".into())
            ]
        );
    }
    #[test]
    fn existing_math_is_not_rewritten() {
        for text in [
            r"x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}",
            r"\begin{pmatrix}a&b\\c&d\end{pmatrix}",
            r"\int_0^\infty e^{-x^2}dx",
        ] {
            assert_eq!(runs(text).unwrap(), vec![Run::Math(text.into())]);
        }
    }
    #[test]
    fn rejects_nesting_and_malformed_text_instead_of_dropping_it() {
        for text in [
            r"\frac{\text{中文}}{2}",
            r"\text{中文",
            r"\text{a{b}}",
            r"\text{\unknown}",
            r"\begin{matrix}\text{中文}\end{matrix}",
            r"x_\text{中文}",
        ] {
            assert!(runs(text).is_err(), "{text}");
        }
    }
}
