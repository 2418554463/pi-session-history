import { it, expect, vi } from "vitest";
import { homedir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { codexTheme, displayDirectory, identityColor } from "../src/codex-style.ts";
import { CommandCenter, type CenterTask } from "../src/command-center.ts";
const base = { fg: (_: string, text: string) => text, bg: (_: string, text: string) => text, bold: (text: string) => text };
const tasks: CenterTask[] = Array.from({ length: 31 }, (_, i) => ({ id: String(i), title: `Task ${i}`, cwd: homedir() + `/project-${i % 3}`, project: homedir() + `/project-${i % 3}`, status: "Inactive", model: "test", modified: new Date(1000 * i), preview: i === 0 ? "uniquefind" : "" }));
it("uses Codex's blue selection instead of the user's gray selectedBg", () => {
  const center = new CommandCenter(tasks, codexTheme(base), vi.fn(), vi.fn(), vi.fn(), () => 36, { fullHeight: true, pageSize: 10 });
  const lines = center.render(120);
  expect(lines.join("\n")).toContain("48;2;99;168;248");
  expect(lines.join("\n")).toContain("38;2;");
  expect(lines.every(line => visibleWidth(line) <= 120)).toBe(true);
  const plain = lines.map(stripVTControlCharacters);
  expect(plain.join("\n")).toContain("~/project-");
  expect(plain.map(line => line.split("│")[0]).join("\n")).not.toContain(homedir() + "/project-");
  expect(plain.some((line, i) => line.split("│")[0]?.trim() === "" && plain[i + 1]?.includes("~/project-"))).toBe(true);
});
it("loads ten recent items, supports Show more, and searches beyond that page", async () => {
  const action = vi.fn();
  const center = new CommandCenter(tasks, base, vi.fn(), action, vi.fn(), () => 36, { pageSize: 10 });
  expect(center.visible()).toHaveLength(10);
  expect(center.visible().some(task => task.id === "0")).toBe(false);
  center.selected = center.visible().at(-1)!.id;
  center.handleInput("\x1b[B");
  center.update(tasks); // A late metadata response must not move off Show more.
  await center.invoke("open");
  expect(center.visible()).toHaveLength(20);
  expect(action).not.toHaveBeenCalled();
  center.input.setValue("uniquefind");
  expect(center.visible().map(task => task.id)).toEqual(["0"]);
  expect(center.hasMore()).toBe(false);
});
it("keeps identity colors stable and abbreviates only the actual home prefix", () => {
  expect(identityColor("fixed-id")).toBe(identityColor("fixed-id"));
  expect(displayDirectory(homedir())).toBe("~");
  expect(displayDirectory(homedir() + "-another/project")).not.toMatch(/^~/);
  expect(visibleWidth(displayDirectory("/root/" + "长路径/".repeat(40), 32))).toBeLessThanOrEqual(32);
});
