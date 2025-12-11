/**
 * Patch a `git fast-export` stream with updated commit metadata.
 *
 * Walks through the stream byte-accurately (matching the parser) and replaces
 * `author`, `committer`, and `data` (message) lines in each commit block with
 * values from the supplied commits array.  Everything else — blob blocks, reset
 * lines, file operations, marks, original-oid, from, merge, etc. — is passed
 * through verbatim.
 *
 * @param {string}   stream   Full fast-export text (the original raw stream)
 * @param {object[]} commits  Array of commit objects (same shape as parser output)
 * @returns {string} Patched stream ready for `git fast-import`
 */
export function patchFastExportStream(stream, commits) {
  // ── count commits in stream ──────────────────────────────────────────────
  const streamCommitCount = countCommits(stream);
  if (streamCommitCount !== commits.length) {
    throw new Error(
      `Commit count mismatch: stream has ${streamCommitCount} commit(s) but JSON has ${commits.length}`
    );
  }

  // ── work on raw bytes for accurate data-N handling ───────────────────────
  const buf = Buffer.from(stream, 'utf8');
  let pos = 0;
  let commitIndex = 0;
  const outParts = [];

  /** Read one text line (up to and including \n). Returns the line without \n. */
  function readLine() {
    const start = pos;
    while (pos < buf.length && buf[pos] !== 0x0a /* '\n' */) pos++;
    const line = buf.toString('utf8', start, pos);
    if (pos < buf.length) pos++; // consume '\n'
    return line;
  }

  /** Peek at the current line without advancing pos. */
  function peekLine() {
    const saved = pos;
    const line = readLine();
    pos = saved;
    return line;
  }

  /** Append a text string (with trailing newline) to output. */
  function emit(text) {
    outParts.push(text + '\n');
  }

  /** Emit the bytes at [start, end) of buf verbatim, then a newline. */
  function emitRaw(start, end) {
    outParts.push(buf.toString('utf8', start, end) + '\n');
  }

  /** Emit a line from buf verbatim (the line text without the newline, then add newline). */
  function emitLine(line) {
    outParts.push(line + '\n');
  }

  /**
   * Emit N raw data bytes from buf (no trailing newline added — the bytes
   * themselves may contain newlines), then consume the one trailing newline
   * that git fast-export places after the data bytes.
   */
  function emitDataBytes(n) {
    outParts.push(buf.toString('utf8', pos, pos + n));
    pos += n;
    // consume the trailing newline (if present)
    if (pos < buf.length && buf[pos] === 0x0a) {
      outParts.push('\n');
      pos++;
    }
  }

  /** Skip N data bytes + trailing newline (used to discard old message). */
  function skipDataBytes(n) {
    pos += n;
    if (pos < buf.length && buf[pos] === 0x0a) pos++;
  }

  while (pos < buf.length) {
    const lineStart = pos;
    const line = readLine();

    if (line === '') {
      emitLine('');
      continue;
    }

    // ── commit block ────────────────────────────────────────────────────────
    if (line.startsWith('commit ')) {
      const commit = commits[commitIndex++];
      emitLine(line); // e.g. "commit refs/heads/master"

      // Read and patch commit headers until we hit the data stanza
      let donePatchingHeaders = false;
      while (!donePatchingHeaders && pos < buf.length) {
        const hdr = readLine();

        if (hdr.startsWith('mark ')) {
          emitLine(hdr);
        } else if (hdr.startsWith('original-oid ')) {
          emitLine(hdr);
        } else if (hdr.startsWith('author ')) {
          // Replace with patched author
          const { name, email, date } = commit.author;
          emit(`author ${name} <${email}> ${date}`);
        } else if (hdr.startsWith('committer ')) {
          // Replace with patched committer
          const { name, email, date } = commit.committer;
          emit(`committer ${name} <${email}> ${date}`);
        } else if (hdr.startsWith('data ')) {
          // Replace with patched message
          const oldLen = parseInt(hdr.slice(5), 10);
          const newMsg = commit.message;
          // git fast-export always appends a newline after the message bytes;
          // we mirror that: the data block is the message + '\n'
          const newLen = Buffer.byteLength(newMsg + '\n');
          emit(`data ${newLen}`);
          outParts.push(newMsg + '\n');
          // Skip past the old message bytes (+ its trailing newline)
          skipDataBytes(oldLen);
          donePatchingHeaders = true;
        } else {
          // encoding, gpgsig, etc. — pass through
          emitLine(hdr);
        }
      }

      // After the data stanza: pass through from/merge/file-op lines until
      // the next top-level keyword or blank line.
      while (pos < buf.length) {
        const next = peekLine();
        if (
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next === 'done'
        ) {
          break;
        }
        const opLine = readLine();
        emitLine(opLine);
      }

      continue;
    }

    // ── blob block ──────────────────────────────────────────────────────────
    if (line === 'blob') {
      emitLine(line);
      while (pos < buf.length) {
        const next = peekLine();
        if (
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next === 'done'
        ) {
          break;
        }
        const blobLine = readLine();
        if (blobLine.startsWith('data ')) {
          const n = parseInt(blobLine.slice(5), 10);
          emitLine(blobLine); // "data N"
          emitDataBytes(n);   // raw data bytes + trailing newline
          break;
        }
        emitLine(blobLine); // mark, original-oid
      }
      continue;
    }

    // ── reset / tag / done ──────────────────────────────────────────────────
    if (
      line.startsWith('reset ') ||
      line.startsWith('tag ') ||
      line === 'done'
    ) {
      emitLine(line);
      while (pos < buf.length) {
        const next = peekLine();
        if (
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next === 'done'
        ) {
          break;
        }
        const tLine = readLine();
        if (tLine.startsWith('data ')) {
          const n = parseInt(tLine.slice(5), 10);
          emitLine(tLine);
          emitDataBytes(n);
          break;
        }
        emitLine(tLine);
      }
      continue;
    }

    // ── any other top-level line — pass through ─────────────────────────────
    emitLine(line);
  }

  return outParts.join('');
}

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Count the number of commit blocks in a fast-export stream by scanning for
 * lines that start with "commit ".
 */
function countCommits(stream) {
  let count = 0;
  let i = 0;
  while (i < stream.length) {
    // Find the next newline
    const nl = stream.indexOf('\n', i);
    const end = nl === -1 ? stream.length : nl;
    const line = stream.slice(i, end);
    if (line.startsWith('commit ')) count++;
    i = end + 1;
  }
  return count;
}
