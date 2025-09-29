import process from 'node:process';

// This script is executed via Node: 'node dump-args.js arg1 arg2 ...'
// process.argv[0] is the node executable path
// process.argv[1] is the path to this script (dump-args.js)
// process.argv[2] and onwards are the arguments passed from your 'exec' call.
const args = process.argv.slice(2);

// Look up the specific environment variable
const envVar = process.env.EFFECTION_TEST_ENV_VAL;

// Print a stable, predictable output string with a Unix line ending (\n)
console.log(JSON.stringify({ args, envVar }));