import process from "node:process";

// Exits on the first SIGTERM, so graceful shutdown always lands.
process.on("SIGTERM", () => {
  process.exit(0);
});

console.log("ready");
setInterval(() => {}, 1_000);
