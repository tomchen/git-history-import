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
	raw: string;
	markToOid: Map<number, string>;
}

/**
 * Parse `git fast-export --all --show-original-ids` output into structured
 * commit objects.
 */
export function parseFastExport(stream: string): ParseResult {
	const commits: Commit[] = [];
	/** mark number → original-oid */
	const markToOid = new Map<number, string>();

	// We work on the raw bytes so that `data N` byte-counts are exact.
	const buf = Buffer.from(stream, "utf8");
	let pos = 0; // current byte offset into buf

	/** Read one text line (up to and including \n). Returns the line without \n. */
	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a /* '\n' */) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++; // consume the '\n'
		return line;
	}

	/** Peek at the current line without advancing pos. */
	function peekLine(): string {
		const saved = pos;
		const line = readLine();
		pos = saved;
		return line;
	}

	/** Skip exactly N bytes then one trailing newline. */
	function skipBytes(n: number): void {
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
	}

	/** Read exactly N bytes as a UTF-8 string, then consume the trailing newline. */
	function readBytes(n: number): string {
		const content = buf.toString("utf8", pos, pos + n);
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
		return content;
	}

	/**
	 * Consume a `data N` stanza (the "data N" header line has already been read
	 * by the caller and N is passed in).  Returns the data as a string.
	 */
	function consumeData(n: number): string {
		return readBytes(n);
	}

	/**
	 * Parse an author/committer line of the form:
	 *   Name <email> timestamp timezone
	 * Returns date as human-readable ISO-like string: "2026-03-28 20:53:44 +0100"
	 */
	function parseIdentity(line: string): Identity {
		const gtIdx = line.lastIndexOf(">");
		const afterGt = line.slice(gtIdx + 2); // skip '> '
		const ltIdx = line.indexOf("<");
		const name = line.slice(0, ltIdx).trimEnd();
		const email = line.slice(ltIdx + 1, gtIdx);
		const raw = afterGt.trim();
		const date = gitDateToHuman(raw);
		return { name, email, date };
	}

	while (pos < buf.length) {
		const line = readLine();
		if (line === "") continue;

		// ── commit block ──────────────────────────────────────────────────────────
		if (line.startsWith("commit ")) {
			let markNum: number | null = null;
			let original_hash: string | null = null;
			let author: Identity | null = null;
			let committer: Identity | null = null;
			let message = "";
			const parentMarks: { kind: string; mark: number }[] = [];

			// Read commit header lines until we hit the data stanza or end-of-block
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
				// encoding, gpgsig, etc. — skip silently
			}

			// After the data stanza: optional from/merge/file-op lines until blank
			// line or next top-level keyword.
			while (pos < buf.length) {
				const next = peekLine();
				if (
					next === "" ||
					next.startsWith("commit ") ||
					next.startsWith("blob") ||
					next.startsWith("reset ") ||
					next.startsWith("tag ") ||
					next.startsWith("done")
				) {
					break;
				}
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
				// M / D / R / C file ops — ignored for parent resolution
			}

			// Register this commit's mark → oid mapping
			if (markNum !== null && original_hash !== null) {
				markToOid.set(markNum, original_hash);
			}

			// Resolve parent marks → oids (best-effort; unknown marks produce null)
			const parents = parentMarks
				.map(({ mark }) => markToOid.get(mark) ?? null)
				.filter((oid): oid is string => oid !== null);

			commits.push({
				original_hash,
				message,
				author,
				committer,
				parents,
			});

			continue;
		}

		// ── blob block ────────────────────────────────────────────────────────────
		if (line === "blob") {
			while (pos < buf.length) {
				const next = peekLine();
				if (
					next === "" ||
					next.startsWith("commit ") ||
					next.startsWith("blob") ||
					next.startsWith("reset ") ||
					next.startsWith("tag ") ||
					next.startsWith("done")
				) {
					break;
				}
				const blobLine = readLine();
				if (blobLine.startsWith("data ")) {
					const n = Number.parseInt(blobLine.slice(5), 10);
					skipBytes(n);
					break;
				}
				// mark / original-oid lines inside blob — skip
			}
			continue;
		}

		// ── reset / tag / done / other ────────────────────────────────────────────
		// reset may carry a `from :N` that we don't need for commit parents.
		// Just skip until the next top-level block.
		if (
			line.startsWith("reset ") ||
			line.startsWith("tag ") ||
			line === "done"
		) {
			while (pos < buf.length) {
				const next = peekLine();
				if (
					next === "" ||
					next.startsWith("commit ") ||
					next.startsWith("blob") ||
					next.startsWith("reset ") ||
					next.startsWith("tag ") ||
					next.startsWith("done")
				) {
					break;
				}
				const tagLine = readLine();
				if (tagLine.startsWith("data ")) {
					const n = Number.parseInt(tagLine.slice(5), 10);
					skipBytes(n);
					break;
				}
			}
		}

		// Any other line (e.g. bare 'from' after a reset) — skip
	}

	return { commits, raw: stream, markToOid };
}

/**
 * Convert git raw date "1774729976 +0100" to "2026-03-26 19:52:56 +0100".
 */
function gitDateToHuman(raw: string): string {
	const [timestamp, tz] = raw.split(" ");
	const sec = Number.parseInt(timestamp, 10);
	// Build date string in UTC then apply timezone offset for display
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
