"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BEHAVIOR_KEYS,
  createAiEvaluator,
  createResponseSchema,
  validateAiEvaluationResult,
  validateEvaluationPayload,
} = require("../ai-evaluator.js");

function payload(expectations = { answerLatestQuestion: true, preserveContext: false }) {
  return {
    scenario: { id: "scenario-1", name: "Behavior test" },
    messages: ["What is the latest status?", "And what happens next?"],
    replies: ["The current status is ready.", "The next step is review."],
    behaviorExpectations: expectations,
    channelMode: "website",
  };
}

function result(keys, passed = true) {
  return {
    overallPassed: passed,
    summary: passed ? "The enabled checks pass." : "A concrete behavior issue is present.",
    checks: keys.map((key) => ({
      key,
      passed,
      reason: passed ? "The supplied reply provides no concrete violation." : "The supplied reply provides concrete evidence.",
      turnIndices: [2],
    })),
  };
}

function createResponse(body, ok = true, status = 200) {
  return { ok, status, async json() { return body; } };
}

test("validates evaluation payloads and returns only enabled keys", () => {
  const normalized = validateEvaluationPayload(payload({
    answerLatestQuestion: true,
    preserveContext: false,
    noUnnecessaryRepetition: true,
  }));
  assert.deepEqual(normalized.enabledKeys, ["answerLatestQuestion", "noUnnecessaryRepetition"]);
  assert.deepEqual(normalized.payload.behaviorExpectations, {
    answerLatestQuestion: true,
    preserveContext: false,
    noUnnecessaryRepetition: true,
  });
  assert.throws(() => validateEvaluationPayload({ ...payload(), behaviorExpectations: { unknown: true } }), /Unknown/);
  assert.throws(() => validateEvaluationPayload({ ...payload(), replies: ["one"] }), /match/);
  assert.throws(() => validateEvaluationPayload({ ...payload(), messages: ["   "] }), /message/i);
});

test("rejects missing, duplicate, unknown, and inconsistent AI checks", () => {
  const enabled = ["answerLatestQuestion", "preserveContext"];
  assert.deepEqual(validateAiEvaluationResult(result(enabled), enabled).checks.map((check) => check.key), enabled);
  assert.throws(() => validateAiEvaluationResult(result(["answerLatestQuestion"]), enabled), /match|missing/i);
  assert.throws(() => validateAiEvaluationResult({ ...result(enabled), checks: [
    result(["answerLatestQuestion"]).checks[0],
    { ...result(["answerLatestQuestion"]).checks[0], key: "answerLatestQuestion" },
  ] }, enabled), /duplicated|missing/i);
  assert.throws(() => validateAiEvaluationResult({ ...result(enabled), checks: [
    { ...result(["answerLatestQuestion"]).checks[0], key: "not-a-key" },
    result(["preserveContext"]).checks[0],
  ] }, enabled), /invalid/i);
  assert.throws(() => validateAiEvaluationResult({ ...result(enabled), overallPassed: false }, enabled), /match/);
});

test("builds a strict Responses API request without putting the API key in the body", async () => {
  let requestUrl;
  let requestOptions;
  const evaluator = createAiEvaluator({
    env: {
      OPENAI_API_KEY: "sk-test-secret",
      OPENAI_EVAL_MODEL: "gpt-test-model",
      OPENAI_EVAL_REASONING: "high",
      OPENAI_API_BASE_URL: "https://example.test/v1",
      OPENAI_EVAL_TIMEOUT_MS: "1000",
    },
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return createResponse({ output_text: JSON.stringify(result(["answerLatestQuestion"])), usage: { total_tokens: 12 } });
    },
  });
  const evaluation = await evaluator.evaluate(payload({ answerLatestQuestion: true, preserveContext: false }));
  const sent = JSON.parse(requestOptions.body);
  assert.equal(requestUrl, "https://example.test/v1/responses");
  assert.equal(sent.model, "gpt-test-model");
  assert.deepEqual(sent.reasoning, { effort: "high" });
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.type, "json_schema");
  assert.equal(sent.text.format.strict, true);
  assert.deepEqual(sent.text.format.schema.properties.checks.minItems, 1);
  assert.deepEqual(sent.text.format.schema.properties.checks.maxItems, 1);
  assert.equal(sent.input[0].role, "system");
  assert.match(sent.input[0].content[0].text, /untrusted data/i);
  assert.equal(JSON.stringify(sent).includes("sk-test-secret"), false);
  assert.equal(requestOptions.headers.Authorization, "Bearer sk-test-secret");
  assert.deepEqual(evaluation.usage, { total_tokens: 12 });
});

test("does not call OpenAI when no expectations are enabled", async () => {
  let calls = 0;
  const evaluator = createAiEvaluator({
    env: {},
    fetchImpl: async () => { calls += 1; return createResponse({}); },
  });
  const evaluation = await evaluator.evaluate(payload({ answerLatestQuestion: false, preserveContext: false }));
  assert.equal(calls, 0);
  assert.equal(evaluation.status, "skipped");
});

test("fails safely for unconfigured, HTTP, refusal, malformed, and timeout responses", async () => {
  const baseEnv = { OPENAI_API_KEY: "sk-test-secret", OPENAI_EVAL_TIMEOUT_MS: "10" };
  await assert.rejects(
    createAiEvaluator({ env: {}, fetchImpl: async () => createResponse({}) }).evaluate(payload({ answerLatestQuestion: true })),
    (error) => error.code === "EVAL_UNCONFIGURED",
  );
  await assert.rejects(
    createAiEvaluator({ env: baseEnv, fetchImpl: async () => createResponse({ error: { message: "secret upstream body" } }, false, 500) }).evaluate(payload({ answerLatestQuestion: true })),
    (error) => error.code === "AI_HTTP_ERROR" && !error.message.includes("secret"),
  );
  await assert.rejects(
    createAiEvaluator({ env: baseEnv, fetchImpl: async () => createResponse({ output: [{ content: [{ type: "refusal" }] }] }) }).evaluate(payload({ answerLatestQuestion: true })),
    (error) => error.code === "AI_REFUSAL",
  );
  await assert.rejects(
    createAiEvaluator({ env: baseEnv, fetchImpl: async () => createResponse({ output_text: "not json" }) }).evaluate(payload({ answerLatestQuestion: true })),
    (error) => error.code === "AI_INVALID_RESULT",
  );
  await assert.rejects(
    createAiEvaluator({
      env: baseEnv,
      fetchImpl: async (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    }).evaluate(payload({ answerLatestQuestion: true })),
    (error) => error.code === "AI_TIMEOUT",
  );
});

test("keeps the public behavior key set stable", () => {
  assert.deepEqual(createResponseSchema(BEHAVIOR_KEYS).schema.properties.checks.items.properties.key.enum, BEHAVIOR_KEYS);
});
