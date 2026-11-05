// npm run ingest:docs
// Reads every PDF in public/docs, splits each page into passages of a few
// sentences, embeds them with Gemini and saves them all to one JSON file that
// the app loads into memory (lib/copper/rag/passages.ts).
// Each passage starts with its document's title and remembers its page number.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extractText, getDocumentProxy } from "unpdf";
import { callEmbedMany } from "../lib/ai/call.ts";
import { EMBEDDING_MODEL } from "../lib/ai/models.ts";
import { DOCUMENTS } from "../lib/copper/documents.ts";

const OUT = "lib/copper/data/document-passages.json";
const SENTENCES_PER_PASSAGE = 4;
const MAX_CHARS = 700;
const MIN_CHARS = 150; // a shorter leftover joins the passage before it

/** Splits one page's text into passages of a few sentences. */
function passagesFor(pageText) {
  const sentences = pageText
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const out = [];
  let current = [];
  const flush = () => {
    if (current.length) out.push(current.join(" "));
    current = [];
  };
  for (const sentence of sentences) {
    const length = current.join(" ").length + sentence.length;
    if (
      current.length >= SENTENCES_PER_PASSAGE ||
      (current.length && length > MAX_CHARS)
    ) {
      flush();
    }
    current.push(sentence);
  }
  flush();
  if (out.length > 1 && out[out.length - 1].length < MIN_CHARS) {
    out[out.length - 2] += " " + out.pop();
  }
  return out;
}

const passages = [];
const counts = {};

for (const doc of DOCUMENTS) {
  const bytes = new Uint8Array(readFileSync(`public${doc.file}`));
  const pdf = await getDocumentProxy(bytes);
  const { text: pages } = await extractText(pdf, { mergePages: false });
  counts[doc.title] = 0;
  pages.forEach((pageText, i) => {
    for (const chunk of passagesFor(pageText)) {
      counts[doc.title]++;
      passages.push({
        id: `${doc.id}-p${i + 1}-${counts[doc.title]}`,
        documentId: doc.id,
        title: doc.title,
        page: i + 1,
        // The title goes first so the vector knows which document it came from.
        text: `${doc.title}\n${chunk}`,
      });
    }
  });
}

if (process.argv.includes("--dry")) {
  console.log(
    `Dry run: ${passages.length} passages (nothing embedded or saved)`,
  );
  for (const [title, n] of Object.entries(counts))
    console.log(`  ${title}: ${n}`);
  process.exit(0);
}

const vectors = await callEmbedMany(
  { module: 3, feature: "embed-documents" },
  { values: passages.map((p) => p.text), taskType: "RETRIEVAL_DOCUMENT" },
);

const round = (v) => v.map((x) => Math.round(x * 1e6) / 1e6);
const file = {
  model: EMBEDDING_MODEL.id,
  dimensions: EMBEDDING_MODEL.dimensions,
  passages: passages.map((p, i) => ({ ...p, embedding: round(vectors[i]) })),
};

mkdirSync("lib/copper/data", { recursive: true });
writeFileSync(OUT, JSON.stringify(file) + "\n");

console.log(`Saved ${passages.length} passages to ${OUT}`);
for (const [title, n] of Object.entries(counts))
  console.log(`  ${title}: ${n}`);
