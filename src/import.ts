import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
	createBackupBranch,
	getCurrentBranch,
	getRepoRoot,
	gitFastExport,
	gitFastImport,
	gitResetHard,
	isGitRepo,
	isWorkingTreeClean,
} from "./git.js";
import type { Commit } from "./parser.js";
import { patchFastExportStream } from "./serializer.js";

export interface ImportOptions {
	noBackup?: boolean;
}

export function importHistory(file: string, opts: ImportOptions): void {
	if (!isGitRepo()) {
		throw new Error("Not a git repository");
	}

	// Allow the import JSON file itself to be inside the repo
	const absFile = resolve(file);
	const repoRoot = getRepoRoot();
	const relFile = relative(repoRoot, absFile);
	const isInsideRepo = !relFile.startsWith("..") && !relFile.startsWith("/");

	if (!isWorkingTreeClean(isInsideRepo ? [relFile] : undefined)) {
		throw new Error(
			"Working tree is not clean. Please commit or stash your changes first.",
		);
	}

	const jsonStr = readFileSync(file, "utf-8");
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(jsonStr) as Record<string, unknown>;
	} catch (e) {
		throw new Error(`Invalid JSON: ${(e as Error).message}`);
	}

	if (!Array.isArray(data.commits)) {
		throw new Error('Invalid JSON: missing "commits" array');
	}

	const commits = data.commits.map((c: unknown, i: number) =>
		validateCommit(c, i),
	);

	const branch = getCurrentBranch();
	if (branch === "HEAD") {
		throw new Error(
			"Cannot operate on detached HEAD. Please checkout a branch first.",
		);
	}

	const ref = `refs/heads/${branch}`;

	if (!opts.noBackup) {
		const backupBranch = createBackupBranch();
		console.log(`Backup branch created: ${backupBranch}`);
	}

	const stream = gitFastExport(ref);
	const patchedStream = patchFastExportStream(stream, commits);
	gitFastImport(patchedStream);
	gitResetHard(branch);

	console.log(
		`Imported ${commits.length} commits. History rewritten on branch '${branch}'.`,
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

function validateCommit(c: unknown, index: number): Commit {
	if (typeof c !== "object" || c === null) {
		throw new Error(`commits[${index}]: expected an object`);
	}
	const obj = c as Record<string, unknown>;

	if (typeof obj.message !== "string") {
		throw new Error(`commits[${index}].message: expected a string`);
	}

	validateIdentity(obj.author, `commits[${index}].author`);
	validateIdentity(obj.committer, `commits[${index}].committer`);

	if (typeof obj.original_hash !== "string" || obj.original_hash.length === 0) {
		throw new Error(`commits[${index}].original_hash: required for import`);
	}

	return {
		original_hash: obj.original_hash,
		message: obj.message,
		author: obj.author as Commit["author"],
		committer: obj.committer as Commit["committer"],
		parents: Array.isArray(obj.parents) ? (obj.parents as string[]) : [],
	};
}

function validateIdentity(id: unknown, path: string): void {
	if (typeof id !== "object" || id === null) {
		throw new Error(`${path}: expected an object with name, email, date`);
	}
	const obj = id as Record<string, unknown>;
	if (typeof obj.name !== "string") {
		throw new Error(`${path}.name: expected a string`);
	}
	if (typeof obj.email !== "string") {
		throw new Error(`${path}.email: expected a string`);
	}
	if (typeof obj.date !== "string") {
		throw new Error(`${path}.date: expected a string`);
	}
}
