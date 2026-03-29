import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportHistory } from "../src/export.js";

function createTestRepo() {
	const dir = mkdtempSync(join(tmpdir(), "ghi-test-"));
	execSync("git init", { cwd: dir });
	execSync('git config user.email "test@test.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello");
	execSync('git add file.txt && git commit -m "first commit"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello world");
	execSync('git add file.txt && git commit -m "second commit"', { cwd: dir });
	return dir;
}

describe("exportHistory", () => {
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

	it("exports commits to JSON file", () => {
		const outFile = join(repoDir, "out.json");
		exportHistory(outFile, {});
		const json = JSON.parse(readFileSync(outFile, "utf-8"));
		expect(json.version).toBe(1);
		expect(json.commits.length).toBe(2);
		expect(json.commits[0].message).toBe("first commit");
		expect(json.commits[1].message).toBe("second commit");
		expect(json.commits[0].author.name).toBe("Test");
		expect(json.commits[0].author.email).toBe("test@test.com");
		expect(json.commits[0].original_hash).toBeTruthy();
		expect(json.exported_at).toBeTruthy();
	});

	it("exported JSON contains ref field", () => {
		const outFile = join(repoDir, "ref.json");
		exportHistory(outFile, {});
		const json = JSON.parse(readFileSync(outFile, "utf-8"));
		expect(json.ref).toBeTruthy();
		expect(typeof json.ref).toBe("string");
	});

	it("fails outside a git repo", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "ghi-nogit-"));
		process.chdir(tmpDir);
		expect(() => exportHistory(join(tmpDir, "out.json"), {})).toThrow(/not a git repository/i);
		process.chdir(repoDir);
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
