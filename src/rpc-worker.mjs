import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Owns one RPC child. Never signals a PID obtained from a session file. */
export class RpcWorker {
  constructor(command, args, options = {}) {
    this.status = 'starting'; this.sessionFile = undefined; this.pending = new Map();
    this.uiRequests = new Map(); this.events = []; this.lastText = ''; this.error = undefined;
    this.child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env,
      PI_SESSION_HISTORY_WORKER: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8'); this.child.stderr.setEncoding('utf8');
    let buffer = '';
    this.child.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 16 * 1024 * 1024) { this.fail(new Error('RPC record exceeds limit')); void this.close(); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        try { this.receive(JSON.parse(line)); } catch { /* Non-protocol diagnostics must not corrupt framing. */ }
      }
    });
    this.child.stderr.on('data', text => { this.error = (this.error ?? '') + text; this.error = this.error.slice(-4096); });
    this.child.on('error', error => this.fail(error));
    this.exited = new Promise(resolve => this.child.once('close', (code, signal) => {
      this.fail(new Error(`RPC worker exited (${code ?? signal})`));
      this.status = 'inactive'; resolve();
    }));
  }
  receive(record) {
    if (record.type === 'response' && record.id) {
      const pending = this.pending.get(record.id);
      if (pending) {
        clearTimeout(pending.timer); this.pending.delete(record.id);
        record.success ? pending.resolve(record.data) : pending.reject(new Error(record.error || 'RPC command failed'));
      }
    }
    if (record.type === 'extension_ui_request') {
      // The UI must explicitly answer; never auto-approve permission requests.
      if (record.id && ['select','confirm','input','editor'].includes(record.method)) {
        this.uiRequests.set(record.id, record); this.status = 'needs-input';
      }
    }
    if (record.type === 'agent_start') this.status = 'working';
    if (record.type === 'agent_settled') this.status = this.uiRequests.size ? 'needs-input' : 'ready';
    if (record.type === 'message_update' && record.assistantMessageEvent?.type === 'text_delta') {
      this.lastText = (this.lastText + record.assistantMessageEvent.delta).slice(-16384);
    }
    if (record.type !== 'message_update') {
      this.events.push(record); if (this.events.length > 40) this.events.shift();
    }
  }
  fail(error) {
    this.error = String(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  write(record) {
    return new Promise((resolve, reject) => {
      if (this.child.stdin.destroyed) { reject(new Error('RPC stdin closed')); return; }
      this.child.stdin.write(JSON.stringify(record) + '\n', error => error ? reject(error) : resolve());
    });
  }
  request(type, data = {}, timeout = 30000) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC ${type} timed out`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      void this.write({ ...data, type, id }).catch(error => {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }
  async start(prompt) {
    const state = await this.request('get_state');
    this.sessionFile = state?.sessionFile;
    this.status = 'ready';
    if (prompt) {
      this.status = 'working';
      const accepted = await this.request('prompt', { message: prompt });
      if (accepted?.disposition === 'handled') this.status = 'ready';
    }
    return state;
  }
  async respond(response) {
    if (!this.uiRequests.has(response.id)) throw new Error('Unknown UI request');
    await this.write({ ...response, type: 'extension_ui_response' });
    this.uiRequests.delete(response.id);
    if (!this.uiRequests.size) this.status = 'working';
  }
  async abort() { await this.request('abort'); }
  async close() {
    this.child.stdin.end();
    let timer;
    await Promise.race([this.exited, new Promise(resolve => {
      timer = setTimeout(() => { this.child.kill('SIGTERM'); resolve(); }, 2000);
    })]);
    clearTimeout(timer);
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const force = setTimeout(() => this.child.kill('SIGKILL'), 2000);
      force.unref(); await this.exited; clearTimeout(force);
    }
  }
  snapshot() {
    return { status: this.status, sessionFile: this.sessionFile, lastText: this.lastText,
      error: this.error, requests: [...this.uiRequests.values()] };
  }
}
