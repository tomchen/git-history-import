# githe: TypeScript + Tooling Migration

## Goal

Convert githe from JavaScript to TypeScript, add standard tooling (Biome, EditorConfig, gitignore, gitattributes), add MIT LICENSE, achieve ~100% test coverage with Vitest, prepare for npm publishing, and set up GitHub Actions CI/CD.

## Project Structure

```
githe/
├── bin/githe.js                    # shebang wrapper → imports ../dist/cli.js
├── src/
│   ├── cli.ts                      # CLI entry (arg parsing + main, extracted from bin/githe.js)
│   ├── export.ts
│   ├── import.ts
│   ├── parser.ts
│   ├── serializer.ts
│   └── git.ts
├── tests/
│   ├── e2e.test.ts
│   ├── export.test.ts
│   ├── import.test.ts
│   ├── parser.test.ts
│   └── serializer.test.ts
├── .github/workflows/ci.yml
├── .editorconfig
├── .gitattributes
├── .gitignore
├── biome.json
├── LICENSE
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## TypeScript Setup

- **tsconfig.json**: `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `outDir: dist`, `rootDir: src`, `strict: true`, `declaration: true`
- **bin/githe.js**: Thin shebang wrapper `#!/usr/bin/env node` that does `import "../dist/cli.js"`
- All source files renamed `.js` → `.ts` with proper type annotations
- No runtime dependencies added

## Testing

- **Runner**: Vitest
- **Coverage**: `@vitest/coverage-v8`
- **Target**: ~100% coverage on all source files
- **Config**: `vitest.config.ts` with coverage thresholds
- Tests migrated from `node:test` → Vitest (`describe`/`it`/`expect`)
- e2e tests continue to use real git repos in temp directories

## Linting & Formatting

- **Biome**: recommended lint rules + formatter
- **Style**: double quotes, semicolons (matches current code), 2-space indent, 80 char line width
- **biome.json**: configured for TypeScript, ignoring `dist/` and `coverage/`

## Config Files

- **.gitignore**: `node_modules/`, `dist/`, `coverage/`, `*.tgz`
- **.gitattributes**: `* text=auto eol=lf`
- **.editorconfig**: UTF-8, LF, 2-space indent, trim trailing whitespace, final newline

## LICENSE

MIT license, copyright `Tom Chen (tomchen.org)`.

## package.json

```json
{
  "name": "githe",
  "version": "0.1.0",
  "description": "Export git history to JSON, edit it, import it back",
  "type": "module",
  "bin": { "githe": "./bin/githe.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist", "bin"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^3",
    "@vitest/coverage-v8": "^3",
    "@biomejs/biome": "^1"
  }
}
```

## GitHub Actions

**ci.yml** — triggers on push to `main` and PRs:
1. Lint (Biome check)
2. Build (tsc)
3. Test + coverage (Node 20 and 22 matrix)

**publish job** — triggers on `v*` tag push:
1. Build
2. `npm publish` with `NODE_AUTH_TOKEN` secret

## Public API

Export `exportHistory` and `importHistory` from `dist/index.js` so the package can be used as a library, not just a CLI.
