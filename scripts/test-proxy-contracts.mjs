import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const nginx = read("nginx.conf.template");
assert.match(
  nginx,
  /large_client_header_buffers\s+8\s+32k;/,
  "nginx must accept legacy accumulated room cookies during migration",
);
const dockerfile = read("Dockerfile");
const edgeCompose = read("deploy/docker-compose.edge.yml");
const vite = read("vite.config.ts");
const api = read("src/services/api.ts");

const checkLocation = nginx.indexOf("location /bot-api/check/");
const runLocation = nginx.indexOf("location /bot-api/code/run/");
const genericLocation = nginx.indexOf("location /bot-api/ {");
const liveHealthLocation = nginx.indexOf("location = /health/live {");
const readyHealthLocation = nginx.indexOf("location = /health/ready {");

assert.ok(checkLocation >= 0, "nginx must route /bot-api/check/ explicitly");
assert.ok(runLocation >= 0, "nginx must route /bot-api/code/run/ explicitly");
assert.ok(genericLocation >= 0, "nginx must keep generic /bot-api/ route");
assert.ok(liveHealthLocation >= 0, "nginx must expose backend liveness");
assert.ok(readyHealthLocation >= 0, "nginx must expose backend readiness");
assert.ok(checkLocation < genericLocation, "check route must be before generic /bot-api/");
assert.ok(runLocation < genericLocation, "code-run route must be before generic /bot-api/");

for (const [name, start, end] of [
  ["check", checkLocation, runLocation],
  ["code-run", runLocation, genericLocation],
]) {
  const block = nginx.slice(start, end);
  assert.match(block, /proxy_pass \$\{CODE_RUNNER_API_PROXY_URL\};/, `${name} must proxy to code runner API`);
  assert.match(
    block,
    /proxy_set_header Authorization "Bearer \$\{CODE_RUNNER_AUTH_TOKEN\}";/,
    `${name} must send server-side code runner token`,
  );
}

const genericBlock = nginx.slice(genericLocation);
assert.match(genericBlock, /proxy_pass \$\{BOT_API_PROXY_URL\};/, "generic bot routes must proxy to BOT_API_PROXY_URL");
assert.doesNotMatch(
  genericBlock,
  /proxy_set_header Authorization "Bearer \$\{CODE_RUNNER_AUTH_TOKEN\}";/,
  "generic bot routes must not leak code runner token",
);
assert.match(
  dockerfile,
  /BOT_API_PROXY_URL=https:\/\/webhook\.bot\.innoprog\.ru/,
  "Dockerfile must default generic bot route upstream to webhook.bot.innoprog.ru",
);
assert.match(
  dockerfile,
  /CODE_RUNNER_API_PROXY_URL=https:\/\/api\.innoprog\.ru/,
  "Dockerfile must default code-runner upstream to api.innoprog.ru",
);
assert.match(
  api,
  /const API_URL = \(process\.env\.REACT_APP_BOT_API_URL \|\| "\/bot-api"\)/,
  "frontend must call relative /bot-api so nginx owns backend routing",
);
for (const path of ["/bot-api/check", "/bot-api/code/run"]) {
  const start = vite.indexOf(`'${path}': {`);
  assert.ok(start >= 0, `${path} development proxy must exist`);
  const block = vite.slice(start, vite.indexOf("},", start) + 2);
  assert.ok(
    block.includes("target: 'https://ide.innoprog.ru'") &&
      block.includes("changeOrigin: true"),
    `${path} development proxy must preserve the production Host contract`,
  );
}
for (const name of [
  "REACT_APP_BOT_API_URL",
  "REACT_APP_WS_URL",
  "REACT_APP_PARENT_APP_ORIGIN",
  "REACT_APP_PARENT_POST_MESSAGE_ALLOWED_ORIGINS",
]) {
  assert.ok(
    dockerfile.includes(`ARG ${name}=`),
    `Dockerfile must accept ${name} at build time`,
  );
  assert.ok(
    edgeCompose.includes(`${name}: \${${name}:-`),
    `edge compose must pass ${name} into the frontend build`,
  );
}
assert.doesNotMatch(
  read("src/components/shared/Code/IDE/IDE.tsx"),
  /postMessage\([\s\S]*?"\*"/,
  "IDE must never send parent-window messages with a wildcard target",
);
assert.doesNotMatch(
  read("src/hooks/useCodeExecution.ts"),
  /postMessage\([\s\S]*?"\*"/,
  "code execution must never send parent-window messages with a wildcard target",
);

for (const [name, start] of [
  ["liveness", liveHealthLocation],
  ["readiness", readyHealthLocation],
]) {
  const block = nginx.slice(start, nginx.indexOf("}", start) + 1);
  assert.match(block, /proxy_pass http:\/\/backend:3000\/health\//, `${name} must proxy to the IDE backend`);
}

console.log("innoprog-ide proxy contracts ok");
