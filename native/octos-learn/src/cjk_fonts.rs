//! Web parity for Chinese text: the web app renders CJK in PingFang SC (a
//! sans serif) on macOS, while Makepad's International font policy falls
//! back to LXGW WenKai (a kai/handwriting face). The pinned Makepad cannot
//! load the system's PingFang .ttc, so the app bundles Noto Sans SC (SIL OFL
//! 1.1, see assets/fonts/NotoSansSC-LICENSE.txt) and puts it ahead of LXGW
//! in the theme's regular/label/bold families. The families are edited in
//! place, so every style derived from theme.font_* picks the fonts up; this
//! must run after makepad_widgets::script_mod and before any widget is built.
use makepad_widgets::*;

pub fn install(vm: &mut ScriptVm) {
    let fonts = script_eval!(vm, {
        use mod.prelude.widgets_internal.*
        use mod.text.*
        {
            regular: FontMember{res: crate_resource("self:assets/fonts/NotoSansSC-Regular.otf") asc: 0.0 desc: 0.0}
            bold: FontMember{res: crate_resource("self:assets/fonts/NotoSansSC-Bold.otf") asc: 0.0 desc: 0.0}
        }
    });
    let Some(fonts) = fonts.as_object() else { return };
    let regular = vm.bx.heap.value(fonts, id!(regular).into(), NoTrap);
    let bold = vm.bx.heap.value(fonts, id!(bold).into(), NoTrap);

    let mut themes = vec![vm.module(id!(theme))];
    let all = vm.module(id!(themes));
    for name in [id!(light), id!(dark)] {
        if let Some(t) = vm.bx.heap.value(all, name.into(), NoTrap).as_object() {
            themes.push(t);
        }
    }
    let mut done = Vec::new();
    for theme in themes {
        for (role, member, member_id) in [
            (id!(font_regular), regular, id!(noto_sans_sc_regular)),
            (id!(font_label), regular, id!(noto_sans_sc_regular)),
            (id!(font_bold), bold, id!(noto_sans_sc_bold)),
        ] {
            let Some(style) = vm.bx.heap.value(theme, role.into(), NoTrap).as_object() else { continue };
            let Some(family) = vm.bx.heap.value(style, id!(font_family).into(), NoTrap).as_object() else { continue };
            if done.contains(&family) {
                continue;
            }
            done.push(family);
            prepend_cjk(vm, family, member_id, member);
        }
    }
}

/// Rebuild `family` with `member` right after its Latin members: before the
/// first LXGW (or other CJK) fallback, else at the end.
fn prepend_cjk(vm: &mut ScriptVm, family: ScriptObject, member_id: LiveId, member: ScriptValue) {
    let len = vm.bx.heap.vec_len(family);
    let entries: Vec<_> = (0..len).map(|i| vm.bx.heap.vec_key_value(family, i, NoTrap)).collect();
    if entries.iter().any(|kv| kv.key == member_id.into()) {
        return;
    }
    let lxgw = [id!(lxgw_wenkai_regular), id!(lxgw_wenkai_bold)];
    let at = entries
        .iter()
        .position(|kv| lxgw.iter().any(|id| kv.key == (*id).into()))
        .unwrap_or(entries.len());
    for _ in 0..len {
        vm.bx.heap.vec_pop(family, NoTrap);
    }
    for (i, kv) in entries.iter().enumerate() {
        if i == at {
            vm.bx.heap.vec_push(family, member_id.into(), member, NoTrap);
        }
        vm.bx.heap.vec_push(family, kv.key, kv.value, NoTrap);
    }
    if at == entries.len() {
        vm.bx.heap.vec_push(family, member_id.into(), member, NoTrap);
    }
}
