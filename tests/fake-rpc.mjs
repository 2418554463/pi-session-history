let buffer = '';
const emit = record => process.stdout.write(JSON.stringify(record) + '\n');
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    const command = JSON.parse(line);
    const response = data => emit({ type: 'response', id: command.id, success: true, data });
    if (command.type === 'get_state') response({ sessionFile: '/test/fake-session.jsonl' });
    else if (command.type === 'prompt') {
      emit({ type: 'agent_start' }); response({ disposition: 'started' });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hello\u2028world' } });
      emit({ type: 'agent_end' });
      emit({ type: 'extension_ui_request', id: 'permission-1', method: 'confirm', title: 'Allow?' });
    } else if (command.type === 'extension_ui_response') emit({ type: 'agent_settled' });
    else if (command.type === 'abort') { response({}); emit({ type: 'agent_settled' }); }
    else response({});
  }
});
process.stdin.on('end', () => process.exit(0));
