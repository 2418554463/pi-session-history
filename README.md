# pi-session-history

Codex-inspired history navigation for Pi: press **← in an empty input box** to open a searchable list of saved sessions.

## Install

Requires Pi **1.5.0+**.

```sh
pi install git:github.com/2418554463/pi-session-history
```

Run `/reload`. Local development: `npm install`, then `pi install /absolute/path/to/pi-session-history`.

## Keys

- Empty composer + `←`: open history. Nonempty drafts retain normal cursor movement.
- `/session-history`: also opens the list.
- Type: search session names, first messages and project paths (multiple search terms supported).
- `↑` / `↓`: select; Enter: resume.
- Tab: switch between all projects and the current project.
- Esc / `→`: close without switching.

The list shows date, message count and project path; the selected session's first message appears below. Most recently modified sessions come first. The current session is omitted. This is saved-session history, not an overview of live subagents or a background-session scheduler.

## Safety and compatibility

Uses Pi's `SessionManager` and command-context `switchSession()`; it does not rewrite session files. It does not replace the editor or add a footer/widget, so it coexists with the image-preview extension. Session switching is disabled while an agent task is active, and a nonempty draft requires confirmation. Standard UI prompt events suppress the shortcut while dialogs are active. Other extensions' custom screens that do not emit these events may need shortcut coordination; `/session-history` remains an alternative entry point.

Codex's empty-prompt trigger was researched in [agents_navigation.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/chat_composer/agents_navigation.rs); this plugin is an independent Pi implementation.

## Development

```sh
npm install
npm run check
npm test
```

Tests cover activation guards, command dispatch, draft preservation, search/project filtering, session selection, cancellation, narrow rendering and cleanup. Real terminal behavior and session replacement need manual verification after installation.
