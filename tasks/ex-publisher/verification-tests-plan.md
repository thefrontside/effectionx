# Verification System Tests Plan

## Import Map Generation (`lib/import-map.test.ts`)
```
describe("Import Map Generation", () => {
  describe("generateImportMap", () => {
    it("should generate import map with specific Effection version")
    it("should merge with existing base import map")
    it("should override effection import in base map")
  })

  describe("writeImportMapToFile", () => {
    it("should write valid JSON import map to file")
    it("should create directories if they don't exist")
  })

  describe("createTempImportMap", () => {
    it("should create temporary file with import map")
    it("should return path to temporary file")
    it("should clean up temporary files after use")
  })
})
```

## Deno Test Execution (`lib/deno-test.test.ts`)
```
describe("Deno Test Execution", () => {
  describe("runDenoTests", () => {
    it("should execute deno test with custom import map")
    it("should capture test output and exit code")
    it("should handle test failures gracefully")
    it("should pass through additional deno test flags")
  })

  describe("findTestFiles", () => {
    it("should discover test files in extension directory")
    it("should filter by test patterns")
    it("should exclude files in gitignore")
  })
})
```

## DNT Integration (`lib/dnt.test.ts`)
```
describe("DNT Integration", () => {
  describe("generateDNTConfig", () => {
    it("should create DNT config for specific Effection version")
    it("should include correct package.json metadata")
    it("should map Deno imports to Node equivalents")
  })

  describe("runDNTBuild", () => {
    it("should execute DNT build process")
    it("should output to specified directory")
    it("should handle build failures")
  })
})
```

## Node Test Execution (`lib/node-test.test.ts`)
```
describe("Node Test Execution", () => {
  describe("runNodeTests", () => {
    it("should execute npm test in generated package")
    it("should install dependencies first")
    it("should handle missing package.json")
    it("should capture test results")
  })
})
```

## Linting (`lib/lint.test.ts`)
```
describe("Linting", () => {
  describe("runLint", () => {
    it("should execute deno lint on extension")
    it("should respect lint configuration")
    it("should report lint errors")
    it("should handle extensions without lint config")
  })
})
```

## Verification Command Integration (`commands/verify.test.ts`)
```
describe("Verify Command", () => {
  describe("verifyCommand", () => {
    it("should run all verification steps for extension")
    it("should filter by extension name when specified")
    it("should run only deno tests when --deno flag set")
    it("should run only node tests when --node flag set")
    it("should run linting when --lint flag set")
    it("should test specific Effection version when specified")
    it("should report verification results clearly")
    it("should handle verification failures gracefully")
  })
})
```