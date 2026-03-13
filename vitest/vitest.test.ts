import { describe, it } from "@effectionx/bdd";
import { exec } from "@effectionx/process";
import { expect } from "expect";

describe("@effectionx/vitest", () => {
  it("runs vitest tests with effection operations", function* () {
    let result = yield* exec(
      "pnpm vitest run test/fixtures/sample.vitest.ts --reporter=verbose",
      {
        cwd: import.meta.dirname,
      },
    ).join();

    // Verify exit code
    expect(result.code).toEqual(0);

    // Verify all test names appear in output
    expect(result.stdout).toContain("can run an effection operation");
    expect(result.stdout).toContain("runs beforeEach before each test");
    expect(result.stdout).toContain("resets state between tests");
    expect(result.stdout).toContain("works in nested suites");
    expect(result.stdout).toContain("runs beforeAll once before all tests");
    expect(result.stdout).toContain(
      "beforeAll ran only once while beforeEach ran again",
    );

    // Verify pass count
    expect(result.stdout).toMatch(/6 passed/);
  });

  it("correctly scopes adapters across nested describes", function* () {
    let result = yield* exec(
      "pnpm vitest run test/fixtures/nested-scopes.vitest.ts --reporter=verbose",
      {
        cwd: import.meta.dirname,
      },
    ).join();

    expect(result.code).toEqual(0);

    expect(result.stdout).toContain("runs outer beforeEach");
    expect(result.stdout).toContain("runs both outer and middle beforeEach");
    expect(result.stdout).toContain("runs all three levels of beforeEach");
    expect(result.stdout).toContain(
      "outer scope is not affected by inner beforeEach",
    );

    expect(result.stdout).toMatch(/4 passed/);
  });

  it("isolates scopes across multiple test files", function* () {
    let result = yield* exec(
      "pnpm vitest run test/fixtures/sample.vitest.ts test/fixtures/nested-scopes.vitest.ts --reporter=verbose",
      {
        cwd: import.meta.dirname,
      },
    ).join();

    expect(result.code).toEqual(0);

    // 6 from sample + 4 from nested-scopes = 10 total
    expect(result.stdout).toMatch(/10 passed/);
  });

  it("reports failing tests correctly", function* () {
    let result = yield* exec(
      "pnpm vitest run test/fixtures/failing.vitest.ts --reporter=verbose",
      {
        cwd: import.meta.dirname,
      },
    ).join();

    // Verify exit code is non-zero (tests failed)
    expect(result.code).not.toEqual(0);

    // Verify failing test names appear in output
    expect(result.stdout).toContain("should fail on assertion error");
    expect(result.stdout).toContain("should fail on thrown error");

    // Verify fail count
    expect(result.stdout).toMatch(/2 failed/);
  });
});
