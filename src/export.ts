import { writeFileSync } from "node:fs";
import { getCurrentRef, getRepoRoot, gitFastExport, isGitRepo } from "./git.js";
import { parseFastExport } from "./parser.js";

export interface ExportOptions {
	range?: string;
}

export function exportHistory(file: string, opts: ExportOptions): void {
	if (!isGitRepo()) {
		throw new Error("Not a git repository");
	}

	const ref = opts.range || getCurrentRef();
	const stream = gitFastExport(ref);
	const { commits } = parseFastExport(stream);
	const repoRoot = getRepoRoot();

	const normalizedCommits = commits.map((c) => ({
		...c,
		message: c.message.replace(/\n$/, ""),
	}));

	const output = JSON.stringify(
		{
			version: 1,
			repo: repoRoot,
			ref,
			exported_at: new Date().toISOString(),
			commits: normalizedCommits,
		},
		null,
		2,
	);

	writeFileSync(file, output, "utf-8");
	console.log(`Exported ${commits.length} commits to ${file}`);
}
