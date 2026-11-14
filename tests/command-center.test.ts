import { it, expect, vi } from "vitest";
import { CommandCenter, type CenterTask } from "../src/command-center.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
const theme = { fg: (_: any, text: string) => text, bg: (_: any, text: string) => text, bold: (text: string) => text };
const tasks: CenterTask[] = [
  { id: "1", title: "修复图片预览", cwd: "/project/a", project: "/project", model: "model-a", status: "Ready", modified: new Date(), preview: "完整消息预览" },
  { id: "2", title: "Background", cwd: "/project/b", project: "/project", model: "model-b", status: "Working", modified: new Date(), preview: "Running" },
];
function panel() {
  const action = vi.fn().mockResolvedValue(undefined), done = vi.fn();
  return { center: new CommandCenter(tasks, theme, vi.fn(), action, done, () => 40), action, done };
}
it("matches Codex header, tabs, three-row header and 24-row total", () => {
  const { center } = panel(); const lines = center.render(120);
  expect(lines).toHaveLength(24);
  expect(lines[0]).toContain("Agent command center");
  expect(lines[1]).toContain("Needs you 0"); expect(lines[2]).toContain("─");
  expect(lines.some(line => line.includes(" │ "))).toBe(true);
});
it("uses the exact 90-column body threshold and stays within narrow widths", () => {
  const { center } = panel();
  expect(center.render(94).some(line => line.includes(" │ "))).toBe(true);
  expect(center.render(93).some(line => line.includes(" │ "))).toBe(false);
  for (const width of [1, 8, 30, 80, 94, 120]) expect(center.render(width).every(line => visibleWidth(line) <= width)).toBe(true);
});
it("uses Codex status tabs rather than the original project-scope tab", () => {
  const { center } = panel(); center.handleInput("\t"); expect(center.visible()).toHaveLength(0);
  center.handleInput("\t"); expect(center.visible().map(task => task.id)).toEqual(["2"]);
});
it("supports explicit search mode and stable selection after metadata refresh", () => {
  const { center } = panel(); center.handleInput("/"); center.handleInput("图"); center.handleInput("\r");
  expect(center.visible().map(task => task.id)).toEqual(["1"]);
  center.update([...tasks]); expect(center.selected).toBe("1");
});
it("binds the Codex task actions and does not mistake search input for actions", async () => {
  const { center, action } = panel(); center.handleInput("n"); await Promise.resolve(); await Promise.resolve();
  expect(action).toHaveBeenCalledWith("new", expect.anything());
  center.handleInput("/"); center.handleInput("n"); expect(action).toHaveBeenCalledTimes(1);
});
it("help uses the task shortcuts and escape returns before closing", () => {
  const { center, done } = panel(); center.handleInput("?");
  expect(center.render(120).join("\n")).toContain("Backspace Delete");
  center.handleInput("\x1b"); expect(done).not.toHaveBeenCalled();
  center.handleInput("\x1b"); expect(done).toHaveBeenCalled();
});
it("keeps the Tasks header visible when the current session is at the bottom", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ ...tasks[0]!, id: String(i), title: `Task ${i}` }));
  const center = new CommandCenter(many, theme, vi.fn(), vi.fn(), vi.fn(), () => 30, { fullHeight: true, actions: ["open", "pin"] });
  center.selected = "79";
  const lines = center.render(120);
  expect(lines).toHaveLength(30);
  expect(lines[3]).toContain("Tasks");
  expect(lines.join("\n")).toContain("Task 79");
});
it("does not advertise or execute unimplemented background actions", async () => {
  const action = vi.fn();
  const center = new CommandCenter(tasks, theme, vi.fn(), action, vi.fn(), () => 30, { actions: ["open", "pin"] });
  center.handleInput("n");
  expect(action).not.toHaveBeenCalled();
  center.handleInput("?");
  expect(center.render(120).join("\n")).not.toContain("New worktree");
});
