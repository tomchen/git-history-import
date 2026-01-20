import { readFileSync } from "node:fs";
import {
	createBackupBranch,
	getCurrentBranch,
	gitFastExport,
	gitFastImport,
	gitResetHard,
	isGitRepo,
	isWorkingTreeClean,
} from "./git.js";
import { parseFastExport } from "./parser.js";
import { patchFastExportStream } from "./serializer.js";

export interface ImportOptions {
	noBackup?: boolean;
}

export async function importHistory(
	file: string,
	opts: ImportOptions,
): Promise<void> {
	if (!isGitRepo()) {
		throw new Error("Not a git repository");
	}

	if (!isWorkingTreeClean()) {
		throw new Error(
			"Working tree is not clean. Please commit or stash your changes first.",
		);
	}

	const jsonStr = readFileSync(file, "utf-8");
	let data: { commits: unknown[] };
	try {
		data = JSON.parse(jsonStr) as { commits: unknown[] };
	} catch (e) {
		throw new Error(`Invalid JSON: ${(e as Error).message}`);
	}

	if (!data.commits || !Array.isArray(data.commits)) {
		throw new Error('Invalid JSON: missing "commits" array');
	}

	const branch = getCurrentBranch();

	if (!opts.noBackup) {
		const backupBranch = createBackupBranch();
		console.log(`Backup branch created: ${backupBranch}`);
	}

	const stream = gitFastExport();
	const patchedStream = patchFastExportStream(
		stream,
		data.commits as Parameters<typeof patchFastExportStream>[1],
	);
	gitFastImport(patchedStream);
	gitResetHard(branch);

	console.log(
		`Imported ${data.commits.length} commits. History rewritten on branch '${branch}'.`,
	);
	console.log("");
	console.log("To completely purge old history:");
	console.log("");
	console.log("# 1. Delete backup branch:");
	console.log("git branch -D githe-backup-<timestamp>");
	console.log("# 2. Expire reflog:");
	console.log("git reflog expire --expire=now --all");
	console.log("# 3. Garbage collect:");
	console.log("git gc --prune=now --aggressive");
	console.log("# 4. Force push to remote:");
	console.log("git push --force");
	console.log("# 5. All collaborators must re-clone");
}
