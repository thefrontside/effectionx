import { global } from "effection";
import { api } from "effection/experimental";
import { combine } from "./mod.ts";
import { scope } from "./scope/implementation.ts";
import { player } from "./player/implementation.ts";
import { useSSEServer } from "./lib/sse-server.ts";
import { useLabels } from "./lib/labels.ts";
import { pause } from "./player/implementation.ts";

const inspector = combine.inspectors(scope, player);

global.decorate(api.Main, {
  main([body], next) {
    return next(function* (args) {
      yield* useLabels({ name: "main", args });

      let handle = yield* inspector.attach();

      let address = yield* useSSEServer(handle, { port: 41000 });

      console.log(`inspector started on ${address.port}`);

      if (args.includes('--break')) {
	yield* pause();
      }

      yield* body(args);

    });
  },
});
