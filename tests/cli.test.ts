import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// We import main (and exercise parseArgs / printUsage) by calling main() directly.
// The auto-run guard is in bin/ghi.js (not cli.ts), so importing here is safe.
import { main } from "../src/cli.js";

function createTestRepo() {
	const dir = mkdtempSync(join(tmpdir(), "ghi-cli-"));
	execSync("git init", { cwd: dir });
	execSync('git config user.email "test@test.com"', { cwd: dir });
	execSync('git config user.name "Test"', { cwd: dir });
	writeFileSync(join(dir, "file.txt"), "hello");
	execSync('git add file.txt && git commit -m "init"', { cwd: dir });
	return dir;
}

describe("main() CLI", () => {
	let origCwd: string;
	let repoDir: string;
	let tmpDir: string;

	beforeAll(() => {
		origCwd = process.cwd();
		repoDir = createTestRepo();
		tmpDir = mkdtempSync(join(tmpdir(), "ghi-cli-json-"));
		process.chdir(repoDir);
	});

	afterAll(() => {
		process.chdir(origCwd);
		rmSync(repoDir, { recursive: true, force: true });
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("printUsage and exits 0 with no args", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main([]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:0");
		}
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("ghi export"),
		);
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("printUsage and exits 0 with --help", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["--help"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:0");
		}
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("ghi export"),
		);
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("printUsage and exits 0 with -h", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["-h"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:0");
		}
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("export command writes JSON to file", () => {
		const outFile = join(tmpDir, "cli-out.json");
		main(["export", outFile]);
		const data = JSON.parse(readFileSync(outFile, "utf-8"));
		expect(data.version).toBe(1);
	});

	it("parseArgs: --range option is parsed", () => {
		const outFile = join(tmpDir, "cli-range.json");
		main(["export", outFile, "--range", "refs/heads/master"]);
	});

	it("export command without file path exits 1", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["export"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:1");
		}
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("export requires a JSON file path"),
		);
		errSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("import command without file path exits 1", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["import"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:1");
		}
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("import requires a JSON file path"),
		);
		errSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("unknown command exits 1 with error message", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["boguscmd"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:1");
		}
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("Unknown command"),
		);
		errSpy.mockRestore();
		logSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("parseArgs: unknown option exits 1", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((_code?: number) => {
				throw new Error(`exit:${_code}`);
			});
		try {
			main(["export", "--unknown-flag"]);
		} catch (e) {
			expect((e as Error).message).toBe("exit:1");
		}
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("Unknown option"),
		);
		errSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("import command executes successfully with valid JSON", () => {
		// First export
		const jsonFile = join(tmpDir, "cli-import.json");
		main(["export", jsonFile]);

		// Modify and import
		const data = JSON.parse(readFileSync(jsonFile, "utf-8"));
		data.commits[0].message = "cli-test imported";
		writeFileSync(jsonFile, JSON.stringify(data, null, 2));

		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		main(["import", jsonFile, "--no-backup"]);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Imported"));
		logSpy.mockRestore();
	});
});
