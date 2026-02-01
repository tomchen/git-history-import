import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getCommitHash,
	getCurrentRef,
	isGitRepo,
	isWorkingTreeClean,
} from "../src/git.js";

function createTestRepo() {
	const dir = mkdtempSync(join(tmpdir(), "githe-git-"));
	execSync("git init", { cwd: dir });
	execSync('git config user.email "test@test.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello");
	execSync('git add file.txt && git commit -m "init"', { cwd: dir });
	return dir;
}

describe("git helpers inside a repo", () => {
	let origCwd: string;
	let repoDir: string;

	beforeAll(() => {
		origCwd = process.cwd();
		repoDir = createTestRepo();
		process.chdir(repoDir);
	});

	afterAll(() => {
		process.chdir(origCwd);
		rmSync(repoDir, { recursive: true, force: true });
	});

	it("getCommitHash returns a 40-char SHA for HEAD", () => {
		const hash = getCommitHash("HEAD");
		expect(hash).toMatch(/^[0-9a-f]{40}$/);
	});

	it("getCommitHash matches git rev-parse HEAD", () => {
		const expected = execSync("git rev-parse HEAD", {
			encoding: "utf-8",
		}).trim();
		expect(getCommitHash("HEAD")).toBe(expected);
	});

	it("isWorkingTreeClean returns false for modified tracked file", () => {
		writeFileSync(join(repoDir, "file.txt"), "modified");
		const result = isWorkingTreeClean();
		execSync("git checkout -- file.txt", { cwd: repoDir });
		expect(result).toBe(false);
	});

	it("isWorkingTreeClean ignores untracked files", () => {
		writeFileSync(join(repoDir, "untracked.txt"), "new");
		const result = isWorkingTreeClean();
		rmSync(join(repoDir, "untracked.txt"));
		expect(result).toBe(true);
	});

	it("getCurrentRef returns refs/heads/<branch>", () => {
		const ref = getCurrentRef();
		expect(ref).toMatch(/^refs\/heads\/.+$/);
	});

	it("getCurrentRef throws on detached HEAD", () => {
		// Detach HEAD by checking out a specific commit hash
		const hash = execSync("git rev-parse HEAD", {
			encoding: "utf-8",
			cwd: repoDir,
		}).trim();
		execSync(`git checkout --detach ${hash}`, { cwd: repoDir, stdio: "pipe" });
		expect(() => getCurrentRef()).toThrow(/detached HEAD/i);
		// Reattach to branch
		execSync("git checkout -", { cwd: repoDir, stdio: "pipe" });
	});
});

describe("git helpers outside a repo", () => {
	let origCwd: string;
	let noGitDir: string;

	beforeAll(() => {
		origCwd = process.cwd();
		noGitDir = mkdtempSync(join(tmpdir(), "githe-nogit-"));
		process.chdir(noGitDir);
	});

	afterAll(() => {
		process.chdir(origCwd);
		rmSync(noGitDir, { recursive: true, force: true });
	});

	it("isGitRepo returns false outside a git repo", () => {
		expect(isGitRepo()).toBe(false);
	});

	it("isWorkingTreeClean returns false outside a git repo (catch branch)", () => {
		// execSync throws when not in a git repo, the catch branch returns false
		expect(isWorkingTreeClean()).toBe(false);
	});
});
