# Deno Deploy

Provides Deno Deploy Effection context with `region`, `deploymentId` and
`isDenoDeploy` flag to detect when running in the Deno Deploy environment. This
can be useful when testing an application that's deployed to Deno Deploy.

```ts
import { main } from "effection";
import { useDenoDeploy } from "@effectionx/deno-deploy";

await main(function* () {
  const {
    isDenoDeploy,
    deploymentId,
    region,
  } = yield* useDenoDeploy();
});
```
