import { execFileSync } from "node:child_process";

export function isGitRepo(): boolean {
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export function isWorkingTreeClean(): boolean {
	try {
		// Only check tracked files — untracked files (including the import
		// JSON) are irrelevant and won't be touched by git reset --hard.
		execFileSync("git", ["diff-index", "--quiet", "HEAD"], {
			stdio: "pipe",
		});
		return true;
	} catch {
		return false;
	}
}

export function gitFastExport(ref: string): Buffer {
	return execFileSync("git", ["fast-export", ref, "--show-original-ids"], {
		maxBuffer: 100 * 1024 * 1024,
	});
}

export function getCurrentBranch(): string {
	return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		encoding: "utf-8",
	}).trim();
}

export function getCurrentRef(): string {
	const branch = getCurrentBranch();
	if (branch === "HEAD") {
		throw new Error(
			"Cannot operate on detached HEAD. Please checkout a branch first.",
		);
	}
	return `refs/heads/${branch}`;
}

export function getRepoRoot(): string {
	return execFileSync("git", ["rev-parse", "--show-toplevel"], {
		encoding: "utf-8",
	}).trim();
}

export function getCommitHash(ref: string): string {
	return execFileSync("git", ["rev-parse", ref], {
		encoding: "utf-8",
	}).trim();
}

export function createBackupBranch(): string {
	const timestamp = Date.now();
	const branchName = `ghi-backup-${timestamp}`;
	execFileSync("git", ["branch", branchName], { stdio: "pipe" });
	return branchName;
}

export function gitFastImport(stream: Buffer): void {
	execFileSync("git", ["fast-import", "--force", "--quiet"], {
		input: stream,
		maxBuffer: 100 * 1024 * 1024,
	});
}

export function gitResetHard(ref: string): void {
	execFileSync("git", ["reset", "--hard", ref], { stdio: "pipe" });
}
