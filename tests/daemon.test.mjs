import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDaemon } from '../src/daemon.mjs';
import { RpcWorker } from '../src/rpc-worker.mjs';
const fixture = fileURLToPath(new URL('./fake-rpc.mjs', import.meta.url));
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Condition timed out');
};
it('owns RPC lifetime, preserves unicode separators, and never auto-approves', async () => {
  const worker = new RpcWorker(process.execPath, [fixture]);
  try {
    await worker.start('test');
    await waitFor(() => worker.status === 'needs-input');
    expect(worker.lastText).toBe('hello\u2028world');
    expect(worker.uiRequests.size).toBe(1);
    // agent_end above must not incorrectly mark this task finished.
    expect(worker.status).not.toBe('ready');
    await expect(worker.respond({ id: 'unknown', confirmed: true })).rejects.toThrow();
    await worker.respond({ id: 'permission-1', confirmed: false });
    await waitFor(() => worker.status === 'ready');
  } finally { await worker.close(); }
  expect(worker.status).toBe('inactive');
});
it('authenticates loopback API, enforces exclusive ownership, and closes children', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'history-daemon-'));
  const daemon = await startDaemon({ directory, command: process.execPath, args: [fixture] });
  const url = `http://127.0.0.1:${daemon.port}`;
  const call = async (path, body, headers = {}) => fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${daemon.token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    expect((await fetch(url + '/tasks')).status).toBe(401);
    expect((await call('/tasks', undefined, { Origin: 'https://example.com' })).status).toBe(403);
    expect(statSync(join(directory, 'daemon.json')).mode & 0o777).toBe(0o600);
    await expect(startDaemon({ directory, command: process.execPath })).rejects.toThrow();
    const created = await (await call('/tasks', { cwd: directory, prompt: 'test' })).json();
    expect(created.id).toBeTruthy();
    expect((await call('/tasks/00000000-0000-0000-0000-000000000000/stop', {})).status).toBe(404);
    const tasks = await (await call('/tasks')).json();
    expect(tasks).toHaveLength(1);
    expect((await call(`/tasks/${created.id}/respond`, { id: 'permission-1', confirmed: false })).status).toBe(200);
    expect((await call(`/tasks/${created.id}/stop`, {})).status).toBe(200);
  } finally { await daemon.close(); rmSync(directory, { recursive: true, force: true }); }
});
