import type { Context } from "@b9g/crank";
import { router } from "./router.ts";
import { Layout } from "./layout.tsx";
import { Home } from "./home.tsx";
import { Live } from "./live.tsx";
import { Demo } from "./pages/demo/demo.tsx";
import { Recording } from "./recording.tsx";

export async function* App(this: Context): AsyncGenerator<Element> {
  let route = router.route;
  router.listen(() => this.refresh(() => (route = router.route)));

  for ({} of this) {
    switch (route) {
      case "home":
        yield <Home />;
        break;
      case "live":
        yield <Live />;
        break;
      case "demo":
        yield <Demo />;
        break;
      case "recording":
        yield <Recording />;
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
