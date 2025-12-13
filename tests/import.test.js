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
  let tmpDir;

  before(() => {
    origCwd = process.cwd();
    repoDir = createTestRepo();
    tmpDir = mkdtempSync(join(tmpdir(), 'githe-json-'));
    process.chdir(repoDir);
  });

  after(() => {
    process.chdir(origCwd);
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rewrites commit messages from modified JSON', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    data.commits[0].message = 'modified first';
    data.commits[1].message = 'modified second';
    const jsonFile = join(tmpDir, 'history.json');
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
    const jsonFile = join(tmpDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, { noBackup: true });

    const log = execSync('git log --format="%an <%ae>" --reverse', { encoding: 'utf-8' }).trim().split('\n');
    assert.equal(log[0], 'NewAuthor <new@author.com>');
  });

  it('creates backup branch by default', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    const jsonFile = join(tmpDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, {});

    const branches = execSync('git branch', { encoding: 'utf-8' });
    assert.ok(branches.includes('githe-backup-'));
  });

  it('rejects dirty working tree', async () => {
    writeFileSync(join(repoDir, 'dirty.txt'), 'uncommitted');
    const jsonFile = join(tmpDir, 'history.json');
    writeFileSync(jsonFile, '{}');

    await assert.rejects(() => importHistory(jsonFile, {}), /clean|commit|stash/i);

    const { unlinkSync } = await import('node:fs');
    unlinkSync(join(repoDir, 'dirty.txt'));
  });

  it('preserves file content after rewrite', async () => {
    const jsonStr = await exportHistory({});
    const data = JSON.parse(jsonStr);
    data.commits[0].message = 'changed msg';
    const jsonFile = join(tmpDir, 'history.json');
    writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    await importHistory(jsonFile, { noBackup: true });

    const content = readFileSync(join(repoDir, 'file.txt'), 'utf-8');
    assert.equal(content, 'hello world');
  });
});
