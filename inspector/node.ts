import { global } from "effection";
import { api } from "effection/experimental";
import { combine } from "./mod.ts";
import { scope } from "./scope/implementation.ts";
import { player } from "./player/implementation.ts";
import { attach } from "./lib/attach.ts";
import { useSSEServer } from "./lib/sse-server.ts";
import { useLabels } from "./lib/labels.ts";
import { pause } from "./player/implementation.ts";
import packageJSON from "./package.json" with { type: "json" };

const inspector = combine.inspectors(scope, player);

global.decorate(api.Main, {
  main([body], next) {
    return next(function* (args) {
      yield* useLabels({ name: "main", args: args.join(" ") });

      yield* attach(global, inspector, function* (handle) {
        let address = yield* useSSEServer(handle, { port: 41000 });

        let { version } = packageJSON;
        console.log(
          `effection inspector@${version} running at http://localhost:${address.port}/live`,
        );
      });

      if (args.includes("--suspend")) {
        yield* pause();
      }

      yield* body(args);

      if (args.includes("--suspend")) {
        yield* pause();
      }
    });
  },
});
