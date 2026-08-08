import { spawn } from "node:child_process";
import process from "node:process";

const descendant = spawn(
  process.execPath,
  [
    "-e",
    ['process.on("SIGTERM", () => {});', "setInterval(() => {}, 1000);"].join(
      "",
    ),
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);

descendant.unref();
console.log("ready");
process.on("SIGTERM", () => process.exit(23));
setInterval(() => {}, 1_000);
