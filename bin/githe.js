#!/usr/bin/env node

import { exportHistory } from '../src/export.js';
import { importHistory } from '../src/import.js';

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && args[i + 1]) {
      opts.output = args[++i];
    } else if (args[i] === '--range' && args[i + 1]) {
      opts.range = args[++i];
    } else if (args[i] === '--no-backup') {
      opts.noBackup = true;
    } else if (!args[i].startsWith('-')) {
      opts._.push(args[i]);
    } else {
      console.error(`Unknown option: ${args[i]}`);
      process.exit(1);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`Usage:
  githe export [-o <file>] [--range <range>]
  githe import <file> [--no-backup]`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const opts = parseArgs(args.slice(1));

  if (command === 'export') {
    await exportHistory(opts);
  } else if (command === 'import') {
    const file = opts._[0];
    if (!file) {
      console.error('Error: import requires a JSON file path');
      process.exit(1);
    }
    await importHistory(file, opts);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
