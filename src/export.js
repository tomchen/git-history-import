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

  const normalizedCommits = commits.map((c) => ({
    ...c,
    message: c.message.replace(/\n$/, ''),
  }));

  const output = JSON.stringify({
    version: 1,
    repo: repoRoot,
    exported_at: new Date().toISOString(),
    commits: normalizedCommits,
  }, null, 2);

  if (opts.output) {
    writeFileSync(opts.output, output, 'utf-8');
    console.log(`Exported ${commits.length} commits to ${opts.output}`);
  } else {
    return output;
  }
}
