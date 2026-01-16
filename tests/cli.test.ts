import { describe, it, beforeAll, afterAll, vi, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// We import main (and exercise parseArgs / printUsage) by calling main() directly.
// The auto-run guard in cli.ts (import.meta.url check) prevents it from running on import.
import { main } from '../src/cli.js';

function createTestRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'githe-cli-'));
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  writeFileSync(join(dir, 'file.txt'), 'hello');
  execSync('git add file.txt && git commit -m "init"', { cwd: dir });
  return dir;
}

describe('main() CLI', () => {
  let origCwd: string;
  let repoDir: string;
  let tmpDir: string;

  beforeAll(() => {
    origCwd = process.cwd();
    repoDir = createTestRepo();
    tmpDir = mkdtempSync(join(tmpdir(), 'githe-cli-json-'));
    process.chdir(repoDir);
  });

  afterAll(() => {
    process.chdir(origCwd);
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('printUsage and exits 0 with no args', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main([]);
    } catch (e) {
      expect((e as Error).message).toBe('exit:0');
    }
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('githe export'));
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('printUsage and exits 0 with --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main(['--help']);
    } catch (e) {
      expect((e as Error).message).toBe('exit:0');
    }
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('githe export'));
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('printUsage and exits 0 with -h', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main(['-h']);
    } catch (e) {
      expect((e as Error).message).toBe('exit:0');
    }
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('export command writes JSON to stdout', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await main(['export']);
    expect(writeSpy).toHaveBeenCalled();
    const written = (writeSpy.mock.calls[0][0] as string);
    expect(JSON.parse(written).version).toBe(1);
    writeSpy.mockRestore();
  });

  it('parseArgs: --range option is parsed', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    // Use HEAD..HEAD (empty range) to exercise the --range parsing path without needing 2 commits
    await main(['export', '--range', 'refs/heads/master']);
    writeSpy.mockRestore();
  });

  it('export command with -o writes to file', async () => {
    const outFile = join(tmpDir, 'cli-out.json');
    await main(['export', '-o', outFile]);
    const data = JSON.parse(require('node:fs').readFileSync(outFile, 'utf-8'));
    expect(data.version).toBe(1);
  });

  it('import command without file path exits 1', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main(['import']);
    } catch (e) {
      expect((e as Error).message).toBe('exit:1');
    }
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('import requires a JSON file path'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('unknown command exits 1 with error message', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main(['boguscmd']);
    } catch (e) {
      expect((e as Error).message).toBe('exit:1');
    }
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
    errSpy.mockRestore();
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('parseArgs: unknown option exits 1', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => { throw new Error('exit:' + _code); });
    try {
      await main(['export', '--unknown-flag']);
    } catch (e) {
      expect((e as Error).message).toBe('exit:1');
    }
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown option'));
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('import command executes successfully with valid JSON', async () => {
    // First export
    const jsonFile = join(tmpDir, 'cli-import.json');
    await main(['export', '-o', jsonFile]);

    // Modify and import
    const fs = await import('node:fs');
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    data.commits[0].message = 'cli-test imported';
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main(['import', jsonFile, '--no-backup']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Imported'));
    logSpy.mockRestore();
  });
});
