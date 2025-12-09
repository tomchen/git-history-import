import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
