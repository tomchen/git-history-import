import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCommitHash, isGitRepo, isWorkingTreeClean } from "../src/git.js";

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

	it("isWorkingTreeClean returns false for dirty tree", () => {
		writeFileSync(join(repoDir, "dirty.txt"), "untracked");
		const result = isWorkingTreeClean();
		rmSync(join(repoDir, "dirty.txt"));
		expect(result).toBe(false);
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
