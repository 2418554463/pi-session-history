import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RpcWorker } from './rpc-worker.mjs';

export async function startDaemon({ directory, command, args = [] }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'daemon.lock');
  // Exclusive creation: never run competing managers in the same directory.
  const lockHandle = await import('node:fs/promises').then(fs => fs.open(lock, 'wx', 0o600));
  const token = randomBytes(32).toString('hex');
  const workers = new Map();
  const stateFile = join(directory, 'daemon.json');
  let closing = false;
  const authorized = request => {
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    if (!authorized(request)) { send(401, { error: 'Unauthorized' }); return; }
    // Browser-origin requests are not a supported client, even with a leaked token.
    if (request.headers.origin) { send(403, { error: 'Browser clients forbidden' }); return; }
    try {
      if (request.method === 'GET' && request.url === '/health') { send(200, { pid: process.pid }); return; }
      if (request.method === 'GET' && request.url === '/tasks') {
        send(200, [...workers].map(([id, item]) => ({ id, cwd: item.cwd, created: item.created, ...item.worker.snapshot() }))); return;
      }
      if (request.method !== 'POST') { send(404, { error: 'Unknown route' }); return; }
      let bytes = 0, chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { send(413, { error: 'Payload too large' }); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (request.url === '/tasks') {
        if (closing) throw new Error('Service shutting down');
        if (typeof body.cwd !== 'string' || !body.cwd.startsWith('/')) throw new Error('Absolute cwd required');
        if (body.prompt !== undefined && typeof body.prompt !== 'string') throw new Error('Invalid prompt');
        // A fresh RPC worker owns a fresh session. Never attach an arbitrary existing session.
        const id = randomUUID();
        const worker = new RpcWorker(command, [...args, '--mode', 'rpc'], { cwd: body.cwd });
        const item = { worker, cwd: body.cwd, created: new Date().toISOString() };
        workers.set(id, item);
        try { await worker.start(body.prompt); }
        catch (error) { await worker.close(); throw error; }
        send(201, { id, ...worker.snapshot() }); return;
      }
      const match = /^\/tasks\/([a-f0-9-]+)\/(stop|close|respond|prompt)$/.exec(request.url);
      const item = match && workers.get(match[1]);
      if (!item) { send(404, { error: 'No service-owned task matches this ID' }); return; }
      if (match[2] === 'stop') await item.worker.abort();
      if (match[2] === 'close') await item.worker.close();
      if (match[2] === 'respond') await item.worker.respond(body);
      if (match[2] === 'prompt') {
        if (typeof body.message !== 'string') throw new Error('Message required');
        await item.worker.request('prompt', { message: body.message, streamingBehavior: 'followUp' });
      }
      send(200, item.worker.snapshot());
    } catch (error) { send(400, { error: String(error) }); }
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 5000;
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    const port = server.address().port;
    const state = { port, token, pid: process.pid, started: new Date().toISOString() };
    const temporary = stateFile + '.tmp';
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 }); renameSync(temporary, stateFile);
    return { ...state, async close() {
      if (closing) return; closing = true;
      await new Promise(resolve => server.close(resolve));
      await Promise.all([...workers.values()].map(item => item.worker.close()));
      try { unlinkSync(stateFile); } catch {}
      await lockHandle.close(); try { unlinkSync(lock); } catch {}
    } };
  } catch (error) { await lockHandle.close(); try { unlinkSync(lock); } catch {} throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , directory, command, ...args] = process.argv;
  if (!directory || !command) throw new Error('Usage: daemon.mjs DIRECTORY PI_COMMAND [ARGS...]');
  const daemon = await startDaemon({ directory, command, args });
  let stopping = false;
  const close = async () => { if (stopping) return; stopping = true; await daemon.close(); process.exit(0); };
  process.on('SIGTERM', close); process.on('SIGINT', close);
}
