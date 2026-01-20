import { test } from "vitest";
import { expect } from "vitest";
import { patchFastExportStream } from "../src/serializer.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function dataBlock(msg: string) {
	const bytes = Buffer.byteLength(msg, "utf8");
	return `data ${bytes}\n${msg}`;
}

interface Person {
	name: string;
	email: string;
	date: string;
}

function makeCommit({
	ref = "refs/heads/master",
	mark,
	oid,
	author,
	committer,
	msg,
	extra = [],
}: {
	ref?: string;
	mark: number;
	oid: string;
	author: Person;
	committer: Person;
	msg: string;
	extra?: string[];
}) {
	const lines = [
		`commit ${ref}`,
		`mark :${mark}`,
		`original-oid ${oid}`,
		`author ${author.name} <${author.email}> ${author.date}`,
		`committer ${committer.name} <${committer.email}> ${committer.date}`,
		dataBlock(msg),
		...extra,
	];
	return lines.join("\n");
}

const ALICE: Person = {
	name: "Alice",
	email: "alice@example.com",
	date: "2023-11-14 22:13:20 +0000",
};
const BOB: Person = {
	name: "Bob",
	email: "bob@example.com",
	date: "2023-11-14 23:13:21 +0100",
};
const CAROL: Person = {
	name: "Carol",
	email: "carol@example.com",
	date: "2023-11-14 22:13:22 +0000",
};

// ── Test 1: replaces author name and email ────────────────────────────────────

test("replaces author name and email", () => {
	const stream = makeCommit({
		mark: 1,
		oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		author: ALICE,
		committer: BOB,
		msg: "initial commit",
	});

	const newAuthor = { name: "Zara", email: "zara@new.com", date: ALICE.date };
	const commits = [
		{
			original_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			message: "initial commit",
			author: newAuthor,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("author Zara <zara@new.com>");
	expect(result).not.toContain("Alice");
});

// ── Test 2: replaces commit message and updates data length ──────────────────

test("replaces commit message and updates data length", () => {
	const oldMsg = "old message";
	const stream = makeCommit({
		mark: 1,
		oid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		author: ALICE,
		committer: BOB,
		msg: oldMsg,
	});

	const newMsg = "brand new commit message with more text";
	const newLen = Buffer.byteLength(`${newMsg}\n`);
	const commits = [
		{
			original_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			message: newMsg,
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain(`data ${newLen}`);
	expect(result).toContain(newMsg);
	expect(result).not.toContain(oldMsg);
});

// ── Test 3: replaces committer date ──────────────────────────────────────────

test("replaces committer date", () => {
	const stream = makeCommit({
		mark: 1,
		oid: "cccccccccccccccccccccccccccccccccccccccc",
		author: ALICE,
		committer: BOB,
		msg: "some commit",
	});

	const newCommitter = {
		name: BOB.name,
		email: BOB.email,
		date: "2033-05-18 09:03:19 +0530",
	};
	const commits = [
		{
			original_hash: "cccccccccccccccccccccccccccccccccccccccc",
			message: "some commit",
			author: ALICE,
			committer: newCommitter,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	// humanDateToGit converts "2033-05-18 07:03:19 +0530" → "1999999999 +0530"
	expect(result).toContain("1999999999 +0530");
	expect(result).not.toContain("1700000001 +0100");
});

// ── Test 4: handles multiple commits with blobs between them ─────────────────

test("handles multiple commits with blobs between them", () => {
	const blobBlock = [
		"blob",
		"mark :1",
		"original-oid ce013625030ba8dba906f756967f9e9ca394464a",
		"data 6",
		"hello\n",
	].join("\n");

	const commit1 = makeCommit({
		mark: 2,
		oid: "dddddddddddddddddddddddddddddddddddddddd",
		author: ALICE,
		committer: ALICE,
		msg: "first commit",
	});

	const blobBlock2 = [
		"blob",
		"mark :3",
		"original-oid ce013625030ba8dba906f756967f9e9ca394464b",
		"data 4",
		"bye\n",
	].join("\n");

	const commit2 = makeCommit({
		mark: 4,
		oid: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		author: BOB,
		committer: BOB,
		msg: "second commit",
		extra: ["from :2"],
	});

	const stream = [blobBlock, commit1, blobBlock2, commit2].join("\n");

	const newAlice = {
		name: "Alice2",
		email: "alice2@example.com",
		date: ALICE.date,
	};
	const newBob = { name: "Bob2", email: "bob2@example.com", date: BOB.date };
	const commits = [
		{
			original_hash: "dddddddddddddddddddddddddddddddddddddddd",
			message: "patched first",
			author: newAlice,
			committer: newAlice,
			parents: [],
		},
		{
			original_hash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			message: "patched second",
			author: newBob,
			committer: newBob,
			parents: ["dddddddddddddddddddddddddddddddddddddddd"],
		},
	];

	const result = patchFastExportStream(stream, commits);

	// Both commits patched
	expect(result).toContain("Alice2");
	expect(result).toContain("patched first");
	expect(result).toContain("Bob2");
	expect(result).toContain("patched second");

	// Blob blocks passed through verbatim
	expect(result).toContain("ce013625030ba8dba906f756967f9e9ca394464a");
	expect(result).toContain("ce013625030ba8dba906f756967f9e9ca394464b");
	expect(result).toContain("hello\n");
	expect(result).toContain("bye\n");
});

// ── Test 5: handles multiline commit messages ─────────────────────────────────

test("handles multiline commit messages with correct data byte length", () => {
	const oldMsg = "single line";
	const stream = makeCommit({
		mark: 1,
		oid: "ffffffffffffffffffffffffffffffffffffffff",
		author: ALICE,
		committer: ALICE,
		msg: oldMsg,
	});

	const newMsg = "line one\nline two\nline three";
	const expectedLen = Buffer.byteLength(`${newMsg}\n`);
	const commits = [
		{
			original_hash: "ffffffffffffffffffffffffffffffffffffffff",
			message: newMsg,
			author: ALICE,
			committer: ALICE,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain(`data ${expectedLen}`);
	expect(result).toContain("line one\nline two\nline three");
});

// ── Test 6: throws on commit count mismatch ──────────────────────────────────

test("throws when stream commit count does not match commits array length", () => {
	const stream = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "only commit",
	});

	// Provide 2 commit objects but stream has only 1
	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "only commit",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
		{
			original_hash: "0000000000000000000000000000000000000000",
			message: "extra",
			author: CAROL,
			committer: CAROL,
			parents: [],
		},
	];

	expect(() => patchFastExportStream(stream, commits)).toThrow(
		/commit count mismatch/i,
	);
});

// ── Test 7: commit message containing "commit refs/heads" is not miscounted ──

test('does not miscount "commit " lines inside commit messages or blob data', () => {
	const msgWithCommitKeyword =
		"docs: add plan\n\nExample:\ncommit refs/heads/master\nmark :1\ncommit refs/heads/feature";
	const stream = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: msgWithCommitKeyword,
	});

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: msgWithCommitKeyword,
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	// Should NOT throw — there is 1 real commit, not 3
	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("docs: add plan");
});

// ── Test 8: unknown commit header lines are passed through verbatim ───────────

test("passes through unknown commit header lines (encoding, gpgsig, etc.)", () => {
	// Build a stream with an "encoding utf-8" line before the data stanza
	const lines = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		"author Alice <alice@example.com> 2023-11-14 22:13:20 +0000",
		"committer Bob <bob@example.com> 2023-11-14 22:13:20 +0000",
		"encoding utf-8",
		dataBlock("encoded commit"),
	];
	const stream = lines.join("\n");

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "encoded commit",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("encoding utf-8");
	expect(result).toContain("encoded commit");
});

// ── Test 9: tag blocks with data are passed through ──────────────────────────

test("passes through tag blocks with data stanzas", () => {
	const commit = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "tagged commit",
	});

	const tagMsg = "Release v1.0";
	const tagBlock = [
		"tag v1.0",
		"from :1",
		"tagger Alice <alice@example.com> 2023-11-14 22:13:20 +0000",
		dataBlock(tagMsg),
	].join("\n");

	const stream = `${commit}\n${tagBlock}`;

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "tagged commit",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("tag v1.0");
	expect(result).toContain("from :1");
	expect(result).toContain("tagger Alice");
	expect(result).toContain(tagMsg);
});

// ── Test 10: done keyword is passed through ────────────────────────────────

test('passes through "done" keyword', () => {
	const stream = `${makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "last commit",
	})}\ndone`;

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "last commit",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("done");
});

// ── Test 11: humanDateToGit passthrough for raw git dates ─────────────────

test("passes through raw git date format unchanged", () => {
	// Use a raw git date (digits + tz offset) as the date in author/committer
	const rawGitDate = "1700000000 +0000";
	const authorWithRawDate = {
		name: "Alice",
		email: "alice@example.com",
		date: rawGitDate,
	};
	const stream = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "raw date commit",
	});

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "raw date commit",
			author: authorWithRawDate,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	// The raw git date should appear verbatim in the output
	expect(result).toContain(`author Alice <alice@example.com> ${rawGitDate}`);
});

// ── Test 12: humanDateToGit throws on unrecognized date format ────────────

test("throws on unrecognized date format in author/committer", () => {
	const badDate = "not-a-date";
	const authorWithBadDate = {
		name: "Alice",
		email: "alice@example.com",
		date: badDate,
	};
	const stream = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "bad date commit",
	});

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "bad date commit",
			author: authorWithBadDate,
			committer: BOB,
			parents: [],
		},
	];

	expect(() => patchFastExportStream(stream, commits)).toThrow(
		/unrecognized date format/i,
	);
});

// ── Test 13: blob block terminated by "done" without data ─────────────────

test('handles blob terminated by "done" keyword without a data stanza', () => {
	const commit = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "before blob",
	});
	// Blob with only a mark line, terminated by "done"
	const stream = `${commit}\nblob\nmark :2\ndone`;

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "before blob",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("blob");
	expect(result).toContain("done");
});

// ── Test 14: unrecognised top-level line is passed through ─────────────────

test("passes through unrecognised top-level lines verbatim", () => {
	// A "progress" line is a valid fast-export directive that we don't handle specially
	const commit = makeCommit({
		mark: 1,
		oid: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		author: ALICE,
		committer: BOB,
		msg: "test commit",
	});
	const stream = `progress some status message\n${commit}`;

	const commits = [
		{
			original_hash: "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
			message: "test commit",
			author: ALICE,
			committer: BOB,
			parents: [],
		},
	];

	const result = patchFastExportStream(stream, commits);
	expect(result).toContain("progress some status message");
});
