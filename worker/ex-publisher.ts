import { defineConfig } from "ex-publisher";

export default defineConfig({
  // name of the extension
  name: "worker",

  // description that will go into package.json
  description: "Web Worker and subprocess management for Effection",

  // versions of effection this project is compatible with
  effection: ["4-beta"],

  // new versions will be published to these registries
  // NOTE: JSR publishing is not currently supported, only NPM
  registries: ["npm"],
});
