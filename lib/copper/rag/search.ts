// Document search: embeds a question and finds the passages whose embeddings
// are closest to it. Used by Ask Copper's search_docs tool.
import { callEmbedMany, isAiConfigured } from "@/lib/ai/call";
import { pageUrl } from "@/lib/copper/rag/citations";
import { getPassages } from "@/lib/copper/rag/passages";

export type DocSearchResult = {
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  /** The passage, without the title line it was embedded with. */
  text: string;
  /** Opens the PDF at this page. */
  url: string;
  /** How close it is to the question: 1 is identical, 0 is unrelated. */
  score: number;
};

export type DocSearch =
  | { status: "ok"; query: string; results: DocSearchResult[] }
  | { status: "unavailable"; message: string };

/** How many passages come back. */
export const TOP_K = 5;

// Both vectors have length 1, so their dot product is their cosine similarity.
function similarity(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** The passages closest to `query`, best first. */
export async function searchDocs(
  query: string,
  k: number = TOP_K,
): Promise<DocSearch> {
  const passages = getPassages();
  if (passages.length === 0) {
    return {
      status: "unavailable",
      message:
        "The documents haven't been prepared yet (run npm run ingest:docs).",
    };
  }
  if (!isAiConfigured()) {
    return {
      status: "unavailable",
      message: "Document search needs the Google AI key.",
    };
  }
  let vector: number[];
  try {
    [vector] = await callEmbedMany(
      { module: 3, feature: "search-docs" },
      { values: [query], taskType: "RETRIEVAL_QUERY" },
    );
  } catch {
    return {
      status: "unavailable",
      message: "The documents can't be searched right now. Please try again.",
    };
  }
  const results = passages
    .map((p) => ({ p, score: similarity(vector, p.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ p, score }) => ({
      title: p.title,
      page: p.page,
      text: p.text.slice(p.title.length).trim(),
      url: pageUrl(p.documentId, p.page),
      score: Math.round(score * 1000) / 1000,
    }));
  return { status: "ok", query, results };
}
