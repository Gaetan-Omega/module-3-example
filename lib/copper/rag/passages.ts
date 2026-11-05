// The document passages and their embeddings, made by `npm run ingest:docs`.
// Importing the JSON loads it into memory once, when the server starts, so
// searching it later needs no database or file reads.
import data from "@/lib/copper/data/document-passages.json";

export type DocumentPassage = {
  id: string;
  documentId: string;
  /** The document's title, which the text also starts with. */
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  text: string;
  /** Length-1 vector from the embedding model. */
  embedding: number[];
};

const passages: DocumentPassage[] = data.passages;

export function getPassages(): readonly DocumentPassage[] {
  return passages;
}
