import { it, expect, vi } from "vitest";
import { TuiMainScreen } from "@earendil-works/pi-tui";
import { attachHistoryShortcut } from "../src/editor-shortcut.ts";

it("only composer input opens history, preserving dialog/overlay arrow ownership", () => {
  const open = vi.fn(() => true);
  const original = vi.fn();
  const editor = { invalidate: vi.fn(), render: () => [], handleInput: original };
  attachHistoryShortcut(editor, open);
  const dialog = { invalidate: vi.fn(), render: () => [], handleInput: vi.fn() };
  const tui = new TuiMainScreen({ columns: 100, rows: 30, write: vi.fn(), hideCursor: vi.fn(), showCursor: vi.fn() } as any);
  vi.spyOn(tui, "requestRender").mockImplementation(() => {});
  // Exercise real TUI focus routing rather than invoking the shortcut directly.
  const input = (data: string) => (tui as any).handleTerminalInput(data);
  tui.setFocus(dialog);
  input("\x1b[D"); input("\x1b[C");
  expect(dialog.handleInput).toHaveBeenCalledTimes(2);
  expect(open).not.toHaveBeenCalled();
  tui.setFocus(editor);
  input("\x1b[D");
  expect(open).toHaveBeenCalledTimes(1);
  expect(original).not.toHaveBeenCalled();
  input("\x1b[C");
  expect(original).toHaveBeenCalledWith("\x1b[C");
  const overlay = tui.showOverlay(dialog);
  input("\x1b[D");
  expect(open).toHaveBeenCalledTimes(1);
  expect(dialog.handleInput).toHaveBeenCalledTimes(3);
  overlay.hide();
});
it("forwards autocomplete and blocked composer keys, retaining editor identity and this", () => {
  const open = vi.fn(() => false);
  const editor = { showing: true, count: 0, isShowingAutocomplete() { return this.showing; }, handleInput(_data: string) { this.count++; } };
  expect(attachHistoryShortcut(editor, open)).toBe(editor);
  attachHistoryShortcut(editor, open);
  editor.handleInput("\x1b[D");
  expect(open).not.toHaveBeenCalled();
  editor.showing = false;
  editor.handleInput("\x1b[D");
  expect(open).toHaveBeenCalledTimes(1);
  expect(editor.count).toBe(2);
});
