// The course's approved models. Calls go straight to Google with a Google AI
// Studio key, which is free and needs no credit card.
export const MODELS = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (fast, shows its thinking)",
    // Google's own name for it, used when calling Google.
    googleId: "gemini-2.5-flash",
  },
  {
    id: "google/gemini-3-flash",
    label: "Gemini 3 Flash (newer, thinks out loud less often)",
    googleId: "gemini-3-flash-preview",
  },
] as const;

/**
 * The embedding model for turning text into vectors (used by document search).
 * 768 numbers per passage keeps the saved file small and is plenty for a few
 * hundred passages.
 */
export const EMBEDDING_MODEL = {
  id: "google/gemini-embedding-001",
  googleId: "gemini-embedding-001",
  dimensions: 768,
} as const;

export type ModelId = (typeof MODELS)[number]["id"];

/**
 * The model used when a call doesn't name one. Google no longer lets new API
 * keys use 2.5 Flash, so the default is 3 Flash. (2.5 Flash wrote a thinking
 * summary for every question; 3 Flash does so less often.)
 */
export const DEFAULT_MODEL: ModelId = "google/gemini-3-flash";

/** AI_MODEL if it names an approved model, otherwise the default. */
export function defaultModel(): ModelId {
  const id = process.env.AI_MODEL;
  return MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL;
}
