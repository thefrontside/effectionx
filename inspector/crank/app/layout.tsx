import type { Children } from "@b9g/crank";

export function Layout({ children }: { children: Children }): Element {
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
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
