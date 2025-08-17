import type { Operation } from "npm:effection@3.6.0";
import { createApi } from "npm:@effectionx/context-api@0.0.2";

export interface Logger {
  info: (message: string, ...args: unknown[]) => Operation<void>;
  debug: (message: string, ...args: unknown[]) => Operation<void>;
  warn: (message: string, ...args: unknown[]) => Operation<void>;
  error: (message: string, ...args: unknown[]) => Operation<void>;
}

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

const consoleLogger: Logger = {
  *info(message: string, ...args: unknown[]) {
    console.log(`${colors.blue}[INFO]${colors.reset} ${message}`, ...args);
  },
  *debug(message: string, ...args: unknown[]) {
    console.log(`${colors.gray}[DEBUG]${colors.reset} ${message}`, ...args);
  },
  *warn(message: string, ...args: unknown[]) {
    console.warn(`${colors.yellow}[WARN]${colors.reset} ${message}`, ...args);
  },
  *error(message: string, ...args: unknown[]) {
    console.error(`${colors.red}[ERROR]${colors.reset} ${message}`, ...args);
  },
};

export const loggerApi = createApi("logger", consoleLogger);
export const log = loggerApi.operations;
