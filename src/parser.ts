export interface Identity {
	name: string;
	email: string;
	date: string;
}

export interface Commit {
	original_hash: string | null;
	message: string;
	author: Identity | null;
	committer: Identity | null;
	parents: string[];
}

export interface ParseResult {
	commits: Commit[];
	raw: Buffer;
	markToOid: Map<number, string>;
}

/**
 * Parse `git fast-export --show-original-ids` output into structured
 * commit objects.
 *
 * Accepts a raw Buffer to preserve binary blob data. Text lines (commit
 * metadata, keywords) are decoded as UTF-8; binary data blocks are
 * skipped by byte count without decoding.
 */
export function parseFastExport(stream: Buffer): ParseResult {
	const commits: Commit[] = [];
	const markToOid = new Map<number, string>();

	const buf = stream;
	let pos = 0;

	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++;
		return line;
	}

	function peekLine(): string {
		const saved = pos;
		const line = readLine();
		pos = saved;
		return line;
	}

	function skipBytes(n: number): void {
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
	}

	function readBytes(n: number): string {
		const content = buf.toString("utf8", pos, pos + n);
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
		return content;
	}

	function consumeData(n: number): string {
		return readBytes(n);
	}

	function parseIdentity(line: string): Identity {
		const gtIdx = line.lastIndexOf(">");
		const afterGt = line.slice(gtIdx + 2);
		const ltIdx = line.indexOf("<");
		const name = line.slice(0, ltIdx).trimEnd();
		const email = line.slice(ltIdx + 1, gtIdx);
		const raw = afterGt.trim();
		const date = gitDateToHuman(raw);
		return { name, email, date };
	}

	function isTopLevel(next: string): boolean {
		return (
			next === "" ||
			next.startsWith("commit ") ||
			next.startsWith("blob") ||
			next.startsWith("reset ") ||
			next.startsWith("tag ") ||
			next.startsWith("done")
		);
	}

	while (pos < buf.length) {
		const line = readLine();
		if (line === "") continue;

		if (line.startsWith("commit ")) {
			let markNum: number | null = null;
			let original_hash: string | null = null;
			let author: Identity | null = null;
			let committer: Identity | null = null;
			let message = "";
			const parentMarks: { kind: string; mark: number }[] = [];

			let headersDone = false;
			while (!headersDone && pos < buf.length) {
				const hdr = readLine();

				if (hdr.startsWith("mark :")) {
					markNum = Number.parseInt(hdr.slice(6), 10);
				} else if (hdr.startsWith("original-oid ")) {
					original_hash = hdr.slice(13).trim();
				} else if (hdr.startsWith("author ")) {
					author = parseIdentity(hdr.slice(7));
				} else if (hdr.startsWith("committer ")) {
					committer = parseIdentity(hdr.slice(10));
				} else if (hdr.startsWith("data ")) {
					const n = Number.parseInt(hdr.slice(5), 10);
					message = consumeData(n);
					headersDone = true;
				}
			}

			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const opLine = readLine();
				if (opLine.startsWith("from :")) {
					parentMarks.push({
						kind: "from",
						mark: Number.parseInt(opLine.slice(6), 10),
					});
				} else if (opLine.startsWith("merge :")) {
					parentMarks.push({
						kind: "merge",
						mark: Number.parseInt(opLine.slice(7), 10),
					});
				}
			}

			if (markNum !== null && original_hash !== null) {
				markToOid.set(markNum, original_hash);
			}

			const parents = parentMarks
				.map(({ mark }) => markToOid.get(mark) ?? null)
				.filter((oid): oid is string => oid !== null);

			commits.push({ original_hash, message, author, committer, parents });
			continue;
		}

		if (line === "blob") {
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const blobLine = readLine();
				if (blobLine.startsWith("data ")) {
					const n = Number.parseInt(blobLine.slice(5), 10);
					skipBytes(n);
					break;
				}
			}
			continue;
		}

		if (
			line.startsWith("reset ") ||
			line.startsWith("tag ") ||
			line === "done"
		) {
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const tagLine = readLine();
				if (tagLine.startsWith("data ")) {
					const n = Number.parseInt(tagLine.slice(5), 10);
					skipBytes(n);
					break;
				}
			}
		}
	}

	return { commits, raw: stream, markToOid };
}

/**
 * Convert git raw date "1774729976 +0100" to "2026-03-26 19:52:56 +0100".
 */
function gitDateToHuman(raw: string): string {
	const [timestamp, tz] = raw.split(" ");
	const sec = Number.parseInt(timestamp, 10);
	const sign = tz[0] === "+" ? 1 : -1;
	const tzH = Number.parseInt(tz.slice(1, 3), 10);
	const tzM = Number.parseInt(tz.slice(3, 5), 10);
	const offsetMs = sign * (tzH * 60 + tzM) * 60000;
	const local = new Date(sec * 1000 + offsetMs);
	const y = local.getUTCFullYear();
	const mo = String(local.getUTCMonth() + 1).padStart(2, "0");
	const d = String(local.getUTCDate()).padStart(2, "0");
	const h = String(local.getUTCHours()).padStart(2, "0");
	const mi = String(local.getUTCMinutes()).padStart(2, "0");
	const s = String(local.getUTCSeconds()).padStart(2, "0");
	return `${y}-${mo}-${d} ${h}:${mi}:${s} ${tz}`;
}
