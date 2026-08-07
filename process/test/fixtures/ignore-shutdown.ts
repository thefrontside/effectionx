import { spawn } from "node:child_process";
import process from "node:process";

const descendant = spawn(
  process.execPath,
  ["-e", 'process.on("SIGINT", () => {}); setInterval(() => {}, 1000);'],
  {
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  },
);

descendant.once("spawn", () => {
  console.log("ready");
});

descendant.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

process.on("SIGINT", () => {});
process.stdin.resume();
setInterval(() => {}, 1000);
