import { Operation, until } from "npm:effection@3.6.0";
import { join, resolve } from "jsr:@std/path";
import { exists as fsExists } from "jsr:@std/fs";
import type { ExtensionConfig, VersionResolutionResult } from "../types.ts";
import { ExtensionConfigSchema } from "../types.ts";
import { logger } from "../logger.ts";

export interface DiscoveredExtension {
  name: string;
  path: string;
  config: ExtensionConfig;
  version: string;
  resolvedVersions: VersionResolutionResult[];
}

interface WorkspaceConfig {
  workspace?: string[];
  [key: string]: unknown;
}

export function* discoverExtensions(
  workspaceDir: string,
): Operation<DiscoveredExtension[]> {
  yield* logger.debug(`Discovering extensions in workspace: ${workspaceDir}`);

  try {
    // Read workspace configuration
    const workspaceConfigPath = join(workspaceDir, "deno.json");
    const workspaceExists = yield* exists(workspaceConfigPath);

    if (!workspaceExists) {
      yield* logger.debug("No workspace deno.json found");
      return [];
    }

    const workspaceContent = yield* readTextFile(workspaceConfigPath);
    const workspaceConfig: WorkspaceConfig = JSON.parse(workspaceContent);

    if (!workspaceConfig.workspace || workspaceConfig.workspace.length === 0) {
      yield* logger.debug("Workspace has no members");
      return [];
    }

    yield* logger.debug(
      `Found ${workspaceConfig.workspace.length} workspace members`,
    );

    // Discover extensions in each workspace member
    const extensions: DiscoveredExtension[] = [];

    for (const memberPath of workspaceConfig.workspace) {
      const fullMemberPath = resolve(workspaceDir, memberPath);
      const extension = yield* tryDiscoverExtension(fullMemberPath);

      if (extension) {
        extensions.push(extension);
        yield* logger.debug(`Discovered extension: ${extension.name}`);
      }
    }

    yield* logger.info(`Discovered ${extensions.length} extensions`);
    return extensions;
  } catch (error) {
    yield* logger.error("Failed to discover extensions:", error);
    throw error;
  }
}

function* tryDiscoverExtension(
  extensionPath: string,
): Operation<DiscoveredExtension | null> {
  try {
    // Check if ex-publisher.ts config exists
    const configPath = join(extensionPath, "ex-publisher.ts");
    const configExists = yield* exists(configPath);

    if (!configExists) {
      yield* logger.debug(
        `No ex-publisher.ts config found in ${extensionPath}`,
      );
      return null;
    }

    // Load extension configuration
    const config = yield* loadExtensionConfig(configPath);

    // Load version from deno.json
    const version = yield* loadExtensionVersion(extensionPath);

    return {
      name: config.name,
      path: extensionPath,
      config,
      version,
      resolvedVersions: [], // TODO: Populate with version resolution
    };
  } catch (error) {
    yield* logger.warn(
      `Failed to discover extension at ${extensionPath}:`,
      error,
    );
    return null;
  }
}

export function* loadExtensionConfig(
  configPath: string,
): Operation<ExtensionConfig> {
  yield* logger.debug(`Loading extension config from ${configPath}`);

  try {
    // Dynamic import to load the config module
    const configModule = yield* dynamicImport(configPath);

    if (!configModule.default) {
      throw new Error(`No default export found in ${configPath}`);
    }

    // Validate the configuration with Zod schema
    const validatedConfig = ExtensionConfigSchema.parse(configModule.default);

    yield* logger.debug(
      `Successfully validated config for ${validatedConfig.name}`,
    );
    return validatedConfig;
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as any; // Zod error has errors property
      const details = zodError.errors.map((e: any) =>
        `${e.path.join(".")}: ${e.message}`
      ).join(", ");
      throw new Error(`Invalid configuration in ${configPath}: ${details}`);
    }
    throw error;
  }
}

function* loadExtensionVersion(extensionPath: string): Operation<string> {
  const denoJsonPath = join(extensionPath, "deno.json");
  const denoJsonExists = yield* exists(denoJsonPath);

  if (!denoJsonExists) {
    throw new Error(`No deno.json found in ${extensionPath}`);
  }

  const denoJsonContent = yield* readTextFile(denoJsonPath);
  const denoJson = JSON.parse(denoJsonContent);

  if (!denoJson.version) {
    throw new Error(`No version found in ${denoJsonPath}`);
  }

  return denoJson.version;
}

// Effection wrappers for async file operations
function exists(path: string): Operation<boolean> {
  return until(fsExists(path));
}

function* readTextFile(path: string): Operation<string> {
  return yield* until(Deno.readTextFile(path));
}

function* dynamicImport(path: string): Operation<any> {
  // Convert file path to file:// URL for dynamic import
  const fileUrl = new URL(`file://${path}`).href;
  return yield* until(import(fileUrl));
}
