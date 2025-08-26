import { defineConfig } from "ex-publisher";

export default defineConfig({
  // name of the extension
  name: "deno-deploy",

  // description that will go into package.json
  description: "Deno Deploy utilities for Effection applications",

  // versions of effection this project is compatible with
  // Note: No explicit Effection dependency found, assuming v3 compatibility
  effection: ["3"],

  // new versions will be published to these registries
  // NOTE: JSR publishing is not currently supported, only NPM
  registries: ["npm"],
});
