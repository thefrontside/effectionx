import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { until } from "npm:effection@3.6.0";
import { generateImportMap, writeImportMapToFile, createTempImportMap } from "./import-map.ts";

describe("Import Map Generation", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-import-map-test-" });
  });

  describe("generateImportMap", () => {
    it("should generate import map with specific Effection version", function* () {
      const importMap = yield* generateImportMap("3.6.0");
      
      expect(importMap).toEqual({
        imports: {
          "effection": "npm:effection@3.6.0"
        }
      });
    });

    it("should merge with existing base import map", function* () {
      const baseImportMap = {
        imports: {
          "@std/testing": "jsr:@std/testing@1",
          "zod": "npm:zod@^3.20.2"
        }
      };
      
      const importMap = yield* generateImportMap("4.0.0-beta.2", baseImportMap);
      
      expect(importMap).toEqual({
        imports: {
          "@std/testing": "jsr:@std/testing@1",
          "zod": "npm:zod@^3.20.2",
          "effection": "npm:effection@4.0.0-beta.2"
        }
      });
    });

    it("should override effection import in base map", function* () {
      const baseImportMap = {
        imports: {
          "effection": "npm:effection@3.0.0",
          "@std/testing": "jsr:@std/testing@1"
        }
      };
      
      const importMap = yield* generateImportMap("4.0.0-beta.2", baseImportMap);
      
      expect(importMap.imports["effection"]).toBe("npm:effection@4.0.0-beta.2");
      expect(importMap.imports["@std/testing"]).toBe("jsr:@std/testing@1");
    });
  });

  describe("writeImportMapToFile", () => {
    it("should write valid JSON import map to file", function* () {
      const filePath = `${tempDir.path}/import-map.json`;
      const importMap = {
        imports: {
          "effection": "npm:effection@3.6.0"
        }
      };
      
      yield* writeImportMapToFile(importMap, filePath);
      
      const content = yield* until(Deno.readTextFile(filePath));
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual(importMap);
    });

    it("should create directories if they don't exist", function* () {
      const filePath = `${tempDir.path}/nested/deep/import-map.json`;
      const importMap = {
        imports: {
          "effection": "npm:effection@3.6.0"
        }
      };
      
      yield* writeImportMapToFile(importMap, filePath);
      
      const content = yield* until(Deno.readTextFile(filePath));
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual(importMap);
    });
  });

  describe("createTempImportMap", () => {
    it("should create temporary file with import map", function* () {
      const tempFilePath = yield* createTempImportMap("3.6.0");
      
      expect(tempFilePath).toMatch(/\/ex-publisher-.*\/import-map\.json$/);
      
      const content = yield* until(Deno.readTextFile(tempFilePath));
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual({
        imports: {
          "effection": "npm:effection@3.6.0"
        }
      });
      
      // Cleanup
      const tempDirPath = tempFilePath.split("/").slice(0, -1).join("/");
      yield* until(Deno.remove(tempDirPath, { recursive: true }));
    });

    it("should return path to temporary file", function* () {
      const tempFilePath = yield* createTempImportMap("4.0.0-beta.2");
      
      expect(typeof tempFilePath).toBe("string");
      expect(tempFilePath).toMatch(/import-map\.json$/);
      
      const stat = yield* until(Deno.stat(tempFilePath));
      expect(stat.isFile).toBe(true);
      
      // Cleanup
      const tempDirPath = tempFilePath.split("/").slice(0, -1).join("/");
      yield* until(Deno.remove(tempDirPath, { recursive: true }));
    });
  });
});