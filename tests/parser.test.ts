import { test } from "vitest";
import { expect } from "vitest";
import { parseFastExport } from "../src/parser.js";

// ── helpers ──────────────────────────────────────────────────────────────────

// dataBlock returns "data N\n<msg>" WITHOUT a trailing newline so that
// Array.join('\n') can supply the separator between elements.  The real
// git fast-export format places `from`/`merge`/file-op lines immediately
// after the message bytes + one newline with no blank-line gap.
function dataBlock(msg: string) {
	const bytes = Buffer.byteLength(msg, "utf8");
	return `data ${bytes}\n${msg}`;
}

// ── Test 1: single commit with no files ──────────────────────────────────────

test("parses a single commit with no files", () => {
	const stream = [
		"reset refs/heads/master",
		"commit refs/heads/master",
		"mark :1",
		"original-oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"author Alice <alice@example.com> 1700000000 +0000",
		"committer Bob <bob@example.com> 1700000001 +0100",
		dataBlock("initial commit"),
	].join("\n");

	const { commits, raw, markToOid } = parseFastExport(stream);

	expect(commits.length).toBe(1);
	const c = commits[0];
	expect(c.original_hash).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
	expect(c.message).toBe("initial commit");
	expect(c.parents).toEqual([]);

	expect(c.author.name).toBe("Alice");
	expect(c.author.email).toBe("alice@example.com");
	expect(c.author.date).toBe("2023-11-14 22:13:20 +0000");

	expect(c.committer.name).toBe("Bob");
	expect(c.committer.email).toBe("bob@example.com");
	expect(c.committer.date).toBe("2023-11-14 23:13:21 +0100");

	expect(raw).toBe(stream);
	expect(markToOid).toBeInstanceOf(Map);
	expect(markToOid.get(1)).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

// ── Test 2: multiple commits with parent relationships ────────────────────────

test("parses multiple commits with parent relationships resolved via mark-to-oid", () => {
	const stream = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@x.com> 1000000000 +0000",
		"committer A <a@x.com> 1000000000 +0000",
		dataBlock("first"),
		"commit refs/heads/master",
		"mark :2",
		"original-oid 2222222222222222222222222222222222222222",
		"author B <b@x.com> 1000000001 +0000",
		"committer B <b@x.com> 1000000001 +0000",
		dataBlock("second"),
		"from :1",
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(2);
	expect(commits[0].parents).toEqual([]);
	expect(commits[1].parents).toEqual([
		"1111111111111111111111111111111111111111",
	]);
});

// ── Test 3: blob blocks between commits ──────────────────────────────────────

test("handles blob blocks between commits without corrupting output", () => {
	const stream = [
		"blob",
		"mark :1",
		"original-oid ce013625030ba8dba906f756967f9e9ca394464a",
		"data 6",
		"hello\n",
		"commit refs/heads/master",
		"mark :2",
		"original-oid aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
		"author X <x@x.com> 1000000000 +0000",
		"committer X <x@x.com> 1000000000 +0000",
		dataBlock("commit one"),
		"blob",
		"mark :3",
		"original-oid bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222",
		"data 4",
		"bye\n",
		"commit refs/heads/master",
		"mark :4",
		"original-oid cccc3333cccc3333cccc3333cccc3333cccc3333",
		"author Y <y@y.com> 1000000002 +0000",
		"committer Y <y@y.com> 1000000002 +0000",
		dataBlock("commit two"),
		"from :2",
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(2);
	expect(commits[0].original_hash).toBe(
		"aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
	);
	expect(commits[0].message).toBe("commit one");
	expect(commits[1].original_hash).toBe(
		"cccc3333cccc3333cccc3333cccc3333cccc3333",
	);
	expect(commits[1].message).toBe("commit two");
	expect(commits[1].parents).toEqual([
		"aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111",
	]);
});

// ── Test 4: merge commit with multiple parents ────────────────────────────────

test("parses merge commits with multiple parents (from + merge)", () => {
	const stream = [
		"commit refs/heads/main",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@x.com> 1000000000 +0000",
		"committer A <a@x.com> 1000000000 +0000",
		dataBlock("parent one"),
		"commit refs/heads/feature",
		"mark :2",
		"original-oid 2222222222222222222222222222222222222222",
		"author B <b@x.com> 1000000001 +0000",
		"committer B <b@x.com> 1000000001 +0000",
		dataBlock("parent two"),
		"commit refs/heads/main",
		"mark :3",
		"original-oid 3333333333333333333333333333333333333333",
		"author C <c@x.com> 1000000002 +0000",
		"committer C <c@x.com> 1000000002 +0000",
		dataBlock("merge commit"),
		"from :1",
		"merge :2",
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(3);
	const merge = commits[2];
	expect(merge.original_hash).toBe("3333333333333333333333333333333333333333");
	expect(merge.parents).toEqual([
		"1111111111111111111111111111111111111111",
		"2222222222222222222222222222222222222222",
	]);
});

// ── Test 5: preserves raw stream ──────────────────────────────────────────────

test("result.raw equals the input stream exactly", () => {
	const stream =
		"commit refs/heads/master\nmark :1\noriginal-oid abcd1234abcd1234abcd1234abcd1234abcd1234\nauthor Z <z@z.com> 1000000000 +0000\ncommitter Z <z@z.com> 1000000000 +0000\ndata 3\nhi\n\n";

	const { raw } = parseFastExport(stream);
	expect(raw).toBe(stream);
});

// ── Test 6: multiline commit messages ────────────────────────────────────────

test("parses multiline commit messages using byte-counting", () => {
	const msg = "line one\nline two\nok";
	const stream = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid dddddddddddddddddddddddddddddddddddddddd",
		"author M <m@m.com> 1000000000 +0000",
		"committer M <m@m.com> 1000000000 +0000",
		dataBlock(msg),
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(1);
	expect(commits[0].message).toBe(msg);
});

// ── Test 7: mark-to-oid resolution with interspersed reset and blob blocks ───

test("resolves mark-to-oid correctly when reset and blob blocks are interspersed", () => {
	const stream = [
		"reset refs/heads/master",
		"commit refs/heads/master",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@a.com> 1000000000 +0000",
		"committer A <a@a.com> 1000000000 +0000",
		dataBlock("root"),
		"blob",
		"mark :2",
		"original-oid ce013625030ba8dba906f756967f9e9ca394464a",
		"data 6",
		"hello\n",
		"reset refs/heads/feature",
		"from :1",
		"commit refs/heads/feature",
		"mark :3",
		"original-oid 3333333333333333333333333333333333333333",
		"author B <b@b.com> 1000000001 +0000",
		"committer B <b@b.com> 1000000001 +0000",
		dataBlock("branch commit"),
		"from :1",
	].join("\n");

	const { commits, markToOid } = parseFastExport(stream);

	// mark :2 is a blob — should NOT appear in markToOid as a commit oid
	// but mark :1 and :3 should map to their commit oids
	expect(markToOid.get(1)).toBe("1111111111111111111111111111111111111111");
	expect(markToOid.get(3)).toBe("3333333333333333333333333333333333333333");

	expect(commits.length).toBe(2);
	// second commit's parent resolves to commit :1's oid
	expect(commits[1].parents).toEqual([
		"1111111111111111111111111111111111111111",
	]);
});

// ── Test 8: negative timezone offset in gitDateToHuman ───────────────────────

test("converts negative timezone offset correctly", () => {
	const stream = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@a.com> 1000000000 -0500",
		"committer A <a@a.com> 1000000000 -0500",
		dataBlock("neg tz commit"),
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits[0].author?.date).toContain("-0500");
	expect(commits[0].author?.date).toBe("2001-09-08 20:46:40 -0500");
});

// ── Test 9: tag blocks with data stanzas ─────────────────────────────────────

test("skips tag blocks with data stanzas", () => {
	const tagMsg = "Release v1.0";
	const tagMsgBytes = Buffer.byteLength(tagMsg, "utf8");
	const stream = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@a.com> 1000000000 +0000",
		"committer A <a@a.com> 1000000000 +0000",
		dataBlock("root commit"),
		"tag v1.0",
		"from :1",
		"tagger Alice <alice@example.com> 1000000001 +0000",
		`data ${tagMsgBytes}`,
		tagMsg,
		"commit refs/heads/master",
		"mark :2",
		"original-oid 2222222222222222222222222222222222222222",
		"author B <b@b.com> 1000000002 +0000",
		"committer B <b@b.com> 1000000002 +0000",
		dataBlock("second commit"),
		"from :1",
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(2);
	expect(commits[0].message).toBe("root commit");
	expect(commits[1].message).toBe("second commit");
});

// ── Test 9: "done" keyword terminates the stream ─────────────────────────────

test('handles "done" keyword at the end of the stream', () => {
	const stream = [
		"commit refs/heads/master",
		"mark :1",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@a.com> 1000000000 +0000",
		"committer A <a@a.com> 1000000000 +0000",
		dataBlock("only commit"),
		"done",
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(1);
	expect(commits[0].message).toBe("only commit");
});

// ── Test 10: blob with no data stanza followed by commit ─────────────────────

test("handles blob block interrupted by a top-level keyword before data", () => {
	// A blob block that only has a mark line (no data stanza) — the inner loop
	// should break on seeing the next "commit " line
	const stream = [
		"blob",
		"mark :1",
		// No data stanza — next line is a commit which should break the blob loop
		"commit refs/heads/master",
		"mark :2",
		"original-oid 1111111111111111111111111111111111111111",
		"author A <a@a.com> 1000000000 +0000",
		"committer A <a@a.com> 1000000000 +0000",
		dataBlock("commit after incomplete blob"),
	].join("\n");

	const { commits } = parseFastExport(stream);

	expect(commits.length).toBe(1);
	expect(commits[0].message).toBe("commit after incomplete blob");
});
