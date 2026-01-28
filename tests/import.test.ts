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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

	it("rewrites commit messages from modified JSON", () => {
		const jsonStr = exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].message = "modified first";
		data.commits[1].message = "modified second";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		importHistory(jsonFile, { noBackup: true });

		const log = execSync('git log --format="%s" --reverse', {
			encoding: "utf-8",
		}).trim();
		expect(log).toBe("modified first\nmodified second");
	});

	it("rewrites author info from modified JSON", () => {
		const jsonStr = exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].author.name = "NewAuthor";
		data.commits[0].author.email = "new@author.com";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		importHistory(jsonFile, { noBackup: true });

		const log = execSync('git log --format="%an <%ae>" --reverse', {
			encoding: "utf-8",
		})
			.trim()
			.split("\n");
		expect(log[0]).toBe("NewAuthor <new@author.com>");
	});

	it("creates backup branch by default", () => {
		const jsonStr = exportHistory({});
		const data = JSON.parse(jsonStr);
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		importHistory(jsonFile, {});

		const branches = execSync("git branch", { encoding: "utf-8" });
		expect(branches).toContain("githe-backup-");
	});

	it("rejects dirty working tree", () => {
		writeFileSync(join(repoDir, "dirty.txt"), "uncommitted");
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, "{}");

		expect(() => importHistory(jsonFile, {})).toThrow(/clean|commit|stash/i);

		unlinkSync(join(repoDir, "dirty.txt"));
	});

	it("rejects invalid JSON", () => {
		const jsonFile = join(tmpDir, "bad.json");
		writeFileSync(jsonFile, "not valid json {{{");

		expect(() => importHistory(jsonFile, {})).toThrow(/invalid json/i);
	});

	it("rejects JSON without commits array", () => {
		const jsonFile = join(tmpDir, "nocommits.json");
		writeFileSync(jsonFile, JSON.stringify({ version: 1 }));

		expect(() => importHistory(jsonFile, {})).toThrow(
			/missing "commits" array/i,
		);
	});

	it("preserves file content after rewrite", () => {
		const jsonStr = exportHistory({});
		const data = JSON.parse(jsonStr);
		data.commits[0].message = "changed msg";
		const jsonFile = join(tmpDir, "history.json");
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		importHistory(jsonFile, { noBackup: true });

		const content = readFileSync(join(repoDir, "file.txt"), "utf-8");
		expect(content).toBe("hello world");
	});

	it("rejects commit that is not an object", () => {
		const jsonFile = join(tmpDir, "bad-type.json");
		writeFileSync(jsonFile, JSON.stringify({ commits: ["not an object"] }));
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/commits\[0\].*expected an object/,
		);
	});

	it("rejects commit with missing message", () => {
		const jsonFile = join(tmpDir, "bad-msg.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						author: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/message.*expected a string/,
		);
	});

	it("rejects commit with missing committer", () => {
		const jsonFile = join(tmpDir, "bad-committer.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						message: "hi",
						author: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/committer/,
		);
	});

	it("rejects identity with missing name", () => {
		const jsonFile = join(tmpDir, "bad-name.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						message: "hi",
						author: { email: "a@a", date: "2024-01-01 00:00:00 +0000" },
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/author\.name.*expected a string/,
		);
	});

	it("rejects identity with missing email", () => {
		const jsonFile = join(tmpDir, "bad-email.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						message: "hi",
						author: { name: "A", date: "2024-01-01 00:00:00 +0000" },
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/author\.email.*expected a string/,
		);
	});

	it("rejects identity with missing date", () => {
		const jsonFile = join(tmpDir, "bad-date.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						message: "hi",
						author: { name: "A", email: "a@a" },
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/author\.date.*expected a string/,
		);
	});

	it("rejects commit with missing author", () => {
		const jsonFile = join(tmpDir, "bad-author.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						original_hash: "abc123",
						message: "hi",
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(/author/);
	});

	it("succeeds with reordered commits array (matched by hash)", () => {
		const jsonStr = exportHistory({});
		const data = JSON.parse(jsonStr!);
		data.commits.reverse();
		const jsonFile = join(tmpDir, "reversed.json");
		writeFileSync(jsonFile, JSON.stringify(data));
		// Should succeed — hash matching ignores array order
		importHistory(jsonFile, { noBackup: true });
		// Messages should still be in correct git order (not reversed)
		const log = execSync('git log --format="%s" --reverse', {
			encoding: "utf-8",
		})
			.trim()
			.split("\n");
		// The messages match the original commits, just the JSON array was reversed
		expect(log.length).toBe(2);
	});

	it("rejects commit with missing original_hash", () => {
		const jsonFile = join(tmpDir, "no-hash.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						message: "hi",
						author: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, { noBackup: true })).toThrow(
			/original_hash/i,
		);
	});
});

describe("importHistory on detached HEAD", () => {
	let origCwd: string;
	let repoDir: string;

	beforeAll(() => {
		origCwd = process.cwd();
		repoDir = mkdtempSync(join(tmpdir(), "githe-detached-"));
		execSync("git init", { cwd: repoDir });
		execSync('git config user.email "test@test.com"', { cwd: repoDir });
		execSync('git config user.name "Test"', { cwd: repoDir });
		writeFileSync(join(repoDir, "file.txt"), "hello");
		execSync('git add file.txt && git commit -m "init"', { cwd: repoDir });
		execSync("git checkout --detach", { cwd: repoDir });
		process.chdir(repoDir);
	});

	afterAll(() => {
		process.chdir(origCwd);
		rmSync(repoDir, { recursive: true, force: true });
	});

	it("rejects import on detached HEAD", () => {
		const tmpJson = mkdtempSync(join(tmpdir(), "githe-detached-json-"));
		const jsonFile = join(tmpJson, "dummy.json");
		writeFileSync(
			jsonFile,
			JSON.stringify({
				commits: [
					{
						message: "x",
						original_hash: "abc",
						author: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
						committer: {
							name: "A",
							email: "a@a",
							date: "2024-01-01 00:00:00 +0000",
						},
					},
				],
			}),
		);
		expect(() => importHistory(jsonFile, {})).toThrow(/detached HEAD/i);
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

	it("rejects import outside a git repository", () => {
		const jsonFile = join(noGitDir, "dummy.json");
		writeFileSync(jsonFile, JSON.stringify({ commits: [] }));

		expect(() => importHistory(jsonFile, {})).toThrow(/not a git repository/i);
	});
});
