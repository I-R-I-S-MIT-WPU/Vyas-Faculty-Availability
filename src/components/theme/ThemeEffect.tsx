"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

export function ThemeEffect() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme as string);
  }, [theme, resolvedTheme]);

  return null;
}
