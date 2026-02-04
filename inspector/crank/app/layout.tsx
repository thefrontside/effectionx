import type { Children } from "@b9g/crank";

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
      <header class="site-header">
        <div class="brand">
          <div class="logo">
            <sl-button
              href="/"
              aria-label="Home"
              class="logo-button"
              type="button"
            >
              <img src="/effection-logo.svg" alt="Effection logo" />
            </sl-button>
          </div>

          <div class="theme-switcher">
            <sl-button
              class="theme-toggle"
              aria-label="Toggle theme"
              type="button"
              onclick={() => toggleTheme()}
            >
              <sl-icon name="sun" class="icon-sun"></sl-icon>
              <sl-icon name="moon" class="icon-moon"></sl-icon>
            </sl-button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
