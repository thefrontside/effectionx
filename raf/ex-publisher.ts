import { defineConfig } from "ex-publisher";

export default defineConfig({
  // name of the extension
  name: "raf",

  // description that will go into package.json
  description: "RequestAnimationFrame utilities for Effection",

  // versions of effection this project is compatible with
  effection: ["3"],

  // new versions will be published to these registries
  // NOTE: JSR publishing is not currently supported, only NPM
  registries: ["npm"],
});
