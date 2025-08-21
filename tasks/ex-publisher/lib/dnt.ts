import { Operation, until } from "npm:effection@3.6.0";
import { build, emptyDir } from "jsr:@deno/dnt@0.42.3";
import { log } from "../logger.ts";

export interface DNTConfig {
  entryPoints: string[];
  outDir: string;
  shims: {
    deno: boolean;
  };
  mappings: Record<string, string>;
  importMap?: string;
  package: {
    name: string;
    version: string;
    description: string;
    author?: string;
    license: string;
    repository?: any;
    dependencies: Record<string, string>;
    type?: string;
    exports?: any;
  };
}

export interface DNTBuildOptions {
  extensionPath: string;
  effectionVersion: string;
  outputDir: string;
  packageMetadata?: {
    name: string;
    version: string;
    description: string;
    author?: string;
  };
}

export interface DNTBuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface DNTRunOptions {
  config: DNTConfig;
  workingDir: string;
  importMapPath?: string;
  cacheDir?: string;
}

export function* generateDNTConfig(options: DNTBuildOptions): Operation<DNTConfig> {
  const { extensionPath, effectionVersion, outputDir, packageMetadata } = options;

  yield* log.debug(`Generating DNT config for ${extensionPath}`);

  // Read deno.json to get package info and imports
  const denoJsonPath = `${extensionPath}/deno.json`;
  const denoJsonContent = yield* until(Deno.readTextFile(denoJsonPath));
  const denoJson = JSON.parse(denoJsonContent);

  // Determine entry points from exports
  const entryPoints: string[] = [];
  if (typeof denoJson.exports === "string") {
    entryPoints.push(denoJson.exports);
  } else if (typeof denoJson.exports === "object" && denoJson.exports !== null) {
    for (const [key, value] of Object.entries(denoJson.exports)) {
      if (typeof value === "string") {
        entryPoints.push(value);
      }
    }
  } else {
    // Default to mod.ts if no exports specified
    entryPoints.push("./mod.ts");
  }

  // Generate mappings from Deno imports to Node equivalents
  const mappings: Record<string, string> = {};

  if (denoJson.imports) {
    for (const [importName, importValue] of Object.entries(denoJson.imports)) {
      if (importName === "effection") {
        // Override with specific version
        mappings[importName] = `npm:effection@${effectionVersion}`;
      } else if (typeof importValue === "string") {
        // Convert JSR imports to NPM equivalents
        if (importValue.startsWith("jsr:@std/")) {
          const jsr = importValue.replace("jsr:", "npm:");
          mappings[importName] = jsr;
        } else if (importValue.startsWith("npm:")) {
          mappings[importName] = importValue;
        } else if (importValue.startsWith("jsr:")) {
          // Convert other JSR imports to npm
          mappings[importName] = importValue.replace("jsr:", "npm:");
        }
        // Skip relative and absolute file paths - let DNT handle them
        // Don't add mappings for local files
      }
    }
  }

  // Generate package.json metadata
  const packageName = packageMetadata?.name || denoJson.name || "unknown-package";
  const packageVersion = packageMetadata?.version || denoJson.version || "1.0.0";
  const packageDescription = packageMetadata?.description || "Generated package";

  // Extract dependencies from mappings
  const dependencies: Record<string, string> = {};
  for (const [_, mappingValue] of Object.entries(mappings)) {
    if (mappingValue.startsWith("npm:")) {
      const npmSpec = mappingValue.replace("npm:", "");
      const [pkgName, version] = npmSpec.includes("@") && !npmSpec.startsWith("@")
        ? npmSpec.split("@")
        : npmSpec.startsWith("@")
        ? [npmSpec.split("@").slice(0, 2).join("@"), npmSpec.split("@")[2]]
        : [npmSpec, "latest"];
      
      if (version) {
        dependencies[pkgName] = version.replace("^", "").replace("~", "");
      }
    }
  }

  const config: DNTConfig = {
    entryPoints,
    outDir: outputDir,
    shims: {
      deno: true,
    },
    mappings,
    package: {
      name: packageName,
      version: packageVersion,
      description: packageDescription,
      author: packageMetadata?.author,
      license: "MIT",
      repository: {
        type: "git",
        url: `https://github.com/frontside/effectionx.git`,
        directory: `packages/${packageName.replace("@effectionx/", "")}`,
      },
      dependencies,
    },
  };

  yield* log.debug("Generated DNT config:");
  yield* log.debug("- Package name:", packageName);
  yield* log.debug("- Package version:", packageVersion);
  yield* log.debug("- Package description:", packageDescription);
  yield* log.debug("- Author:", packageMetadata?.author);
  yield* log.debug("- Dependencies:", dependencies);
  yield* log.debug("- Entry points:", entryPoints);
  yield* log.debug("- Mappings:", mappings);
  
  return config;
}

export function* runDNTBuild(options: DNTRunOptions): Operation<DNTBuildResult> {
  const { config, workingDir, cacheDir } = options;

  yield* log.debug(`Running DNT build in ${workingDir}`);

  // Change to working directory for DNT build
  const originalCwd = Deno.cwd();
  
  try {
    Deno.chdir(workingDir);
    
    yield* log.debug("Changed to working directory:", workingDir);
    yield* log.debug("Output directory:", config.outDir);
    
    // Clean output directory
    yield* until(emptyDir(config.outDir));
    yield* log.debug("Cleaned output directory");

    // Set DENO_DIR environment variable to use shared cache or avoid cache issues
    const originalDenoDir = Deno.env.get("DENO_DIR");
    const denoDir = cacheDir || `${workingDir}/.deno-cache`;
    Deno.env.set("DENO_DIR", denoDir);
    
    try {
      // Run DNT build
      yield* until(build({
        entryPoints: config.entryPoints,
        outDir: config.outDir,
        shims: config.shims,
        package: config.package,
        scriptModule: false,
        importMap: config.importMap,
        // Exclude test files since they're not part of the Node.js package
        filterDiagnostic: (diagnostic) => {
          // Skip diagnostics for test files
          if (diagnostic.file?.fileName?.includes(".test.") || 
              diagnostic.file?.fileName?.includes("_test.") ||
              diagnostic.file?.fileName?.includes(".spec.")) {
            return false;
          }
          return true;
        },
        // Skip test files entirely
        test: false,
      }));

      yield* log.debug("DNT build completed successfully");

      return {
        success: true,
        exitCode: 0,
        stdout: "DNT build completed successfully",
        stderr: "",
      };
    } finally {
      // Restore original DENO_DIR
      if (originalDenoDir) {
        Deno.env.set("DENO_DIR", originalDenoDir);
      } else {
        Deno.env.delete("DENO_DIR");
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    yield* log.debug(`DNT build failed: ${errorMessage}`);
    if (errorStack) {
      yield* log.debug("Error stack:", errorStack);
    }

    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: errorMessage,
    };
  } finally {
    // Restore original working directory
    Deno.chdir(originalCwd);
  }
}