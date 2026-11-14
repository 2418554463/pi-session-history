import { Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type Focusable } from "@earendil-works/pi-tui";
import { clean } from "./model.ts";
export type TaskStatus = "Needs you" | "Working" | "Ready" | "Inactive";
export interface CenterTask {
  id: string; title: string; cwd: string; project: string; model: string;
  status: TaskStatus; modified: Date; preview: string; reasoning?: string; pinned?: boolean; current?: boolean;
  sessionFile?: string; workerId?: string;
}
export type CenterAction = "open" | "new" | "worktree" | "fork" | "rename" | "stop" | "archive" | "delete" | "hide" | "pin";
export interface CenterTheme { fg(color: any, text: string): string; bg(color: any, text: string): string; bold(text: string): string }
const filters = ["All", "Needs you", "Working", "Ready", "Inactive"];
const groups = ["Project", "Directory", "Status", "Model"];
const pad = (text: string, width: number) => {
  const clipped = truncateToWidth(text, Math.max(0, width));
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
};

/** Geometry and action bindings follow Codex rust-v0.167.2 agent_center/. */
export class CommandCenter implements Component, Focusable {
  input = new Input();
  searching = false; help = false; filter = 0; grouping = 0; selected?: string;
  notice = ""; busy = false; scroll = 0;
  private height = 24;
  private detailId?: string;
  constructor(public tasks: CenterTask[], private theme: CenterTheme,
    private repaint: () => void, private action: (action: CenterAction, task?: CenterTask) => Promise<void>,
    private done: () => void, private terminalRows: () => number,
    private options: { fullHeight?: boolean; actions?: CenterAction[]; onSelection?: (task: CenterTask) => void } = {}) {
    this.selected = this.visible()[0]?.id;
  }
  get focused() { return this.searching && this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }
  update(tasks: CenterTask[]) {
    this.tasks = tasks;
    if (!this.visible().some(task => task.id === this.selected)) this.selected = this.visible()[0]?.id;
    this.repaint();
  }
  visible() {
    const words = this.input.getValue().toLowerCase().split(/\s+/).filter(Boolean);
    return this.tasks.filter(task => (this.filter === 0 || task.status === filters[this.filter]) &&
      words.every(word => `${task.title} ${task.cwd} ${task.preview}`.toLowerCase().includes(word)))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) ||
        this.group(a).localeCompare(this.group(b)) || b.modified.getTime() - a.modified.getTime());
  }
  group(task: CenterTask) {
    if (task.pinned) return "Pinned";
    return [task.project, task.cwd, task.status, task.model][this.grouping]!;
  }
  async invoke(action: CenterAction) {
    if (this.busy) return;
    if (this.options.actions && !this.options.actions.includes(action)) {
      this.notice = "This action is not enabled in the saved-session view"; this.repaint(); return;
    }
    this.busy = true; this.notice = ""; this.repaint();
    try { await this.action(action, this.tasks.find(task => task.id === this.selected)); }
    catch (error) { this.notice = String(error); }
    finally { this.busy = false; this.repaint(); }
  }
  handleInput(data: string) {
    if (this.searching) {
      if (matchesKey(data, "escape") || matchesKey(data, "enter")) this.searching = false;
      else { this.input.handleInput(data); this.selected = this.visible()[0]?.id; this.scroll = 0; }
      this.repaint(); return;
    }
    if (matchesKey(data, "escape") || matchesKey(data, "right")) {
      if (this.help) this.help = false; else this.done(); this.repaint(); return;
    }
    if (data === "?") { this.help = !this.help; this.repaint(); return; }
    if (this.help) return;
    if (matchesKey(data, "tab") || matchesKey(data, "shift+tab")) {
      this.filter = (this.filter + (matchesKey(data, "shift+tab") ? 4 : 1)) % filters.length;
      this.selected = this.visible()[0]?.id; this.scroll = 0;
    } else if (data === "g") {
      this.grouping = (this.grouping + 1) % groups.length; this.scroll = 0;
    } else if (data === "/" || matchesKey(data, "f3")) { this.searching = true; this.input.focused = true; }
    else if (matchesKey(data, "up") || matchesKey(data, "down") || matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
      const rows = this.visible(); const index = rows.findIndex(task => task.id === this.selected);
      const backwards = matchesKey(data, "up") || matchesKey(data, "pageUp");
      const step = matchesKey(data, "pageUp") || matchesKey(data, "pageDown") ? Math.max(1, this.height - 7) : 1;
      this.selected = rows[Math.max(0, Math.min(rows.length - 1, index + (backwards ? -step : step)))]?.id;
    } else {
      const action: CenterAction | undefined = matchesKey(data, "enter") || data === "o" ? "open"
        : matchesKey(data, "backspace") ? "delete" : ({ n: "new", w: "worktree", f: "fork", r: "rename", x: "stop", a: "archive", h: "hide", p: "pin" } as Record<string, CenterAction>)[data];
      if (action) void this.invoke(action);
    }
    this.repaint();
  }
  render(width: number): string[] {
    this.height = Math.max(6, this.options.fullHeight ? this.terminalRows() : Math.min(24, this.terminalRows() - 2));
    const inner = Math.max(1, width - 4), wide = inner >= 90;
    const listWidth = wide ? inner - 41 : inner;
    const title = this.theme.bold("Agent command center") + this.theme.fg("dim", `  Group: ${groups[this.grouping]}  g`);
    const tabs = filters.map((label, i) => {
      const count = this.tasks.filter(task => i === 0 || task.status === label).length;
      const text = ` ${label} ${count} `;
      return i === this.filter ? this.theme.bg("selectedBg", this.theme.fg("accent", text)) : this.theme.fg("dim", text);
    }).join(" ");
    const lines = ["  " + truncateToWidth(title, inner), "  " + truncateToWidth(tabs, inner), "  " + this.theme.fg("dim", "─".repeat(inner))];
    const bodyHeight = this.height - 4;
    if (this.help) {
      const help = this.options.actions ? ["Task shortcuts", "", "Navigate", "↑/↓ Up/Down    Enter/o Resume    PgUp/PgDn Page", "", "Tasks", "p Pin/unpin", "", "View", "Tab/Shift+Tab Filter    / or F3 Search    g Group", "? Help    Esc Back", "", "Restoring uses the saved session directory automatically."] : ["Task shortcuts", "", "Navigate", "↑/↓ Up/Down    Enter Open    PgUp/PgDn Page", "", "Tasks",
        "n New    w New worktree    o Resume    f Fork", "r Rename    x Stop    a Archive    h Hide", "Backspace Delete    p Pin/unpin", "", "View", "Tab/Shift+Tab Filter    / or F3 Search    g Group", "? Help    Esc Back"];
      for (let row = 0; row < bodyHeight; row++) lines.push("  " + truncateToWidth(help[row] ?? "", inner));
    } else {
      const visible = this.visible();
      const entries: { text: string; task?: CenterTask }[] = [];
      const fixedRows: string[] = [];
      if (this.searching || this.input.getValue()) fixedRows.push(this.theme.fg("accent", "Search › ") + this.input.render(Math.max(1, listWidth - 9))[0]);
      fixedRows.push(this.theme.fg("dim", listWidth >= 56 ? pad("    Tasks", listWidth - 24) + "  " + pad("Status", 11) + "Updated".padStart(11) : "    Tasks"));
      const viewportHeight = Math.max(1, bodyHeight - fixedRows.length - 1);
      let lastGroup: string | undefined;
      for (const task of visible) {
        const group = this.group(task);
        if (group !== lastGroup) { entries.push({ text: this.theme.fg("dim", `${clean(group)}  ${visible.filter(t => this.group(t) === group).length}`) }); lastGroup = group; }
        const metadata = listWidth >= 56 ? 24 : 0;
        const age = relativeAge(task.modified);
        entries.push({ task, text: pad(`${task.id === this.selected ? "›" : " "} ${task.status === "Working" ? "●" : "○"} ${clean(task.title)}`, listWidth - metadata) +
          (metadata ? `  ${pad(task.status, 11)}${age.padStart(11)}` : "") });
      }
      if (!visible.length) entries.push({ text: this.theme.fg("dim", this.tasks.length ? "No matching tasks" : "No tasks yet") });
      const selection = entries.findIndex(entry => entry.task?.id === this.selected);
      if (selection < this.scroll) this.scroll = Math.max(0, selection);
      if (selection >= this.scroll + viewportHeight) this.scroll = selection - viewportHeight + 1;
      this.scroll = Math.max(0, Math.min(this.scroll, entries.length - viewportHeight));
      const chosen = this.tasks.find(task => task.id === this.selected);
      if (chosen && this.detailId !== chosen.id) {
        this.detailId = chosen.id;
        queueMicrotask(() => this.options.onSelection?.(chosen));
      }
      const details = chosen ? [this.theme.bold("Task details"), "", this.theme.bold(clean(chosen.title)), `○ ${chosen.status}`, "", `Model: ${clean(chosen.model)}`, `Reasoning: ${clean(chosen.reasoning ?? "—")}`, "", "Project", ...wrapTextWithAnsi(clean(chosen.cwd), 38), "", "Prompt", ...wrapTextWithAnsi(clean(chosen.preview || "No prompt available."), 38)] : [];
      for (let row = 0; row < bodyHeight; row++) {
        const offset = row - fixedRows.length;
        const entry = offset >= 0 && offset < viewportHeight ? entries[this.scroll + offset] : undefined;
        let left = pad(row < fixedRows.length ? fixedRows[row]! : entry?.text ?? "", listWidth);
        if (entry?.task?.id === this.selected) left = this.theme.bg("selectedBg", left);
        lines.push("  " + left + (wide ? this.theme.fg("dim", " │ ") + pad(details[row] ?? "", 38) : ""));
      }
    }
    lines.push("  " + this.theme.fg(this.notice ? "warning" : "dim", this.notice || (this.busy ? "Working…" : (this.options.actions ? "? help  Esc back  ↑/↓ move  Enter resume  p pin  / search" : "? help  Esc back  ↑/↓ move  Enter open  n new  / search"))));
    return lines.map(line => truncateToWidth(line, width));
  }
  invalidate() { this.input.invalidate(); }
}
export function relativeAge(date: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  return seconds < 60 ? "now" : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
}
