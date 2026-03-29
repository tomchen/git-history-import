import { createRequire } from "node:module";
import { exportHistory } from "./export.js";
import { importHistory } from "./import.js";

interface CliOptions {
	range?: string;
	noBackup?: boolean;
	_: string[];
}

function parseArgs(args: string[]): CliOptions {
	const opts: CliOptions = { _: [] };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--range" && args[i + 1]) {
			opts.range = args[++i];
		} else if (args[i] === "--no-backup") {
			opts.noBackup = true;
		} else if (!args[i].startsWith("-")) {
			opts._.push(args[i]);
		} else {
			console.error(`Unknown option: ${args[i]}`);
			process.exit(1);
		}
	}
	return opts;
}

function printUsage(): void {
	console.log(`Usage:
  ghi export <file> [--range <range>]
  ghi import <file> [--no-backup]`);
}

export function main(argv: string[]): void {
	const command = argv[0];

	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(0);
	}

	if (command === "--version" || command === "-v") {
		const require = createRequire(import.meta.url);
		const { version } = require("../package.json") as { version: string };
		console.log(version);
		process.exit(0);
	}

	const opts = parseArgs(argv.slice(1));

	if (command === "export") {
		const file = opts._[0];
		if (!file) {
			console.error("Error: export requires a JSON file path");
			process.exit(1);
		}
		exportHistory(file, opts);
	} else if (command === "import") {
		const file = opts._[0];
		if (!file) {
			console.error("Error: import requires a JSON file path");
			process.exit(1);
		}
		importHistory(file, opts);
	} else {
		console.error(`Unknown command: ${command}`);
		printUsage();
		process.exit(1);
	}
}
