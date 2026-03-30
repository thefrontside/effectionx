let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  if (buffer.includes("\n")) {
    process.stdout.write("got line\n");
    process.exit(0);
  }
});
