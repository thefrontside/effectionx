// Extracted and adapted from DNT's test runner code generation

export function generateTestRunnerScript(options: {
  testEntryPoints: string[];
  denoTestShimPackageName?: string;
  moduleType?: "module" | "commonjs";
}): string {
  const usesDenoTest = options.denoTestShimPackageName != null;
  const useESM = options.moduleType === "module";
  
  let script = "";
  
  if (useESM) {
    script += `import pc from "picocolors";
import process from "process";
import { pathToFileURL } from "url";
`;
    if (usesDenoTest) {
      script += `import { testDefinitions } from "${options.denoTestShimPackageName}";
`;
    }
  } else {
    script += `const pc = require("picocolors");
const process = require("process");
const { pathToFileURL } = require("url");
`;
    if (usesDenoTest) {
      script += `const { testDefinitions } = require("${options.denoTestShimPackageName}");
`;
    }
  }

  script += `
const filePaths = [`;
  
  for (const entryPoint of options.testEntryPoints) {
    script += `\n  "${entryPoint.replace(/\.ts$/, ".js")}",`;
  }
  
  script += `\n];

async function runTestDefinitions(testDefinitions, options) {
  const testFailures = [];
  const hasOnly = testDefinitions.some((d) => d.only);
  if (hasOnly) {
    testDefinitions = testDefinitions.filter((d) => d.only);
  }
  
  let testsRun = 0;
  let testsPassed = 0;
  
  for (const definition of testDefinitions) {
    testsRun++;
    process.stdout.write("test " + definition.name + " ...");
    if (definition.ignore) {
      process.stdout.write(\` \${pc.gray("ignored")}\\n\`);
      continue;
    }
    
    let pass = false;
    try {
      await definition.fn({});
      pass = true;
      testsPassed++;
    } catch (err) {
      testFailures.push({ name: definition.name, err: err.message || String(err) });
    }
    
    if (pass) {
      process.stdout.write(\` \${pc.green("ok")}\\n\`);
    } else {
      process.stdout.write(\` \${pc.red("FAILED")}\\n\`);
    }
  }
  
  console.log(\`\\ntest result: \${testFailures.length === 0 ? pc.green("ok") : pc.red("FAILED")}. \${testsPassed} passed; \${testFailures.length} failed; 0 ignored; 0 measured; 0 filtered out\\n\`);
  
  if (testFailures.length > 0) {
    console.log("failures:\\n");
    for (const failure of testFailures) {
      console.log(\`\${failure.name}\`);
      console.log(\`thread 'main' panicked at \${failure.err}\`);
      console.log("");
    }
  }
  
  return {
    testsRun,
    testsPassed,
    testsFailed: testFailures.length,
    testFailures,
    success: testFailures.length === 0
  };
}

async function main() {`;

  if (usesDenoTest) {
    script += `
  const testContext = { process, pc };
  let allResults = { testsRun: 0, testsPassed: 0, testsFailed: 0, testFailures: [], success: true };
  
  for (const [i, filePath] of filePaths.entries()) {
    if (i > 0) console.log("");
    
    console.log("running " + pc.underline(filePath) + "...");
    
    try {`;
    
    if (useESM) {
      script += `
      await import(pathToFileURL(filePath).href);`;
    } else {
      script += `
      const fileUrl = pathToFileURL(filePath);
      await import(fileUrl.href);`;
    }
    
    script += `
      
      if (testDefinitions.length > 0) {
        const results = await runTestDefinitions(testDefinitions, testContext);
        allResults.testsRun += results.testsRun;
        allResults.testsPassed += results.testsPassed;
        allResults.testsFailed += results.testsFailed;
        allResults.testFailures.push(...results.testFailures);
        if (!results.success) allResults.success = false;
        
        // Clear test definitions for next file
        testDefinitions.length = 0;
      }
    } catch (err) {
      console.error(\`Error loading \${filePath}: \${err.message}\`);
      allResults.success = false;
      allResults.testsFailed++;
      allResults.testFailures.push({ name: filePath, err: err.message });
    }
  }
  
  process.exit(allResults.success ? 0 : 1);`;
  } else {
    // Just run the test files directly without the Deno test shim
    script += `
  let allSuccess = true;
  
  for (const [i, filePath] of filePaths.entries()) {
    if (i > 0) console.log("");
    
    console.log("running " + pc.underline(filePath) + "...");
    
    try {`;
      
    if (useESM) {
      script += `
      await import(pathToFileURL(filePath).href);`;
    } else {
      script += `
      const fileUrl = pathToFileURL(filePath);
      await import(fileUrl.href);`;
    }
    
    script += `
    } catch (err) {
      console.error(\`Error loading \${filePath}: \${err.message}\`);
      allSuccess = false;
    }
  }
  
  // Exit with appropriate code
  process.exit(allSuccess ? 0 : 1);`;
  }

  script += `
}

main().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});`;

  return script;
}