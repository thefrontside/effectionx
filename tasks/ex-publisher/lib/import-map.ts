import { Operation, until } from "npm:effection@3.6.0";
import { log } from "../logger.ts";

export interface ImportMap {
  imports: Record<string, string>;
}

export function* generateImportMap(
  effectionVersion: string,
  baseImportMap?: ImportMap,
): Operation<ImportMap> {
  yield* log.debug(`Generating import map for Effection ${effectionVersion}`);

  const imports: Record<string, string> = {
    ...baseImportMap?.imports,
    "effection": `npm:effection@${effectionVersion}`,
  };

  const importMap: ImportMap = { imports };

  yield* log.debug("Generated import map:", importMap);
  return importMap;
}

export function* writeImportMapToFile(
  importMap: ImportMap,
  filePath: string,
): Operation<void> {
  yield* log.debug(`Writing import map to ${filePath}`);

  // Ensure directory exists
  const dir = filePath.split("/").slice(0, -1).join("/");
  if (dir) {
    yield* until(Deno.mkdir(dir, { recursive: true }));
  }

  const content = JSON.stringify(importMap, null, 2);
  yield* until(Deno.writeTextFile(filePath, content));

  yield* log.debug(`Import map written to ${filePath}`);
}

export function* createTempImportMap(
  effectionVersion: string,
  baseImportMap?: ImportMap,
): Operation<string> {
  const importMap = yield* generateImportMap(effectionVersion, baseImportMap);
  
  // Create a temporary directory
  const tempDir = yield* until(Deno.makeTempDir({ prefix: "ex-publisher-" }));
  const tempFile = `${tempDir}/import-map.json`;
  
  yield* writeImportMapToFile(importMap, tempFile);
  
  return tempFile;
}