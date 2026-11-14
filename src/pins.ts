import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
export const pinKey = (path: string) => createHash("sha256").update(path).digest("hex");
export async function readPins(directory: string) {
  try { return new Set(await readdir(directory)); }
  catch (error: any) { if (error.code === "ENOENT") return new Set<string>(); throw error; }
}
export async function setPinned(directory: string, path: string, pinned: boolean) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, pinKey(path));
  if (pinned) await writeFile(file, "", { mode: 0o600 });
  else try { await unlink(file); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
}
