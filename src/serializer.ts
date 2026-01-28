import type { Commit } from "./parser.js";

/**
 * Patch a `git fast-export` stream with updated commit metadata.
 *
 * Matches JSON commits to stream commits by `original_hash` (looked up
 * from each commit block's `original-oid` line). Commits not present in
 * the JSON are passed through unchanged — this allows range-exported
 * JSON to be applied against a full-branch re-export without truncating
 * history.
 *
 * Every commit in the JSON must have a non-null `original_hash`, and
 * every hash must match exactly one commit in the stream.
 */
export function patchFastExportStream(
	stream: Buffer,
	commits: Commit[],
): Buffer {
	const patchMap = new Map<string, Commit>();
	for (const commit of commits) {
		if (!commit.original_hash) {
			throw new Error("Every commit must have an original_hash for import");
		}
		if (patchMap.has(commit.original_hash)) {
			throw new Error(
				`Duplicate original_hash in JSON: ${commit.original_hash}`,
			);
		}
		patchMap.set(commit.original_hash, commit);
	}

	const buf = stream;
	let pos = 0;
	const outParts: Buffer[] = [];
	const matchedHashes = new Set<string>();

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

	function emit(text: string): void {
		outParts.push(Buffer.from(`${text}\n`));
	}

	function emitLine(line: string): void {
		outParts.push(Buffer.from(`${line}\n`));
	}

	function emitDataBytes(n: number): void {
		outParts.push(buf.subarray(pos, pos + n));
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) {
			outParts.push(Buffer.from("\n"));
			pos++;
		}
	}

	function skipDataBytes(n: number): void {
		pos += n;
		if (pos < buf.length && buf[pos] === 0x0a) pos++;
	}

	function isTopLevel(next: string): boolean {
		return (
			next === "" ||
			next.startsWith("commit ") ||
			next.startsWith("blob") ||
			next.startsWith("reset ") ||
			next.startsWith("tag ") ||
			next === "done"
		);
	}

	while (pos < buf.length) {
		const line = readLine();

		if (line === "") {
			emitLine("");
			continue;
		}

		if (line.startsWith("commit ")) {
			emitLine(line);

			// Collect header lines until `data` to discover original-oid
			const headerLines: string[] = [];
			let streamOid: string | null = null;
			let dataLen = -1;

			while (pos < buf.length) {
				const hdr = readLine();
				if (hdr.startsWith("original-oid ")) {
					streamOid = hdr.slice(13).trim();
				}
				if (hdr.startsWith("data ")) {
					dataLen = Number.parseInt(hdr.slice(5), 10);
					headerLines.push(hdr);
					break;
				}
				headerLines.push(hdr);
			}

			const commit = streamOid !== null ? patchMap.get(streamOid) : undefined;
			if (commit && streamOid) {
				matchedHashes.add(streamOid);
			}

			// Emit headers — patch author/committer/data if we have a match
			for (const hdr of headerLines) {
				if (hdr.startsWith("author ") && commit) {
					const { name, email, date } = commit.author!;
					emit(`author ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("committer ") && commit) {
					const { name, email, date } = commit.committer!;
					emit(`committer ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("data ") && commit) {
					const newMsg = commit.message;
					const newLen = Buffer.byteLength(`${newMsg}\n`);
					emit(`data ${newLen}`);
					outParts.push(Buffer.from(`${newMsg}\n`));
					skipDataBytes(dataLen);
				} else if (hdr.startsWith("data ")) {
					emitLine(hdr);
					emitDataBytes(dataLen);
				} else {
					emitLine(hdr);
				}
			}

			// Pass through from/merge/file-op lines
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const opLine = readLine();
				emitLine(opLine);
			}

			continue;
		}

		if (line === "blob") {
			emitLine(line);
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const blobLine = readLine();
				if (blobLine.startsWith("data ")) {
					const n = Number.parseInt(blobLine.slice(5), 10);
					emitLine(blobLine);
					emitDataBytes(n);
					break;
				}
				emitLine(blobLine);
			}
			continue;
		}

		if (
			line.startsWith("reset ") ||
			line.startsWith("tag ") ||
			line === "done"
		) {
			emitLine(line);
			while (pos < buf.length) {
				const next = peekLine();
				if (isTopLevel(next)) break;
				const tLine = readLine();
				if (tLine.startsWith("data ")) {
					const n = Number.parseInt(tLine.slice(5), 10);
					emitLine(tLine);
					emitDataBytes(n);
					break;
				}
				emitLine(tLine);
			}
			continue;
		}

		emitLine(line);
	}

	// Every JSON commit must have matched a stream commit
	if (matchedHashes.size !== commits.length) {
		const unmatched = commits
			.filter((c) => !matchedHashes.has(c.original_hash!))
			.map((c) => c.original_hash);
		throw new Error(
			`${commits.length - matchedHashes.size} commit(s) in JSON not found in repository: ${unmatched.join(", ")}`,
		);
	}

	return Buffer.concat(outParts);
}

/**
 * Convert human-readable date back to git raw format.
 * Accepts: "2026-03-26 19:52:56 +0100" -> "1774729976 +0100"
 * Also accepts raw git format "1774729976 +0100" as passthrough.
 */
function humanDateToGit(date: string): string {
	if (/^\d+ [+-]\d{4}$/.test(date)) return date;

	const match = date.match(
		/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/,
	);
	if (!match) throw new Error(`Unrecognized date format: ${date}`);

	const [, y, mo, d, h, mi, s, tz] = match;
	const sign = tz[0] === "+" ? 1 : -1;
	const tzH = Number.parseInt(tz.slice(1, 3), 10);
	const tzM = Number.parseInt(tz.slice(3, 5), 10);
	const offsetMs = sign * (tzH * 60 + tzM) * 60000;

	const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMs;
	const timestamp = Math.floor(utcMs / 1000);
	return `${timestamp} ${tz}`;
}
