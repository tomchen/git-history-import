import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "bin", "githe.js");

function run(cmd: string, opts: Record<string, unknown> = {}) {
	return execSync(`node ${CLI} ${cmd}`, { encoding: "utf-8", ...opts });
}

function runRaw(args: string[], opts: Record<string, unknown> = {}) {
	try {
		return {
			stdout: execSync(`node ${CLI} ${args.join(" ")}`, {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
				...opts,
			}),
			stderr: "",
			code: 0,
		};
	} catch (e: unknown) {
		const err = e as { stdout?: string; stderr?: string; status?: number };
		return {
			stdout: err.stdout ?? "",
			stderr: err.stderr ?? "",
			code: err.status ?? 1,
		};
	}
}

function createTestRepo() {
	const dir = mkdtempSync(join(tmpdir(), "githe-e2e-"));
	execSync("git init", { cwd: dir });
	execSync('git config user.email "test@test.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	writeFileSync(join(dir, "a.txt"), "aaa");
	execSync('git add a.txt && git commit -m "add a"', { cwd: dir });
	writeFileSync(join(dir, "b.txt"), "bbb");
	execSync('git add b.txt && git commit -m "add b"', { cwd: dir });
	writeFileSync(join(dir, "a.txt"), "aaa updated");
	execSync('git add a.txt && git commit -m "update a"', { cwd: dir });
	return dir;
}

describe("githe e2e", () => {
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

	it("full export → edit → import cycle", () => {
		// Export — write JSON to a temp dir outside repo to keep working tree clean
		const tmpDir = mkdtempSync(join(tmpdir(), "githe-e2e-json-"));
		const jsonFile = join(tmpDir, "history.json");
		run(`export -o ${jsonFile}`);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));

		expect(data.version).toBe(1);
		expect(data.commits.length).toBe(3);

		// Edit: change all messages and the author of the first commit
		data.commits[0].message = "MODIFIED: add a";
		data.commits[1].message = "MODIFIED: add b";
		data.commits[2].message = "MODIFIED: update a";
		data.commits[0].author.name = "Ghost";
		data.commits[0].author.email = "ghost@example.com";

		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		// Import
		run(`import ${jsonFile} --no-backup`);

		// Verify messages
		const log = execSync('git log --format="%s" --reverse', {
			encoding: "utf-8",
		}).trim();
		expect(log).toBe("MODIFIED: add a\nMODIFIED: add b\nMODIFIED: update a");

		// Verify author
		const authors = execSync('git log --format="%an <%ae>" --reverse', {
			encoding: "utf-8",
		})
			.trim()
			.split("\n");
		expect(authors[0]).toBe("Ghost <ghost@example.com>");

		// Verify file content preserved
		expect(readFileSync(join(repoDir, "a.txt"), "utf-8")).toBe("aaa updated");
		expect(readFileSync(join(repoDir, "b.txt"), "utf-8")).toBe("bbb");

		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("shows usage with --help", () => {
		const output = run("--help");
		expect(output).toContain("githe export");
		expect(output).toContain("githe import");
	});

	it("shows usage with -h", () => {
		const result = runRaw(["-h"]);
		expect(result.stdout).toContain("githe export");
		expect(result.code).toBe(0);
	});

	it("shows usage with no arguments", () => {
		const result = runRaw([]);
		expect(result.stdout).toContain("githe export");
		expect(result.code).toBe(0);
	});

	it("exports and writes to stdout when no -o flag", () => {
		const result = runRaw(["export"]);
		expect(result.code).toBe(0);
		const data = JSON.parse(result.stdout);
		expect(data.version).toBe(1);
		expect(Array.isArray(data.commits)).toBe(true);
	});

	it("exports to file with -o flag", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "githe-e2e-cli-"));
		const jsonFile = join(tmpDir, "out.json");
		const result = runRaw(["export", "-o", jsonFile]);
		expect(result.code).toBe(0);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));
		expect(data.version).toBe(1);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("imports from file with --no-backup", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "githe-e2e-cli-"));
		const jsonFile = join(tmpDir, "history.json");
		run(`export -o ${jsonFile}`);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));
		data.commits[0].message = "cli-imported commit";
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		const result = runRaw(["import", jsonFile, "--no-backup"]);
		expect(result.code).toBe(0);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("errors on unknown command", () => {
		const result = runRaw(["unknowncmd"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Unknown command");
	});

	it("errors on unknown option", () => {
		const result = runRaw(["export", "--bogus-flag"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Unknown option");
	});

	it("errors on import with missing file path", () => {
		const result = runRaw(["import"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("import requires a JSON file path");
	});

	it("error catch handler prints message and exits 1", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "githe-e2e-cli-"));
		const badJson = join(tmpDir, "bad.json");
		writeFileSync(badJson, "not json");
		const result = runRaw(["import", badJson, "--no-backup"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/error:/i);
		rmSync(tmpDir, { recursive: true, force: true });
	});
});
