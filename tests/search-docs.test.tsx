// Module 3: Ask Copper's search_docs tool. A fake embedding model and a few
// fake passages stand in for Gemini and the saved JSON, so these checks need no
// AI key and cost nothing.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createLive, type Live } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each fake passage points mostly along one axis, so "closest" is predictable:
// a question about codes lands on the error-code passage, and so on.
const unit = (...v: number[]) => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
};
const TOPICS = ["code", "refund", "wifi", "other"] as const;
const vectorFor = (topic: (typeof TOPICS)[number], tilt = 0) =>
  unit(...TOPICS.map((t) => (t === topic ? 1 : tilt)));

const passage = (
  documentId: string,
  title: string,
  page: number,
  topic: (typeof TOPICS)[number],
  text: string,
  tilt = 0,
) => ({
  id: `${documentId}-p${page}-${text.length}`,
  documentId,
  title,
  page,
  text: `${title}\n${text}`,
  embedding: vectorFor(topic, tilt),
});

let passages: ReturnType<typeof passage>[] = [];
let embedCalls: { values: string[]; taskType?: string }[] = [];

vi.mock("@/lib/copper/rag/passages", () => ({
  getPassages: () => passages,
}));

vi.mock("@/lib/ai/call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/call")>()),
  callEmbedMany: async (
    _info: unknown,
    options: { values: string[]; taskType?: string },
  ) => {
    embedCalls.push(options);
    return options.values.map((q) =>
      /c-47|error|code/i.test(q)
        ? vectorFor("code")
        : /refund/i.test(q)
          ? vectorFor("refund")
          : /wi-?fi/i.test(q)
            ? vectorFor("wifi")
            : vectorFor("other"),
    );
  },
}));

const HOME = "Copper Home User Guide";
const TERMS = "Copper State Labs Terms and Conditions";
const FAQ = "Copper Plus FAQ";

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  embedCalls = [];
  passages = [
    passage(
      "copper-home-user-guide",
      HOME,
      9,
      "code",
      "C-47 Microphone array fault. Unplug Copper Home.",
    ),
    passage(
      "copper-home-user-guide",
      HOME,
      4,
      "wifi",
      "3.1 Reconnect to Wi-Fi or change networks.",
      0.3,
    ),
    passage(
      "copper-home-user-guide",
      HOME,
      9,
      "wifi",
      "Hold both buttons for 15 seconds to reset.",
      0.2,
    ),
    passage(
      "copper-plus-faq",
      FAQ,
      5,
      "refund",
      "Annual plans get a full refund within 30 days.",
    ),
    passage(
      "copper-terms-and-conditions",
      TERMS,
      4,
      "refund",
      "4.6 Refunds. Annual: full refund if you cancel in 30 days.",
      0.1,
    ),
    passage(
      "copper-terms-and-conditions",
      TERMS,
      2,
      "refund",
      "2.3 Refunds go back to your original payment method.",
      0.4,
    ),
    passage(
      "copper-notes-user-guide",
      "Copper Notes User Guide",
      2,
      "other",
      "Meet Copper Notes.",
    ),
  ];
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/copper/assistant/ask");
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import("@/lib/copper/rag/search");
}

describe("search_docs: finding the closest passages", () => {
  it("embeds the question as a query and returns the 5 closest passages, best first", async () => {
    const { searchDocs } = await load();
    const found = await searchDocs("annual refund");
    expect(embedCalls).toEqual([
      { values: ["annual refund"], taskType: "RETRIEVAL_QUERY" },
    ]);
    if (found.status !== "ok") throw new Error("expected results");
    expect(found.results).toHaveLength(5);
    expect(found.results.map((r) => [r.title, r.page])).toEqual([
      [FAQ, 5],
      [TERMS, 4],
      [TERMS, 2],
      [HOME, 4],
      [HOME, 9],
    ]);
    const scores = found.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("gives each passage its title, page, text without the title line, and a link that opens the PDF at that page", async () => {
    const { searchDocs } = await load();
    const found = await searchDocs("What does C-47 mean?");
    if (found.status !== "ok") throw new Error("expected results");
    expect(found.results[0]).toMatchObject({
      title: HOME,
      page: 9,
      text: "C-47 Microphone array fault. Unplug Copper Home.",
      url: "/docs/copper-home-user-guide.pdf#page=9",
    });
    const refund = await searchDocs("annual refund");
    if (refund.status !== "ok") throw new Error("expected results");
    expect(refund.results[1].url).toBe(
      "/docs/copper-terms-and-conditions.pdf#page=4",
    );
  });

  it("finds the Wi-Fi passages for 'reset Wi-Fi'", async () => {
    const { searchDocs } = await load();
    const found = await searchDocs("reset Wi-Fi");
    if (found.status !== "ok") throw new Error("expected results");
    expect(found.results.slice(0, 2).map((r) => r.text)).toEqual([
      "Hold both buttons for 15 seconds to reset.",
      "3.1 Reconnect to Wi-Fi or change networks.",
    ]);
  });

  it("says so, instead of crashing, when there's no key, no prepared documents or the embedding fails", async () => {
    const { searchDocs } = await load();
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    expect(await searchDocs("refund")).toMatchObject({ status: "unavailable" });
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
    passages = [];
    expect(await searchDocs("refund")).toMatchObject({
      status: "unavailable",
      message: expect.stringMatching(/ingest:docs/),
    });
  });
});

describe("search_docs: the tool and what Copper is told", () => {
  it("is one of Copper's tools, takes a question, and Copper is told to use it for setup, troubleshooting, warranty and policy", async () => {
    vi.resetModules();
    const { copperTools, searchDocsInput } =
      await import("@/lib/copper/assistant/tools");
    expect(Object.keys(copperTools)).toContain("search_docs");
    expect(copperTools.search_docs.description).toMatch(/5 closest passages/);
    expect(searchDocsInput.safeParse({ query: "reset Wi-Fi" }).success).toBe(
      true,
    );
    expect(searchDocsInput.safeParse({ query: "" }).success).toBe(false);

    const { COPPER_INSTRUCTIONS } =
      await import("@/lib/copper/assistant/instructions");
    expect(COPPER_INSTRUCTIONS).toContain("search_docs");
    for (const topic of ["setup", "troubleshooting", "warranty", "policy"])
      expect(COPPER_INSTRUCTIONS).toContain(topic);

    const { TOOL_LABELS } = await import("@/lib/copper/assistant/progress");
    expect(TOOL_LABELS.search_docs).toBeTruthy();

    const result = await copperTools.search_docs.execute!(
      { query: "annual refund" },
      { toolCallId: "t", messages: [], context: {} },
    );
    expect(result).toMatchObject({ status: "ok" });
  });
});

describe("search_docs: the tool card", () => {
  it("lists each passage with its document title, page and a link that opens the PDF at that page", async () => {
    const { searchDocs } = await load();
    const output = await searchDocs("annual refund");
    const done = createLive<Progress>();
    done.done({
      status: "done",
      reply: "Annual plans are refundable within 30 days.",
      steps: [
        {
          type: "tool",
          id: "call-1",
          name: "search_docs",
          state: "done",
          input: { query: "annual refund" },
          output,
        },
      ],
    });
    const askCopper = vi.fn().mockResolvedValue({
      progress: done.live as Live<Progress>,
    });
    vi.doMock("@/lib/copper/assistant/ask", () => ({ askCopper }));

    vi.resetModules();
    const { default: Home } = await import("@/app/page");
    const page = Home as unknown as () => Promise<React.ReactNode>;
    render(<>{await page()}</>);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const section = await screen.findByTestId("ask-copper");
    const chat = within(section);
    fireEvent.change(chat.getByRole("textbox"), {
      target: { value: "annual refund" },
    });
    fireEvent.click(chat.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(chat.getByText(/refundable within 30 days/)).toBeInTheDocument(),
    );

    const card = section.querySelector<HTMLElement>(
      '[data-tool="search_docs"]',
    )!;
    expect(card).toBeTruthy();
    const items = within(card).getAllByTestId("doc-passage");
    expect(items).toHaveLength(5);
    const first = within(items[0]).getByRole("link", {
      name: `${FAQ}, page 5`,
    });
    expect(first).toHaveAttribute("href", "/docs/copper-plus-faq.pdf#page=5");
    expect(first).toHaveAttribute("target", "_blank");
    expect(items[0].textContent).toContain("Annual plans get a full refund");
  });
});
