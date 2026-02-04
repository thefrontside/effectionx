import type { Children } from "@b9g/crank";
import layoutStyles from "../layout.module.css";

export function Header({ toggleTheme }: { toggleTheme: () => void }): Element {
  return (
    <header class={layoutStyles.brand}>
      <div class={layoutStyles.brand}>
        <div class={layoutStyles.logo}>
          <sl-button href="/" aria-label="Home" type="button">
            <img
              src="/effection-logo.svg"
              class={layoutStyles.logoImg}
              alt="Effection logo"
            />
          </sl-button>
        </div>

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
  );
}
