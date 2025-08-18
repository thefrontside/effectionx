import { defineConfig } from "ex-publisher";

export default defineConfig({
  // name of the extension
  name: "task-buffer",

  // description that will go into package.json
  description: "Task buffering and batching utilities for Effection",

  // versions of effection this project is compatible with
  effection: ["4-beta"],

  // new versions will be published to these registries
  // NOTE: JSR publishing is not currently supported, only NPM
  registries: ["npm"],
});
