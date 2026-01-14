import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const CLI = join(import.meta.dirname, '..', 'bin', 'githe.js');

function run(cmd: string, opts: Record<string, unknown> = {}) {
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

  it('full export → edit → import cycle', () => {
    // Export — write JSON to a temp dir outside repo to keep working tree clean
    const tmpDir = mkdtempSync(join(tmpdir(), 'githe-e2e-json-'));
    const jsonFile = join(tmpDir, 'history.json');
    run(`export -o ${jsonFile}`);
    const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));

    expect(data.version).toBe(1);
    expect(data.commits.length).toBe(3);

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
    expect(log).toBe('MODIFIED: add a\nMODIFIED: add b\nMODIFIED: update a');

    // Verify author
    const authors = execSync('git log --format="%an <%ae>" --reverse', { encoding: 'utf-8' }).trim().split('\n');
    expect(authors[0]).toBe('Ghost <ghost@example.com>');

    // Verify file content preserved
    expect(readFileSync(join(repoDir, 'a.txt'), 'utf-8')).toBe('aaa updated');
    expect(readFileSync(join(repoDir, 'b.txt'), 'utf-8')).toBe('bbb');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows usage with --help', () => {
    const output = run('--help');
    expect(output).toContain('githe export');
    expect(output).toContain('githe import');
  });
});
