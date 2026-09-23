/** Run real-browser contracts serially so animation sampling does not compete across tests. */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}artifacts/chat-tests`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const started = Date.now();
const base = process.env.STORYBOOK_URL ?? `http://127.0.0.1:${process.env.CHAT_TEST_PORT ?? '6199'}`;
const fullSuite = [
  'scroll-anchor',
  'resize-window',
  'contracts',
  'item-debug',
  'scroll-velocity',
  'scroll',
  'composer-release',
  'flight-composer',
  'scroll-ownership',
  'wheel-stability',
  'touch-takeover',
  'send-flight',
  'items',
  'typing-exit',
  'typing-handoff',
  'typing-exit-insertion',
  'catch-up',
  'history-scroll',
  'bottom-line',
  'layout-transactions',
  'insertion',
];
const ciSuite = ['scroll-anchor', 'contracts', 'item-debug', 'scroll', 'send-flight', 'typing-handoff'];
const suiteName = process.argv[2] ?? 'full';
const suites = { full: fullSuite, ci: ciSuite };
const names = suites[suiteName];
if (!names) {
  throw new Error(`Unknown chat test suite "${suiteName}". Expected one of: ${Object.keys(suites).join(', ')}`);
}
const children = new Set();
function stop(child) {
  if (!child.pid) return;
  // Only terminate process groups created by this runner, including browser/server descendants.
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function launch(command, args, name, cwd = root) {
  const log = createWriteStream(`${output}/${name}.log`);
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: { ...process.env, STORYBOOK_URL: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      log.end();
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}; see ${output}/${name}.log`));
    });
  });
  // A server can fail while readiness is being polled; retain the rejection for the caller.
  void done.catch(() => {});
  return { child, done };
}
function cleanup() {
  for (const child of children) stop(child);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    cleanup();
    process.exit(1);
  });
try {
  console.log(`Chat test suite: ${suiteName} (${names.length}/${fullSuite.length} scripts)`);
  if (!process.env.STORYBOOK_URL) {
    const server = launch(
      'pnpm',
      [
        'exec',
        'storybook',
        'dev',
        '--ci',
        '--exact-port',
        '--host',
        '127.0.0.1',
        '--port',
        new URL(base).port,
        '--disable-telemetry',
      ],
      'storybook',
      `${root}lab`
    );
    let startupFailure;
    void server.done.then(
      () => {
        startupFailure = new Error('Storybook exited before tests');
      },
      (error) => {
        startupFailure = error;
      }
    );
    const readiness = async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (startupFailure) throw startupFailure;
        try {
          const response = await fetch(`${base}/index.json`, { signal: AbortSignal.timeout(2000) });
          if (response.ok) return;
        } catch {
          /* The owned server is still starting. */
        }
        await delay(250);
      }
      throw new Error(`Storybook did not become ready; see ${output}/storybook.log`);
    };
    await readiness();
  }
  for (const name of names) {
    console.log(`RUN ${name}`);
    // Shared primitives keep their own script names; chat contracts carry the chat- prefix.
    const script = existsSync(`${root}scripts/test-${name}.mjs`)
      ? `scripts/test-${name}.mjs`
      : `scripts/test-chat-${name}.mjs`;
    const { child, done } = launch(process.execPath, [script], name);
    const timeout = setTimeout(() => stop(child), 180000);
    try {
      await done;
    } finally {
      clearTimeout(timeout);
      stop(child);
      children.delete(child);
    }
    console.log(`PASS ${name}`);
  }
  console.log(`Chat contracts passed (${Math.round((Date.now() - started) / 1000)}s). Logs: ${output}`);
} finally {
  cleanup();
  // Preserve only artifacts produced during this run, never stale evidence from a prior run.
  for (const name of await readdir('/tmp')) {
    if (!/^chat-.*\.(json|png)$/.test(name)) continue;
    const source = `/tmp/${name}`;
    if ((await stat(source)).mtimeMs >= started) await copyFile(source, `${output}/${name}`);
  }
}
