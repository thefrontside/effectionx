import { readFileSync } from "node:fs";
import process from "node:process";

if (process.argv.length !== 3) {
  console.error("Usage: node cat.ts <file>");
  process.exit(1);
}

const filename = process.argv[2];

try {
  const content = readFileSync(filename, "utf-8");
  process.stdout.write(content);
} catch (error) {
  console.error(`Error reading file "${filename}":`, (error as Error).message);
  process.exit(1);
}
