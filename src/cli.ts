import { exportHistory } from "./export.js";
import { importHistory } from "./import.js";

interface CliOptions {
	output?: string;
	range?: string;
	noBackup?: boolean;
	_: string[];
}

function parseArgs(args: string[]): CliOptions {
	const opts: CliOptions = { _: [] };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "-o" && args[i + 1]) {
			opts.output = args[++i];
		} else if (args[i] === "--range" && args[i + 1]) {
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
  githe export [-o <file>] [--range <range>]
  githe import <file> [--no-backup]`);
}

export async function main(argv: string[]): Promise<void> {
	const command = argv[0];

	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(0);
	}

	const opts = parseArgs(argv.slice(1));

	if (command === "export") {
		const result = await exportHistory(opts);
		if (result !== undefined) {
			process.stdout.write(result);
		}
	} else if (command === "import") {
		const file = opts._[0];
		if (!file) {
			console.error("Error: import requires a JSON file path");
			process.exit(1);
		}
		await importHistory(file, opts);
	} else {
		console.error(`Unknown command: ${command}`);
		printUsage();
		process.exit(1);
	}
}
