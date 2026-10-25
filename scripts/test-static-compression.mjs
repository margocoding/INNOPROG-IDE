// Integration check against the production nginx template and built assets.
// Requires Docker and `npm run build`; creates and removes its own container.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { createConnection } from 'node:net';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const name = `innoprog-ide-gzip-test-${process.pid}`;
function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
function get(port, path, encoding = 'gzip') {
  return new Promise((resolveResponse, reject) => {
    const req = request({ host: '127.0.0.1', port, path,
      headers: { 'Accept-Encoding': encoding } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveResponse({ status: response.statusCode,
        headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.setTimeout(5_000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}
// Outer proxies may use HTTP/1.0 for the upstream hop even when the
// browser connection uses HTTP/2. Exercise that hop without auto-decompression.
function getHttp10(port, path) {
  return new Promise((resolveResponse, reject) => {
    const chunks = [];
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(`GET ${path} HTTP/1.0\r\nHost: localhost\r\nAccept-Encoding: gzip\r\nVia: 1.1 test-proxy\r\n\r\n`);
    });
    socket.setTimeout(5_000, () => socket.destroy(new Error('HTTP/1.0 timeout')));
    socket.on('error', reject);
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => {
      const raw = Buffer.concat(chunks);
      const boundary = raw.indexOf('\r\n\r\n');
      const lines = raw.subarray(0, boundary).toString().split('\r\n');
      const headers = Object.fromEntries(lines.slice(1).map((line) => {
        const colon = line.indexOf(':');
        return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
      }));
      resolveResponse({ status: Number(lines[0].split(' ')[1]), headers,
        body: raw.subarray(boundary + 4) });
    });
  });
}
const apiBody = JSON.stringify({ result: true, output: 'sample output '.repeat(500) });
const upstream = createServer((req, res) => {
  if (req.url.startsWith('/task/')) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write('{"completed":1}\n');
    setTimeout(() => res.end('{"result":true}\n'), 30);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(apiBody);
  }
});
await new Promise((done) => upstream.listen(0, '0.0.0.0', done));
try {
  const upstreamUrl = `http://host.docker.internal:${upstream.address().port}`;
  docker('run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::80',
    '--add-host', 'backend:127.0.0.1',
    '--add-host', 'host.docker.internal:host-gateway',
    '-e', `BOT_API_PROXY_URL=${upstreamUrl}`, '-e', 'BOT_API_PROXY_HOST=test-upstream',
    '-e', `CODE_RUNNER_API_PROXY_URL=${upstreamUrl}`, '-e', 'CODE_RUNNER_API_PROXY_HOST=test-upstream',
    '-e', 'CODE_RUNNER_AUTH_TOKEN=local-test-only',
    '-v', `${root}/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro`,
    '-v', `${root}/dist:/usr/share/nginx/html:ro`, 'nginx:stable-alpine');
  const port = Number(docker('port', name, '80').split(':').at(-1));
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { ready = (await get(port, '/')).status === 200; } catch {}
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, 'nginx startup failed');
  docker('exec', name, 'nginx', '-t');
  const assets = readdirSync(resolve(root, 'dist/assets'));
  for (const extension of ['.js', '.css']) {
    const asset = assets.filter((file) => file.endsWith(extension) && readFileSync(resolve(root, 'dist/assets', file)).length > 1024)
      .sort((a, b) => readFileSync(resolve(root, 'dist/assets', b)).length - readFileSync(resolve(root, 'dist/assets', a)).length)[0];
    assert.ok(asset, `missing built ${extension} asset`);
    const original = readFileSync(resolve(root, 'dist/assets', asset));
    const compressed = await get(port, `/assets/${asset}`);
    const identity = await get(port, `/assets/${asset}`, 'identity');
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.match(compressed.headers.vary, /Accept-Encoding/i);
    assert.match(compressed.headers['cache-control'], /immutable/);
    assert.deepEqual(gunzipSync(compressed.body), original);
    assert.equal(identity.headers['content-encoding'], undefined);
    assert.deepEqual(identity.body, original);
    const proxied = await getHttp10(port, `/assets/${asset}`);
    assert.equal(proxied.status, 200);
    assert.equal(proxied.headers['content-encoding'], 'gzip');
    assert.match(proxied.headers.vary, /Accept-Encoding/i);
    assert.deepEqual(gunzipSync(proxied.body), original);

    console.log(`${extension}: ${identity.body.length} -> ${compressed.body.length} bytes; decoded content identical`);
  }
  assert.equal((await get(port, '/')).headers['content-encoding'], undefined);
  assert.equal((await get(port, '/assets/nonexistent.js')).status, 404);
  const api = await get(port, '/bot-api/check/py');
  assert.equal(api.status, 200);
  assert.equal(api.headers['content-encoding'], undefined);
  assert.equal(api.body.toString(), apiBody);
  const progress = await get(port, '/bot-api/task/1/check-answer?progress=1');
  assert.equal(progress.status, 200);
  assert.equal(progress.headers['content-encoding'], undefined);
  assert.equal(progress.headers['x-accel-buffering'], 'no');
  assert.equal(progress.body.toString(), '{"completed":1}\n{"result":true}\n');
  console.log('nginx static compression, identity, cache, 404, API and progress contracts passed');
} finally {
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 30_000 });
  await new Promise((done) => upstream.close(done));
}
