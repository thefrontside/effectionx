import { type } from "arktype";
import { createLocalStorage } from "./storage";

export const SettingsSchema = type({
  "showInspectorRuntime?": "boolean",
  "showAnonymousScopes?": "boolean",
});

export type Settings = typeof SettingsSchema.infer;

export const settings = createLocalStorage<Settings>(
  "settings",
  SettingsSchema,
  {},
);
