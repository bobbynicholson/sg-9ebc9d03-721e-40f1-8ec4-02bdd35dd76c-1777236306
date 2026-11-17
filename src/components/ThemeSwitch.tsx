/**
 * Theme control is hidden while the app is pinned to light mode. Keeping this
 * tiny component lets existing portal headers omit it without duplicated
 * feature flags; restore the switch after dark mode is ready across the app.
 */
export function ThemeSwitch() {
  return null;
}
