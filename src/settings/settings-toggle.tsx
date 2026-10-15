import "./settings-toggle.css";

interface SettingsToggleProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testId?: string;
}

/** Use ordinary transforms and explicit borders on older Android WebViews. */
export function SettingsToggle({ id, checked, disabled = false, onChange, label, testId }: SettingsToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      className="settings-toggle"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}
