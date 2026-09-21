/** Local collector for ios-inertia-harness.html; never part of the test/CI runner. */
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? 6011);
const output = resolve(process.env.OUTPUT_DIR ?? 'artifacts/research/ios-inertia');
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);

// Small CLI client: arm a fresh story or wait for a trial's evidence.
if (process.argv[2]) {
  const [action, id, method = 'baseline', delay = '80'] = process.argv.slice(2);
  if (!['start', 'wait'].includes(action) || !validId(id)) {
    throw new Error('Usage: node ios-inertia-collector.mjs [start ID METHOD DELAY_MS | wait ID]');
  }
  const base = `http://localhost:${port}`;
  if (action === 'start') {
    const response = await fetch(`${base}/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, method, delay: Number(delay) }),
    });
    if (!response.ok) throw new Error(await response.text());
  }
  const phase = action === 'start' ? 'ready' : 'done';
  let result;
  for (let attempt = 0; attempt < 160; attempt++) {
    const states = await (await fetch(`${base}/status`)).json();
    const state = states[id];
    if (state?.phase === 'error') throw new Error(state.error);
    if (state?.phase === phase) {
      result = state;
      break;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!result) throw new Error(`Timed out waiting for ${id}: ${phase}`);
  console.log(JSON.stringify(result));
} else {
  await mkdir(output, { recursive: true });
  let job = { id: 'initial', method: 'baseline', delay: 80 };
  const states = Object.create(null);
  http
    .createServer(async (request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'OPTIONS') return void response.end();
      try {
        if (request.method === 'GET') {
          if (request.url === '/job') return void response.end(JSON.stringify(job));
          if (request.url === '/status') return void response.end(JSON.stringify(states));
        }
        if (request.method === 'POST') {
          let body = '';
          for await (const chunk of request) body += chunk;
          const data = JSON.parse(body);
          if (!validId(data.id)) throw new Error('Invalid trial ID');
          if (request.url === '/job') {
            job = data;
            delete states[data.id];
            return void response.end(JSON.stringify(job));
          }
          if (request.url === '/status') {
            states[data.id] = data;
            return void response.end('ok');
          }
          if (request.url === '/result') {
            await writeFile(resolve(output, `${data.id}.json`), JSON.stringify(data, null, 2));
            states[data.id] = { id: data.id, phase: 'done', summary: data.summary };
            return void response.end('ok');
          }
        }
        response.statusCode = 404;
        response.end('Not found');
      } catch (error) {
        response.statusCode = 400;
        response.end(String(error));
      }
    })
    .listen(port, '127.0.0.1', () => console.log(`Inertia collector: http://localhost:${port} → ${output}`));
}
