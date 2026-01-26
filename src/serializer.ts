import type { Commit } from "./parser.js";

/**
 * Patch a `git fast-export` stream with updated commit metadata.
 *
 * Accepts and returns raw Buffers to preserve binary blob data. Text
 * parts (commit headers, messages) are decoded/encoded as UTF-8; binary
 * data blocks are copied byte-for-byte without decoding.
 *
 * Validates commit identity: if the JSON provides an original_hash, it
 * must match the stream's original-oid for the corresponding commit.
 */
export function patchFastExportStream(
	stream: Buffer,
	commits: Commit[],
): Buffer {
	const streamCommitCount = countCommits(stream);
	if (streamCommitCount !== commits.length) {
		throw new Error(
			`Commit count mismatch: stream has ${streamCommitCount} commit(s) but JSON has ${commits.length}`,
		);
	}

	const buf = stream;
	let pos = 0;
	let commitIndex = 0;
	const outParts: Buffer[] = [];

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

	/**
	 * Copy N raw data bytes from the input buffer, then consume the
	 * trailing newline. No encoding conversion — binary-safe.
	 */
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
			const commit = commits[commitIndex++];
			emitLine(line);

			let donePatchingHeaders = false;
			while (!donePatchingHeaders && pos < buf.length) {
				const hdr = readLine();

				if (hdr.startsWith("mark ")) {
					emitLine(hdr);
				} else if (hdr.startsWith("original-oid ")) {
					emitLine(hdr);
					const streamOid = hdr.slice(13).trim();
					if (commit.original_hash && commit.original_hash !== streamOid) {
						throw new Error(
							`Commit identity mismatch at index ${commitIndex - 1}: ` +
								`stream has ${streamOid} but JSON has ${commit.original_hash}`,
						);
					}
				} else if (hdr.startsWith("author ")) {
					const { name, email, date } = commit.author!;
					emit(`author ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("committer ")) {
					const { name, email, date } = commit.committer!;
					emit(`committer ${name} <${email}> ${humanDateToGit(date)}`);
				} else if (hdr.startsWith("data ")) {
					const oldLen = Number.parseInt(hdr.slice(5), 10);
					const newMsg = commit.message;
					const newLen = Buffer.byteLength(`${newMsg}\n`);
					emit(`data ${newLen}`);
					outParts.push(Buffer.from(`${newMsg}\n`));
					skipDataBytes(oldLen);
					donePatchingHeaders = true;
				} else {
					emitLine(hdr);
				}
			}

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

function countCommits(stream: Buffer): number {
	const buf = stream;
	let pos = 0;
	let count = 0;

	function readLine(): string {
		const start = pos;
		while (pos < buf.length && buf[pos] !== 0x0a) pos++;
		const line = buf.toString("utf8", start, pos);
		if (pos < buf.length) pos++;
		return line;
	}

	while (pos < buf.length) {
		const line = readLine();
		if (line.startsWith("commit ")) count++;
		if (line.startsWith("data ")) {
			const n = Number.parseInt(line.slice(5), 10);
			pos += n;
			if (pos < buf.length && buf[pos] === 0x0a) pos++;
		}
	}
	return count;
}
