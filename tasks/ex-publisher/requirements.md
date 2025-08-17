# About

ex-publisher is a tool created for EffectionX to workaround for
[Deno's lack of support for semver ranges](https://github.com/denoland/deno/issues/26587),
to makes it easier to test packages that need both Deno & Node compatibility and
ensure that Effection v3 and Effection v4 version of packages are available.

# How does it work?

It has 4 phases:

1. Analyze
2. Verify
3. Plan
4. Publish

In Analyze phase, it reads read the file system to determine the following

1. What extensions does it need to work with?
2. What are the latest version for each extension?
3. Confirm that each extension is compatible with Effection v3 and v4 APIs

In the verification phase, it executes tests in Deno and Node to ensure that
extension can be published. Since the tests are written using Deno Test runner,
it runs Node tests after executing Deno DNT script that generates the Node
package will be published to NPM in the Execution phase.

In Plan phase, it determines which extensions need to be published based on
latest versions of each extension and the current version specified in
ex-publisher.ts. It produces a list of instructions which will be executed
during the execution phase and prints them out.

In Execution phase, take the instructions from the Plan phase and execute them
one by one. The instructions will include, which extension needs to be published
to what version, where to find files for each version.

# Implementation Design

## Configuration

Each extension will be in a directory matching it's name and include a
TypeScript file that will provide configuration. It'll be called
ex-publisher.ts. Each file will be based on the following template,

```ts
import { defineConfig } from "ex-publisher";

export default defineConfig({
  // name of the extension
  name: "example",

  // description that will go into package.json
  description: "example description",

  // versions of effection this project is compatible with
  // this will be converted to a semver range in package.json (e.g., "^3.0.0 || ^4.0.0")
  // supports prerelease version specifiers:
  // ["3", "4"] - stable versions only
  // ["4-beta"] - beta prereleases only (e.g., 4.0.0-beta.1)
  // ["4-alpha"] - alpha prereleases only (e.g., 4.0.0-alpha.2)
  // ["4-rc"] - release candidate prereleases only (e.g., 4.0.0-rc.1)
  // ["4-prerelease"] - any prerelease (alpha, beta, rc)
  // ["4-any"] - stable or prerelease (prefers stable when available)
  effection: ["3", "4"],

  // new versions will be published to these registries
  // NOTE: JSR publishing is not currently supported, only NPM
  registries: ["npm"],
});
```

## Error handling

It allows partial completion - where it attempts to publish the extensions and
versions that it can publish. Those that encounter errors should be recorded to
a file.

## Rollback mechanism

It's a roll forward only workflow - it should be possible to re-run the entire
process to publish only the previously failed extensions, versions or
registries.

## Version Resolution

Before generating semver ranges for package.json, ex-publisher must resolve the
highest available version for each Effection version constraint specified in the
extension configuration.

### Process

1. **Fetch Available Versions**: Query NPM registry for all published Effection
   versions
2. **Parse Constraints**: Convert extension config constraints (e.g.,
   `["3", "4-beta"]`) into semver ranges
3. **Resolve Highest**: For each constraint, find the highest version that
   matches the range
4. **Cache Results**: Cache NPM registry responses to avoid repeated network
   requests

### Constraint Resolution Examples

| Configuration    | Semver Range           | Resolved Version | Description                      |
| ---------------- | ---------------------- | ---------------- | -------------------------------- |
| `"3"`            | `>=3.0.0 <4.0.0`       | `3.6.1`          | Highest stable 3.x               |
| `"4"`            | `>=4.0.0 <5.0.0`       | `4.2.1`          | Highest stable 4.x               |
| `"4-beta"`       | `>=4.0.0-beta <4.0.0`  | `4.0.0-beta.1`   | Highest 4.x beta                 |
| `"4-alpha"`      | `>=4.0.0-alpha <4.0.0` | `4.0.0-alpha.2`  | Highest 4.x alpha                |
| `"4-rc"`         | `>=4.0.0-rc <4.0.0`    | `4.0.0-rc.1`     | Highest 4.x RC                   |
| `"4-prerelease"` | `>=4.0.0-0 <4.0.0`     | `4.0.0-rc.1`     | Highest 4.x prerelease           |
| `"4-any"`        | `>=4.0.0-0 <5.0.0`     | `4.2.1`          | Stable preferred over prerelease |

### Error Handling

- Network timeouts: Retry with exponential backoff
- 404 responses: Log warning and continue with empty version list
- Malformed responses: Log error and continue with empty version list
- No matching versions: Include error in resolution result

## Dependency resolution

For Deno, we can use `--import-map` parameter to overload imports when executing
tests or publish command. For Node, we might need to edit the package.json
followed by an `npm install` to install a specific version of Effection.

## CLI Interface

`ex-publisher`

Global Flags --verbose: Print debugging output

`ex-publisher analyze [ext_name]` help: Perform analyze and output found
extensions

Parameters ext_name: [optional] select extension to analyze

`ex-publisher verify [ext_name] [--deno] [--node] [--effection=version]` help:
Run tests for extensions

Parameters ext_name: [optional] select extension to run tests for

Arguments --deno: [optional] run tests for deno --node: [optional] run tests for
node --effection: [optional]: run tests for specified version of Effection
--lint: [optional] run lint as part of verify

`ex-publisher plan [ext_name] [--jsr] [--npm] [--effection=version]` help: Show
the plan for publishing new versions of extensions

Parameters ext_name: [optional] select extension to plan

Arguments --jsr: [optional] show plan for JSR (not currently supported) --npm:
[optional] show plan for NPM --effection: [optional]: show plan for specified
version of Effection

`ex-publisher publish [ext_name] [--jsr] [--npm] [--effection=version]` help:
Publish new versions of extensions

Parameters: ext_name: [optional] select extension to plan

Arguments --jsr: [optional] publish to JSR (not currently supported) --npm:
[optional] publish to NPM --effection: [optional]: publish for specified version
of Effection

## Logging

We'll create a logging library using `@effectionx/context-api`.

## Dry-run mode

Can be done with plan command

## File structure

It'll store all generated files in extension directories for example
`[ext_name]/ex-publisher-[node|deno]-[version]`. These directories will be in
`.gitignore` to exclude them from the repository

## Version bumping strategy

Q: How to determine new version numbers (patch/minor/major) for each extension?

A: We'll just follow semver for each extension. We don't need to do anything
special anymore because we're going to work around Deno not having range support
by not publishing to JSR.

~~[major] - version of effection that this package is compatible with~~
~~[minor] - equivalent of major version but for project specifically~~
~~[patch] - most changes will be patch as long as they're significant breaking
changes~~

When want to support a sliding version dependency on an extension, use `~`
prefix otherwise specify a version explicitly.

## Workspace integration

Q: How it fits with the existing Deno workspace structure?

A: I'm not sure if it would be better to remove the workspace setup or still use
it.

Unknown: Does `--import-map` update the lock file?

## Import map generation

Q: Specific details on how import maps are created for different Effection
versions?

A: Since `--import-map` takes a file, we might need to create the file and store
it in a temporary location.

Unknown: Can we use a data: url for --import-map?

## DNT configuration

Q: How to handle different DNT configs for v3 vs v4?

A: We should be able to use DNT to specify which version of effection we're
generating package for.

Unknown: Do we want to test multiple node version - we could use Volta for this.

## Concurrent publishing

Q: Whether to publish extensions in parallel or sequentially?

A: We could do it in parallel using `@effectionx/task-buffer`.

Unknown: Performance benefits of doing publishing in parallel are unknown.

## Status persistence

Q: Where/how to store the error log and retry state between runs?

A: Store them on the file system in files that are gitignored

## Registry authentication details

Q: How to handle NPM tokens, JSR auth (env vars? config files?)

A: Read tokens from environment variables

## Global flags completion

Q: Missing --dry-run and --force flags in the global flags section

A: Not applicable

## Error recovery specifics

Q: What specific errors trigger retry vs abort (auth failures, network timeouts,
version conflicts, etc.)

Only network related failures should cause a retry. Auth failures only matter
for `analyze` and `publish`. Version conflicts can be ignored.

## Code Practices

We're going to use Effection. It's docs are available in
https://github.com/thefrontside/effection/tree/effection-v3.6.0/docs

Use Effection where possible instead of async/await.
