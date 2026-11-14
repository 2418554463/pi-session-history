# pi-session-history

A Codex-style project/session overview for Pi. Start Pi from **any directory**, press **← on an empty composer**, and resume an old session in **its own working directory** automatically.

## Install

Requires Pi 1.5.0+.

```sh
pi install git:github.com/2418554463/pi-session-history
```

Run `/reload`. Local checkout: `pi install /absolute/path/to/pi-session-history`.

## Overview

The screen follows Codex CLI 0.167.2's agent command center: header, status tabs, horizontal separator, grouped task rows, selected-row highlight and footer. It fills the terminal. At 94 columns or wider (90-column body), the right-hand 38-column details pane appears with a 3-column separator. Narrow terminals hide details.

Visual styling is scoped to this screen rather than inherited from Pi's selection background: blue `#63A8F8` with bold black selected text, a gray active tab, and stable FNV-1a identity colors from the default Codex dark theme's Catppuccin Mocha accent family. Project groups have a blank line between them. Home paths use `~`; long group paths are center-truncated to at most 64 cells. The current session and pinned items stay visible alongside the ten most recent unpinned saved sessions; `Show more` expands by ten. Search always covers all saved sessions, including unloaded pages.

- **←** on an empty idle composer, or `/session-history`: open.
- **↑/↓**, **PgUp/PgDn**: select.
- **Enter / o**: resume in the selected session's recorded directory, without a manual `cd` or a directory prompt.
- **/ / F3**: search names, prompts and directories; Enter leaves search mode.
- **Tab / Shift+Tab**: cycle status filters.
- **g**: cycle Project / Directory / Status / Model grouping.
- **p**: pin/unpin; pins persist under the agent configuration directory.
- **?**: help. **Esc / →**: back.

Resuming uses Pi's native `ctx.switchSession(path)`. Pi rebuilds the target workspace's services and built-in tool paths. This changes Pi's working directory, **not the directory of the parent shell**. Missing/deleted session directories produce an error rather than silently using the launch directory. The current session is included; selecting it closes the overview without reloading it.

## Honest scope

This release connects the **saved-session overview and cross-directory resume**. It is not complete functional parity with Codex's daemon-backed task manager:

- Current session is Ready; other saved sessions are Inactive **in this view**, not evidence that no other Pi process is using them. External processes are not monitored.
- Project and Directory currently both use the recorded cwd; worktree-root collapsing is not implemented.
- Model/reasoning metadata loads lazily from the selected session. Missing, unreadable, or >16 MiB files show `—` rather than guessed values.
- New/worktree/fork/rename/stop/archive/delete are not enabled or advertised as working actions in the installed view.
- Background-service and RPC-worker modules are development scaffolding, **not auto-started** by this release. Switching away from an actively running foreground task is not implemented; the idle guard remains.

No Pi-core changes or global CLI replacement are needed for cross-directory resume. The extension does not replace the editor and works alongside pi-image-preview. A nonempty draft requires confirmation before replacement. Standard UI prompts suppress the Left shortcut; custom screens from other extensions may need shortcut coordination.

## Development

```sh
npm install
npm run check
npm test
```

The UI was implemented after inspecting upstream `rust-v0.167.2` sources in `codex-rs/tui/src/app/agent_center/`. Automated tests cover layout breakpoints, keyboard navigation, filtering, pins, metadata, native command dispatch and the experimental service's ownership/authentication. A real Pi RPC smoke test additionally verified `bash pwd` changes from launch directory A to restored directory B without sending a model request. Visual parity still needs manual checking in a terminal.
