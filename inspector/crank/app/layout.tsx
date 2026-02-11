import type { Children, Context } from "@b9g/crank";
import layoutStyles from "./layout.module.css";
import { settings } from "./data/settings.ts";
import type { SlDrawer, SlLazyChangeEvent } from "@shoelace-style/shoelace";
import { createScope, each, sleep } from "effection";

export async function* Layout(
  this: Context,
  { children }: { children: Children },
  cxt: Context,
): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();
  await using _ = {
    [Symbol.asyncDispose]: destroy,
  };

  scope.run(function* () {
    for ({} of yield* each(settings)) {
      cxt.refresh();
      yield* each.next();
    }
  });

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
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("sl-theme-dark");
      localStorage.setItem("theme", "dark");
    }
  }

  let drawer: SlDrawer;

  this.addEventListener("sl-change", (event: SlLazyChangeEvent) => {
    let { name, checked } = event.target as unknown as {
      name: string;
      checked: boolean;
    };
    settings.update((current) => {
      return {
        ...current,
        [name]: checked,
      };
    });
  });

  for ({} of this) {
    yield (
      <div id="layout">
        <sl-drawer label="Settings" ref={(el: SlDrawer) => (drawer = el)}>
          <p>
            <sl-checkbox
              name="showInspectorRuntime"
              checked={settings.value.showInspectorRuntime}
            >
              Show Inspector Runtime
            </sl-checkbox>
          </p>
          <p>
            <sl-checkbox
              name="showAnonymousScopes"
              checked={settings.value.showAnonymousScopes}
            >
              Show Anonymous Scopes
            </sl-checkbox>
          </p>
        </sl-drawer>
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
              <sl-button aria-label="Settings" onclick={() => drawer.show()}>
                <sl-icon name="gear"></sl-icon>
              </sl-button>
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
}
