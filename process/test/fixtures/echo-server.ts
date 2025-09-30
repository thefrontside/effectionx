const { process } = globalThis;

console.log("starting server");
Deno.serve({
  port: parseInt(process.env.PORT || "29000"),
  onListen: () => {
    console.log("listening");
  },
}, async (request: Request) => {
  process.stderr.write(`got request\n`);

  // Read the entire request body
  const command = await request.text();

  // Handle the command asynchronously to allow response to be sent first
  setTimeout(() => {
    readCommand(command);
  }, 100);

  // Echo the request body back
  return new Response(command, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
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
