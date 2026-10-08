//! App-wide Button text color: Makepad's theme turns label ink white on
//! hover / focus / press (`color_label_inner_hover`), which is unreadable on
//! the light web-style faces used everywhere here. The web keeps the label
//! color and only changes the face, so labels keep `color` except when
//! disabled. Registered right after makepad_widgets so every Button (DSL or
//! built at runtime) inherits it.
use makepad_widgets::*;

script_mod! {
    use mod.prelude.widgets_internal.*
    mod.widgets.Button = mod.widgets.Button {
        draw_text +: {
            get_color: fn() {
                return self.color.mix(self.color_disabled, self.disabled)
            }
        }
    }
}
