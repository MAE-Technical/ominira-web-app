"use client";

import { useReaderStore } from "@/stores/reader-store";
import Switch from "./Switch";

/**
 * Dark-mode switch — used by AccountView's Theme row (both auth states) so
 * the control can't drift between the two. In the header, signed-in readers
 * switch theme from ProfileMenu's dropdown and signed-out readers from
 * HeaderThemeToggle. Shares Switch with NotificationsRow
 * for a consistent on/off look across every account setting.
 */
export default function ThemeToggle() {
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);

  return (
    <Switch
      checked={theme === "dark"}
      onChange={(checked) => setTheme(checked ? "dark" : "light")}
      ariaLabel="Dark mode"
    />
  );
}
