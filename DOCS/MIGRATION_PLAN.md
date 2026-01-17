# Migration Plan Review: Risks and Gaps

## Runtime and Build

- `--experimental-strip-types` is still experimental. It will not strip TS-only syntax in dependencies and can choke on `const enum`, `namespace`, and other TS-only constructs. Consider a stable fallback (tsx/ts-node/tsc emit) or constrain allowed syntax.
- CI uses Node 22, but packages declare `engines: >=16`. The proposed test command relies on `--experimental-strip-types`, which does not exist on Node 16. Either raise the engine floor or change the test runner strategy.
- `tsc --build` produces JS and types, but the plan does not ensure legacy consumers that rely on `main`/`types` fields continue to work. Consider adding `main` and `types` in package `package.json` in addition to `exports`.

## Exports and Module Conditions

- The `development` export condition is custom. It only works if consumers pass `--conditions=development`, and many bundlers ignore custom conditions. Add a standard fallback (`import`/`default`) and confirm tooling compatibility.
- Subpath exports are not addressed. If any `deno.json` defines multiple exports, those must be mirrored in `exports` or they will break.

## Type Checking and Tests

- `tsconfig.check.json` includes `**/*.ts` across the repo but does not address TS path mapping or package-level types. This can cause unresolved import errors when tests use bare workspace imports.
- Node’s test runner will not ignore `dist` or `node_modules` by default when globs are broad. Tighten the test glob or add explicit excludes.
- The npm `@std/expect` package may rely on web APIs or Deno shims. Confirm Node compatibility or plan an alternative test assertion library.

## Dependency and Packaging Risks

- Root `devDependencies` include `effection`, while packages declare it as `peerDependencies`. This can mask missing peer deps in consumers and allow tests to pass in the monorepo while installs fail downstream.
- `sideEffects: false` is risky if any package performs global registration or side effects. Validate per-package before applying this flag.

## Stdlib and API Replacements

- `@std/path` → `node:path` does not cover `fromFileUrl`/`toFileUrl` or `posix` helpers if used. Each usage must be audited.
- `@std/fs` includes helpers like `ensureDir`, `walk`, and `copy`. Node does not provide equivalents; replacements or new helpers are needed.
- `@std/streams` has helpers not present in `node:stream`. Any use of `readAll`, `copy`, or similar helpers needs a custom replacement.

## Scripts and Tooling

- Replacing `@deno/dnt` with `tsc --build` omits DNT’s behavior: import rewrite, shims, `package.json` adjustments, and module resolution. A replacement plan for URL imports (`https://`/`jsr:`) is required.
- `pnpm check` should run `tsc --build --emitDeclarationOnly` followed by `tsc -p tsconfig.check.json`. `tsconfig.check.json` uses `baseUrl` + `paths` to resolve `@effectionx/*` against source.
- Task scripts are written in TS and will need a runtime strategy (tsx/ts-node/compiled JS) if Node cannot execute them directly.

## Project Reference Automation

- Add a root `tsconfig.test.json` as part of the migration. The sync script uses the nearest `tsconfig.test.json` (or the root file as a fallback) to decide whether an import is test-only.
- Document the new sync script usage in the plan:
  - `node tasks/sync-tsrefs.ts` updates references only.
  - `node tasks/sync-tsrefs.ts fix` updates references and adds missing deps.
  - `node tasks/sync-tsrefs.ts check` fails CI if references or deps are out of date.
- The script should add missing workspace imports to `devDependencies` if they are test-only, otherwise to `dependencies`.

## CI and Repository Hygiene

- `pnpm install --frozen-lockfile` assumes a committed `pnpm-lock.yaml`, but the plan doesn’t mention generating or committing it.
- Import maps are removed without an equivalent Node strategy (`imports` field or TS path mapping). This will break `@std/*` and other mapped paths.
- Biome ignores `**/*.json`, which stops formatting/linting `package.json` and config files; confirm this is intentional.

## Suggested Follow-ups

- Audit `deno.json` exports for subpaths and map them explicitly.
- Inventory all `@std/*` usages and note which ones require custom replacements.
- Decide on a stable Node TS runtime for tests and scripts (tsx or compiled JS).
- Align `engines` with the runtime features required by the plan.
