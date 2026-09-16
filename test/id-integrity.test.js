const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = join(__dirname, "..");
const appSource = readFileSync(join(root, "app.js"), "utf8");
const htmlSource = readFileSync(join(root, "index.html"), "utf8");

test("every static app.js element lookup has a matching index.html id", () => {
  const appIds = [...appSource.matchAll(/getElementById\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .filter((id, index, ids) => ids.indexOf(id) === index);
  const htmlIds = new Set(
    [...htmlSource.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
  );
  const missingIds = appIds.filter((id) => !htmlIds.has(id));

  assert.deepEqual(missingIds, []);
});

test("Backend Debug turn log keeps its required DOM hooks", () => {
  for (const id of ["turn-log-count", "turn-log-empty", "turn-log-table-wrap", "turn-log-body"]) {
    assert.match(htmlSource, new RegExp('id="' + id + '"'));
  }
  assert.match(htmlSource, /Request \/ turn log/);
  assert.match(appSource, /function renderTurnLog\(\)/);
  assert.match(appSource, /selectTurn\(turn\.id\)/);
});
