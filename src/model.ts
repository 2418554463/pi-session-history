import type { SessionInfo } from "@earendil-works/pi-coding-agent";
export function canOpen(text: string, idle: boolean, blocked: boolean, opening: boolean) {
  return text.length === 0 && idle && !blocked && !opening;
}
export const clean = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
export function filterSessions(sessions: SessionInfo[], query: string, cwd?: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return sessions.filter(s => (!cwd || s.cwd === cwd) && terms.every(t =>
    `${s.name ?? ""} ${s.firstMessage} ${s.cwd}`.toLowerCase().includes(t)))
    .sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
