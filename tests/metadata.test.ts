import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPins, setPinned, pinKey } from "../src/pins.ts";
import { sessionDetails } from "../src/details.ts";
it("persists independent pins without changing session files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-history-pins-"));
  try {
    expect((await readPins(join(directory, "missing"))).size).toBe(0);
    await setPinned(directory, "/project/a/session.jsonl", true);
    await setPinned(directory, "/project/b/session.jsonl", true);
    expect((await readPins(directory)).has(pinKey("/project/a/session.jsonl"))).toBe(true);
    await setPinned(directory, "/project/a/session.jsonl", false);
    expect((await readPins(directory)).size).toBe(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("reads the last model and reasoning changes without parsing message payloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-history-details-"));
  try {
    const path = join(directory, "session.jsonl");
    await writeFile(path, [
      { type: "model_change", modelId: "old" }, { type: "thinking_level_change", thinkingLevel: "low" },
      { type: "message", message: { content: "ignored" } },
      { type: "model_change", modelId: "new" }, { type: "thinking_level_change", thinkingLevel: "high" },
    ].map(entry => JSON.stringify(entry)).join("\n") + '\n{"type":"model_change",');
    expect(await sessionDetails(path)).toEqual({ model: "new", reasoning: "high" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
