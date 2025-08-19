// Extracted and adapted from DNT test runner types

export interface TestDefinition {
  name: string;
  fn: (context: TestContext) => Promise<void> | void;
  only?: boolean;
  ignore?: boolean;
}

export interface TestContext {
  name: string;
  parent: TestContext | undefined;
  origin: string;
  err: any;
  children: TestContext[];
  hasFailingChild: boolean;
  status: "ok" | "fail" | "pending" | "ignored";
  getOutput(): string;
  step(
    nameOrDefinition: string | TestDefinition,
    fn?: (context: TestContext) => void | Promise<void>,
  ): Promise<boolean>;
}

export interface Picocolors {
  green(text: string): string;
  red(text: string): string;
  gray(text: string): string;
}

export interface NodeProcess {
  stdout: {
    write(text: string): void;
  };
  exit(code: number): never;
}

export interface RunTestDefinitionsOptions {
  pc: Picocolors;
  process: NodeProcess;
  origin: string;
}