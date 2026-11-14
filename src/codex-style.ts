import { homedir } from "node:os";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CenterTheme } from "./command-center.ts";
// Codex rust-v0.167.2: ChatGPT Blue 200 selection and Catppuccin Mocha accents.
const accents = ["f5e0dc", "f2cdcd", "f5c2e7", "cba6f7", "f38ba8", "eba0ac", "fab387", "f9e2af", "a6e3a1", "94e2d5", "89dceb", "74c7ec", "89b4fa", "b4befe"];
export function identityColor(id: string) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(id)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  const hex = accents[Number(hash % BigInt(accents.length))]!;
  return `${parseInt(hex.slice(0, 2), 16)};${parseInt(hex.slice(2, 4), 16)};${parseInt(hex.slice(4), 16)}`;
}
export function codexTheme(base: CenterTheme): CenterTheme {
  return {
    fg: (color, text) => color === "dim" || color === "muted" ? `\x1b[2m${text}\x1b[22m` : base.fg(color, text),
    bg: (color, text) => base.bg(color, text), bold: text => `\x1b[1m${text}\x1b[22m`,
    identity: (id, text) => `\x1b[38;2;${identityColor(id)}m${text}\x1b[39m`,
    selection: text => `\x1b[1;38;2;0;0;0;48;2;99;168;248m${text}\x1b[0m`,
    activeTab: text => `\x1b[1;38;2;255;255;255;48;2;76;76;76m${text}\x1b[0m`,
  };
}
export function displayDirectory(path: string, maxWidth = 64) {
  const home = homedir();
  let label = path === home ? "~" : path.startsWith(home + "/") ? "~" + path.slice(home.length) : path;
  if (visibleWidth(label) <= maxWidth) return label;
  if (maxWidth < 3) return truncateToWidth(label, maxWidth);
  const left = Math.floor((maxWidth - 1) / 2), right = maxWidth - left - 1;
  let suffix = "";
  for (const char of [...label].reverse()) { if (visibleWidth(char + suffix) > right) break; suffix = char + suffix; }
  return truncateToWidth(label, left, "") + "…" + suffix;
}
