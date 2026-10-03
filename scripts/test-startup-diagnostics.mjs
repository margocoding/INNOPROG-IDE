import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = html.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<script type="module"/);
assert.ok(source, "the diagnostics bootstrap must execute before the app module");

function createHarness({ withTiming = true, withBeacon = true } = {}) {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const sent = [];
  const timers = [];
  const observerInstances = [];
  let clock = 0;
  const window = {
    location: { href: "https://ide.innoprog.ru/", origin: "https://ide.innoprog.ru" },
    addEventListener(name, listener) {
      const list = windowListeners.get(name) || [];
      list.push(listener);
      windowListeners.set(name, list);
    },
  };
  const document = {
    addEventListener(name, listener) {
      const list = documentListeners.get(name) || [];
      list.push(listener);
      documentListeners.set(name, list);
    },
  };
  class MockObserver {
    constructor(callback) { this.callback = callback; observerInstances.push(this); }
    observe(options) { this.types = [...(this.types || []), options.type]; }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  const navigator = withBeacon
    ? { sendBeacon: (url, body) => { sent.push({ url, body }); return true; } }
    : undefined;
  const context = {
    window,
    document,
    navigator,
    Blob,
    URL,
    setTimeout(callback, ms) { timers.push({ callback, ms }); return timers.length; },
    fetch: (...args) => { sent.push({ fetch: args }); return Promise.reject(new Error("offline")); },
    performance: withTiming ? { now: () => clock } : undefined,
    PerformanceObserver: withTiming ? MockObserver : undefined,
    Math: Object.create(Math),
  };
  context.Math.random = () => 0.01;
  vm.runInNewContext(source[1], context, { timeout: 1000 });
  return { window, windowListeners, documentListeners, sent, timers, observerInstances, context, advance: (ms) => { clock += ms; } };
}

async function readBeacon(harness) {
  assert.equal(harness.sent.length, 1, "one page must send at most one diagnostics request");
  assert.equal(harness.sent[0].url, "/startup-diagnostics");
  return JSON.parse(await harness.sent[0].body.text());
}

{
  const harness = createHarness();
  const before = [...harness.windowListeners.get("error")];
  harness.window.__ideStartupDiagnostics.mark("render_scheduled");
  vm.runInNewContext(source[1], harness.context, { timeout: 1000 });
  assert.equal(harness.windowListeners.get("error").length, before.length, "bootstrap guard prevents StrictMode duplicate listeners");
  harness.windowListeners.get("error")[0]({ target: { tagName: "SCRIPT", src: "https://cdn.example/main.js?token=secret" } });
  const payload = await readBeacon(harness);
  assert.deepEqual(payload.events.map(({ event }) => event), ["bootstrap", "render_scheduled", "script_failure"]);
  assert.ok(!JSON.stringify(payload).includes("cdn.example"));
  assert.ok(!JSON.stringify(payload).includes("secret"));
}

{
  const harness = createHarness();
  harness.windowListeners.get("unhandledrejection")[0]({ reason: new Error("private module URL /chunk.js?token=secret") });
  const payload = await readBeacon(harness);
  assert.ok(payload.events.some(({ event }) => event === "unhandled_rejection"));
  assert.ok(!JSON.stringify(payload).includes("private module URL"));
  assert.ok(!JSON.stringify(payload).includes("secret"));
}

{
  const harness = createHarness();
  harness.windowListeners.get("error")[0]({ target: { tagName: "LINK", rel: "stylesheet", href: "/private.css?token=secret" } });
  const payload = await readBeacon(harness);
  assert.ok(payload.events.some(({ event }) => event === "style_failure"));
  assert.ok(!JSON.stringify(payload).includes("private.css"));
}

{
  const harness = createHarness();
  harness.observerInstances[0].emit([
    {
      entryType: "resource",
      name: "https://ide.innoprog.ru/assets/app.js?secret=1",
      initiatorType: "script",
      fetchStart: 5,
      requestStart: 25,
      responseStart: 65,
      responseEnd: 95,
      duration: 120.6,
    },
    {
      entryType: "resource",
      name: "https://ide.innoprog.ru/assets/vendor.js",
      initiatorType: "script",
      fetchStart: 10,
      requestStart: 40,
      responseStart: 60,
      responseEnd: 160,
      duration: 150,
    },
    { entryType: "resource", name: "https://external.example/app.js?secret=2", initiatorType: "script", duration: 80 },
    { entryType: "resource", name: "https://ide.innoprog.ru/api?private=3", initiatorType: "fetch", duration: Number.NaN },
    { entryType: "navigation", domContentLoadedEventEnd: 88 },
  ]);
  harness.windowListeners.get("error")[0]({ target: harness.window });
  const payload = await readBeacon(harness);
  assert.ok(payload.events.some(({ event, durationMs }) => event === "resource_script" && durationMs === 150));
  assert.ok(payload.events.some(({ event, durationMs }) => event === "resource_queue" && durationMs === 30));
  assert.ok(payload.events.some(({ event, durationMs }) => event === "resource_ttfb" && durationMs === 40));
  assert.ok(payload.events.some(({ event, durationMs }) => event === "resource_download" && durationMs === 100));
  assert.ok(!payload.events.some(({ event }) => event === "resource_fetch"), "non-finite resource timing is discarded");
  assert.ok(payload.events.some(({ event }) => event === "navigation"));
  assert.ok(!JSON.stringify(payload).includes("external.example"));
  assert.ok(!JSON.stringify(payload).includes("private=3"));
}

{
  const harness = createHarness({ withTiming: false, withBeacon: false });
  harness.windowListeners.get("error")[0]({ target: harness.window, message: "user content" });
  assert.equal(harness.sent.length, 1, "unsupported observers and sendBeacon fall back without blocking startup");
  const [url, options] = harness.sent[0].fetch;
  assert.equal(url, "/startup-diagnostics");
  assert.equal(options.credentials, "omit");
  assert.ok(!options.body.includes("user content"));
}

{
  const harness = createHarness();
  harness.timers.find(({ ms }) => ms === 12000).callback();
  const payload = await readBeacon(harness);
  assert.ok(payload.events.some(({ event }) => event === "boot_timeout"), "startup deadline records missing app entry");
}

for (const completionAtMs of [13000, 18000, 60000]) {
  const harness = createHarness();
  harness.advance(12000);
  harness.timers.find(({ ms }) => ms === 12000).callback();
  const timeoutPayload = await readBeacon(harness);
  assert.ok(timeoutPayload.events.some(({ event }) => event === "boot_timeout"));
  assert.equal(harness.observerInstances[0].disconnected, undefined, "resource observation continues after the timeout signal");

  const fetchStart = 5;
  const requestStart = 25;
  const responseStart = completionAtMs - 100;
  harness.advance(completionAtMs - 12000);
  harness.observerInstances[0].emit([{
    entryType: "resource",
    name: "https://ide.innoprog.ru/assets/main.js?private=1",
    initiatorType: "script",
    fetchStart,
    requestStart,
    responseStart,
    responseEnd: completionAtMs,
    duration: completionAtMs - fetchStart,
  }]);

  assert.equal(harness.sent.length, 2, "a slow main script gets one bounded phase snapshot after the timeout signal");
  assert.equal(harness.sent[1].url, "/startup-diagnostics");
  const latePayload = JSON.parse(await harness.sent[1].body.text());
  assert.deepEqual(latePayload.events.map(({ event }) => event).sort(), [
    "resource_download",
    "resource_queue",
    "resource_script",
    "resource_ttfb",
  ]);
  assert.ok(latePayload.events.some(({ event, durationMs }) => event === "resource_script" && durationMs === Math.round((completionAtMs - fetchStart) / 10) * 10));
  assert.ok(latePayload.events.some(({ event, durationMs }) => event === "resource_download" && durationMs === 100));
  assert.ok(!JSON.stringify(latePayload).includes("main.js"));
  assert.ok(!JSON.stringify(latePayload).includes("private=1"));

  harness.observerInstances[0].emit([{
    entryType: "resource",
    name: "https://ide.innoprog.ru/assets/another.js",
    initiatorType: "script",
    fetchStart: 10,
    requestStart: 20,
    responseStart: completionAtMs + 10,
    responseEnd: completionAtMs + 20,
    duration: 30,
  }]);
  assert.equal(harness.sent.length, 2, "late timing remains capped at two reports per page");
}

console.log("IDE startup diagnostics bootstrap ok");
