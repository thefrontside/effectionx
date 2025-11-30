import { createServer } from "node:http";
import process from "node:process";

console.log("starting server");

const port = parseInt(process.env.PORT || "29000");

const server = createServer((req, res) => {
  process.stderr.write(`got request\n`);

  // Read the entire request body
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    // Handle the command asynchronously to allow response to be sent first
    setTimeout(() => {
      readCommand(body);
    }, 100);

    // Echo the request body back
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(body);
  });
});

server.listen(port, () => {
  console.log("listening");
});

process.on("message", function (message: unknown) {
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
