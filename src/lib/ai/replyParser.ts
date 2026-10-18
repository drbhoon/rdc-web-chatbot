/**
 * Splits the model's reply, as it streams in, into what TARA says and what
 * she writes. Every reply is asked to begin with one line,
 *
 *     [[SAY: the words for the voice]]
 *
 * followed by the written answer — but only when the answer gives addresses
 * or a list of plants or products: those are spoken as a short summary ("RDC
 * has a plant in Whitefield, Bengaluru. The address is in the answer box.")
 * instead of read out (RDC, 2026-10-11). Every other answer has no SAY line
 * and is read in full as it streams (RDC, 2026-10-18).
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

// A list this long is a catalogue (plants, products, people), not an answer to read out.
const LONG_LIST_ITEMS = 6;

/**
 * What to say aloud for an approved answer returned word for word, or null to
 * read the whole answer. Only addresses and long lists (plants, products) are
 * summarised — their first sentence and a pointer to the answer box; every
 * other answer is read in full (RDC, 2026-10-18: "What is MPU?" was spoken as
 * one sentence).
 */
export function spokenSummary(text: string, language: string): string | null {
  const plain = text.replace(/\*\*|__|`/g, "").replace(/\(?https?:\/\/[^\s)]+\)?/g, "").replace(/\s+([,.])/g, "$1").trim();
  const listItems = plain.match(/^\s*(?:[-*•]|\d+\.)\s/gm)?.length ?? 0;
  const hasAddress = /\b\d{6}\b|\baddress\s*:/i.test(plain);
  if (listItems < LONG_LIST_ITEMS && !hasAddress) return null;
  const line = plain.split("\n")[0].trim();
  const first = (line.match(/^.*?[.!?।](?=\s|$)/)?.[0] ?? line).replace(/:$/, ".");
  return `${first} ${language === "hi" ? "पूरी जानकारी answer box में है।" : "The details are in the answer box."}`;
}
