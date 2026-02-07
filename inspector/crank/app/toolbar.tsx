import type { Context, Children } from "@b9g/crank";
import { Portal } from "@b9g/crank";

export function Toolbar(this: Context, { children }: { children: Children }) {
  let toolbar: Element = this.consume("toolbar");
  return <Portal root={toolbar}>{children}</Portal>;
}
