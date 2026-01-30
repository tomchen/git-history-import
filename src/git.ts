import { execFileSync } from "node:child_process";

export function isGitRepo(): boolean {
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export function isWorkingTreeClean(ignore?: string[]): boolean {
	try {
		const status = execFileSync("git", ["status", "--porcelain"], {
			encoding: "utf-8",
		});
		if (!ignore || ignore.length === 0) return status.trim() === "";
		const lines = status
			.split("\n")
			.filter((l) => l.trim() !== "")
			.filter((l) => {
				const path = l.slice(3);
				return !ignore.some((ig) => path === ig);
			});
		return lines.length === 0;
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
	const branchName = `githe-backup-${timestamp}`;
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
