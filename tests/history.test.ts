import { it, expect, vi } from "vitest";
vi.mock("@earendil-works/pi-coding-agent", () => ({ SessionManager: { listAll: vi.fn() } }));
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import extension from "../src/index.ts";
import { canOpen, clean, filterSessions } from "../src/model.ts";
const sessions = [
  { path: "/s/one", id: "1", cwd: "/a", name: "Older", firstMessage: "修复图片 bug", modified: new Date(1), messageCount: 4 },
  { path: "/s/two", id: "2", cwd: "/b", name: "Recent", firstMessage: "write tests", modified: new Date(2), messageCount: 6 },
] as any;
function setup() {
  const handlers = new Map<string, Function>();
  let draft = ""; let idle = true;
  const editor = { handleInput: vi.fn(), isShowingAutocomplete: () => false };
  let factory: any = () => editor;
  const pi = { on: (key: string, fn: Function) => handlers.set(key, fn),
    registerCommand: vi.fn(), sendUserMessage: vi.fn() };
  extension(pi as any);
  const ctx = { mode: "tui", hasUI: true, cwd: "/a", isIdle: () => idle,
    sessionManager: { getSessionFile: () => "/s/current" },
    switchSession: vi.fn(),
    ui: { notify: vi.fn(), getEditorText: () => draft,
      getEditorComponent: () => factory,
      setEditorComponent: vi.fn((next: any) => { factory = next; next({}, {}, {}); }), confirm: vi.fn().mockResolvedValue(false),
      onTerminalInput: vi.fn(),
      custom: vi.fn().mockResolvedValue(undefined),
    },
  };
  handlers.get("session_start")!({}, ctx);
  vi.mocked(SessionManager.listAll).mockResolvedValue(sessions);
  return { pi, ctx, handlers, editor, input: (data: string) => editor.handleInput(data),
    draft: (text: string) => { draft = text; }, busy: () => { idle = false; },
    command: () => pi.registerCommand.mock.calls[0][1].handler("", ctx),
  };
}
it("only allows opening from a completely empty, idle, unblocked composer", () => {
  expect(canOpen("", true, false, false)).toBe(true);
  expect(canOpen(" ", true, false, false)).toBe(false);
  expect(canOpen("", false, false, false)).toBe(false);
  expect(canOpen("", true, true, false)).toBe(false);
  expect(canOpen("", true, false, true)).toBe(false);
});
it("left consumes once and dispatches a command without replacing the editor", async () => {
  const s = setup(); expect(s.input("\x1b[D")).toBeUndefined();
  expect(s.input("\x1b[D")).toBeUndefined();
  await Promise.resolve();
  expect(s.pi.sendUserMessage).toHaveBeenCalledWith("/session-history", { expandPromptTemplates: true });
  expect(s.pi.sendUserMessage).toHaveBeenCalledTimes(1);
  expect(s.ctx.ui.onTerminalInput).not.toHaveBeenCalled();
  expect(s.ctx.ui.getEditorComponent()({}, {}, {})).toBe(s.editor);
});
it("does not intercept text editing, modified arrows, active tasks or dialogs", () => {
  const s = setup(); s.draft("text"); expect(s.input("\x1b[D")).toBeUndefined();
  s.draft(""); expect(s.input("\x1b[1;5D")).toBeUndefined();
  s.handlers.get("ui_prompt_start")!(); expect(s.input("\x1b[D")).toBeUndefined();
  s.handlers.get("ui_prompt_end")!(); s.busy(); expect(s.input("\x1b[D")).toBeUndefined();
});
it("filters multiple terms, supports project scope and sorts by recency", () => {
  expect(filterSessions(sessions, "").map(s => s.id)).toEqual(["2", "1"]);
  expect(filterSessions(sessions, "图片 bug").map(s => s.id)).toEqual(["1"]);
  expect(filterSessions(sessions, "", "/a").map(s => s.id)).toEqual(["1"]);
  expect(clean("a\x1b\n b")).not.toContain("\x1b");
});
it("cancel does not switch, selecting a session uses the command context", async () => {
  const s = setup(); await s.command(); expect(s.ctx.switchSession).not.toHaveBeenCalled();
  s.ctx.ui.custom.mockResolvedValue("/s/two" as any); await s.command();
  expect(s.ctx.switchSession).toHaveBeenCalledWith("/s/two");
});
it("asks before replacing a nonempty draft", async () => {
  const s = setup(); s.draft("unsent"); s.ctx.ui.custom.mockResolvedValue("/s/two" as any);
  await s.command(); expect(s.ctx.ui.confirm).toHaveBeenCalled(); expect(s.ctx.switchSession).not.toHaveBeenCalled();
});
it("renders narrow widths, searches and closes through the component", async () => {
  const s = setup(); let component: any; const done = vi.fn();
  s.ctx.ui.custom.mockImplementation((factory: any) => {
    component = factory({ requestRender: vi.fn(), terminal: { rows: 30 } },
      { fg: (_: string, text: string) => text, bg: (_: string, text: string) => text, bold: (text: string) => text },
      { matches: (data: string, key: string) => matchesKey(data, ({
        "tui.select.up": "up", "tui.select.down": "down", "tui.select.confirm": "enter",
      } as any)[key]) }, done);
    return Promise.resolve(undefined);
  });
  await s.command(); component.focused = true;
  expect(component.render(12).every((line: string) => visibleWidth(line) <= 12)).toBe(true);
  component.handleInput("/"); component.handleInput("图"); component.handleInput("\r"); component.handleInput("\r");
  expect(done).toHaveBeenCalledWith("/s/one");
  component.handleInput("\x1b"); expect(done).toHaveBeenCalledWith(undefined);
});
it("session reinitialization does not stack shortcut wrappers", async () => {
  const s = setup();
  s.handlers.get("session_start")!({}, s.ctx);
  s.input("\x1b[D"); await Promise.resolve();
  expect(s.pi.sendUserMessage).toHaveBeenCalledTimes(1);
  expect(s.ctx.ui.setEditorComponent).toHaveBeenCalledTimes(1);
});
