# Codex command-center parity contract

Target: local `codex-cli 0.167.2`, upstream tag `rust-v0.167.2`.

## Clarified priority (user screenshots)

From any launch directory, show sessions across projects and resume the selected
session using its recorded working directory automatically. Do not require a
manual `cd`. Pi 1.5.0 already supports this via `ctx.switchSession(path)`:
AgentSessionRuntime recreates cwd-bound services from SessionManager.getCwd().
A real RPC smoke test verified `bash pwd` changes from launch to target cwd after
switch_session, with no model call. This capability does not require a core fork.
Foreground-task backgrounding is a separate, unimplemented capability; do not
conflate it with cross-directory resume or replace the global Pi for the latter.
Reference sources:
- `codex-rs/tui/src/app/agent_center/{render,rows,input,hints,navigation}.rs`
- `codex-rs/tui/src/app/agents_overview{,_details,_actions,_grouping}.rs`

## Required layout

- Header 3 rows: `Agent command center  Group: ...`, status tabs, horizontal rule.
- Desired height 24 rows, 2-column horizontal inset.
- At body width >=90, list (minimum 46 columns), 3-column divider, 38-column details pane.
- Narrow mode omits details pane; one-row footer stays visible.
- Tabs: All, Needs you, Working, Ready, Inactive; counts from real task state.
- Group modes: Project, Directory, Status, Model.
- Metadata editing uses one list row (`Search › ` / `Rename › `).
- Help and configurable action hints, stable selection and viewport on refresh.

## Required behavior

Open/resume, new task, worktree task, fork, rename, stop, archive, hide, delete,
pin/unpin, search, grouping, status filters, pagination and selection preservation.
Deletion must be confirmed. Current or externally owned live sessions must not be
modified by the daemon. Never infer live state from file modification times.

## Backend

User approved a persistent background service. Use a loopback-only authenticated
API and RPC workers. Tokens and state must be owner-only. Only service-owned
processes can be stopped. Do not send model prompts before explicit user action.
RPC extension UI requests must be surfaced rather than automatically approved.
Use `agent_settled`, not `agent_end`, as the completion boundary.

Pi-native foreground session detachment and background ownership transfer need
explicit design: opening the same session in both a TUI and RPC worker is not
safe. Codex-only provider/application details must not be fabricated.

## Current state

The native entry point now uses CommandCenter for a full-terminal saved-session
overview, with cross-project resume using the session directory, persistent pins,
status tabs, grouping, search and lazy model/reasoning details. Experimental RPC
service modules are tested but not connected or auto-started. Complete task
management/foreground detachment and visual parity remain unverified; see README
for the explicitly supported subset. No Pi core fork has been created or installed.
