import { spawn } from "node:child_process";
import process from "node:process";

let descendant = spawn(
  process.execPath,
  ["-e", "setInterval(() => {}, 1000)"],
  {
    stdio: ["ignore", "inherit", "inherit"],
  },
);

descendant.unref();
process.exit(23);
