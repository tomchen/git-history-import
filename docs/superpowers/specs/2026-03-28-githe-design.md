# githe - Git History Export/Import CLI

## Overview

npm CLI tool that exports git commit history to an editable JSON file, and imports modified JSON back to rewrite history. Zero dependencies, uses only Node.js built-ins and git commands.

## Project Structure

```
githe/
├── package.json          # bin: { "githe": "./bin/githe.js" }
├── bin/githe.js          # CLI entry (process.argv, no framework)
├── src/
│   ├── export.js         # git fast-export → parse → JSON
│   ├── import.js         # JSON → patch fast-export stream → git fast-import
│   ├── parser.js         # fast-export text stream parser
│   └── serializer.js     # Patches fast-export stream with JSON overrides
├── tests/
│   └── ...
└── README.md
```

## JSON Format

```json
{
  "version": 1,
  "repo": "/path/to/repo",
  "exported_at": "2026-03-28T13:22:00Z",
  "commits": [
    {
      "original_hash": "abc123...",
      "message": "feat: add login",
      "author": {
        "name": "Chen",
        "email": "chen@example.com",
        "date": "2026-03-27T10:00:00+08:00"
      },
      "committer": {
        "name": "Chen",
        "email": "chen@example.com",
        "date": "2026-03-27T10:00:00+08:00"
      },
      "parents": ["def456..."],
      "tree": "789abc..."
    }
  ]
}
```

- `commits` in topological order (oldest first)
- `original_hash` is read-only, for reference only
- `parents` / `tree` exported for reference, not used during import

## CLI Interface

```bash
# Export entire history
githe export -o history.json

# Export specific range
githe export -o history.json --range HEAD~5..HEAD

# Export to stdout
githe export

# Import (rewrite history)
githe import history.json

# Import without backup
githe import history.json --no-backup
```

## Core Flow

### Export

1. Verify current directory is a git repo
2. Run `git fast-export --all` (or with range)
3. Parse fast-export stream: extract commit metadata (author, committer, message, parents, tree)
4. Write commit metadata to JSON. Blob data is not included in JSON output.

### Import

1. Verify working tree is clean
2. Create backup branch `githe-backup-<timestamp>`
3. Re-run `git fast-export --all` to get complete stream (with blobs/trees)
4. Read user-modified JSON
5. Replace commit metadata in fast-export stream with JSON values
6. Pipe modified stream through `git fast-import`
7. `git reset --hard` to new HEAD

Blob/file content is always managed by git. JSON only concerns metadata.

## Error Handling

- Not a git repo → error and exit
- Dirty working tree (on import) → error, prompt to commit/stash
- Invalid JSON → error with details
- Commit count mismatch between JSON and current history → error (no adding/removing commits, only editing metadata)

## Technical Approach

Based on `git fast-export` / `git fast-import` — the official git mechanism for history rewriting. Same foundation used by `git-filter-repo`. Zero external dependencies.

## Import Backup

- Default: creates `githe-backup-<timestamp>` branch before rewriting
- `--no-backup` flag to skip
- Backup branch is a normal git branch, deletable with `git branch -D`
