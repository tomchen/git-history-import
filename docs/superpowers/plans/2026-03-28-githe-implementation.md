# githe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npm CLI tool that exports git commit history to editable JSON and imports modified JSON back to rewrite history.

**Architecture:** CLI entry parses argv and dispatches to export/import modules. Export runs `git fast-export --all --show-original-ids`, parses the stream into commit metadata, outputs JSON. Import reads modified JSON, re-runs fast-export, patches the stream with JSON overrides, pipes through `git fast-import`, then resets the branch.

**Tech Stack:** Node.js (>=18), zero dependencies, git CLI commands (`fast-export`, `fast-import`)

---

### Task 1: Project Scaffold + CLI Entry

**Files:**
- Create: `package.json`
- Create: `bin/githe.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "githe",
  "version": "0.1.0",
  "description": "Export git history to JSON, edit it, import it back",
  "bin": {
    "githe": "./bin/githe.js"
  },
  "type": "module",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  },
  "license": "MIT",
  "keywords": ["git", "history", "export", "import", "json"]
}
```

- [ ] **Step 2: Create CLI entry bin/githe.js**

```js
#!/usr/bin/env node

import { exportHistory } from '../src/export.js';
import { importHistory } from '../src/import.js';

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' && args[i + 1]) {
      opts.output = args[++i];
    } else if (args[i] === '--range' && args[i + 1]) {
      opts.range = args[++i];
    } else if (args[i] === '--no-backup') {
      opts.noBackup = true;
    } else if (!args[i].startsWith('-')) {
      opts._.push(args[i]);
    } else {
      console.error(`Unknown option: ${args[i]}`);
      process.exit(1);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`Usage:
  githe export [-o <file>] [--range <range>]
  githe import <file> [--no-backup]`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  const opts = parseArgs(args.slice(1));

  if (command === 'export') {
    await exportHistory(opts);
  } else if (command === 'import') {
    const file = opts._[0];
    if (!file) {
      console.error('Error: import requires a JSON file path');
      process.exit(1);
    }
    await importHistory(file, opts);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

- [ ] **Step 3: Create placeholder modules so the CLI can load**

Create `src/export.js`:

```js
export async function exportHistory(opts) {
  throw new Error('Not implemented');
}
```

Create `src/import.js`:

```js
export async function importHistory(file, opts) {
  throw new Error('Not implemented');
}
```

- [ ] **Step 4: Test that CLI loads and shows help**

```bash
chmod +x bin/githe.js
node bin/githe.js --help
```

Expected: prints usage text, exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json bin/githe.js src/export.js src/import.js
git commit -m "feat: project scaffold with CLI entry"
```

---

### Task 2: Fast-Export Parser

**Files:**
- Create: `src/parser.js`
- Create: `tests/parser.test.js`

The parser takes a `git fast-export --all --show-original-ids` output string and extracts commit metadata. It returns an array of commit objects and preserves the raw stream for later patching.

The fast-export format looks like:

```
reset refs/heads/master
commit refs/heads/master
mark :1
original-oid 03b50f9cbd73fe2d2ef1b9d06012f17d4cd80b87
author Name <email> 1774730015 +0100
committer Name <email> 1774730015 +0100
data 15
initial commit

blob
mark :2
original-oid ce013625030ba8dba906f756967f9e9ca394464a
data 6
hello

commit refs/heads/master
mark :3
original-oid 496c024...
author Name <email> 1774730015 +0100
committer Name <email> 1774730015 +0100
data 9
add file
from :1
M 100644 :2 file.txt
```

Key parsing rules:
- Lines starting with `commit ` begin a new commit block
- `original-oid` gives the original hash
- `author`/`committer` lines: `Name <email> timestamp timezone`
- `data N` followed by exactly N bytes is the commit message
- `from :N` indicates parent (first parent)
- `merge :N` indicates additional parents
- `blob`, `reset`, `tag` blocks are non-commit blocks to preserve as-is

- [ ] **Step 1: Write parser tests**

Create `tests/parser.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFastExport } from '../src/parser.js';

describe('parseFastExport', () => {
  it('parses a single commit with no files', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid abc123def456
author Alice <alice@example.com> 1700000000 +0000
committer Bob <bob@example.com> 1700000001 +0000
data 12
first commit
`;
    const result = parseFastExport(stream);
    assert.equal(result.commits.length, 1);
    const c = result.commits[0];
    assert.equal(c.original_hash, 'abc123def456');
    assert.equal(c.message, 'first commit');
    assert.equal(c.author.name, 'Alice');
    assert.equal(c.author.email, 'alice@example.com');
    assert.equal(c.author.date, '1700000000 +0000');
    assert.equal(c.committer.name, 'Bob');
    assert.equal(c.committer.email, 'bob@example.com');
    assert.equal(c.committer.date, '1700000001 +0000');
    assert.deepEqual(c.parents, []);
  });

  it('parses multiple commits with parent relationships', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 6
first

commit refs/heads/main
mark :2
original-oid bbb222
author B <b@b.com> 2000 +0000
committer B <b@b.com> 2000 +0000
data 7
second
from :1

`;
    const result = parseFastExport(stream);
    assert.equal(result.commits.length, 2);
    assert.deepEqual(result.commits[0].parents, []);
    assert.deepEqual(result.commits[1].parents, ['aaa111']);
  });

  it('handles blob blocks between commits', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 6
first

blob
mark :2
data 5
hello
commit refs/heads/main
mark :3
original-oid bbb222
author B <b@b.com> 2000 +0000
committer B <b@b.com> 2000 +0000
data 7
second
from :1
M 100644 :2 file.txt

`;
    const result = parseFastExport(stream);
    assert.equal(result.commits.length, 2);
    assert.equal(result.commits[0].original_hash, 'aaa111');
    assert.equal(result.commits[1].original_hash, 'bbb222');
  });

  it('parses merge commits with multiple parents', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 2
a

commit refs/heads/main
mark :2
original-oid bbb222
author A <a@a.com> 2000 +0000
committer A <a@a.com> 2000 +0000
data 2
b
from :1

commit refs/heads/main
mark :3
original-oid ccc333
author A <a@a.com> 3000 +0000
committer A <a@a.com> 3000 +0000
data 6
merge
from :1
merge :2

`;
    const result = parseFastExport(stream);
    assert.equal(result.commits.length, 3);
    assert.deepEqual(result.commits[2].parents, ['aaa111', 'bbb222']);
  });

  it('preserves raw stream for later patching', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 2
a

`;
    const result = parseFastExport(stream);
    assert.equal(result.raw, stream);
  });

  it('handles multiline commit messages', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 20
line one
line two
ok

`;
    const result = parseFastExport(stream);
    assert.equal(result.commits[0].message, 'line one\nline two\nok');
  });

  it('resolves mark-to-oid for parent references', () => {
    const stream = `reset refs/heads/main
commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 2
a

blob
mark :2
data 5
hello
commit refs/heads/main
mark :3
original-oid bbb222
author A <a@a.com> 2000 +0000
committer A <a@a.com> 2000 +0000
data 2
b
from :1
M 100644 :2 file.txt

`;
    const result = parseFastExport(stream);
    assert.deepEqual(result.commits[1].parents, ['aaa111']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/parser.test.js
```

Expected: FAIL — `parseFastExport` not found.

- [ ] **Step 3: Implement parser**

Create `src/parser.js`:

```js
/**
 * Parse a git fast-export stream into structured commit data.
 * Returns { commits: [...], raw: string, markToOid: Map }
 */
export function parseFastExport(stream) {
  const lines = stream.split('\n');
  const commits = [];
  const markToOid = new Map();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('commit ')) {
      const commit = parseCommitBlock(lines, i, markToOid);
      commits.push(commit.data);
      if (commit.mark && commit.data.original_hash) {
        markToOid.set(commit.mark, commit.data.original_hash);
      }
      i = commit.nextIndex;
    } else if (line.startsWith('blob')) {
      i = skipBlobBlock(lines, i);
    } else {
      i++;
    }
  }

  return { commits, raw: stream, markToOid };
}

function parseCommitBlock(lines, startIndex, markToOid) {
  let i = startIndex + 1; // skip "commit refs/..." line
  let mark = null;
  let original_hash = '';
  let author = null;
  let committer = null;
  let message = '';
  const parents = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('mark :')) {
      mark = line.slice(5).trim();
      i++;
    } else if (line.startsWith('original-oid ')) {
      original_hash = line.slice(13).trim();
      i++;
    } else if (line.startsWith('author ')) {
      author = parseIdentity(line.slice(7));
      i++;
    } else if (line.startsWith('committer ')) {
      committer = parseIdentity(line.slice(10));
      i++;
    } else if (line.startsWith('data ')) {
      const dataLen = parseInt(line.slice(5), 10);
      i++;
      // Read exactly dataLen bytes from subsequent lines
      message = readData(lines, i, dataLen);
      // Advance past the data content
      i = advancePastData(lines, i, dataLen);
    } else if (line.startsWith('from :')) {
      const parentMark = line.slice(5).trim();
      const parentOid = markToOid.get(parentMark);
      if (parentOid) parents.push(parentOid);
      i++;
    } else if (line.startsWith('merge :')) {
      const mergeMark = line.slice(6).trim();
      const mergeOid = markToOid.get(mergeMark);
      if (mergeOid) parents.push(mergeOid);
      i++;
    } else if (line === '' || line.startsWith('M ') || line.startsWith('D ') || line.startsWith('R ') || line.startsWith('C ')) {
      // File operations or blank lines within commit block
      // Check if next meaningful line starts a new block
      if (line === '' && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.startsWith('commit ') || next.startsWith('blob') || next.startsWith('reset ') || next.startsWith('tag ') || next === '') {
          i++;
          break;
        }
      }
      i++;
    } else {
      // Unknown line or end of commit block
      break;
    }
  }

  return {
    data: { original_hash, message, author, committer, parents },
    mark,
    nextIndex: i,
  };
}

function parseIdentity(str) {
  // Format: "Name <email> timestamp timezone"
  const match = str.match(/^(.+?) <([^>]+)> (.+)$/);
  if (!match) return { name: '', email: '', date: '' };
  return { name: match[1], email: match[2], date: match[3] };
}

function readData(lines, startLine, dataLen) {
  // Reconstruct text from lines and read exactly dataLen bytes
  let collected = '';
  let bytesLeft = dataLen;
  let i = startLine;
  while (bytesLeft > 0 && i < lines.length) {
    const line = lines[i];
    const lineBytes = line + (bytesLeft > line.length + 1 ? '\n' : '');
    const take = Math.min(lineBytes.length, bytesLeft);
    collected += lineBytes.slice(0, take);
    bytesLeft -= take;
    i++;
  }
  // Trim trailing newline from message
  if (collected.endsWith('\n')) {
    collected = collected.slice(0, -1);
  }
  return collected;
}

function advancePastData(lines, startLine, dataLen) {
  let bytesLeft = dataLen;
  let i = startLine;
  while (bytesLeft > 0 && i < lines.length) {
    const line = lines[i];
    bytesLeft -= line.length + 1; // +1 for the newline
    i++;
  }
  return i;
}

function skipBlobBlock(lines, startIndex) {
  let i = startIndex + 1; // skip "blob" line
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('mark :') || line.startsWith('original-oid ')) {
      i++;
    } else if (line.startsWith('data ')) {
      const dataLen = parseInt(line.slice(5), 10);
      i++;
      i = advancePastData(lines, i, dataLen);
      break;
    } else {
      break;
    }
  }
  return i;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/parser.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser.js tests/parser.test.js
git commit -m "feat: implement fast-export stream parser"
```

---

### Task 3: Export Command

**Files:**
- Create: `src/git.js` (shared git helper utilities)
- Modify: `src/export.js`
- Create: `tests/export.test.js`

- [ ] **Step 1: Create git helper module**

Create `src/git.js`:

```js
import { execSync } from 'node:child_process';

export function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function isWorkingTreeClean() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    return status.trim() === '';
  } catch {
    return false;
  }
}

export function gitFastExport(range) {
  const rangeArg = range || '--all';
  return execSync(`git fast-export ${rangeArg} --show-original-ids`, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
}

export function getCurrentBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
}

export function getRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
}

export function getCommitHash(ref) {
  return execSync(`git rev-parse ${ref}`, { encoding: 'utf-8' }).trim();
}
```

- [ ] **Step 2: Write export tests**

Create `tests/export.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { exportHistory } from '../src/export.js';

function createTestRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'githe-test-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello');
  execSync('git add file.txt && git commit -m "first commit"', { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello world');
  execSync('git add file.txt && git commit -m "second commit"', { cwd: dir });
  return dir;
}

describe('exportHistory', () => {
  let origCwd;
  let repoDir;

  before(() => {
    origCwd = process.cwd();
    repoDir = createTestRepo();
    process.chdir(repoDir);
  });

  after(() => {
    process.chdir(origCwd);
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('exports commits to JSON object', async () => {
    const result = await exportHistory({});
    const json = JSON.parse(result);
    assert.equal(json.version, 1);
    assert.equal(json.commits.length, 2);
    assert.equal(json.commits[0].message, 'first commit');
    assert.equal(json.commits[1].message, 'second commit');
    assert.equal(json.commits[0].author.name, 'Test');
    assert.equal(json.commits[0].author.email, 'test@test.com');
    assert.ok(json.commits[0].original_hash);
    assert.ok(json.exported_at);
  });

  it('exports to file when -o is given', async () => {
    const outFile = join(repoDir, 'out.json');
    await exportHistory({ output: outFile });
    const { readFileSync } = await import('node:fs');
    const json = JSON.parse(readFileSync(outFile, 'utf-8'));
    assert.equal(json.commits.length, 2);
  });

  it('fails outside a git repo', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'githe-nogit-'));
    process.chdir(tmpDir);
    await assert.rejects(() => exportHistory({}), /not a git repository/i);
    process.chdir(repoDir);
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
node --test tests/export.test.js
```

Expected: FAIL — `exportHistory` throws "Not implemented".

- [ ] **Step 4: Implement export**

Replace `src/export.js`:

```js
import { writeFileSync } from 'node:fs';
import { isGitRepo, gitFastExport, getRepoRoot } from './git.js';
import { parseFastExport } from './parser.js';

export async function exportHistory(opts) {
  if (!isGitRepo()) {
    throw new Error('Not a git repository');
  }

  const stream = gitFastExport(opts.range);
  const { commits } = parseFastExport(stream);
  const repoRoot = getRepoRoot();

  const output = JSON.stringify({
    version: 1,
    repo: repoRoot,
    exported_at: new Date().toISOString(),
    commits,
  }, null, 2);

  if (opts.output) {
    writeFileSync(opts.output, output, 'utf-8');
    console.log(`Exported ${commits.length} commits to ${opts.output}`);
  } else {
    return output;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/export.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/git.js src/export.js tests/export.test.js
git commit -m "feat: implement export command"
```

---

### Task 4: Serializer (Patch Fast-Export Stream)

**Files:**
- Create: `src/serializer.js`
- Create: `tests/serializer.test.js`

The serializer takes a raw fast-export stream and an array of modified commits (from JSON). It walks through the stream and replaces author/committer/message fields in each commit block with values from the JSON, outputting a new stream suitable for `git fast-import`.

- [ ] **Step 1: Write serializer tests**

Create `tests/serializer.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { patchFastExportStream } from '../src/serializer.js';

describe('patchFastExportStream', () => {
  const baseStream = `commit refs/heads/main
mark :1
original-oid aaa111
author Old <old@old.com> 1000 +0000
committer Old <old@old.com> 1000 +0000
data 6
first

`;

  it('replaces author name and email', () => {
    const commits = [{
      original_hash: 'aaa111',
      message: 'first',
      author: { name: 'New', email: 'new@new.com', date: '1000 +0000' },
      committer: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      parents: [],
    }];
    const result = patchFastExportStream(baseStream, commits);
    assert.ok(result.includes('author New <new@new.com> 1000 +0000'));
    assert.ok(result.includes('committer Old <old@old.com> 1000 +0000'));
  });

  it('replaces commit message', () => {
    const commits = [{
      original_hash: 'aaa111',
      message: 'updated message',
      author: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      committer: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      parents: [],
    }];
    const result = patchFastExportStream(baseStream, commits);
    assert.ok(result.includes('data 15'));
    assert.ok(result.includes('updated message'));
  });

  it('replaces committer date', () => {
    const commits = [{
      original_hash: 'aaa111',
      message: 'first',
      author: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      committer: { name: 'Old', email: 'old@old.com', date: '9999 +0800' },
      parents: [],
    }];
    const result = patchFastExportStream(baseStream, commits);
    assert.ok(result.includes('committer Old <old@old.com> 9999 +0800'));
  });

  it('handles multiple commits with blobs between them', () => {
    const stream = `commit refs/heads/main
mark :1
original-oid aaa111
author A <a@a.com> 1000 +0000
committer A <a@a.com> 1000 +0000
data 2
a

blob
mark :2
data 5
hello
commit refs/heads/main
mark :3
original-oid bbb222
author B <b@b.com> 2000 +0000
committer B <b@b.com> 2000 +0000
data 2
b
from :1
M 100644 :2 file.txt

`;
    const commits = [
      {
        original_hash: 'aaa111',
        message: 'A-new',
        author: { name: 'A', email: 'a@a.com', date: '1000 +0000' },
        committer: { name: 'A', email: 'a@a.com', date: '1000 +0000' },
        parents: [],
      },
      {
        original_hash: 'bbb222',
        message: 'B-new',
        author: { name: 'X', email: 'x@x.com', date: '3000 +0000' },
        committer: { name: 'X', email: 'x@x.com', date: '3000 +0000' },
        parents: ['aaa111'],
      },
    ];
    const result = patchFastExportStream(stream, commits);
    assert.ok(result.includes('A-new'));
    assert.ok(result.includes('B-new'));
    assert.ok(result.includes('author X <x@x.com> 3000 +0000'));
  });

  it('handles multiline commit messages', () => {
    const commits = [{
      original_hash: 'aaa111',
      message: 'line one\nline two',
      author: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      committer: { name: 'Old', email: 'old@old.com', date: '1000 +0000' },
      parents: [],
    }];
    const result = patchFastExportStream(baseStream, commits);
    assert.ok(result.includes('data 18'));
    assert.ok(result.includes('line one\nline two'));
  });

  it('throws on commit count mismatch', () => {
    const commits = [
      {
        original_hash: 'aaa111', message: 'a',
        author: { name: 'A', email: 'a@a.com', date: '1000 +0000' },
        committer: { name: 'A', email: 'a@a.com', date: '1000 +0000' },
        parents: [],
      },
      {
        original_hash: 'bbb222', message: 'b',
        author: { name: 'B', email: 'b@b.com', date: '2000 +0000' },
        committer: { name: 'B', email: 'b@b.com', date: '2000 +0000' },
        parents: [],
      },
    ];
    assert.throws(
      () => patchFastExportStream(baseStream, commits),
      /commit count mismatch/i,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/serializer.test.js
```

Expected: FAIL — `patchFastExportStream` not found.

- [ ] **Step 3: Implement serializer**

Create `src/serializer.js`:

```js
/**
 * Patch a fast-export stream, replacing commit metadata with values from the
 * modified commits array. Non-commit blocks (blobs, resets, tags) pass through
 * unchanged.
 */
export function patchFastExportStream(stream, commits) {
  const lines = stream.split('\n');
  const output = [];
  let commitIndex = 0;
  let i = 0;

  // First pass: count commits in stream
  let streamCommitCount = 0;
  for (const line of lines) {
    if (line.startsWith('commit ')) streamCommitCount++;
  }
  if (streamCommitCount !== commits.length) {
    throw new Error(
      `Commit count mismatch: stream has ${streamCommitCount} commits, JSON has ${commits.length}`
    );
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('commit ')) {
      i = patchCommitBlock(lines, i, commits[commitIndex], output);
      commitIndex++;
    } else if (line.startsWith('blob')) {
      i = copyBlobBlock(lines, i, output);
    } else {
      output.push(line);
      i++;
    }
  }

  return output.join('\n');
}

function patchCommitBlock(lines, startIndex, commit, output) {
  // Output the "commit refs/..." line
  output.push(lines[startIndex]);
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('mark :')) {
      output.push(line);
      i++;
    } else if (line.startsWith('original-oid ')) {
      output.push(line);
      i++;
    } else if (line.startsWith('author ')) {
      output.push(`author ${commit.author.name} <${commit.author.email}> ${commit.author.date}`);
      i++;
    } else if (line.startsWith('committer ')) {
      output.push(`committer ${commit.committer.name} <${commit.committer.email}> ${commit.committer.date}`);
      i++;
    } else if (line.startsWith('data ')) {
      // Replace the data block with the (possibly modified) message
      const oldDataLen = parseInt(line.slice(5), 10);
      const msgBytes = Buffer.byteLength(commit.message + '\n', 'utf-8');
      output.push(`data ${msgBytes}`);
      output.push(commit.message);
      // Skip past original data content
      i++;
      let bytesLeft = oldDataLen;
      while (bytesLeft > 0 && i < lines.length) {
        bytesLeft -= lines[i].length + 1;
        i++;
      }
    } else if (line.startsWith('from ') || line.startsWith('merge ') ||
               line.startsWith('M ') || line.startsWith('D ') ||
               line.startsWith('R ') || line.startsWith('C ')) {
      output.push(line);
      i++;
    } else if (line === '') {
      output.push(line);
      i++;
      // Check if we've exited the commit block
      if (i < lines.length) {
        const next = lines[i];
        if (next.startsWith('commit ') || next.startsWith('blob') ||
            next.startsWith('reset ') || next.startsWith('tag ') || next === '') {
          break;
        }
      } else {
        break;
      }
    } else {
      output.push(line);
      i++;
    }
  }

  return i;
}

function copyBlobBlock(lines, startIndex, output) {
  output.push(lines[startIndex]); // "blob"
  let i = startIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('mark :') || line.startsWith('original-oid ')) {
      output.push(line);
      i++;
    } else if (line.startsWith('data ')) {
      const dataLen = parseInt(line.slice(5), 10);
      output.push(line);
      i++;
      let bytesLeft = dataLen;
      while (bytesLeft > 0 && i < lines.length) {
        output.push(lines[i]);
        bytesLeft -= lines[i].length + 1;
        i++;
      }
      break;
    } else {
      break;
    }
  }
  return i;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/serializer.test.js
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/serializer.js tests/serializer.test.js
git commit -m "feat: implement fast-export stream serializer"
```

---

### Task 5: Import Command

**Files:**
- Modify: `src/import.js`
- Modify: `src/git.js` (add helpers)
- Create: `tests/import.test.js`

- [ ] **Step 1: Write import tests**

Create `tests/import.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { importHistory } from '../src/import.js';
import { exportHistory } from '../src/export.js';

function createTestRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'githe-test-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello');
  execSync('git add file.txt && git commit -m "first commit"', { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello world');
  execSync('git add file.txt && git commit -m "second commit"', { cwd: dir });
  return dir;
}

describe('importHistory', () => {
  let origCwd;
  let repoDir;

  before(() => {
    origCwd = process.cwd();
    repoDir = createTestRepo();
    process.chdir(repoDir);
  });

  after(() => {
    process.chdir(origCwd);
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('rewrites commit messages from modified JSON', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    data.commits[0].message = 'modified first';
    data.commits[1].message = 'modified second';
    const jsonFile = join(repoDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, { noBackup: true });

    const log = execSync('git log --format="%s" --reverse', { encoding: 'utf-8' }).trim();
    assert.equal(log, 'modified first\nmodified second');
  });

  it('rewrites author info from modified JSON', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    data.commits[0].author.name = 'NewAuthor';
    data.commits[0].author.email = 'new@author.com';
    const jsonFile = join(repoDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, { noBackup: true });

    const log = execSync('git log --format="%an <%ae>" --reverse', { encoding: 'utf-8' }).trim().split('\n');
    assert.equal(log[0], 'NewAuthor <new@author.com>');
  });

  it('creates backup branch by default', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    const jsonFile = join(repoDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, {});

    const branches = execSync('git branch', { encoding: 'utf-8' });
    assert.ok(branches.includes('githe-backup-'));
  });

  it('rejects dirty working tree', async () => {
    writeFileSync(join(repoDir, 'dirty.txt'), 'uncommitted');
    const jsonFile = join(repoDir, 'history.json');
    writeFileSync(jsonFile, '{}');

    await assert.rejects(() => importHistory(jsonFile, {}), /clean|commit|stash/i);

    // Clean up
    const { unlinkSync } = await import('node:fs');
    unlinkSync(join(repoDir, 'dirty.txt'));
  });

  it('preserves file content after rewrite', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    data.commits[0].message = 'changed msg';
    const jsonFile = join(repoDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, { noBackup: true });

    const content = readFileSync(join(repoDir, 'file.txt'), 'utf-8');
    assert.equal(content, 'hello world');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/import.test.js
```

Expected: FAIL — `importHistory` throws "Not implemented".

- [ ] **Step 3: Add git helpers for import**

Add to `src/git.js`:

```js
export function createBackupBranch() {
  const timestamp = Date.now();
  const branchName = `githe-backup-${timestamp}`;
  execSync(`git branch ${branchName}`, { stdio: 'pipe' });
  return branchName;
}

export function gitFastImport(stream) {
  execSync('git fast-import --force --quiet', {
    input: stream,
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
  });
}

export function gitResetHard(ref) {
  execSync(`git reset --hard ${ref}`, { stdio: 'pipe' });
}
```

- [ ] **Step 4: Implement import**

Replace `src/import.js`:

```js
import { readFileSync } from 'node:fs';
import {
  isGitRepo,
  isWorkingTreeClean,
  gitFastExport,
  gitFastImport,
  gitResetHard,
  getCurrentBranch,
  createBackupBranch,
} from './git.js';
import { parseFastExport } from './parser.js';
import { patchFastExportStream } from './serializer.js';

export async function importHistory(file, opts) {
  if (!isGitRepo()) {
    throw new Error('Not a git repository');
  }

  if (!isWorkingTreeClean()) {
    throw new Error('Working tree is not clean. Please commit or stash your changes first.');
  }

  const jsonStr = readFileSync(file, 'utf-8');
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  if (!data.commits || !Array.isArray(data.commits)) {
    throw new Error('Invalid JSON: missing "commits" array');
  }

  const branch = getCurrentBranch();

  if (!opts.noBackup) {
    const backupBranch = createBackupBranch();
    console.log(`Backup branch created: ${backupBranch}`);
  }

  // Get the current fast-export stream
  const stream = gitFastExport();

  // Patch with modified commit data
  const patchedStream = patchFastExportStream(stream, data.commits);

  // Import the patched stream
  gitFastImport(patchedStream);

  // Reset to the new HEAD
  gitResetHard(branch);

  console.log(`Imported ${data.commits.length} commits. History rewritten on branch '${branch}'.`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/import.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Run all tests**

```bash
node --test tests/**/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/import.js src/git.js tests/import.test.js
git commit -m "feat: implement import command with backup"
```

---

### Task 6: Integration Test (End-to-End)

**Files:**
- Create: `tests/e2e.test.js`

- [ ] **Step 1: Write end-to-end test**

Create `tests/e2e.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const CLI = join(import.meta.dirname, '..', 'bin', 'githe.js');

function run(cmd, opts = {}) {
  return execSync(`node ${CLI} ${cmd}`, { encoding: 'utf-8', ...opts });
}

function createTestRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'githe-e2e-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'aaa');
  execSync('git add a.txt && git commit -m "add a"', { cwd: dir });
  writeFileSync(join(dir, 'b.txt'), 'bbb');
  execSync('git add b.txt && git commit -m "add b"', { cwd: dir });
  writeFileSync(join(dir, 'a.txt'), 'aaa updated');
  execSync('git add a.txt && git commit -m "update a"', { cwd: dir });
  return dir;
}

describe('githe e2e', () => {
  let origCwd;
  let repoDir;

  before(() => {
    origCwd = process.cwd();
    repoDir = createTestRepo();
    process.chdir(repoDir);
  });

  after(() => {
    process.chdir(origCwd);
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('full export → edit → import cycle', () => {
    // Export
    const jsonFile = join(repoDir, 'history.json');
    run(`export -o ${jsonFile}`);
    const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));

    assert.equal(data.version, 1);
    assert.equal(data.commits.length, 3);

    // Edit: change all messages and the author of the first commit
    data.commits[0].message = 'MODIFIED: add a';
    data.commits[1].message = 'MODIFIED: add b';
    data.commits[2].message = 'MODIFIED: update a';
    data.commits[0].author.name = 'Ghost';
    data.commits[0].author.email = 'ghost@example.com';

    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    // Import
    run(`import ${jsonFile} --no-backup`);

    // Verify messages
    const log = execSync('git log --format="%s" --reverse', { encoding: 'utf-8' }).trim();
    assert.equal(log, 'MODIFIED: add a\nMODIFIED: add b\nMODIFIED: update a');

    // Verify author
    const authors = execSync('git log --format="%an <%ae>" --reverse', { encoding: 'utf-8' }).trim().split('\n');
    assert.equal(authors[0], 'Ghost <ghost@example.com>');

    // Verify file content preserved
    assert.equal(readFileSync(join(repoDir, 'a.txt'), 'utf-8'), 'aaa updated');
    assert.equal(readFileSync(join(repoDir, 'b.txt'), 'utf-8'), 'bbb');
  });

  it('shows usage with --help', () => {
    const output = run('--help');
    assert.ok(output.includes('githe export'));
    assert.ok(output.includes('githe import'));
  });
});
```

- [ ] **Step 2: Run e2e tests**

```bash
node --test tests/e2e.test.js
```

Expected: all tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
node --test tests/**/*.test.js
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e.test.js
git commit -m "test: add end-to-end integration tests"
```

---

### Task 7: npm Link + Manual Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Link globally and test**

```bash
npm link
```

- [ ] **Step 2: Smoke test in a real repo**

```bash
cd /tmp && mkdir githe-smoke && cd githe-smoke && git init
git commit --allow-empty -m "test commit"
githe export -o test.json
cat test.json
# Manually verify JSON looks correct
# Edit test.json message
githe import test.json
git log --oneline
# Verify message changed
```

- [ ] **Step 3: Clean up and commit if any fixes needed**

```bash
npm unlink -g githe
rm -rf /tmp/githe-smoke
```
