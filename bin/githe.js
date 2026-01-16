#!/usr/bin/env node
import { main } from "../dist/cli.js";

main(process.argv.slice(2)).catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
