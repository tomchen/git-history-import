# githe

Export git history to JSON, edit it, import it back.

githe wraps `git fast-export` and `git fast-import` to let you dump a repository's commit history into a plain JSON file, modify whatever you need in any text editor, then replay the changes back to rewrite the history.

## Install

```bash
npm install -g githe
```

## Usage

Basic workflow:

```bash
# Export history to JSON
githe export -o history.json

# Edit history.json with any editor...
# Change commit messages, author names, emails, dates, etc.

# Import modified history
githe import history.json
```

All options:

```bash
# Export to stdout
githe export

# Export specific range
githe export -o history.json --range HEAD~5..HEAD

# Import without creating backup branch
githe import history.json --no-backup
```

## JSON Format

Each exported file looks like this:

```json
{
  "version": 1,
  "repo": "/path/to/your/repo",
  "ref": "refs/heads/main",
  "exported_at": "2024-01-15T10:30:00.000Z",
  "commits": [
    {
      "original_hash": "a1b2c3d4e5f6...",
      "message": "fix: correct off-by-one error in parser",
      "author": {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "date": "2024-01-15 10:30:00 +0000"
      },
      "committer": {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "date": "2024-01-15 10:30:00 +0000"
      },
      "parents": ["9f8e7d6c5b4a..."]
    }
  ]
}
```

The `date` field uses human-readable format: `YYYY-MM-DD HH:MM:SS +ZZZZ` (e.g. `2024-01-15 10:30:00 +0200`). Raw git format (`1705312200 +0200`) is also accepted during import.

## What Can Be Modified

The following fields are rewritten during import:

- `message` — commit message
- `author.name`, `author.email`, `author.date` — authorship
- `committer.name`, `committer.email`, `committer.date` — committer identity

The `original_hash` field is **required** for import. githe matches each JSON entry to a commit in the repository by this hash and only patches commits that appear in the JSON. This means you can safely export a subset with `--range`, edit it, and import it back — only the matching commits are rewritten, and the rest of the history is preserved unchanged.

The order of entries in the `commits` array does not matter. You may also remove entries you don't want to edit. However, you must not add entries whose `original_hash` does not exist in the current branch.

The `parents` and `ref` fields are exported for reference only and are not used during import. The tree (file contents, including binary files) is preserved exactly as-is.

## Backup and Recovery

By default, `githe import` creates a backup branch named `githe-backup-<timestamp>` pointing to the original HEAD before rewriting history.

To recover the original history:

```bash
# Check the backup branch name printed during import, then:
git checkout githe-backup-<timestamp>

# Or reset your current branch back to the backup
git checkout main
git reset --hard githe-backup-<timestamp>
```

Use `--no-backup` to skip creating the backup branch if you do not need it.

## Completely Purging Old History

After importing, the old commits still exist as dangling objects in the object database. Git retains them in the reflog for approximately 90 days, so they can be recovered via `git reflog`. To remove all traces of the old history:

```bash
# 1. Delete backup branch
git branch -D githe-backup-<timestamp>

# 2. Expire reflog
git reflog expire --expire=now --all

# 3. Garbage collect
git gc --prune=now --aggressive

# 4. Force push to remote
git push --force

# 5. All collaborators must re-clone
```

**Warning: this is irreversible.** Once garbage collected, the old commits cannot be recovered. If the repository has been pushed to a remote, any collaborator who already pulled the old history will still have it locally. They must delete their local clone and re-clone to avoid accidentally reintroducing old commits.

## Programmatic API

githe can also be used as a library:

```ts
import { exportHistory, importHistory, parseFastExport, patchFastExportStream } from "githe";

// Export commits as a JSON string
const json = exportHistory({ range: "HEAD~5..HEAD" });

// Import from a file
importHistory("history.json", { noBackup: true });
```

Full TypeScript type definitions are included.

## Limitations

- **Current branch only.** githe exports and imports the current branch. Detached HEAD is not supported.
- **`original_hash` is required.** Every commit in the JSON must have an `original_hash` that exists in the current branch. Commits with missing or unknown hashes are rejected.
- **Scalability.** The entire fast-export stream is buffered in memory. Very large repositories (hundreds of MB of history) may exceed the 100 MB buffer limit.

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

## Requirements

- Node.js >= 20
- git

## License

MIT
