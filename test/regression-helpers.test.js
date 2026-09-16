"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  STORAGE_KEY,
  createRegressionScenario,
  getStateStepAssertion,
  updateStateStepAssertion,
  buildEditableAssertions,
  uniqueScenarioId,
  reconcileSavedScenarioIds,
  validateScenario,
  parseScenarioJson,
  serializeScenarios,
  loadSavedScenarios,
  saveSavedScenarios,
} = require("../regression-helpers.js");

function createStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    get(key) { return values.get(key); },
  };
}

test("generates client-only messages and known replay assertions", () => {
  const importedMessages = [
    { role: "bot", text: "Opening reply" },
    { role: "client", text: "First question" },
    { role: "bot", text: "First current reply" },
    { role: "client", text: "Latest question" },
  ];
  const turns = [
    { runType: "replay", debug: { intent: "old-intent", step: "old-step", fields: { old: "value" } } },
    {
      runType: "replay",
      debug: {
        intent: "pricing",
        step: "awaiting_scope",
        fields: { service: "ERP" },
        telegram: { status: "would_send" },
      },
    },
  ];

  const scenario = createRegressionScenario({
    importedMessages,
    turns,
    botId: "cyno-software",
    channelMode: "messenger",
    name: "Pricing regression",
    now: "2026-09-16T00:00:00.000Z",
  });

  assert.deepEqual(scenario.messages, ["First question", "Latest question"]);
  assert.deepEqual(scenario.assertions, {
    intent: "pricing",
    step: "awaiting_scope",
    fields: { service: "ERP" },
    telegramStatus: "would_send",
    telegramTriggerCount: 1,
  });
  assert.deepEqual(scenario.behaviorExpectations, {
    answerLatestQuestion: true,
    preserveContext: true,
    noUnnecessaryRepetition: true,
    noContradictionOrRenegotiation: true,
    doNotIgnoreUserQuestion: true,
  });
  assert.equal(scenario.source.type, "conversation-replay");
});

test("does not invent assertions when replay debug is unavailable", () => {
  const scenario = createRegressionScenario({
    importedMessages: [{ role: "client", text: "Hello" }],
    turns: [],
    botId: "bot",
  });

  assert.deepEqual(scenario.assertions, {});
});

test("validates messages and rejects malformed scenarios", () => {
  assert.throws(() => validateScenario({ id: "bad", name: "Bad", messages: ["", 4] }), /messages/i);
  assert.throws(() => parseScenarioJson("{not-json"), /JSON/i);
  assert.throws(() => parseScenarioJson(JSON.stringify({ id: "bad", name: "Bad", messages: [] })), /messages/i);
});

test("preserves state assertions through import, edit, and validation round-trip", () => {
  const imported = parseScenarioJson(serializeScenarios([{
    id: "state-scenario",
    name: "State assertion",
    messages: ["Hello"],
    assertions: { state: "awaiting_scope", intent: "pricing" },
  }]))[0];

  const stateStep = getStateStepAssertion(imported.assertions);
  const edited = updateStateStepAssertion(imported.assertions, stateStep.value);
  const roundTrip = validateScenario(Object.assign({}, imported, { assertions: edited }));

  assert.equal(stateStep.key, "state");
  assert.deepEqual(roundTrip.assertions, {
    intent: "pricing",
    state: "awaiting_scope",
  });

  const stepAssertions = updateStateStepAssertion({ step: "awaiting_field" }, "awaiting_field");
  assert.deepEqual(stepAssertions, { step: "awaiting_field" });
});

test("normalizes contradictory state and step assertions using the existing state key", () => {
  assert.deepEqual(
    updateStateStepAssertion({ state: "old-state", step: "stale-step", intent: "old-intent" }, "new-state"),
    { intent: "old-intent", state: "new-state" },
  );
  assert.deepEqual(
    updateStateStepAssertion({ state: "stale-state", step: "old-step" }, "new-step"),
    { state: "new-step" },
  );
});

test("rebuilds editable assertions so cleared controls remove stale values and aliases", () => {
  const assertions = buildEditableAssertions({
    state: "awaiting_scope",
    step: "stale-step",
    intent: "pricing",
    extractedFields: { service: "ERP" },
    telegramStatus: "would_send",
    telegramTriggerCount: 2,
  }, {
    stateStepValue: "new-state",
    intent: "",
    fields: undefined,
    telegramStatus: "",
    telegramTriggerCount: undefined,
  });

  assert.deepEqual(assertions, { state: "new-state" });
});

test("serializes and imports a portable scenario collection without response data", () => {
  const scenario = validateScenario({
    id: "portable-scenario",
    name: "Portable",
    botId: "bot",
    channelMode: "website",
    messages: ["Hello"],
    assertions: { intent: "greeting" },
    behaviorExpectations: { preserveContext: false },
    response: { secret: "must not export" },
  });
  const roundTrip = parseScenarioJson(serializeScenarios([scenario]));

  assert.deepEqual(roundTrip, [{
    format: "chatbot-tester-regression-v1",
    id: "portable-scenario",
    name: "Portable",
    botId: "bot",
    channelMode: "website",
    messages: ["Hello"],
    assertions: { intent: "greeting" },
    behaviorExpectations: { preserveContext: false },
  }]);
});

test("uses deterministic collision suffixes", () => {
  assert.equal(uniqueScenarioId("scenario", ["scenario"]), "scenario-2");
  assert.equal(uniqueScenarioId("scenario", ["scenario", "scenario-2"]), "scenario-3");
  assert.equal(uniqueScenarioId("scenario_name", []), "scenario_name");
});

test("reconciles saved IDs against configured IDs without mutating scenarios", () => {
  const saved = [
    validateScenario({ id: "shared", name: "First", messages: ["One"] }),
    validateScenario({ id: "shared", name: "Second", messages: ["Two"] }),
    validateScenario({ id: "shared-2", name: "Third", messages: ["Three"] }),
  ];

  const reconciled = reconcileSavedScenarioIds(saved, ["shared", "shared-2"]);

  assert.deepEqual(reconciled.map((scenario) => scenario.id), ["shared-3", "shared-4", "shared-2-2"]);
  assert.deepEqual(saved.map((scenario) => scenario.id), ["shared", "shared", "shared-2"]);
  assert.equal(reconciled[0].name, "First");
});

test("persists reconciled saved IDs when local storage is writable", () => {
  const scenario = validateScenario({ id: "configured-id", name: "Saved", messages: ["One"] });
  const storage = createStorage({
    [STORAGE_KEY]: JSON.stringify({ scenarios: [scenario] }),
  });

  const loaded = loadSavedScenarios(storage, ["configured-id"]);

  assert.equal(loaded[0].id, "configured-id-2");
  assert.equal(JSON.parse(storage.get(STORAGE_KEY)).scenarios[0].id, "configured-id-2");
});

test("keeps reconciled runtime IDs when persistence fails", () => {
  const scenario = validateScenario({ id: "configured-id", name: "Saved", messages: ["One"] });
  const storage = {
    getItem() { return JSON.stringify({ scenarios: [scenario] }); },
    setItem() { throw new Error("quota exceeded"); },
  };

  const loaded = loadSavedScenarios(storage, ["configured-id"]);

  assert.equal(loaded[0].id, "configured-id-2");
});

test("storage round-trip preserves scenarios and ignores malformed records", () => {
  const storage = createStorage();
  const scenario = validateScenario({ id: "saved", name: "Saved", messages: ["One"], behaviorExpectations: { answerLatestQuestion: true } });
  assert.equal(saveSavedScenarios(storage, [scenario]), true);
  assert.deepEqual(loadSavedScenarios(storage), [scenario]);

  const malformedStorage = createStorage({
    [STORAGE_KEY]: JSON.stringify({ scenarios: [scenario, { id: "bad", name: "Bad", messages: [] }] }),
  });
  assert.deepEqual(loadSavedScenarios(malformedStorage), [scenario]);
});

test("storage failures return safe results", () => {
  const failingStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.deepEqual(loadSavedScenarios(failingStorage), []);
  assert.equal(saveSavedScenarios(failingStorage, []), false);
});
