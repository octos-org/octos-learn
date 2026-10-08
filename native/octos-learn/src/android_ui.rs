//! Web Android density parity. Compact the app chrome in logical pixels;
//! leave the board's coordinate space and Android's physical DPI untouched.
use makepad_widgets::*;

pub use octos_oll_preview::{dim, ANDROID_UI};

#[derive(Clone, Copy, Debug)]
pub struct Catalog {
    pub inner_width: f64,
    pub columns: usize,
    pub gap: f64,
    pub hero_title: f64,
    pub course_cover: f64,
    pub collection_cover: f64,
    pub course_title: f64,
    pub course_description: f64,
    pub course_padding_x: f64,
    pub course_padding_y: f64,
    pub collection_padding: f64,
    pub collection_title: f64,
    pub collection_description: f64,
    pub description_line_height: f64,
    pub description_margin: f64,
    pub collection_description_margin: f64,
    pub lesson_margin: f64,
    pub title_margin: f64,
    pub title_bottom: f64,
}
impl Catalog {
    pub fn new(size: Vec2d, android: bool) -> Self {
        if !android {
            return Self {
                inner_width: 1120.,
                columns: 3,
                gap: 24.,
                hero_title: 48.96,
                course_cover: 201.,
                collection_cover: 222.,
                course_title: 20.,
                course_description: 13.,
                course_padding_x: 21.,
                course_padding_y: 22.,
                collection_padding: 23.,
                collection_title: 23.,
                collection_description: 14.,
                description_line_height: 1.8,
                description_margin: 24.,
                collection_description_margin: 28.,
                lesson_margin: 22.,
                title_margin: 10.,
                title_bottom: 12.,
            };
        }
        // course-launcher.css: Android base rules plus >=800px landscape query.
        let landscape = size.x >= 800. && size.x > size.y;
        let inner_width = (size.x - 42.).max(1.).min(960.);
        let cover = (size.y * 0.24).clamp(100., 160.);
        let columns = if landscape {
            3
        } else {
            ((inner_width + 15.) / 295.).floor().max(1.) as usize
        };
        let card_width = (inner_width - (columns - 1) as f64 * 15.) / columns as f64;
        Self {
            inner_width,
            columns,
            gap: if landscape { 14. } else { 15. },
            hero_title: (size.x * 0.026).clamp(24., 34.),
            course_cover: if landscape {
                cover
            } else {
                card_width * 9. / 16.
            },
            collection_cover: if landscape {
                cover
            } else {
                card_width * 10. / 16.
            },
            course_title: if landscape { 15. } else { 16. },
            course_description: 11.,
            course_padding_x: 15.,
            course_padding_y: 13.,
            collection_padding: 14.,
            collection_title: 17.,
            collection_description: 12.,
            description_line_height: 1.6,
            description_margin: if landscape { 10. } else { 24. },
            collection_description_margin: 12.,
            lesson_margin: 8.,
            title_margin: 6.,
            title_bottom: 8.,
        }
    }
}

/// Apply only the fields in this object, preserving widget state and bindings.
/// Call before loading SVG documents when changing icon walks.
pub fn patch(cx: &mut Cx, widget: &WidgetRef, code: &str) -> Result<(), String> {
    if widget.is_empty() {
        return Err("安卓尺寸目标组件不存在".into());
    }
    // Update Label font fields directly, retaining the compiled text shader.
    let mut code = code.to_owned();
    for field in ["font_size", "line_spacing"] {
        let prefix = format!("draw_text.text_style.{field}:");
        if let Some(start) = code.find(&prefix) {
            let value_start = start + prefix.len();
            let len = code[value_start..]
                .find(|c: char| c.is_whitespace() || c == '}')
                .unwrap_or(code.len() - value_start);
            let number = code[value_start..value_start + len]
                .parse::<f32>()
                .map_err(|_| "无效安卓字体尺寸")?;
            if let Some(mut label) = widget.borrow_mut::<Label>() {
                if field == "font_size" {
                    label.draw_text.text_style.font_size = number;
                } else {
                    label.draw_text.text_style.line_spacing = number;
                }
            }
            code.replace_range(start..value_start + len, "");
        }
    }
    // Never script-apply a partial DrawText: it replaces the shader's source
    // and invalidates its instance stride. Label styles are public; input and
    // button fonts are selected in the original DSL before constructing them.
    if code
        .trim()
        .trim_start_matches('{')
        .trim_end_matches('}')
        .trim()
        .is_empty()
    {
        widget.redraw(cx);
        return Ok(());
    }
    let mut widget = widget.clone();
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
            .ok_or("无法应用安卓界面尺寸")?;
        widget.script_apply(vm, &Apply::Eval, &mut Scope::empty(), value);
        Ok(())
    })
}

pub fn apply(cx: &mut Cx, ui: &WidgetRef, size: Vec2d) -> Result<(), String> {
    let catalog = Catalog::new(size, true);
    for id in [
        live_id!(setup_model_card),
        live_id!(setup_tts_card),
        live_id!(setup_skin_card),
    ] {
        compact_setup_labels(&ui.widget(cx, &[id]));
    }
    let changes = [
        (
            live_id!(launcher_inner),
            format!(
                "{{width:{} padding:Inset{{bottom:38}}}}",
                catalog.inner_width
            ),
        ),
        (live_id!(launcher_header), "{height:62}".into()),
        (live_id!(launcher_settings), "{height:32 min_height:32 margin:0}".into()),
        (live_id!(sel_ask), "{height:27 min_height:27 margin:0}".into()),
        (
            live_id!(launcher_brand),
            "{draw_text.text_style.font_size:12}".into(),
        ),
        (
            live_id!(home_sections),
            "{padding:Inset{top:42 bottom:37}}".into(),
        ),
        (
            live_id!(hero_title_box),
            "{padding:Inset{top:13 bottom:14}}".into(),
        ),
        (
            live_id!(hero_title),
            format!(
                "{{draw_text.text_style.font_size:{}}}",
                catalog.hero_title * 0.75
            ),
        ),
        (
            live_id!(hero_description),
            "{draw_text.text_style.font_size:9.75}".into(),
        ),
        (
            live_id!(blank_board),
            "{height:42 margin:Inset{top:22}}".into(),
        ),
        (
            live_id!(blank_label),
            "{draw_text.text_style.font_size:9.75}".into(),
        ),
        (
            live_id!(library_title),
            "{draw_text.text_style.font_size:15}".into(),
        ),
        (
            live_id!(course_list),
            format!("{{spacing:{}}}", catalog.gap),
        ),
        (
            live_id!(topbar_anchor),
            "{padding:Inset{left:74 right:6 top:6}}".into(),
        ),
        (
            live_id!(topbar),
            "{height:36 spacing:7 padding:Inset{left:9 right:5 top:3 bottom:3}}".into(),
        ),
        (live_id!(canvas_eyebrow), "{visible:false}".into()),
        (
            live_id!(course_title),
            "{draw_text.text_style.font_size:9.75}".into(),
        ),
        (
            live_id!(page_actions_anchor),
            "{padding:Inset{left:6 top:9}}".into(),
        ),
        (live_id!(page_actions), "{width:65 spacing:5}".into()),
        (
            live_id!(ink_anchor),
            "{padding:Inset{left:8 top:48}}".into(),
        ),
        (live_id!(ink_toolbar), "{padding:3 spacing:0}".into()),
        (live_id!(ink_tools), "{spacing:2}".into()),
        (live_id!(input_anchor), "{padding:Inset{bottom:8}}".into()),
        (
            live_id!(input_dock),
            format!(
                "{{width:{} padding:3}}",
                (size.x - 190.).max(280.).min(520.)
            ),
        ),
        (
            live_id!(ask_input),
            "{min_height:29 padding:Inset{left:8 right:8 top:4 bottom:4} draw_text.text_style.font_size:7.5}".into(),
        ),
        (
            live_id!(teacher_anchor),
            "{padding:Inset{right:10 bottom:54}}".into(),
        ),
        (live_id!(teacher_avatar), "{width:56 height:56}".into()),
        (live_id!(octos_art), "{width:39 height:39}".into()),
        (live_id!(octos_png_image), "{width:39 height:39}".into()),
        (
            live_id!(narration_bubble),
            "{width:230 margin:Inset{bottom:13} padding:Inset{left:9 right:9 top:7 bottom:7}}"
                .into(),
        ),
        (
            live_id!(narration),
            "{draw_text.text_style.font_size:8.25 draw_text.text_style.line_spacing:1.186}".into(),
        ),
        (
            live_id!(teacher_state),
            "{draw_text.text_style.font_size:6}".into(),
        ),
        (
            live_id!(outline_anchor),
            "{padding:Inset{right:17 bottom:116}}".into(),
        ),
        (
            live_id!(outline_panel_anchor),
            "{padding:Inset{right:9 bottom:158}}".into(),
        ),
        (
            live_id!(outline_panel),
            format!("{{width:{}}}", 260f64.min(size.x - 28.)),
        ),
        (
            live_id!(setup_inner),
            "{padding:Inset{left:28 right:28 top:14 bottom:20}}".into(),
        ),
        (
            live_id!(setup_heading),
            "{draw_text.text_style.font_size:16.5 margin:Inset{top:3}}".into(),
        ),
        (
            live_id!(setup_intro),
            "{draw_text.text_style.font_size:8.25 margin:Inset{top:9 bottom:14}}".into(),
        ),
        (live_id!(setup_cards), "{spacing:14}".into()),
        (live_id!(setup_model_card), "{padding:14}".into()),
        (live_id!(setup_tts_card), "{padding:14 width:Fill{weight:115}}".into()),
        (live_id!(setup_skin_card), "{padding:14 width:Fill{weight:85}}".into()),
        (live_id!(camera_monitor), "{padding:4 spacing:5}".into()),
        (live_id!(camera_live), "{width:128}".into()),
        (live_id!(camera_image), "{width:128}".into()),
        (live_id!(camera_sent), "{width:128}".into()),
        (live_id!(camera_sent_image), "{width:128}".into()),
        (live_id!(sel_panel), format!("{{width:{}}}", 300f64.min(size.x - 16.))),
    ];
    for id in [
        live_id!(setup_model_heading),
        live_id!(setup_tts_heading),
        live_id!(setup_skin_heading),
    ] {
        patch(
            cx,
            &ui.widget(cx, &[id]),
            "{draw_text.text_style.font_size:11.25 margin:Inset{top:6 bottom:6}}",
        )?;
    }
    for id in [
        live_id!(setup_model),
        live_id!(setup_key),
        live_id!(setup_volc_appid),
        live_id!(setup_volc_token),
        live_id!(setup_volc_voice),
    ] {
        patch(
            cx,
            &ui.widget(cx, &[id]),
            "{min_height:32 padding:Inset{left:9 right:9 top:6 bottom:6}}",
        )?;
    }
    for id in [
        live_id!(setup_save),
        live_id!(setup_listen),
        live_id!(setup_enter),
    ] {
        patch(cx, &ui.widget(cx, &[id]), "{height:32 min_height:32 padding:Inset{left:10 right:10 top:6 bottom:6} draw_text.text_style.font_size:7.5}")?;
    }
    for (id, code) in changes {
        patch(cx, &ui.widget(cx, &[id]), &code)?;
    }
    for id in [live_id!(logo_svg), live_id!(logo_fallback)] {
        patch(cx, &ui.widget(cx, &[id]), "{width:28 height:28}")?;
    }
    for (id, side, icon) in [
        (live_id!(back), 30, 16),
        (live_id!(settings), 30, 16),
        (live_id!(play), 25, 17),
        (live_id!(next_beat), 25, 17),
        (live_id!(replay_topic), 25, 16),
        (live_id!(narration_toggle), 25, 16),
        (live_id!(ask_image), 29, 19),
        (live_id!(ask_camera), 29, 19),
        (live_id!(ask_send), 29, 18),
        (live_id!(ask_mic), 32, 21),
        (live_id!(ask_mic_on), 32, 21),
        (live_id!(outline_trigger), 34, 15),
        (live_id!(camera_frame_settings), 24, 14),
    ] {
        patch(cx, &ui.widget(cx, &[id]), &format!("{{width:{side} height:{side} min_height:{side} padding:0 margin:0 flow:Overlay spacing:0 align:Align{{x:0.5 y:0.5}} label_walk:Walk{{width:0 height:0}} icon_walk:Walk{{width:{icon} height:{icon}}}}}"))?;
    }
    patch(cx, &ui.widget(cx, ids!(start_interaction)), "{height:26 min_height:26 margin:0 flow:Right padding:Inset{left:6 right:6 top:4 bottom:4}}")?;
    for id in [live_id!(voice), live_id!(camera)] {
        patch(
            cx,
            &ui.widget(cx, &[id]),
            "{height:26 min_height:26 text:\"\" flow:Overlay spacing:0 label_walk:Walk{width:0 height:0} padding:Inset{left:6 right:6 top:4 bottom:4}}",
        )?;
    }
    if std::env::var_os("OCTOS_PERF").is_some() {
        makepad_widgets::log!(
            "[android-ui] viewport {}x{} catalog {}px/{}cols chrome 36/27/29px",
            size.x,
            size.y,
            catalog.inner_width,
            catalog.columns
        );
    }
    ui.redraw(cx);
    Ok(())
}

fn compact_setup_labels(widget: &WidgetRef) {
    if let Some(mut label) = widget.borrow_mut::<Label>() {
        label.draw_text.text_style.font_size = 7.5;
    }
    let children = widget
        .borrow::<View>()
        .map(|v| {
            v.children
                .iter()
                .map(|(_, child)| child.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for child in children {
        compact_setup_labels(&child);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn high_density_display_matches_web_android_media_query() {
        let p = Catalog::new(dvec2(960., 540.), true);
        assert_eq!(p.inner_width, 918.);
        assert_eq!(p.columns, 3);
        assert_eq!(p.gap, 14.);
        assert!((p.course_cover - 129.6).abs() < 1e-9);
        assert_eq!(p.course_title, 15.);
        assert!((p.hero_title - 24.96).abs() < 1e-9);
        assert_eq!(p.collection_title, 17.);
    }
    #[test]
    fn narrow_android_catalog_fits_without_scaling_the_board() {
        let p = Catalog::new(dvec2(400., 800.), true);
        assert_eq!(p.columns, 1);
        assert_eq!(p.inner_width, 358.);
        assert_eq!(p.course_title, 16.);
    }
    #[test]
    fn desktop_retains_existing_catalog_geometry() {
        let p = Catalog::new(dvec2(1440., 900.), false);
        assert_eq!(p.inner_width, 1120.);
        assert_eq!(p.course_cover, 201.);
        assert_eq!(p.collection_cover, 222.);
        assert_eq!(p.collection_title, 23.);
    }
}

/// One-time measured geometry, alongside the profiler, for device parity checks.
pub fn log_geometry(cx: &mut Cx, ui: &WidgetRef) {
    for id in [
        live_id!(back),
        live_id!(topbar),
        live_id!(play),
        live_id!(input_dock),
        live_id!(teacher_avatar),
    ] {
        let widget = ui.widget(cx, &[id]);
        let walk = widget.walk(cx);
        let rect = widget.area().rect(cx);
        makepad_widgets::log!("[android-ui-geometry] {id:?} walk {walk:?} rect {rect:?}");
    }
}
