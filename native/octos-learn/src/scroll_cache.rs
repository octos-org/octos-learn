//! Vertical scroll view whose content is rendered once into a texture and
//! only re-rendered when the content itself redraws or the width changes.
//! Scrolling moves one textured quad, so a scroll frame costs the GPU one
//! sampled rectangle instead of every card, glyph and SVG on the page.
//!
//! Why (2026-10-07 Android large-screen bisection, Mali-G52 at 1080p): the
//! course list page re-recorded and re-rendered all content each scroll
//! frame (~52 ms apart); card text and thumbnails were the largest shares,
//! and with the CPU side cached the frame still took ~40 ms, so the GPU
//! re-render itself was the limit.
//!
//! The content draws in its own pass at origin (0, 0), independent of the
//! scroll position. Pointer events for the content are re-issued with
//! positions mapped into that space ([`ScrollCache::map_event`]); while a
//! press is down the mapping keeps the scroll offset from the press, so a
//! drag that scrolls the page is not mistaken for a tap on the content.
use makepad_widgets::*;
use makepad_widgets::makepad_platform::event::{LongPressEvent, ScrollEvent, TouchState};
use makepad_widgets::scroll_bar::{ScrollAxis, ScrollBarAction};

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.ScrollCacheBase = #(ScrollCache::register_widget(vm))
    mod.widgets.ScrollCache = set_type_default() do mod.widgets.ScrollCacheBase {
        width: Fill height: Fit flow: Down
        scroll_bar: mod.widgets.ScrollBar { drag_scrolling: true }
        // web CachedView sampling: pixel-snapped so cached text stays sharp.
        draw_cache +: {
            image: texture_2d(float)
            scale: varying(vec2(0))
            shift: varying(vec2(0))
            vertex: fn() {
                let dpi = self.draw_pass.dpi_factor
                let ceil_size = ceil(self.rect_size * dpi) / dpi
                let floor_pos = floor(self.rect_pos * dpi) / dpi
                self.scale = self.rect_size / ceil_size
                self.shift = (self.rect_pos - floor_pos) / ceil_size
                return self.clip_and_transform_vertex(self.rect_pos self.rect_size)
            }
            pixel: fn() {
                return self.image.sample(self.pos * self.scale + self.shift)
            }
        }
    }
}

/// Textures above this many physical pixels tall are not cached; the
/// content then draws directly (GL_MAX_TEXTURE_SIZE floor on target GPUs).
const MAX_TEXTURE_PX: f64 = 8192.;

#[derive(Script, ScriptHook, Widget)]
pub struct ScrollCache {
    #[deref]
    view: View,
    #[live]
    draw_cache: DrawQuad,
    #[live]
    scroll_bar: ScrollBar,
    #[rust]
    cache: Option<(DrawPass, Texture, DrawList2d)>,
    #[rust]
    viewport: Area,
    #[rust]
    viewport_rect: Rect,
    #[rust]
    content_size: Vec2d,
    #[rust]
    rendered_width: f64,
    /// Offset the quad was last drawn at (clamped, pixel-snapped): what the
    /// user sees, so content events map through it.
    #[rust]
    drawn_scroll: f64,
    /// Scroll offset captured at the press, used for content events until
    /// the press ends.
    #[rust]
    press_scroll: Option<f64>,
}

impl ScrollCache {
    fn scroll(&self) -> f64 {
        self.drawn_scroll
    }

    /// Screen position of content-space (0, 0).
    pub fn content_origin(&self) -> Vec2d {
        self.viewport_rect.pos - dvec2(0., self.scroll())
    }

    /// Content-space rect (as `area().rect(cx)` of a child returns) in screen space.
    pub fn to_screen(&self, rect: Rect) -> Rect {
        Rect { pos: rect.pos + self.content_origin(), size: rect.size }
    }

    pub fn set_scroll_pos(&mut self, cx: &mut Cx, pos: f64) {
        self.scroll_bar.set_scroll_pos_no_action(cx, pos);
        self.drawn_scroll = pos;
        self.draw_cache.redraw(cx);
    }

    /// The event with pointer positions mapped into content space, or `None`
    /// for events without positions (deliver those unchanged). Hosts that
    /// hit-test content areas themselves call this after the UI handled the
    /// event.
    pub fn map_event(&self, event: &Event) -> Option<Event> {
        let shift = self.viewport_rect.pos - dvec2(0., self.press_scroll.unwrap_or_else(|| self.scroll()));
        Some(match event {
            Event::MouseDown(e) => Event::MouseDown(MouseDownEvent { abs: e.abs - shift, ..e.clone() }),
            Event::MouseMove(e) => Event::MouseMove(MouseMoveEvent { abs: e.abs - shift, ..e.clone() }),
            Event::MouseUp(e) => Event::MouseUp(MouseUpEvent { abs: e.abs - shift, ..e.clone() }),
            Event::Scroll(e) => Event::Scroll(ScrollEvent { abs: e.abs - shift, ..e.clone() }),
            Event::LongPress(e) => Event::LongPress(LongPressEvent { abs: e.abs - shift, ..e.clone() }),
            Event::TouchUpdate(e) => {
                let mut e = e.clone();
                for t in &mut e.touches {
                    t.abs -= shift;
                }
                Event::TouchUpdate(e)
            }
            _ => return None,
        })
    }

    fn track_press(&mut self, event: &Event, after: bool) {
        let (down, up) = match event {
            Event::MouseDown(_) => (true, false),
            Event::MouseUp(_) => (false, true),
            Event::TouchUpdate(e) => (
                e.touches.iter().any(|t| t.state == TouchState::Start),
                e.touches.iter().all(|t| t.state == TouchState::Stop),
            ),
            _ => (false, false),
        };
        if !after && down && self.press_scroll.is_none() {
            self.press_scroll = Some(self.scroll());
        }
        if after && up {
            self.press_scroll = None;
        }
    }
}

impl Widget for ScrollCache {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event, scope: &mut Scope) {
        let mut scrolled = false;
        // The quad's area is clipped to the viewport (the walked area's clip is not).
        let scroll_area = self.draw_cache.area();
        self.scroll_bar.handle_scroll_event(cx, event, scroll_area, &mut |_, action| {
            if let ScrollBarAction::Scroll { .. } = action {
                scrolled = true;
            }
        });
        self.scroll_bar.handle_event_with(cx, event, &mut |_, action| {
            if let ScrollBarAction::Scroll { .. } = action {
                scrolled = true;
            }
        });
        if scrolled {
            // Only the quad moves: redraw the viewport, not the cached content.
            self.draw_cache.redraw(cx);
        }
        self.track_press(event, false);
        match self.map_event(event) {
            Some(mapped) => self.view.handle_event(cx, &mapped, scope),
            None => self.view.handle_event(cx, event, scope),
        }
        self.track_press(event, true);
    }

    fn draw_walk(&mut self, cx: &mut Cx2d, scope: &mut Scope, _walk: Walk) -> DrawStep {
        let rect = cx.walk_turtle_with_area(&mut self.viewport, Walk::fill());
        self.viewport_rect = rect;
        let dpi = cx.current_dpi_factor();
        let width = rect.size.x;
        let content_walk = Walk { width: Size::Fixed(width), ..self.view.walk };

        if self.cache.is_none() {
            let texture = Texture::new_with_format(cx, TextureFormat::RenderBGRAu8 { size: TextureSize::Auto, initial: true });
            let pass = DrawPass::new(cx);
            pass.set_color_texture(cx, &texture, DrawPassClearColor::ClearWith(vec4(0., 0., 0., 0.)));
            self.cache = Some((pass, texture, DrawList2d::new(cx)));
        }
        let (pass, texture, list) = self.cache.as_mut().unwrap();
        // `OCTOS_BISECT=nocache` re-renders every frame (device A/B against the old cost).
        let width_changed = self.rendered_width != width;
        let list_dirty = cx.will_redraw_check_axis(list, width, Vec2Index::X);
        let rerender = width_changed || list_dirty || crate::perf::bisect("nocache");
        cx.make_child_pass(pass);
        if rerender {
            cx.begin_pass(pass, None);
            list.begin_always(cx);
            // Own root turtle: the content is taller than the window, whose
            // clip would otherwise cut it off.
            cx.begin_root_turtle(dvec2(width, MAX_TEXTURE_PX / dpi), Layout::flow_down());
            let _ = self.view.draw_walk(cx, scope, content_walk);
            let used = self.view.area().rect(cx);
            cx.end_pass_sized_turtle();
            list.end(cx);
            cx.end_pass(pass);
            self.content_size = dvec2(width, used.size.y.max(1.));
            self.rendered_width = width;
            }
        let total = self.content_size;
        let too_tall = total.y * dpi > MAX_TEXTURE_PX;
        if too_tall {
            log!("ScrollCache: content {:.0}px tall exceeds the texture limit", total.y * dpi);
        }

        // Viewport: clip, place the quad at the (pixel-snapped) scroll offset.
        cx.begin_turtle(
            Walk { abs_pos: Some(rect.pos), width: Size::Fixed(rect.size.x), height: Size::Fixed(rect.size.y), ..Walk::default() },
            Layout { clip_x: true, clip_y: true, ..Layout::default() },
        );
        let max_scroll = (total.y - rect.size.y).max(0.);
        let scroll = self.scroll_bar.get_scroll_pos().clamp(0., max_scroll);
        let scroll = (scroll * dpi).round() / dpi;
        self.drawn_scroll = scroll;
        let quad = Rect { pos: dvec2(rect.pos.x, rect.pos.y - scroll), size: total };
        self.draw_cache.draw_vars.set_texture(0, texture);
        self.draw_cache.draw_abs(cx, quad);
        cx.set_pass_area_with_origin(pass, self.draw_cache.area(), dvec2(0., 0.));
        self.scroll_bar.draw_scroll_bar(cx, ScrollAxis::Vertical, rect, total);
        cx.end_turtle();
        DrawStep::done()
    }
}
