import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);

if (args.length !== 1) {
  console.error("Usage: node cat.ts <file>");
  process.exit(1);
}

const filename = args[0];

try {
  const content = readFileSync(filename, "utf-8");
  process.stdout.write(content);
} catch (error) {
  console.error(`Error reading file "${filename}":`, (error as Error).message);
  process.exit(1);
}
