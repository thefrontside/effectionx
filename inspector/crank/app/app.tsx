import type { Context } from "@b9g/crank";
import { router } from "./router.ts";
import { Layout } from "./layout.tsx";
import { Live } from "./live.tsx";

export async function* App(this: Context): AsyncGenerator<Element> {
  let route = router.route;

  for ({} of this) {
    switch (route) {
      case "home":
        yield (
          <Layout>
            <ul>
              <li>
                <a href="/live">Connect</a>
              </li>
              <li>
                <a href="/demo">Demo</a>
              </li>
            </ul>
          </Layout>
        );
        break;
      case "live":
        yield <Live/>;
        break;
      default:
        yield (
          <Layout>
            <h1>404 Not found </h1>
          </Layout>
        );
    }
  }
}
