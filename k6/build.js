/**
 * Build script for @effectionx/k6
 *
 * This script bundles:
 * 1. Main library - the @effectionx/k6 library with Effection bundled
 * 2. Testing module - BDD testing primitives for K6
 * 3. Demo scripts - example K6 scripts showing problem/solution pairs
 * 4. Test scripts - package tests that run in K6
 */

import * as esbuild from "esbuild";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

// Ensure dist directory exists
await mkdir("dist", { recursive: true });
await mkdir("dist/demos", { recursive: true });
await mkdir("dist/tests", { recursive: true });

// Common esbuild options for K6 bundles
const k6BundleOptions = {
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "neutral", // K6's Sobek is not Node or browser
  // Required for neutral platform to resolve packages like "immutable" that use "main" field
  mainFields: ["module", "main"],
  sourcemap: true,
  minify: false, // Keep readable for debugging
  // K6 provides these modules - mark as external
  // Also mark node:* as external since Effection has dynamic imports for them
  // that only execute in Node environments
  external: ["k6", "k6/*", "node:*"],
};

// Build the main library module
// This bundles Effection into the output so K6 scripts don't need external deps
await esbuild.build({
  ...k6BundleOptions,
  entryPoints: ["lib/mod.ts"],
  outfile: "dist/lib.js",
  banner: {
    js: `/**
 * @effectionx/k6 Library Bundle
 * 
 * Structured concurrency for K6 load testing.
 * Effection is bundled - no external dependencies needed.
 * 
 * Import in K6 scripts:
 *   import { main, group, http } from './lib.js';
 */
`,
  },
});

console.log("Built: dist/lib.js");

// Build demo scripts if they exist
const demosDir = "demos";
if (existsSync(demosDir)) {
  const demoFiles = (await readdir(demosDir)).filter((f) => f.endsWith(".ts"));

  for (const demoFile of demoFiles) {
    const outName = demoFile.replace(".ts", ".js");
    await esbuild.build({
      ...k6BundleOptions,
      entryPoints: [`${demosDir}/${demoFile}`],
      outfile: `dist/demos/${outName}`,
      banner: {
        js: `/**
 * @effectionx/k6 Demo: ${demoFile.replace(".ts", "")}
 * Auto-generated - do not edit directly.
 */
`,
      },
    });
    console.log(`Built: dist/demos/${outName}`);
  }
}

// Build the testing module
await esbuild.build({
  ...k6BundleOptions,
  entryPoints: ["testing/mod.ts"],
  outfile: "dist/testing.js",
  banner: {
    js: `/**
 * @effectionx/k6 Testing Module
 * 
 * BDD testing for K6 with Effection structured concurrency.
 * 
 * Import in K6 scripts:
 *   import { describe, it, expect, runTests } from './testing.js';
 */
`,
  },
});

console.log("Built: dist/testing.js");

// Build test scripts if they exist
const testsDir = "tests";
if (existsSync(testsDir)) {
  const testFiles = (await readdir(testsDir)).filter((f) => f.endsWith(".ts"));

  for (const testFile of testFiles) {
    const outName = testFile.replace(".ts", ".js");
    await esbuild.build({
      ...k6BundleOptions,
      entryPoints: [`${testsDir}/${testFile}`],
      outfile: `dist/tests/${outName}`,
      banner: {
        js: `/**
 * @effectionx/k6 Test: ${testFile.replace(".ts", "")}
 * Auto-generated - do not edit directly.
 */
`,
      },
    });
    console.log(`Built: dist/tests/${outName}`);
  }
}

// Build the full package module
await esbuild.build({
  ...k6BundleOptions,
  entryPoints: ["mod.ts"],
  outfile: "dist/mod.js",
});

console.log("Built: dist/mod.js");

console.log("\nBuild complete!");
