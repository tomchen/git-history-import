import { execSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "..", "bin", "ghi.js");

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
	const dir = mkdtempSync(join(tmpdir(), "ghi-e2e-"));
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

describe("ghi e2e", () => {
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
		const tmpDir = mkdtempSync(join(tmpdir(), "ghi-e2e-json-"));
		const jsonFile = join(tmpDir, "history.json");
		run(`export ${jsonFile}`);
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
		expect(output).toContain("ghi export");
		expect(output).toContain("ghi import");
	});

	it("shows usage with -h", () => {
		const result = runRaw(["-h"]);
		expect(result.stdout).toContain("ghi export");
		expect(result.code).toBe(0);
	});

	it("shows usage with no arguments", () => {
		const result = runRaw([]);
		expect(result.stdout).toContain("ghi export");
		expect(result.code).toBe(0);
	});

	it("exports to file", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "ghi-e2e-cli-"));
		const jsonFile = join(tmpDir, "out.json");
		const result = runRaw(["export", jsonFile]);
		expect(result.code).toBe(0);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));
		expect(data.version).toBe(1);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("errors on export with missing file path", () => {
		const result = runRaw(["export"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("export requires a JSON file path");
	});

	it("imports from file with --no-backup", () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "ghi-e2e-cli-"));
		const jsonFile = join(tmpDir, "history.json");
		run(`export ${jsonFile}`);
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
		const tmpDir = mkdtempSync(join(tmpdir(), "ghi-e2e-cli-"));
		const badJson = join(tmpDir, "bad.json");
		writeFileSync(badJson, "not json");
		const result = runRaw(["import", badJson, "--no-backup"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/error:/i);
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("preserves binary blob data through export → import cycle", () => {
		// Create a file with binary content (bytes that are invalid UTF-8)
		const binaryContent = Buffer.from([0x00, 0x80, 0xff, 0x41, 0x42, 0x43]);
		writeFileSync(join(repoDir, "binary.bin"), binaryContent);
		execSync("git add binary.bin && git commit -m 'add binary file'", {
			cwd: repoDir,
		});

		const tmpJsonDir = mkdtempSync(join(tmpdir(), "ghi-e2e-binary-"));
		const jsonFile = join(tmpJsonDir, "history.json");
		run(`export ${jsonFile}`);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));

		// Modify a commit message (not the binary content)
		data.commits[data.commits.length - 1].message = "MODIFIED: add binary file";
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		run(`import ${jsonFile} --no-backup`);

		// Verify binary content is preserved exactly
		const result = readFileSync(join(repoDir, "binary.bin"));
		expect(result).toEqual(binaryContent);

		// Verify the message was changed
		const log = execSync("git log -1 --format='%s'", {
			encoding: "utf-8",
			cwd: repoDir,
		}).trim();
		expect(log).toBe("MODIFIED: add binary file");

		rmSync(tmpJsonDir, { recursive: true, force: true });
	});

	it("--range export and import round-trip preserves full history", () => {
		// repoDir has 3+ commits at this point
		const tmpJsonDir = mkdtempSync(join(tmpdir(), "ghi-e2e-range-"));
		const jsonFile = join(tmpJsonDir, "range.json");

		// Export only the last commit
		run(`export ${jsonFile} --range HEAD~1..HEAD`);
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));
		expect(data.commits.length).toBe(1);

		// Modify the message
		data.commits[0].message = "RANGE-MODIFIED";
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		// Import — should patch only the last commit, preserve full history
		run(`import ${jsonFile} --no-backup`);

		// ALL commits should still exist
		const log = execSync("git log --format='%s' --reverse", {
			encoding: "utf-8",
			cwd: repoDir,
		})
			.trim()
			.split("\n");
		// Should have 3+ commits (the original ones plus any from other tests)
		// The last one should be modified
		expect(log[log.length - 1]).toBe("RANGE-MODIFIED");
		// Earlier commits should still exist
		expect(log.length).toBeGreaterThanOrEqual(3);

		rmSync(tmpJsonDir, { recursive: true, force: true });
	});

	it("does not execute shell metacharacters in --range", () => {
		try {
			execSync(
				`node ${CLI} export /dev/null --range 'HEAD; touch ${join(repoDir, "injected.txt")}'`,
				{
					encoding: "utf-8",
					cwd: repoDir,
					timeout: 5000,
				},
			);
		} catch {
			// Expected to fail — git can't parse the range
		}
		// The injected command must NOT have executed
		expect(existsSync(join(repoDir, "injected.txt"))).toBe(false);
	});
});
