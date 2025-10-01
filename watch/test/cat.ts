if (Deno.args.length !== 1) {
  console.error("Usage: deno run cat.ts <file>");
  Deno.exit(1);
}

const filename = Deno.args[0];

try {
  const content = await Deno.readTextFile(filename);
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(content));
} catch (error) {
  console.error(`Error reading file "${filename}":`, error.message);
  Deno.exit(1);
}