import type { Children, Context } from "@b9g/crank";
import layoutStyles from "./layout.module.css";

export function Layout(
  this: Context,
  { children }: { children: Children },
): Element {
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
    <div id="layout">
      <header class={layoutStyles.topBar}>
        <div class={layoutStyles.brand}>
          <div class={layoutStyles.logo}>
            <sl-button
              href="/"
              aria-label="Home"
              type="button"
              class={layoutStyles.logoButton}
            >
              <img
                src="/effection-logo.svg"
                class={`${layoutStyles.logoImg} ${layoutStyles.lightLogo}`}
                alt="Effection logo"
              />
              <img
                src="/effection-logo-dark.svg"
                class={`${layoutStyles.logoImg} ${layoutStyles.darkLogo}`}
                alt="Effection logo dark"
              />
            </sl-button>
          </div>

          <div
            id="toolbar"
            ref={(el: Element) => this.provide("toolbar", el)}
          ></div>

          <div class={layoutStyles.themeSwitcher}>
            <sl-button
              aria-label="Toggle theme"
              type="button"
              onclick={() => toggleTheme()}
            >
              <span class={layoutStyles.iconSun}>
                <sl-icon name="sun" />
              </span>
              <span class={layoutStyles.iconMoon}>
                <sl-icon name="moon" />
              </span>
            </sl-button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
