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
  const rangeArg = range || `refs/heads/${getCurrentBranch()}`;
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
