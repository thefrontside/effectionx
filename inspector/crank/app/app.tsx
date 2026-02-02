import type { Context } from "@b9g/crank";
import { router } from "./router.ts";

export function* App(this: Context): Generator<Element> {
  let route = router.route;

  for ({} of this) {
    switch (route) {
      case "home":
	yield (
	  <ul>
	    <li><a href="/live">Connect</a></li>
	    <li><a href="/demo">Demo</a></li>
          </ul>
	);
	break;
      case "live":
	yield <h1> Live Connect </h1>;
	break;
      default:
	yield <h1>404 Not found </h1>;
    }
  }
}
