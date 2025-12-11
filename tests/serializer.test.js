import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchFastExportStream } from '../src/serializer.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function dataBlock(msg) {
  const bytes = Buffer.byteLength(msg, 'utf8');
  return `data ${bytes}\n${msg}`;
}

function makeCommit({ ref = 'refs/heads/master', mark, oid, author, committer, msg, extra = [] }) {
  const lines = [
    `commit ${ref}`,
    `mark :${mark}`,
    `original-oid ${oid}`,
    `author ${author.name} <${author.email}> ${author.date}`,
    `committer ${committer.name} <${committer.email}> ${committer.date}`,
    dataBlock(msg),
    ...extra,
  ];
  return lines.join('\n');
}

const ALICE = { name: 'Alice', email: 'alice@example.com', date: '1700000000 +0000' };
const BOB   = { name: 'Bob',   email: 'bob@example.com',   date: '1700000001 +0100' };
const CAROL = { name: 'Carol', email: 'carol@example.com', date: '1700000002 +0000' };

// ── Test 1: replaces author name and email ────────────────────────────────────

test('replaces author name and email', () => {
  const stream = makeCommit({
    mark: 1,
    oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    author: ALICE,
    committer: BOB,
    msg: 'initial commit',
  });

  const newAuthor = { name: 'Zara', email: 'zara@new.com', date: ALICE.date };
  const commits = [{
    original_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    message: 'initial commit',
    author: newAuthor,
    committer: BOB,
    parents: [],
  }];

  const result = patchFastExportStream(stream, commits);
  assert.ok(result.includes('author Zara <zara@new.com>'), 'new author name/email should appear');
  assert.ok(!result.includes('Alice'), 'old author name should not appear');
});

// ── Test 2: replaces commit message and updates data length ──────────────────

test('replaces commit message and updates data length', () => {
  const oldMsg = 'old message';
  const stream = makeCommit({
    mark: 1,
    oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    author: ALICE,
    committer: BOB,
    msg: oldMsg,
  });

  const newMsg = 'brand new commit message with more text';
  const newLen = Buffer.byteLength(newMsg + '\n');
  const commits = [{
    original_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    message: newMsg,
    author: ALICE,
    committer: BOB,
    parents: [],
  }];

  const result = patchFastExportStream(stream, commits);
  assert.ok(result.includes(`data ${newLen}`), 'data length should be updated');
  assert.ok(result.includes(newMsg), 'new message should appear');
  assert.ok(!result.includes(oldMsg), 'old message should not appear');
});

// ── Test 3: replaces committer date ──────────────────────────────────────────

test('replaces committer date', () => {
  const stream = makeCommit({
    mark: 1,
    oid: 'cccccccccccccccccccccccccccccccccccccccc',
    author: ALICE,
    committer: BOB,
    msg: 'some commit',
  });

  const newCommitter = { name: BOB.name, email: BOB.email, date: '1999999999 +0530' };
  const commits = [{
    original_hash: 'cccccccccccccccccccccccccccccccccccccccc',
    message: 'some commit',
    author: ALICE,
    committer: newCommitter,
    parents: [],
  }];

  const result = patchFastExportStream(stream, commits);
  assert.ok(result.includes('1999999999 +0530'), 'new committer date should appear');
  assert.ok(!result.includes('1700000001 +0100'), 'old committer date should not appear');
});

// ── Test 4: handles multiple commits with blobs between them ─────────────────

test('handles multiple commits with blobs between them', () => {
  const blobBlock = [
    'blob',
    'mark :1',
    'original-oid ce013625030ba8dba906f756967f9e9ca394464a',
    'data 6',
    'hello\n',
  ].join('\n');

  const commit1 = makeCommit({
    mark: 2,
    oid: 'dddddddddddddddddddddddddddddddddddddddd',
    author: ALICE,
    committer: ALICE,
    msg: 'first commit',
  });

  const blobBlock2 = [
    'blob',
    'mark :3',
    'original-oid ce013625030ba8dba906f756967f9e9ca394464b',
    'data 4',
    'bye\n',
  ].join('\n');

  const commit2 = makeCommit({
    mark: 4,
    oid: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    author: BOB,
    committer: BOB,
    msg: 'second commit',
    extra: ['from :2'],
  });

  const stream = [blobBlock, commit1, blobBlock2, commit2].join('\n');

  const newAlice = { name: 'Alice2', email: 'alice2@example.com', date: ALICE.date };
  const newBob   = { name: 'Bob2',   email: 'bob2@example.com',   date: BOB.date };
  const commits = [
    {
      original_hash: 'dddddddddddddddddddddddddddddddddddddddd',
      message: 'patched first',
      author: newAlice,
      committer: newAlice,
      parents: [],
    },
    {
      original_hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      message: 'patched second',
      author: newBob,
      committer: newBob,
      parents: ['dddddddddddddddddddddddddddddddddddddddd'],
    },
  ];

  const result = patchFastExportStream(stream, commits);

  // Both commits patched
  assert.ok(result.includes('Alice2'), 'first commit author should be patched');
  assert.ok(result.includes('patched first'), 'first commit message should be patched');
  assert.ok(result.includes('Bob2'), 'second commit author should be patched');
  assert.ok(result.includes('patched second'), 'second commit message should be patched');

  // Blob blocks passed through verbatim
  assert.ok(result.includes('ce013625030ba8dba906f756967f9e9ca394464a'), 'blob 1 original-oid should pass through');
  assert.ok(result.includes('ce013625030ba8dba906f756967f9e9ca394464b'), 'blob 2 original-oid should pass through');
  assert.ok(result.includes('hello\n'), 'blob 1 data should pass through');
  assert.ok(result.includes('bye\n'), 'blob 2 data should pass through');
});

// ── Test 5: handles multiline commit messages ─────────────────────────────────

test('handles multiline commit messages with correct data byte length', () => {
  const oldMsg = 'single line';
  const stream = makeCommit({
    mark: 1,
    oid: 'ffffffffffffffffffffffffffffffffffffffff',
    author: ALICE,
    committer: ALICE,
    msg: oldMsg,
  });

  const newMsg = 'line one\nline two\nline three';
  const expectedLen = Buffer.byteLength(newMsg + '\n');
  const commits = [{
    original_hash: 'ffffffffffffffffffffffffffffffffffffffff',
    message: newMsg,
    author: ALICE,
    committer: ALICE,
    parents: [],
  }];

  const result = patchFastExportStream(stream, commits);
  assert.ok(result.includes(`data ${expectedLen}`), `data length should be ${expectedLen}`);
  assert.ok(result.includes('line one\nline two\nline three'), 'multiline message should appear intact');
});

// ── Test 6: throws on commit count mismatch ──────────────────────────────────

test('throws when stream commit count does not match commits array length', () => {
  const stream = makeCommit({
    mark: 1,
    oid: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
    author: ALICE,
    committer: BOB,
    msg: 'only commit',
  });

  // Provide 2 commit objects but stream has only 1
  const commits = [
    {
      original_hash: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
      message: 'only commit',
      author: ALICE,
      committer: BOB,
      parents: [],
    },
    {
      original_hash: '0000000000000000000000000000000000000000',
      message: 'extra',
      author: CAROL,
      committer: CAROL,
      parents: [],
    },
  ];

  assert.throws(
    () => patchFastExportStream(stream, commits),
    /commit count mismatch/i,
  );
});
