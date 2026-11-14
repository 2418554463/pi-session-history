import { spawn } from "node:child_process";
import { readFile, mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BackgroundTask {
  id: string; cwd: string; created: string; sessionFile?: string;
  status: "starting" | "working" | "needs-input" | "ready" | "inactive";
  lastText: string; error?: string;
  requests: { id: string; method: string; title?: string; message?: string; options?: string[] }[];
}
interface Discovery { port: number; token: string; pid: number }
export class BackgroundService {
  private discovery?: Discovery;
  constructor(private directory = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "session-history-service")) {}
  private async discover() {
    const state = JSON.parse(await readFile(join(this.directory, "daemon.json"), "utf8")) as Discovery;
    if (!Number.isInteger(state.port) || state.port < 1 || state.port > 65535 || !/^[a-f0-9]{64}$/.test(state.token)) throw new Error("Invalid daemon discovery file");
    return state;
  }
  private async fetch(state: Discovery, path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${state.port}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(35000),
    });
    const value = await response.json() as any;
    if (!response.ok) throw new Error(value.error || `Service HTTP ${response.status}`);
    return value;
  }
  async connect(start = false) {
    try { const state = await this.discover(); await this.fetch(state, "/health"); this.discovery = state; return true; }
    catch { if (!start) return false; }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const log = await open(join(this.directory, "daemon.log"), "a", 0o600);
    const child = spawn(process.execPath, [fileURLToPath(new URL("./daemon.mjs", import.meta.url)),
      this.directory, process.execPath, process.argv[1]!], {
      detached: true, stdio: ["ignore", log.fd, log.fd], env: process.env,
    });
    child.unref(); await log.close();
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (await this.connect(false)) return true;
    }
    throw new Error(`Background service did not start; inspect ${join(this.directory, "daemon.log")}. A stale daemon.lock must be checked before removal.`);
  }
  async tasks(): Promise<BackgroundTask[]> {
    if (!await this.connect(false)) return [];
    return this.fetch(this.discovery!, "/tasks");
  }
  async create(cwd: string, prompt: string): Promise<BackgroundTask> {
    await this.connect(true);
    return this.fetch(this.discovery!, "/tasks", { cwd, prompt });
  }
  async action(id: string, action: "stop" | "close" | "respond" | "prompt", body: unknown = {}) {
    await this.connect(true);
    return this.fetch(this.discovery!, `/tasks/${id}/${action}`, body);
  }
}
