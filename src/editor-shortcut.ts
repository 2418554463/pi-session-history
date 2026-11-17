import { matchesKey } from "@earendil-works/pi-tui";

interface ShortcutEditor {
  handleInput(data: string): void;
  isShowingAutocomplete?(): boolean;
}
const wrapped = new WeakSet<ShortcutEditor>();
/** Attach only to the composer: dialogs/overlays never route their keys here.
 * Preserve the actual editor instance, including image paste and custom methods. */
export function attachHistoryShortcut<T extends ShortcutEditor>(editor: T, open: () => boolean): T {
  if (wrapped.has(editor)) return editor;
  wrapped.add(editor);
  const original = editor.handleInput;
  editor.handleInput = function (data) {
    if (matchesKey(data, "left") && !this.isShowingAutocomplete?.() && open()) return;
    original.call(this, data);
  };
  return editor;
}
