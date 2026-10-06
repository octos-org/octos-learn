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

/// The pinned makepad-latex-math parser never consumes a top-level `]`
/// (parse_one returns None without advancing), so any formula with a plain
/// bracket pair such as `x \in [0, \pi]` spins forever. Rewrite plain
/// brackets to `\lbrack`/`\rbrack`, keeping `\sqrt[n]` optional arguments
/// and `\left[`/`\right]` delimiters, before anything reaches the parser.
pub fn parser_safe(math: &str) -> String {
    let math = function_spacing(math);
    let mut out = String::with_capacity(math.len() + 16);
    let mut chars = math.chars().peekable();
    let mut command = String::new();
    let mut sqrt_depth = 0usize;
    // Open braces, marking those that start a \text-like group.
    let mut braces: Vec<bool> = Vec::new();
    while let Some(c) = chars.next() {
        match c {
            '{' => {
                braces.push(matches!(command.as_str(), "text" | "textrm" | "textit" | "textbf" | "mathrm" | "rm" | "operatorname"));
                out.push(c);
            }
            '}' => {
                braces.pop();
                out.push(c);
            }
            // latex_math parses ' as ‖ (U+2016); draw the prime glyph instead
            // (KaTeX g' → g′, g'' → g″).
            '\'' if !braces.iter().any(|t| *t) => {
                let mut primes = 1;
                while chars.peek() == Some(&'\'') {
                    chars.next();
                    primes += 1;
                }
                let glyph = match primes {
                    1 => "′".to_owned(),
                    2 => "″".to_owned(),
                    3 => "‴".to_owned(),
                    n => "′".repeat(n),
                };
                out.push_str(&format!("\\text{{{glyph}}}"));
            }
            '\\' => {
                out.push(c);
                command.clear();
                // Copy the control word (or single escaped symbol) verbatim.
                if let Some(&next) = chars.peek() {
                    if next.is_ascii_alphabetic() {
                        while let Some(&n) = chars.peek() {
                            if !n.is_ascii_alphabetic() {
                                break;
                            }
                            command.push(n);
                            out.push(n);
                            chars.next();
                        }
                    } else {
                        out.push(next);
                        chars.next();
                    }
                }
                continue;
            }
            '[' if command == "sqrt" => {
                sqrt_depth += 1;
                out.push(c);
            }
            ']' if sqrt_depth > 0 => {
                sqrt_depth -= 1;
                out.push(c);
            }
            '[' if command == "left" || command == "right" => out.push(c),
            ']' if command == "left" || command == "right" => out.push(c),
            '[' => out.push_str("\\lbrack "),
            ']' => out.push_str("\\rbrack "),
            _ => out.push(c),
        }
        if !c.is_whitespace() {
            command.clear();
        }
    }
    out
}

/// latex_math pads operator names (\sin, \cos, …) with a thin space on
/// both sides; TeX only puts one between the operator and an ordinary atom
/// (\sin\theta, 2\sin x) and none next to brackets or relations
/// (P=(\cos\theta, \sin\theta), \sin(x)). Rewrite the non-limit names to
/// upright text and add \, where TeX would.
fn function_spacing(math: &str) -> String {
    const NAMES: [&str; 15] = ["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "exp"];
    let chars: Vec<char> = math.chars().collect();
    let mut out = String::with_capacity(math.len() + 16);
    let mut braces: Vec<bool> = Vec::new();
    let mut last_command = String::new();
    let ordinary_before = |out: &str| {
        let t = out.trim_end();
        t.ends_with(|c: char| c.is_alphanumeric() || matches!(c, ')' | ']' | '}' | '|'))
            && !t.ends_with("\\left(")
    };
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() && chars[i + 1].is_ascii_alphabetic() {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_ascii_alphabetic() {
                j += 1;
            }
            let name: String = chars[i + 1..j].iter().collect();
            if NAMES.contains(&name.as_str()) && !braces.iter().any(|t| *t) {
                let before = if ordinary_before(&out) { "\\," } else { "" };
                // Scripts stay attached to the operator.
                let mut k = j;
                let mut scripts = String::new();
                loop {
                    while k < chars.len() && chars[k] == ' ' {
                        k += 1;
                    }
                    if k >= chars.len() || !matches!(chars[k], '^' | '_') {
                        break;
                    }
                    scripts.push(chars[k]);
                    k += 1;
                    while k < chars.len() && chars[k] == ' ' {
                        k += 1;
                    }
                    if k < chars.len() && chars[k] == '{' {
                        let mut depth = 0;
                        while k < chars.len() {
                            scripts.push(chars[k]);
                            if chars[k] == '{' { depth += 1 } else if chars[k] == '}' { depth -= 1 }
                            k += 1;
                            if depth == 0 { break }
                        }
                    } else if k < chars.len() && chars[k] == '\\' {
                        scripts.push('\\');
                        k += 1;
                        while k < chars.len() && chars[k].is_ascii_alphabetic() {
                            scripts.push(chars[k]);
                            k += 1;
                        }
                    } else if k < chars.len() {
                        scripts.push(chars[k]);
                        k += 1;
                    }
                }
                let mut n = k;
                while n < chars.len() && chars[n] == ' ' {
                    n += 1;
                }
                let next_command: String = if n < chars.len() && chars[n] == '\\' {
                    chars[n + 1..].iter().take_while(|c| c.is_ascii_alphabetic()).collect()
                } else {
                    String::new()
                };
                let ordinary_after = n < chars.len()
                    && (chars[n].is_alphanumeric()
                        || chars[n] == '{'
                        || (chars[n] == '\\' && !next_command.is_empty() && !matches!(next_command.as_str(), "left" | "right" | "quad" | "qquad")));
                let after = if ordinary_after { "\\," } else { "" };
                // \text, not \mathrm: latex_math draws its Roman variant italic.
                out.push_str(&format!("{before}\\text{{{name}}}{scripts}{after}"));
                i = k;
                continue;
            }
            last_command = name.clone();
            out.push('\\');
            out.push_str(&name);
            i = j;
            continue;
        }
        match c {
            '{' => braces.push(matches!(last_command.as_str(), "text" | "textrm" | "textit" | "textbf" | "mathrm" | "rm" | "operatorname")),
            '}' => {
                braces.pop();
            }
            _ => {}
        }
        if !c.is_whitespace() {
            last_command.clear();
        }
        out.push(c);
        i += 1;
    }
    out
}

/// A text run without its edge spaces, and how many were on each side
/// (the layout drops them; they become margins instead).
fn edge_spaces(text: &str) -> (String, usize, usize) {
    let start = text.len() - text.trim_start().len();
    let end = text.trim_end().len().max(start);
    (text[start..end].to_owned(), text[..start].chars().count(), text[end..].chars().count())
}

/// Rebuild only when the source changes. Unhandled text nesting is shown verbatim
/// with a visible diagnostic, never passed to MathView where glyphs could vanish.
pub fn set_formula(cx: &mut Cx, container: &WidgetRef, source: &str) -> Result<(), String> {
    set_formula_color(cx, container, source, "#fff")
}
/// Same as set_formula with an explicit glyph color; light board cards pass a
/// dark color because MathView defaults to white (#fff).
pub fn set_formula_color(
    cx: &mut Cx,
    container: &WidgetRef,
    source: &str,
    color: &str,
) -> Result<(), String> {
    set_formula_scaled(cx, container, source, color, 15., 18.)
}
/// Explicit run sizes: MathView font_size (its em is 1.75x) and the text
/// run Label size in points (board math cards match KaTeX, web
/// fitRenderedMath scales both down together).
pub fn set_formula_scaled(
    cx: &mut Cx,
    container: &WidgetRef,
    source: &str,
    color: &str,
    math_size: f64,
    text_size: f64,
) -> Result<(), String> {
    let parsed = runs(source);
    let (segments, diagnostic) = match parsed {
        Ok(r) => (r, None),
        Err(e) => (vec![Run::Text(source.into())], Some(e)),
    };
    // Runs sit in a flow-Right row with their tops aligned; offset each by
    // (max ascent - own ascent) so the baselines line up like KaTeX's
    // inline \text. MathView draws its baseline at the layout ascent; a
    // Label's first baseline sits at the IBM Plex ascender (1.025em) less
    // the theme's 0.1em fudge.
    let font = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../makepad/widgets/resources/NewCMMath-Regular.otf"));
    let ascent = |run: &Run| -> f64 {
        match run {
            Run::Math(text) => makepad_latex_math::layout(
                &makepad_latex_math::parse(&parser_safe(text)),
                font,
                (math_size * 1.75) as f32,
                makepad_latex_math::MathStyle::Display,
            )
            .map_or(0., |l| l.ascent as f64),
            Run::Text(_) => text_size / 0.75 * 0.925,
        }
    };
    let ascents: Vec<f64> = segments.iter().map(ascent).collect();
    let top = ascents.iter().copied().fold(0., f64::max);
    let mut children = Vec::new();
    for (i, run) in segments.into_iter().enumerate() {
        let margin = (top - ascents[i]).max(0.);
        let (code,value)=match run {
            Run::Math(text)=>(format!("use mod.prelude.widgets.*\nreturn MathView{{margin:Inset{{top:{margin:.2}}} font_size:{math_size} baseline_offset:0 color:{color}}}"),parser_safe(&text)),
            // Edge spaces (\text{抛物面: }) would be dropped by the layout:
            // keep them as 0.25em margins (a word space).
            Run::Text(text)=>{
                let (text, before, after) = edge_spaces(&text);
                let space = text_size / 0.75 * 0.25;
                (format!("use mod.prelude.widgets.*\nreturn Label{{margin:Inset{{top:{margin:.2} left:{:.2} right:{:.2}}} padding:0 draw_text.color:{color} draw_text.text_style.font_size:{text_size}}}", before as f64 * space, after as f64 * space),text)
            }
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
    fn plain_brackets_are_rewritten_but_sqrt_and_left_right_are_kept() {
        use super::parser_safe;
        assert_eq!(parser_safe(r"x \in [0, \pi]"), r"x \in \lbrack 0, \pi\rbrack ");
        assert_eq!(parser_safe(r"\sqrt[3]{x}"), r"\sqrt[3]{x}");
        assert_eq!(parser_safe(r"g'(x) = f''"), r"g\text{′}(x) = f\text{″}");
        assert_eq!(parser_safe(r"\text{don't}"), r"\text{don't}");
        assert_eq!(super::function_spacing(r"P = (\cos\theta, \sin\theta)"), r"P = (\text{cos}\,\theta, \text{sin}\,\theta)");
        assert_eq!(super::function_spacing(r"2\sin^2 x+\sin(x)"), r"2\,\text{sin}^2\,x+\text{sin}(x)");
        assert_eq!(super::function_spacing(r"\lim_{x\to 0}\text{ sin }"), r"\lim_{x\to 0}\text{ sin }");
        assert_eq!(parser_safe(r"\left[x\right]"), r"\left[x\right]");
        assert_eq!(parser_safe(r"[a]"), r"\lbrack a\rbrack ");
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
