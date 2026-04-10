import * as fsp from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { type Api, createApi } from "@effectionx/context-api";
import type { Operation } from "effection";
import { until } from "effection";

export interface Fs {
  stat(path: string): Operation<Stats>;
  lstat(path: string): Operation<Stats>;
  readdir(path: string): Operation<string[]>;
  readdirDirents(path: string): Operation<Dirent[]>;
  rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Operation<void>;
  copyFile(src: string, dest: string): Operation<void>;
  readTextFile(path: string): Operation<string>;
  writeTextFile(path: string, content: string): Operation<void>;
}

export const FsApi: Api<Fs> = createApi("fs", {
  stat(path: string) {
    return until(fsp.stat(path));
  },

  lstat(path: string) {
    return until(fsp.lstat(path));
  },

  readdir(path: string) {
    return until(fsp.readdir(path));
  },

  readdirDirents(path: string) {
    return until(fsp.readdir(path, { withFileTypes: true }));
  },

  rm(path: string, options?: { recursive?: boolean; force?: boolean }) {
    return until(fsp.rm(path, options));
  },

  copyFile(src: string, dest: string) {
    return until(fsp.copyFile(src, dest));
  },

  readTextFile(path: string) {
    return until(fsp.readFile(path, "utf-8"));
  },

  writeTextFile(path: string, content: string) {
    return until(fsp.writeFile(path, content));
  },
});
