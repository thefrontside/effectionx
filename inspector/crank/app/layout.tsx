import type { Children } from "@b9g/crank";

export function Layout({ children }: { children: Children }): Element {
  return (
    <>
      <header>
        <a href="/">Inspector</a>
      </header>
      <main>{children}</main>
    </>
  );
}
