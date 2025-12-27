# TypeScript + Tooling Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert githe from JavaScript to TypeScript with full tooling (Biome, Vitest, GitHub Actions, config files) ready for npm publishing.

**Architecture:** Source in `src/*.ts` compiled by `tsc` to `dist/`. Thin `bin/githe.js` shebang wrapper imports `dist/cli.js`. Tests in `tests/*.test.ts` run by Vitest. Biome handles lint+format. GitHub Actions runs CI and npm publish on tags.

**Tech Stack:** TypeScript 5, Vitest 3, @vitest/coverage-v8, Biome 1, GitHub Actions

---

## File Map

**Create:**
- `.gitignore` — ignore node_modules, dist, coverage, tarballs
- `.gitattributes` — enforce LF line endings
- `.editorconfig` — editor settings (2-space, UTF-8, LF)
- `LICENSE` — MIT license
- `biome.json` — Biome lint+format config
- `tsconfig.json` — TypeScript compiler config
- `vitest.config.ts` — Vitest + coverage config
- `.github/workflows/ci.yml` — CI + publish workflow
- `src/cli.ts` — CLI entry point (extracted from bin/githe.js)
- `src/index.ts` — public API re-exports

**Modify:**
- `bin/githe.js` — thin shebang wrapper importing dist/cli.js
- `package.json` — engines, scripts, devDependencies, exports, files

**Rename + Convert (JS → TS with types):**
- `src/git.js` → `src/git.ts`
- `src/parser.js` → `src/parser.ts`
- `src/serializer.js` → `src/serializer.ts`
- `src/export.js` → `src/export.ts`
- `src/import.js` → `src/import.ts`
- `tests/parser.test.js` → `tests/parser.test.ts`
- `tests/serializer.test.js` → `tests/serializer.test.ts`
- `tests/export.test.js` → `tests/export.test.ts`
- `tests/import.test.js` → `tests/import.test.ts`
- `tests/e2e.test.js` → `tests/e2e.test.ts`

**Delete:**
- `src/git.js`, `src/parser.js`, `src/serializer.js`, `src/export.js`, `src/import.js`
- `tests/parser.test.js`, `tests/serializer.test.js`, `tests/export.test.js`, `tests/import.test.js`, `tests/e2e.test.js`

---

### Task 1: Config Files + LICENSE

Add all config files that don't depend on any code changes.

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `.editorconfig`
- Create: `LICENSE`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
coverage/
*.tgz
```

- [ ] **Step 2: Create `.gitattributes`**

```
* text=auto eol=lf
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 4: Create `LICENSE`**

```
MIT License

Copyright (c) Tom Chen (tomchen.org)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore .gitattributes .editorconfig LICENSE
git commit -m "chore: add gitignore, gitattributes, editorconfig, LICENSE"
```

---

### Task 2: Package.json + TypeScript + Biome + Vitest Setup

Install all dev dependencies and create config files so that `npm run build`, `npm run test`, and `npm run lint` work (they will fail until code is converted, but the configs should be valid).

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Update `package.json`**

Replace the entire file with:

```json
{
  "name": "githe",
  "version": "0.1.0",
  "description": "Export git history to JSON, edit it, import it back",
  "type": "module",
  "bin": {
    "githe": "./bin/githe.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "bin"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "git",
    "history",
    "export",
    "import",
    "json"
  ],
  "license": "MIT",
  "devDependencies": {
    "@biomejs/biome": "^1",
    "@vitest/coverage-v8": "^3",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["dist", "coverage", "node_modules"]
  },
  "formatter": {
    "indentStyle": "tab",
    "lineWidth": 80
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  }
}
```

Note: Biome defaults to tabs. If you prefer spaces, change `indentStyle` to `"space"` and add `"indentWidth": 2`. The plan uses Biome's default (tabs) — adjust after formatting if needed.

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/index.ts"],
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
			},
		},
	},
});
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json biome.json vitest.config.ts package-lock.json
git commit -m "chore: add TypeScript, Vitest, Biome configs and devDependencies"
```

---

### Task 3: Convert `src/git.ts`

Convert the git helper module to TypeScript. This has no internal project dependencies so it's the natural starting point.

**Files:**
- Create: `src/git.ts`
- Delete: `src/git.js`

- [ ] **Step 1: Create `src/git.ts`**

```ts
import { execSync } from "node:child_process";

export function isGitRepo(): boolean {
	try {
		execSync("git rev-parse --git-dir", { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export function isWorkingTreeClean(): boolean {
	try {
		const status = execSync("git status --porcelain", {
			encoding: "utf-8",
		});
		return status.trim() === "";
	} catch {
		return false;
	}
}

export function gitFastExport(range?: string): string {
	const rangeArg = range || `refs/heads/${getCurrentBranch()}`;
	return execSync(`git fast-export ${rangeArg} --show-original-ids`, {
		encoding: "utf-8",
		maxBuffer: 100 * 1024 * 1024,
	});
}

export function getCurrentBranch(): string {
	return execSync("git rev-parse --abbrev-ref HEAD", {
		encoding: "utf-8",
	}).trim();
}

export function getRepoRoot(): string {
	return execSync("git rev-parse --show-toplevel", {
		encoding: "utf-8",
	}).trim();
}

export function getCommitHash(ref: string): string {
	return execSync(`git rev-parse ${ref}`, { encoding: "utf-8" }).trim();
}

export function createBackupBranch(): string {
	const timestamp = Date.now();
	const branchName = `githe-backup-${timestamp}`;
	execSync(`git branch ${branchName}`, { stdio: "pipe" });
	return branchName;
}

export function gitFastImport(stream: string): void {
	execSync("git fast-import --force --quiet", {
		input: stream,
		encoding: "utf-8",
		maxBuffer: 100 * 1024 * 1024,
	});
}

export function gitResetHard(ref: string): void {
	execSync(`git reset --hard ${ref}`, { stdio: "pipe" });
}
```

- [ ] **Step 2: Delete `src/git.js`**

```bash
rm src/git.js
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/git.ts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/git.ts && git rm src/git.js
git commit -m "refactor: convert git.js to TypeScript"
```

---

### Task 4: Convert `src/parser.ts`

Convert the fast-export stream parser to TypeScript. Depends on no other src files.

**Files:**
- Create: `src/parser.ts`
- Delete: `src/parser.js`

- [ ] **Step 1: Create `src/parser.ts`**

```ts
export interface Identity {
	name: string;
	email: string;
	date: string;
}

export interface Commit {
	original_hash: string | null;
	message: string;
	author: Identity | null;
	committer: Identity | null;
	parents: string[];
}

export interface ParseResult {
	commits: Commit[];
	raw: string;
	markToOid: Map<number, string>;
}

/**
 * Parse `git fast-export --show-original-ids` output into structured
 * commit objects.
 */
export function parseFastExport(stream: string): ParseResult {
	const commits: Commit[] = [];
	const markToOid = new Map<number, string>();

	const buf = Buffer.from(stream, "utf8");
	let pos = 0;

	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++;
		return line;
	}

	function peekLine(): string {
		const saved = pos;
		const line = readLine();
		pos = saved;
		return line;
	}

	function skipBytes(n: number): void {
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
	}

	function readBytes(n: number): string {
		const content = buf.toString("utf8", pos, pos + n);
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
		return content;
	}

	function consumeData(n: number): string {
		return readBytes(n);
	}

	function parseIdentity(line: string): Identity {
		const gtIdx = line.lastIndexOf(">");
		const afterGt = line.slice(gtIdx + 2);
		const ltIdx = line.indexOf("<");
		const name = line.slice(0, ltIdx).trimEnd();
		const email = line.slice(ltIdx + 1, gtIdx);
		const raw = afterGt.trim();
		const date = gitDateToHuman(raw);
		return { name, email, date };
	}

	function isTopLevel(next: string): boolean {
		return (
			next === "" ||
			next.startsWith("commit ") ||
			next.startsWith("blob") ||
			next.startsWith("reset ") ||
			next.startsWith("tag ") ||
			next.startsWith("done")
		);
	}

	while (pos < buf.length) {
		const line = readLine();
		if (line === "") continue;

		if (line.startsWith("commit ")) {
			let markNum: number | null = null;
			let original_hash: string | null = null;
			let author: Identity | null = null;
			let committer: Identity | null = null;
			let message = "";
			const parentMarks: { kind: string; mark: number }[] = [];

			let headersDone = false;
			while (!headersDone && pos < buf.length) {
				const hdr = readLine();

				if (hdr.startsWith("mark :")) {
					markNum = parseInt(hdr.slice(6), 10);
				} else if (hdr.startsWith("original-oid ")) {
					original_hash = hdr.slice(13).trim();
				} else if (hdr.startsWith("author ")) {
					author = parseIdentity(hdr.slice(7));
				} else if (hdr.startsWith("committer ")) {
					committer = parseIdentity(hdr.slice(10));
				} else if (hdr.startsWith("data ")) {
					const n = parseInt(hdr.slice(5), 10);
					message = consumeData(n);
					headersDone = true;
				}
			}

			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const opLine = readLine();
				if (opLine.startsWith("from :")) {
					parentMarks.push({
						kind: "from",
						mark: parseInt(opLine.slice(6), 10),
					});
				} else if (opLine.startsWith("merge :")) {
					parentMarks.push({
						kind: "merge",
						mark: parseInt(opLine.slice(7), 10),
					});
				}
			}

			if (markNum !== null && original_hash !== null) {
				markToOid.set(markNum, original_hash);
			}

			const parents = parentMarks
				.map(({ mark }) => markToOid.get(mark) ?? null)
				.filter((oid): oid is string => oid !== null);

			commits.push({ original_hash, message, author, committer, parents });
			continue;
		}

		if (line === "blob") {
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const blobLine = readLine();
				if (blobLine.startsWith("data ")) {
					const n = parseInt(blobLine.slice(5), 10);
					skipBytes(n);
					break;
				}
			}
			continue;
		}

		if (
			line.startsWith("reset ") ||
			line.startsWith("tag ") ||
			line === "done"
		) {
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const tagLine = readLine();
				if (tagLine.startsWith("data ")) {
					const n = parseInt(tagLine.slice(5), 10);
					skipBytes(n);
					break;
				}
			}
			continue;
		}
	}

	return { commits, raw: stream, markToOid };
}

/**
 * Convert git raw date "1774729976 +0100" to "2026-03-26 19:52:56 +0100".
 */
function gitDateToHuman(raw: string): string {
	const [timestamp, tz] = raw.split(" ");
	const sec = parseInt(timestamp, 10);
	const sign = tz[0] === "+" ? 1 : -1;
	const tzH = parseInt(tz.slice(1, 3), 10);
	const tzM = parseInt(tz.slice(3, 5), 10);
	const offsetMs = sign * (tzH * 60 + tzM) * 60000;
	const local = new Date(sec * 1000 + offsetMs);
	const y = local.getUTCFullYear();
	const mo = String(local.getUTCMonth() + 1).padStart(2, "0");
	const d = String(local.getUTCDate()).padStart(2, "0");
	const h = String(local.getUTCHours()).padStart(2, "0");
	const mi = String(local.getUTCMinutes()).padStart(2, "0");
	const s = String(local.getUTCSeconds()).padStart(2, "0");
	return `${y}-${mo}-${d} ${h}:${mi}:${s} ${tz}`;
}
```

- [ ] **Step 2: Delete `src/parser.js`**

```bash
rm src/parser.js
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/parser.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/parser.ts && git rm src/parser.js
git commit -m "refactor: convert parser.js to TypeScript"
```

---

### Task 5: Convert `src/serializer.ts`

Convert the stream patcher to TypeScript. Imports nothing from other src files.

**Files:**
- Create: `src/serializer.ts`
- Delete: `src/serializer.js`

- [ ] **Step 1: Create `src/serializer.ts`**

Import the `Commit` type from parser, and convert the full file with types. The `Commit` type is used for the `commits` parameter.

```ts
import type { Commit } from "./parser.js";

/**
 * Patch a `git fast-export` stream with updated commit metadata.
 */
export function patchFastExportStream(
	stream: string,
	commits: Commit[],
): string {
	const streamCommitCount = countCommits(stream);
	if (streamCommitCount !== commits.length) {
		throw new Error(
			`Commit count mismatch: stream has ${streamCommitCount} commit(s) but JSON has ${commits.length}`,
		);
	}

	const buf = Buffer.from(stream, "utf8");
	let pos = 0;
	let commitIndex = 0;
	const outParts: string[] = [];

	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++;
		return line;
	}

	function peekLine(): string {
		const saved = pos;
		const line = readLine();
		pos = saved;
		return line;
	}

	function emit(text: string): void {
		outParts.push(text + "\n");
	}

	function emitLine(line: string): void {
		outParts.push(line + "\n");
	}

	function emitDataBytes(n: number): void {
		outParts.push(buf.toString("utf8", pos, pos + n));
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) {
			outParts.push("\n");
			pos++;
		}
	}

	function skipDataBytes(n: number): void {
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
	}

	function isTopLevel(next: string): boolean {
		return (
			next === "" ||
			next.startsWith("commit ") ||
			next.startsWith("blob") ||
			next.startsWith("reset ") ||
			next.startsWith("tag ") ||
			next === "done"
		);
	}

	while (pos < buf.length) {
		const line = readLine();

		if (line === "") {
			emitLine("");
			continue;
		}

		if (line.startsWith("commit ")) {
			const commit = commits[commitIndex++];
			emitLine(line);

			let donePatchingHeaders = false;
			while (!donePatchingHeaders && pos < buf.length) {
				const hdr = readLine();

				if (hdr.startsWith("mark ") || hdr.startsWith("original-oid ")) {
					emitLine(hdr);
				} else if (hdr.startsWith("author ")) {
					const { name, email, date } = commit.author!;
					emit(`author ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("committer ")) {
					const { name, email, date } = commit.committer!;
					emit(`committer ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("data ")) {
					const oldLen = parseInt(hdr.slice(5), 10);
					const newMsg = commit.message;
					const newLen = Buffer.byteLength(`${newMsg}\n`);
					emit(`data ${newLen}`);
					outParts.push(`${newMsg}\n`);
					skipDataBytes(oldLen);
					donePatchingHeaders = true;
				} else {
					emitLine(hdr);
				}
			}

			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const opLine = readLine();
				emitLine(opLine);
			}

			continue;
		}

		if (line === "blob") {
			emitLine(line);
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const blobLine = readLine();
				if (blobLine.startsWith("data ")) {
					const n = parseInt(blobLine.slice(5), 10);
					emitLine(blobLine);
					emitDataBytes(n);
					break;
				}
				emitLine(blobLine);
			}
			continue;
		}

		if (
			line.startsWith("reset ") ||
			line.startsWith("tag ") ||
			line === "done"
		) {
			emitLine(line);
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const tLine = readLine();
				if (tLine.startsWith("data ")) {
					const n = parseInt(tLine.slice(5), 10);
					emitLine(tLine);
					emitDataBytes(n);
					break;
				}
				emitLine(tLine);
			}
			continue;
		}

		emitLine(line);
	}

	return outParts.join("");
}

/**
 * Convert human-readable date back to git raw format.
 * Accepts: "2026-03-26 19:52:56 +0100" -> "1774729976 +0100"
 * Also accepts raw git format "1774729976 +0100" as passthrough.
 */
function humanDateToGit(date: string): string {
	if (/^\d+ [+-]\d{4}$/.test(date)) return date;

	const match = date.match(
		/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/,
	);
	if (!match) throw new Error(`Unrecognized date format: ${date}`);

	const [, y, mo, d, h, mi, s, tz] = match;
	const sign = tz[0] === "+" ? 1 : -1;
	const tzH = parseInt(tz.slice(1, 3), 10);
	const tzM = parseInt(tz.slice(3, 5), 10);
	const offsetMs = sign * (tzH * 60 + tzM) * 60000;

	const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMs;
	const timestamp = Math.floor(utcMs / 1000);
	return `${timestamp} ${tz}`;
}

function countCommits(stream: string): number {
	const buf = Buffer.from(stream, "utf8");
	let pos = 0;
	let count = 0;

	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++;
		return line;
	}

	while (pos < buf.length) {
		const line = readLine();
		if (line.startsWith("commit ")) count++;
		if (line.startsWith("data ")) {
			const n = parseInt(line.slice(5), 10);
			pos += n;
			if (pos < buf.length && buf[pos] === 0x0a) pos++;
		}
	}
	return count;
}
```

- [ ] **Step 2: Delete `src/serializer.js`**

```bash
rm src/serializer.js
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit src/serializer.ts src/parser.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/serializer.ts && git rm src/serializer.js
git commit -m "refactor: convert serializer.js to TypeScript"
```

---

### Task 6: Convert `src/export.ts`

**Files:**
- Create: `src/export.ts`
- Delete: `src/export.js`

- [ ] **Step 1: Create `src/export.ts`**

```ts
import { writeFileSync } from "node:fs";
import { isGitRepo, gitFastExport, getRepoRoot } from "./git.js";
import { parseFastExport } from "./parser.js";

export interface ExportOptions {
	output?: string;
	range?: string;
}

export async function exportHistory(opts: ExportOptions): Promise<string | undefined> {
	if (!isGitRepo()) {
		throw new Error("Not a git repository");
	}

	const stream = gitFastExport(opts.range);
	const { commits } = parseFastExport(stream);
	const repoRoot = getRepoRoot();

	const normalizedCommits = commits.map((c) => ({
		...c,
		message: c.message.replace(/\n$/, ""),
	}));

	const output = JSON.stringify(
		{
			version: 1,
			repo: repoRoot,
			exported_at: new Date().toISOString(),
			commits: normalizedCommits,
		},
		null,
		2,
	);

	if (opts.output) {
		writeFileSync(opts.output, output, "utf-8");
		console.log(`Exported ${commits.length} commits to ${opts.output}`);
		return undefined;
	}
	return output;
}
```

- [ ] **Step 2: Delete `src/export.js`**

```bash
rm src/export.js
```

- [ ] **Step 3: Commit**

```bash
git add src/export.ts && git rm src/export.js
git commit -m "refactor: convert export.js to TypeScript"
```

---

### Task 7: Convert `src/import.ts`

**Files:**
- Create: `src/import.ts`
- Delete: `src/import.js`

- [ ] **Step 1: Create `src/import.ts`**

```ts
import { readFileSync } from "node:fs";
import {
	isGitRepo,
	isWorkingTreeClean,
	gitFastExport,
	gitFastImport,
	gitResetHard,
	getCurrentBranch,
	createBackupBranch,
} from "./git.js";
import { parseFastExport } from "./parser.js";
import { patchFastExportStream } from "./serializer.js";

export interface ImportOptions {
	noBackup?: boolean;
}

export async function importHistory(
	file: string,
	opts: ImportOptions,
): Promise<void> {
	if (!isGitRepo()) {
		throw new Error("Not a git repository");
	}

	if (!isWorkingTreeClean()) {
		throw new Error(
			"Working tree is not clean. Please commit or stash your changes first.",
		);
	}

	const jsonStr = readFileSync(file, "utf-8");
	let data: { commits?: unknown };
	try {
		data = JSON.parse(jsonStr);
	} catch (e) {
		throw new Error(`Invalid JSON: ${(e as Error).message}`);
	}

	if (!data.commits || !Array.isArray(data.commits)) {
		throw new Error('Invalid JSON: missing "commits" array');
	}

	const branch = getCurrentBranch();

	if (!opts.noBackup) {
		const backupBranch = createBackupBranch();
		console.log(`Backup branch created: ${backupBranch}`);
	}

	const stream = gitFastExport();
	const patchedStream = patchFastExportStream(stream, data.commits);
	gitFastImport(patchedStream);
	gitResetHard(branch);

	console.log(
		`Imported ${data.commits.length} commits. History rewritten on branch '${branch}'.`,
	);
	console.log("");
	console.log("To completely purge old history:");
	console.log("");
	console.log("# 1. Delete backup branch:");
	console.log("git branch -D githe-backup-<timestamp>");
	console.log("# 2. Expire reflog:");
	console.log("git reflog expire --expire=now --all");
	console.log("# 3. Garbage collect:");
	console.log("git gc --prune=now --aggressive");
	console.log("# 4. Force push to remote:");
	console.log("git push --force");
	console.log("# 5. All collaborators must re-clone");
}
```

- [ ] **Step 2: Delete `src/import.js`**

```bash
rm src/import.js
```

- [ ] **Step 3: Commit**

```bash
git add src/import.ts && git rm src/import.js
git commit -m "refactor: convert import.js to TypeScript"
```

---

### Task 8: Create `src/cli.ts` + `src/index.ts` + Update `bin/githe.js`

Extract CLI logic into TypeScript. Create public API re-export.

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Modify: `bin/githe.js`

- [ ] **Step 1: Create `src/cli.ts`**

```ts
import { exportHistory } from "./export.js";
import { importHistory } from "./import.js";

interface CliOptions {
	output?: string;
	range?: string;
	noBackup?: boolean;
	_: string[];
}

function parseArgs(args: string[]): CliOptions {
	const opts: CliOptions = { _: [] };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "-o" && args[i + 1]) {
			opts.output = args[++i];
		} else if (args[i] === "--range" && args[i + 1]) {
			opts.range = args[++i];
		} else if (args[i] === "--no-backup") {
			opts.noBackup = true;
		} else if (!args[i].startsWith("-")) {
			opts._.push(args[i]);
		} else {
			console.error(`Unknown option: ${args[i]}`);
			process.exit(1);
		}
	}
	return opts;
}

function printUsage(): void {
	console.log(`Usage:
  githe export [-o <file>] [--range <range>]
  githe import <file> [--no-backup]`);
}

export async function main(argv: string[]): Promise<void> {
	const command = argv[0];

	if (!command || command === "--help" || command === "-h") {
		printUsage();
		process.exit(0);
	}

	const opts = parseArgs(argv.slice(1));

	if (command === "export") {
		const result = await exportHistory(opts);
		if (result !== undefined) {
			process.stdout.write(result);
		}
	} else if (command === "import") {
		const file = opts._[0];
		if (!file) {
			console.error("Error: import requires a JSON file path");
			process.exit(1);
		}
		await importHistory(file, opts);
	} else {
		console.error(`Unknown command: ${command}`);
		printUsage();
		process.exit(1);
	}
}

main(process.argv.slice(2)).catch((err: Error) => {
	console.error(`Error: ${err.message}`);
	process.exit(1);
});
```

- [ ] **Step 2: Create `src/index.ts`**

```ts
export { exportHistory } from "./export.js";
export type { ExportOptions } from "./export.js";
export { importHistory } from "./import.js";
export type { ImportOptions } from "./import.js";
export { parseFastExport } from "./parser.js";
export type { Commit, Identity, ParseResult } from "./parser.js";
export { patchFastExportStream } from "./serializer.js";
```

- [ ] **Step 3: Update `bin/githe.js`**

Replace the entire file with:

```js
#!/usr/bin/env node
import "../dist/cli.js";
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
node bin/githe.js --help
```

Expected: prints usage text.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/index.ts bin/githe.js
git commit -m "refactor: extract CLI to src/cli.ts, add index.ts, update bin wrapper"
```

---

### Task 9: Convert Tests to Vitest

Convert all 5 test files from `node:test` to Vitest. The test logic stays the same; only imports and assertions change.

**Migration pattern:**
- `import { describe, it, test, before, after } from "node:test"` → `import { describe, it, test, beforeAll, afterAll } from "vitest"`
- `import assert from "node:assert/strict"` → `import { expect } from "vitest"`
- `assert.equal(a, b)` → `expect(a).toBe(b)`
- `assert.deepEqual(a, b)` → `expect(a).toEqual(b)`
- `assert.ok(x)` → `expect(x).toBeTruthy()`
- `assert.ok(str.includes(sub))` → `expect(str).toContain(sub)`
- `assert.throws(() => fn(), /pat/)` → `expect(() => fn()).toThrow(/pat/)`
- `assert.rejects(() => fn(), /pat/)` → `expect(fn()).rejects.toThrow(/pat/)`
- `before(() => ...)` → `beforeAll(() => ...)`
- `after(() => ...)` → `afterAll(() => ...)`

**Files:**
- Create: `tests/parser.test.ts`, `tests/serializer.test.ts`, `tests/export.test.ts`, `tests/import.test.ts`, `tests/e2e.test.ts`
- Delete: all `tests/*.test.js`

- [ ] **Step 1: Create `tests/parser.test.ts`**

Convert the parser tests. Key changes: all `assert.equal` → `expect().toBe()`, all `assert.deepEqual` → `expect().toEqual()`, all `assert.ok` → `expect().toBeTruthy()`, import `Commit` type for reference. Imports change from `../src/parser.js` to `../src/parser.js` (stays the same — Vitest resolves `.js` → `.ts`).

Full converted file — apply the migration pattern to each of the 7 tests. The test bodies remain identical in logic.

- [ ] **Step 2: Create `tests/serializer.test.ts`**

Convert all 7 serializer tests using the same pattern. `assert.ok(result.includes(...))` → `expect(result).toContain(...)`. `assert.throws` → `expect().toThrow()`.

- [ ] **Step 3: Create `tests/export.test.ts`**

Convert the 3 export tests. `before`/`after` → `beforeAll`/`afterAll`. `assert.rejects` → `expect().rejects.toThrow()`.

- [ ] **Step 4: Create `tests/import.test.ts`**

Convert the 5 import tests. Same patterns. The dynamic `import('node:fs')` for `unlinkSync` can be changed to a static import at the top.

- [ ] **Step 5: Create `tests/e2e.test.ts`**

Convert the 2 e2e tests. The CLI path reference uses `import.meta.dirname` which works in Vitest. `before`/`after` → `beforeAll`/`afterAll`.

- [ ] **Step 6: Delete old JS test files**

```bash
rm tests/parser.test.js tests/serializer.test.js tests/export.test.js tests/import.test.js tests/e2e.test.js
```

- [ ] **Step 7: Run tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 8: Run coverage**

```bash
npm run test:coverage
```

Review output. If any lines/branches are below 90%, note them for Task 10.

- [ ] **Step 9: Commit**

```bash
git add tests/ && git rm tests/*.test.js
git commit -m "test: migrate all tests from node:test to Vitest"
```

---

### Task 10: Coverage Gaps

After running coverage in Task 9, add tests for any uncovered lines/branches. Likely gaps:

- `cli.ts`: unknown command, missing import file arg, `--help`, error catch handler
- `git.ts`: `isGitRepo` returning false, `isWorkingTreeClean` returning false (already tested via import tests)
- `serializer.ts`: `humanDateToGit` passthrough for raw dates, unrecognized date format error

- [ ] **Step 1: Add CLI tests to `tests/e2e.test.ts`**

Add tests for:
- Unknown command exits with error
- `import` without file path exits with error
- Export to stdout (no `-o` flag)
- Unknown option exits with error

- [ ] **Step 2: Add edge case tests if needed**

Review coverage report and add targeted tests for any remaining uncovered branches.

- [ ] **Step 3: Run coverage and verify thresholds**

```bash
npm run test:coverage
```

Expected: all thresholds >= 90% (ideally close to 100%).

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: add tests for coverage gaps"
```

---

### Task 11: Biome Lint + Format

Run Biome on the entire codebase and fix any issues.

- [ ] **Step 1: Run Biome check**

```bash
npx biome check .
```

- [ ] **Step 2: Auto-fix what Biome can**

```bash
npx biome check --write .
```

- [ ] **Step 3: Manually fix any remaining issues**

Review Biome output for errors that can't be auto-fixed. Fix them.

- [ ] **Step 4: Run tests to verify nothing broke**

```bash
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: apply Biome formatting and lint fixes"
```

---

### Task 12: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run build
      - run: npm run test:coverage

  publish:
    needs: [lint, test]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions for lint, test, and npm publish"
```

---

### Task 13: Update README

Update the README to reflect the new TypeScript setup — add development section.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Development section to README**

Add before the License section:

```markdown
## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run lint:fix
```
```

- [ ] **Step 2: Update Requirements section**

Change `Node.js >= 18` to `Node.js >= 20`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with development section and Node 20 requirement"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Clean build**

```bash
rm -rf dist node_modules
npm install
npm run build
```

- [ ] **Step 2: Lint passes**

```bash
npm run lint
```

- [ ] **Step 3: All tests pass with coverage**

```bash
npm run test:coverage
```

- [ ] **Step 4: Dry-run npm pack**

```bash
npm pack --dry-run
```

Verify only `dist/`, `bin/`, `package.json`, `README.md`, and `LICENSE` are included.

- [ ] **Step 5: Test the CLI**

```bash
cd $(mktemp -d) && git init && git commit --allow-empty -m "test" && node /path/to/githe/bin/githe.js export
```

Verify JSON output with 1 commit.
