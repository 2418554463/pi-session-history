import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Input, SelectList, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { canOpen, clean, filterSessions } from "./model.ts";

export default function sessionHistory(pi: ExtensionAPI) {
  let opening = false;
  let blocked = 0;
  let unsubscribe: (() => void) | undefined;
  pi.on("ui_prompt_start", () => { blocked++; });
  pi.on("ui_prompt_end", () => { blocked = Math.max(0, blocked - 1); });
  pi.on("session_start", (_event, ctx) => {
    opening = false; blocked = 0; unsubscribe?.();
    if (!ctx.hasUI || ("mode" in ctx && ctx.mode !== "tui")) return;
    unsubscribe = ctx.ui.onTerminalInput(data => {
      if (!matchesKey(data, "left") || !canOpen(ctx.ui.getEditorText(), ctx.isIdle(), blocked > 0, opening)) return;
      opening = true;
      // Dispatch through a command to obtain a command context for switchSession.
      queueMicrotask(() => {
        try { pi.sendUserMessage("/session-history", { expandPromptTemplates: true }); }
        catch (error) { opening = false; ctx.ui.notify(String(error), "error"); }
      });
      return { consume: true };
    });
  });
  pi.on("session_shutdown", () => { unsubscribe?.(); unsubscribe = undefined; opening = false; });

  pi.registerCommand("session-history", {
    description: "Search and resume history (empty input: ←)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || ("mode" in ctx && ctx.mode !== "tui")) return;
      if (!ctx.isIdle()) { opening = false; ctx.ui.notify("Wait for the current task before switching sessions", "warning"); return; }
      opening = true;
      try {
        const current = ctx.sessionManager.getSessionFile();
        const sessions = (await SessionManager.listAll()).filter(s => s.path !== current);
        if (!sessions.length) { ctx.ui.notify("No other saved sessions", "info"); return; }
        const selected = await ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
          const input = new Input();
          let localOnly = false;
          const makeList = () => {
            const rows = filterSessions(sessions, input.getValue(), localOnly ? ctx.cwd : undefined);
            const list = new SelectList(rows.map(s => ({ value: s.path,
              label: clean(s.name || s.firstMessage || "Untitled session"),
              description: `${s.modified.toLocaleDateString()} · ${s.messageCount} messages · ${clean(s.cwd)}`,
            })), Math.max(1, Math.min(9, tui.terminal.rows - 12)), {
              selectedPrefix: t => theme.fg("accent", t), selectedText: t => theme.fg("accent", t),
              description: t => theme.fg("muted", t), scrollInfo: t => theme.fg("dim", t),
              noMatch: t => theme.fg("muted", t),
            });
            list.onSelect = item => done(item.value);
            list.onCancel = () => done(undefined);
            return list;
          };
          let list = makeList();
          return {
            get focused() { return input.focused; },
            set focused(value: boolean) { input.focused = value; },
            render(width: number) {
              const chosen = sessions.find(s => s.path === list.getSelectedItem()?.value);
              return [theme.fg("accent", "Session history"),
                theme.fg("dim", `${localOnly ? "Current project" : "All projects"} · Tab changes scope · type to search`),
                ...input.render(width), ...list.render(width),
                theme.fg("border", "─".repeat(width)),
                ...wrapTextWithAnsi(clean(chosen?.firstMessage ?? "No matching sessions"), Math.max(1, width)).slice(0, 3),
                theme.fg("dim", "↑↓ select · Enter resume · Esc/→ close"),
              ].map(line => truncateToWidth(line, width));
            },
            handleInput(data: string) {
              if (matchesKey(data, "escape") || matchesKey(data, "right")) { done(undefined); return; }
              if (matchesKey(data, "tab")) { localOnly = !localOnly; list = makeList(); }
              else if (keys.matches(data, "tui.select.up") || keys.matches(data, "tui.select.down") ||
                keys.matches(data, "tui.select.confirm") || matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) list.handleInput(data);
              else { input.handleInput(data); list = makeList(); }
              tui.requestRender();
            },
            invalidate() { input.invalidate(); list.invalidate(); },
          };
        });
        if (!selected) return;
        if (ctx.ui.getEditorText() && !await ctx.ui.confirm("Switch session?", "The current draft will be replaced.")) return;
        await ctx.switchSession(selected);
        return;
      } catch (error) { ctx.ui.notify(`Session history: ${String(error)}`, "error"); }
      finally { opening = false; }
    },
  });
}
