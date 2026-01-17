import { createServer } from "node:http";
import process from "node:process";

console.log("starting server");

const port = Number.parseInt(process.env.PORT || "29000");

const server = createServer(async (req, res) => {
  process.stderr.write("got request\n");

  // Read the entire request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const command = Buffer.concat(chunks).toString();

  // Handle the command asynchronously to allow response to be sent first
  setTimeout(() => {
    readCommand(command);
  }, 100);

  // Echo the request body back
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(command);
});

server.listen(port, () => {
  console.log("listening");
});

process.on("message", (message: unknown) => {
  console.log("got message", message);
  if (process.send) {
    process.send(message);
  }
});

function readCommand(command: string) {
  if (command.includes("exit")) {
    console.log("exit(0)");
    process.exit(0);
  } else if (command.includes("fail")) {
    console.log("exit(1)");
    process.exit(1);
  }
}

process.on("exit", () => console.log("exiting..."));
