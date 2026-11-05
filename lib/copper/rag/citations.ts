// Turns the citations Copper writes, like [Copper Home User Guide, p. 9], into
// links that open that PDF at that page. Plain data and string work, so the
// chat panel (a client component) can use it too.
import { DOCUMENTS } from "@/lib/copper/documents";

/** A link that opens the PDF at one page (browsers read "#page=N"). */
export function pageUrl(documentId: string, page: number): string {
  const doc = DOCUMENTS.find((d) => d.id === documentId);
  return `${doc?.file ?? "/docs"}#page=${page}`;
}

export type ReplyPart =
  | { type: "text"; text: string }
  | { type: "citation"; text: string; url: string };

const CITATION = /(\[[^\[\]]+?, p\. \d+\])/;

/**
 * Splits a reply into plain text and citations. A citation only becomes a link
 * when its title is one of our documents, so a made-up source stays plain text.
 */
export function splitCitations(reply: string): ReplyPart[] {
  return reply
    .split(CITATION)
    .filter(Boolean)
    .map((piece): ReplyPart => {
      const match = /^\[(.+), p\. (\d+)\]$/.exec(piece);
      const doc = match && DOCUMENTS.find((d) => d.title === match[1]);
      if (!match || !doc) return { type: "text", text: piece };
      return {
        type: "citation",
        text: piece,
        url: pageUrl(doc.id, Number(match[2])),
      };
    });
}
