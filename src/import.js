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

  const stream = gitFastExport();
  const patchedStream = patchFastExportStream(stream, data.commits);
  gitFastImport(patchedStream);
  gitResetHard(branch);

  console.log(`Imported ${data.commits.length} commits. History rewritten on branch '${branch}'.`);
  console.log('');
  console.log('To completely purge old history:');
  console.log('  1. Delete the backup branch:  git branch -D githe-backup-<timestamp>');
  console.log('  2. Expire reflog:             git reflog expire --expire=now --all');
  console.log('  3. Garbage collect:           git gc --prune=now --aggressive');
  console.log('  4. Force push:                git push --force');
  console.log('  5. Ask collaborators to re-clone the repository');
}
