import assert from "node:assert/strict";

// No credentials or student data: a 401 proves that TLS and proxy routing
// reached application authentication. A healthy static page cannot prove it.
const base = process.argv[2] || "https://ide.innoprog.ru";
const url = new URL("/bot-api/answer/code", base);
url.search = new URLSearchParams({ answer_id: "proxy-smoke", user_id: "0", task_id: "10030" }).toString();
const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
assert.equal(response.status, 401, "saved-code proxy must reach authentication (401), not fail at TLS/proxy (502)");
assert.equal((await response.json()).result, false);
console.log("IDE saved-code proxy smoke passed: unauthenticated access denied by application");
