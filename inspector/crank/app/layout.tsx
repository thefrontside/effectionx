import type { Children } from "@b9g/crank";
import { Header } from "./components/header.tsx";

export function Layout({ children }: { children: Children }): Element {
  // Initialize theme on client load using stored value or system preference
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("theme");
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored || (prefersDark ? "dark" : "light");

    if (theme === "dark") {
      document.documentElement.classList.add("sl-theme-dark");
    } else {
      document.documentElement.classList.remove("sl-theme-dark");
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains("sl-theme-dark");
    if (isDark) {
      document.documentElement.classList.remove("sl-theme-dark");
      try {
        localStorage.setItem("theme", "light");
      } catch (e) {}
    } else {
      document.documentElement.classList.add("sl-theme-dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch (e) {}
    }
  }

  return (
    <>
      <Header toggleTheme={toggleTheme} />
      <main>{children}</main>
    </>
  );
}
