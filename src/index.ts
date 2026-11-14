import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { canOpen } from "./model.ts";
import { CommandCenter, type CenterTask } from "./command-center.ts";
import { pinKey, readPins, setPinned } from "./pins.ts";
import { join } from "node:path";
import { homedir } from "node:os";
import { sessionDetails } from "./details.ts";

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
        const sessions = await SessionManager.listAll();
        const pinDirectory = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "session-history-pins");
        const pins = await readPins(pinDirectory);
        const tasks: CenterTask[] = sessions.map(s => ({
          id: s.path, sessionFile: s.path, title: s.name || s.firstMessage || "Untitled task",
          cwd: s.cwd || ctx.cwd, project: s.cwd || ctx.cwd, model: s.path === current ? ctx.model?.id ?? "—" : "—",
          status: s.path === current ? "Ready" : "Inactive", current: s.path === current,
          modified: s.modified, preview: s.firstMessage, pinned: pins.has(pinKey(s.path)),
        }));
        if (!tasks.some(task => task.current)) tasks.push({ id: current || "current", sessionFile: current,
          title: ctx.sessionManager.getSessionName?.() || "Untitled task", cwd: ctx.cwd, project: ctx.cwd,
          model: ctx.model?.id ?? "—", status: "Ready", current: true, modified: new Date(), preview: "" });
        const selected = await ctx.ui.custom<string | undefined>((tui, theme, _keys, done) => {
          const center = new CommandCenter(tasks, theme, () => tui.requestRender(), async (action, task) => {
            if (!task) return;
            if (action === "open") { done(task.current ? undefined : task.sessionFile); return; }
            if (action === "pin" && task.sessionFile) {
              await setPinned(pinDirectory, task.sessionFile, !task.pinned);
              task.pinned = !task.pinned; center.update(tasks);
            }
          }, () => done(undefined), () => tui.terminal.rows, { fullHeight: true, actions: ["open", "pin"],
            onSelection: task => {
              if (!task.sessionFile) return;
              void sessionDetails(task.sessionFile).then(details => {
                if (details.model && !task.current) task.model = details.model;
                if (details.reasoning) task.reasoning = details.reasoning;
                if (opening) center.update(tasks);
              }).catch(() => {});
            },
          });
          center.selected = tasks.find(task => task.current)?.id ?? tasks[0]?.id;
          return center;
        }, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left" } });
        if (!selected) return;
        if (ctx.ui.getEditorText() && !await ctx.ui.confirm("Switch session?", "The current draft will be replaced.")) return;
        await ctx.switchSession(selected);
        return;
      } catch (error) { ctx.ui.notify(`Session history: ${String(error)}`, "error"); }
      finally { opening = false; }
    },
  });
}
