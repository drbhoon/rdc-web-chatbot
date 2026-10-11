/**
 * Splits the model's reply, as it streams in, into what TARA says and what
 * she writes. Every reply is asked to begin with one line,
 *
 *     [[SAY: the words for the voice]]
 *
 * followed by the written answer. The SAY line lets the voice start as soon
 * as that line is complete (a second or so), while the answer is still being
 * written, and lets a long answer, a list or an address be spoken as a short
 * summary ("RDC has a plant in Whitefield, Bengaluru. The address is in the
 * answer box.") instead of read out in full (RDC, 2026-10-11).
 *
 * Written text is released a sentence at a time, never mid-word, so the brand
 * name fixes (keepBrandNamesInEnglish) and the [[UNANSWERED]] marker are
 * handled on whole pieces. A reply without a SAY line is fine: the caller
 * speaks the written answer instead.
 */

const SAY_OPEN = "[[SAY:";
const UNANSWERED = "[[UNANSWERED]]";

export interface ParsedPiece {
  /** The spoken line, the moment it is complete (once per reply). */
  say?: string;
  /** Newly released written text. */
  text: string;
}

export class ReplyParser {
  private buffer = "";
  private sayDone = false;
  private say: string | null = null;
  private written = "";
  unanswered = false;

  constructor(private readonly clean: (text: string) => string = (t) => t) {}

  push(delta: string): ParsedPiece {
    this.buffer += delta;
    const piece: ParsedPiece = { text: "" };

    if (!this.sayDone) {
      const lead = this.buffer.trimStart();
      if (lead.length < SAY_OPEN.length && SAY_OPEN.startsWith(lead)) return piece; // could still be "[[SAY:"
      if (lead.startsWith(SAY_OPEN)) {
        const end = lead.indexOf("]]");
        if (end < 0) return piece; // the spoken line is still arriving
        this.say = this.clean(lead.slice(SAY_OPEN.length, end).trim());
        piece.say = this.say;
        this.buffer = lead.slice(end + 2).replace(/^\s*\n?/, "");
      }
      this.sayDone = true;
    }

    piece.text = this.release(false);
    return piece;
  }

  /** The rest, once the stream has ended. */
  finish(): ParsedPiece {
    if (!this.sayDone) {
      this.sayDone = true; // the whole reply was shorter than "[[SAY:"
    }
    return { text: this.release(true) };
  }

  /** The complete written answer so far (cleaned). */
  get text(): string {
    return this.written.trim();
  }

  get spoken(): string | null {
    return this.say;
  }

  private release(all: boolean): string {
    let cut = this.buffer.length;
    if (!all) {
      // Up to the last sentence end or line break, and never into a "[[".
      const boundary = Math.max(
        this.buffer.lastIndexOf("\n"),
        ...[". ", "? ", "! ", "। ", ": "].map((mark) => {
          const at = this.buffer.lastIndexOf(mark);
          return at < 0 ? -1 : at + mark.length - 1;
        }),
      );
      cut = boundary + 1;
      const open = this.buffer.lastIndexOf("[[");
      if (open >= 0 && this.buffer.indexOf("]]", open) < 0) cut = Math.min(cut, open);
    }
    if (cut <= 0) return "";
    let out = this.buffer.slice(0, cut);
    this.buffer = this.buffer.slice(cut);
    if (out.includes(UNANSWERED)) {
      this.unanswered = true;
      out = out.replaceAll(UNANSWERED, "");
    }
    // The line break after the SAY line can arrive on its own: no answer
    // starts with blank space.
    if (!this.written) out = out.replace(/^\s+/, "");
    out = this.clean(out);
    this.written += out;
    return out;
  }
}

/** The same split for a reply that arrived whole. */
export function parseReply(full: string, clean: (text: string) => string = (t) => t) {
  const parser = new ReplyParser(clean);
  parser.push(full);
  parser.finish();
  return { say: parser.spoken, text: parser.text, unanswered: parser.unanswered };
}
