import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const assetsDirectory = path.resolve("dist/assets");
const css = fs.readdirSync(assetsDirectory)
  .filter((name) => name.endsWith(".css"))
  .map((name) => fs.readFileSync(path.join(assetsDirectory, name), "utf8"))
  .join("\n");

assert.doesNotMatch(css, /@tailwind\s+(base|components|utilities)/);
for (const expectedUtility of [
  ".flex{",
  ".h-full{",
  ".bg-ide-secondary{",
]) {
  assert.ok(css.includes(expectedUtility), `built CSS is missing ${expectedUtility}`);
}
assert.ok(css.length > 100_000, "built CSS is unexpectedly small; Tailwind may not have run");
console.log(`innoprog-ide built CSS contract ok (${css.length} bytes)`);
