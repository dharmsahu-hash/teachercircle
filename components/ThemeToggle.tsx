"use client";

import { useEffect, useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export default function ThemeToggle() {
  // Server-rendered markup can't know the visitor's stored preference, so
  // this starts as "system" and syncs from localStorage once mounted —
  // matches the blocking script in app/layout.tsx that already applied the
  // real theme before paint, this just keeps the button's own label in sync.
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("tc_theme") as Theme | null;
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // Private browsing / blocked storage — fine, just stays on "system".
    }
  }, []);

  function cycle() {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem("tc_theme");
      else localStorage.setItem("tc_theme", next);
    } catch {
      // Best-effort only — the toggle still works for this page view.
    }
  }

  const label = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";
  const Icon = theme === "system" ? MonitorIcon : theme === "light" ? SunIcon : MoonIcon;

  return (
    <button
      type="button"
      className="icon-button"
      onClick={cycle}
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label} (Auto → Light → Dark)`}
    >
      <Icon />
    </button>
  );
}
