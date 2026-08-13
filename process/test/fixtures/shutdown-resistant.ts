import process from "node:process";

process.on("SIGINT", () => {});
process.on("SIGTERM", () => {});

if (process.platform !== "win32") {
  process.on("SIGUSR1", () => {
    process.exit(0);
  });
}

console.log("ready");
setInterval(() => {}, 1_000);
