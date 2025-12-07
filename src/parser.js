/**
 * Parse `git fast-export --all --show-original-ids` output into structured
 * commit objects.
 *
 * @param {string} stream  Full fast-export text
 * @returns {{ commits: object[], raw: string, markToOid: Map<number,string> }}
 */
export function parseFastExport(stream) {
  const commits = [];
  /** @type {Map<number, string>} mark number → original-oid */
  const markToOid = new Map();

  // We work on the raw bytes so that `data N` byte-counts are exact.
  const buf = Buffer.from(stream, 'utf8');
  let pos = 0; // current byte offset into buf

  /** Read one text line (up to and including \n). Returns the line without \n. */
  function readLine() {
    const start = pos;
    while (pos < buf.length && buf[pos] !== 0x0a /* '\n' */) pos++;
    const line = buf.toString('utf8', start, pos);
    if (pos < buf.length) pos++; // consume the '\n'
    return line;
  }

  /** Peek at the current line without advancing pos. */
  function peekLine() {
    const saved = pos;
    const line = readLine();
    pos = saved;
    return line;
  }

  /** Skip exactly N bytes then one trailing newline. */
  function skipBytes(n) {
    pos += n;
    if (pos < buf.length && buf[pos] === 0x0a) pos++;
  }

  /** Read exactly N bytes as a UTF-8 string, then consume the trailing newline. */
  function readBytes(n) {
    const content = buf.toString('utf8', pos, pos + n);
    pos += n;
    if (pos < buf.length && buf[pos] === 0x0a) pos++;
    return content;
  }

  /**
   * Consume a `data N` stanza (the "data N" header line has already been read
   * by the caller and N is passed in).  Returns the data as a string.
   */
  function consumeData(n) {
    return readBytes(n);
  }

  /**
   * Parse an author/committer line of the form:
   *   Name <email> timestamp timezone
   */
  function parseIdentity(line) {
    // Split off the trailing "timestamp timezone" (two space-separated tokens)
    const gtIdx = line.lastIndexOf('>');
    const afterGt = line.slice(gtIdx + 2); // skip '> '
    const ltIdx = line.indexOf('<');
    const name = line.slice(0, ltIdx).trimEnd();
    const email = line.slice(ltIdx + 1, gtIdx);
    const date = afterGt.trim();
    return { name, email, date };
  }

  while (pos < buf.length) {
    const line = readLine();
    if (line === '') continue;

    // ── commit block ──────────────────────────────────────────────────────────
    if (line.startsWith('commit ')) {
      let markNum = null;
      let original_hash = null;
      let author = null;
      let committer = null;
      let message = '';
      const parentMarks = [];

      // Read commit header lines until we hit the data stanza or end-of-block
      let headersDone = false;
      while (!headersDone && pos < buf.length) {
        const hdr = readLine();

        if (hdr.startsWith('mark :')) {
          markNum = parseInt(hdr.slice(6), 10);
        } else if (hdr.startsWith('original-oid ')) {
          original_hash = hdr.slice(13).trim();
        } else if (hdr.startsWith('author ')) {
          author = parseIdentity(hdr.slice(7));
        } else if (hdr.startsWith('committer ')) {
          committer = parseIdentity(hdr.slice(10));
        } else if (hdr.startsWith('data ')) {
          const n = parseInt(hdr.slice(5), 10);
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
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next.startsWith('done')
        ) {
          break;
        }
        const opLine = readLine();
        if (opLine.startsWith('from :')) {
          parentMarks.push({ kind: 'from', mark: parseInt(opLine.slice(6), 10) });
        } else if (opLine.startsWith('merge :')) {
          parentMarks.push({ kind: 'merge', mark: parseInt(opLine.slice(7), 10) });
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
        .filter((oid) => oid !== null);

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
    if (line === 'blob') {
      while (pos < buf.length) {
        const next = peekLine();
        if (
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next.startsWith('done')
        ) {
          break;
        }
        const blobLine = readLine();
        if (blobLine.startsWith('data ')) {
          const n = parseInt(blobLine.slice(5), 10);
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
      line.startsWith('reset ') ||
      line.startsWith('tag ') ||
      line === 'done'
    ) {
      while (pos < buf.length) {
        const next = peekLine();
        if (
          next === '' ||
          next.startsWith('commit ') ||
          next.startsWith('blob') ||
          next.startsWith('reset ') ||
          next.startsWith('tag ') ||
          next.startsWith('done')
        ) {
          break;
        }
        const tagLine = readLine();
        if (tagLine.startsWith('data ')) {
          const n = parseInt(tagLine.slice(5), 10);
          skipBytes(n);
          break;
        }
      }
      continue;
    }

    // Any other line (e.g. bare 'from' after a reset) — skip
  }

  return { commits, raw: stream, markToOid };
}
