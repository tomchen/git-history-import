import { execSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { expect } from "vitest";
import { exportHistory } from "../src/export.js";
import { importHistory } from "../src/import.js";

function createTestRepo() {
	const dir = mkdtempSync(join(tmpdir(), "githe-test-"));
	execSync("git init", { cwd: dir });
	execSync('git config user.email "test@test.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello");
	execSync('git add file.txt && git commit -m "first commit"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello world");
	execSync('git add file.txt && git commit -m "second commit"', { cwd: dir });
	return dir;
}

describe("importHistory", () => {
	let origCwd: string;
	let repoDir: string;
	let tmpDir: string;

	beforeAll(() => {
		origCwd = process.cwd();
		repoDir = createTestRepo();
		tmpDir = mkdtempSync(join(tmpdir(), "githe-json-"));
		process.chdir(repoDir);
	});

	afterAll(() => {
		process.chdir(origCwd);
		rmSync(repoDir, { recursive: true, force: true });
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("rewrites commit messages from modified JSON", async () => {
		const jsonStr = await exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].message = "modified first";
		data.commits[1].message = "modified second";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		await importHistory(jsonFile, { noBackup: true });

		const log = execSync('git log --format="%s" --reverse', {
			encoding: "utf-8",
		}).trim();
		expect(log).toBe("modified first\nmodified second");
	});

	it("rewrites author info from modified JSON", async () => {
		const jsonStr = await exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].author.name = "NewAuthor";
		data.commits[0].author.email = "new@author.com";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		await importHistory(jsonFile, { noBackup: true });

		const log = execSync('git log --format="%an <%ae>" --reverse', {
			encoding: "utf-8",
		})
			.trim()
			.split("\n");
		expect(log[0]).toBe("NewAuthor <new@author.com>");
	});

	it("creates backup branch by default", async () => {
		const jsonStr = await exportHistory({});
		const data = JSON.parse(jsonStr);
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		await importHistory(jsonFile, {});

		const branches = execSync("git branch", { encoding: "utf-8" });
		expect(branches).toContain("githe-backup-");
	});

	it("rejects dirty working tree", async () => {
		writeFileSync(join(repoDir, "dirty.txt"), "uncommitted");
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, "{}");

		await expect(importHistory(jsonFile, {})).rejects.toThrow(
			/clean|commit|stash/i,
		);

		unlinkSync(join(repoDir, "dirty.txt"));
	});

	it("rejects invalid JSON", async () => {
		const jsonFile = join(tmpDir, "bad.json");
		writeFileSync(jsonFile, "not valid json {{{");

		await expect(importHistory(jsonFile, {})).rejects.toThrow(/invalid json/i);
	});

	it("rejects JSON without commits array", async () => {
		const jsonFile = join(tmpDir, "nocommits.json");
		writeFileSync(jsonFile, JSON.stringify({ version: 1 }));

		await expect(importHistory(jsonFile, {})).rejects.toThrow(
			/missing "commits" array/i,
		);
	});

	it("preserves file content after rewrite", async () => {
		const jsonStr = await exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].message = "changed msg";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		await importHistory(jsonFile, { noBackup: true });

		const content = readFileSync(join(repoDir, "file.txt"), "utf-8");
		expect(content).toBe("hello world");
	});
});

describe("importHistory outside git repo", () => {
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

	it("rejects import outside a git repository", async () => {
		const jsonFile = join(noGitDir, "dummy.json");
		writeFileSync(jsonFile, JSON.stringify({ commits: [] }));

		await expect(importHistory(jsonFile, {})).rejects.toThrow(
			/not a git repository/i,
		);
	});
});
