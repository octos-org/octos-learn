//! The Window's outer View emits raw pointer actions for an otherwise
//! unclaimed pinch finger. These are not product controls. Forwarding them
//! to App's Actions handler refreshes the board on every camera-only move.
//! Filter them after UI dispatch so touch capture/cursor handling still runs.
use makepad_widgets::*;

pub fn is_window_pointer(action: &Action, window: WidgetUid) -> bool {
    let Some(widget) = action.as_widget_action() else { return false; };
    widget.widget_uid == window && matches!(
        widget.action.as_ref().downcast_ref::<ViewAction>(),
        Some(ViewAction::FingerDown(_) | ViewAction::FingerMove(_)
            | ViewAction::FingerUp(_) | ViewAction::FingerLongPress(_)
            | ViewAction::FingerHoverIn(_) | ViewAction::FingerHoverOut(_))
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use makepad_widgets::makepad_platform::event::finger::DigitId;

    fn widget(uid: WidgetUid, action: impl WidgetActionTrait) -> Action {
        Box::new(WidgetAction { widget_uid: uid, action: Box::new(action), data: None, group: None })
    }

    fn finger_move() -> ViewAction {
        ViewAction::FingerMove(FingerMoveEvent {
            window_id: WindowId(0, 0), abs: Vec2d::default(),
            digit_id: DigitId::default(), device: DigitDevice::Touch { uid: 2 },
            has_long_press_occurred: false, tap_count: 1,
            modifiers: KeyModifiers::default(), time: 0.,
            abs_start: Vec2d::default(), rect: Rect::default(), is_over: true,
        })
    }

    #[test]
    fn filters_only_the_outer_windows_pointer_actions() {
        let root = WidgetUid(3);
        assert!(is_window_pointer(&widget(root, finger_move()), root));
        assert!(!is_window_pointer(&widget(WidgetUid(4), finger_move()), root));
    }

    #[test]
    fn keeps_controls_window_lifecycle_and_nonwidget_actions() {
        let root = WidgetUid(3);
        let mut actions = vec![
            widget(root, finger_move()),
            widget(WidgetUid(4), ButtonAction::Clicked(KeyModifiers::default())),
            widget(root, WindowAction::WindowClosed),
            widget(root, ViewAction::None),
            widget(root, ViewAction::KeyDown(KeyEvent {
                key_code: KeyCode::KeyA, is_repeat: false,
                modifiers: KeyModifiers::default(), time: 0.,
            })),
            widget(WidgetUid(5), SliderAction::Slide(0.75)),
            widget(WidgetUid(6), TextInputAction::Changed("question".into())),
            Box::new(String::from("server completion")) as Action,
        ];
        actions.retain(|action| !is_window_pointer(action, root));
        assert_eq!(actions.len(), 7);
        assert!(actions[0].as_widget_action().unwrap().action.as_ref().is::<ButtonAction>());
        assert!(actions[1].as_widget_action().unwrap().action.as_ref().is::<WindowAction>());
        assert!(actions[6].downcast_ref::<String>().is_some());
    }
}
