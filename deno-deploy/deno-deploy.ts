/**
 * @deprecated This package is Deno-specific and no longer actively maintained.
 * The effectionx monorepo has migrated to Node.js.
 * @module
 */
import { type Context, type Operation, createContext } from "effection";

export interface DenoDeploy {
  /**
   * True when running in Deno Deploy
   */
  isDenoDeploy: boolean;
  /**
   * ID of the current Deno Deploy environment
   * @see https://docs.deno.com/deploy/manual/environment-variables/#deployment-environment-variables
   */
  deploymentId: string | undefined;
  /**
   * It holds the region code of the region in which the deployment is running.
   * You can use this variable to serve region-specific content. You can refer to the
   * region code from the [regions page](https://docs.deno.com/deploy/manual/regions/).
   */
  region: string | undefined;
}

/**
 * Context used to access DenoDeploy value
 *
 * ```ts
 * function*() {
 *  const {
 *    isDenoDeploy,
 *    deploymentId,
 *    region
 *  } = yield* DenoDeployContext;
 * }
 * ```
 */
export const DenoDeployContext: Context<DenoDeploy> = createContext<DenoDeploy>(
  "deno-deploy",
  {
    isDenoDeploy: false,
    deploymentId: undefined,
    region: undefined,
  },
);

/**
 * Use to read the values of Deno Deploy Context.
 *
 * ```ts
 * import { useDenoDeploy } from "@effectionx/deno-deploy";
 *
 * function* () {
 *  const { isDenoDeploy } = yield* useDenoDeploy();
 * }
 * ```
 */
export function* useDenoDeploy(): Operation<DenoDeploy> {
  return yield* DenoDeployContext;
}

/**
 * Use at the root of your application to setup Deno Deploy context.
 *
 * ```ts
 * import { main } from "effection";
 * import { initDenoDeploy } from "@effectionx/deno-deploy";
 *
 * await main(function*() {
 *  yield* initDenoDeploy();
 * });
 * ```
 */
export function* initDenoDeploy(): Operation<DenoDeploy> {
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  const region = Deno.env.get("DENO_REGION");
  const isDenoDeploy = deploymentId !== undefined;

  return yield* DenoDeployContext.set({
    isDenoDeploy,
    deploymentId,
    region,
  });
}
