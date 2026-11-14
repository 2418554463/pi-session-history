import { open } from "node:fs/promises";
/** Optional metadata: never instantiate or mutate another session runtime. */
export async function sessionDetails(path: string): Promise<{ model?: string; reasoning?: string }> {
  const handle = await open(path, "r");
  try {
    if ((await handle.stat()).size > 16 * 1024 * 1024) return {};
    const details: { model?: string; reasoning?: string } = {};
    for (const line of (await handle.readFile("utf8")).split("\n")) {
      // Skip message/image payloads rather than parsing them into memory again.
      if (!/"type"\s*:\s*"(?:model_change|thinking_level_change)"/.test(line)) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "model_change" && typeof entry.modelId === "string") details.model = entry.modelId;
        if (entry.type === "thinking_level_change" && typeof entry.thinkingLevel === "string") details.reasoning = entry.thinkingLevel;
      } catch { /* A partially written final line is not a reason to hide history. */ }
    }
    return details;
  } finally { await handle.close(); }
}
