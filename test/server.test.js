"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createServer, EVALUATION_PATH, HOST } = require("../server.js");

function payload(expectations = { answerLatestQuestion: true }) {
  return {
    scenario: { id: "server-scenario", name: "Server scenario" },
    messages: ["What is next?"],
    replies: ["The next step is review."],
    behaviorExpectations: expectations,
    channelMode: "messenger",
  };
}

function result(key = "answerLatestQuestion", passed = true) {
  return {
    overallPassed: passed,
    summary: "Server evaluator result.",
    checks: [{
      key,
      passed,
      reason: "The visible conversation supports this result.",
      turnIndices: [1],
    }],
  };
}

async function withServer(options, callback) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, HOST, resolve));
  const address = server.address();
  try {
    return await callback("http://" + HOST + ":" + address.port, address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function readResponse(response) {
  return { status: response.status, body: JSON.parse(await response.text()) };
}

async function postRaw(url, headers, body) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: "POST",
      headers,
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("serves static files and evaluates behavior through the POST endpoint", async () => {
  let received;
  await withServer({
    evaluator: {
      isConfigured: () => true,
      async evaluate(input) {
        received = input;
        return result();
      },
    },
  }, async (baseUrl) => {
    const staticResponse = await fetch(baseUrl + "/");
    assert.equal(staticResponse.status, 200);
    assert.match(await staticResponse.text(), /Chatbot Tester/);

    const staticHeadResponse = await fetch(baseUrl + "/", { method: "HEAD" });
    assert.equal(staticHeadResponse.status, 200);
    assert.equal(await staticHeadResponse.text(), "");

    const evaluationResponse = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const evaluation = await readResponse(evaluationResponse);
    assert.equal(evaluation.status, 200);
    assert.equal(evaluation.body.status, "completed");
    assert.equal(evaluation.body.overallPassed, true);
    assert.deepEqual(received, payload());
  });
});

test("accepts application/json with a charset parameter and a local Origin", async () => {
  let configuredCalls = 0;
  let evaluateCalls = 0;
  await withServer({
    evaluator: {
      isConfigured() {
        configuredCalls += 1;
        return true;
      },
      async evaluate() {
        evaluateCalls += 1;
        return result();
      },
    },
  }, async (baseUrl, port) => {
    const response = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Origin: "http://127.0.0.1:" + port,
      },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 200);
    assert.equal((await readResponse(response)).body.status, "completed");
    assert.equal(configuredCalls, 1);
    assert.equal(evaluateCalls, 1);
  });
});

test("rejects non-JSON evaluation requests before evaluator configuration or evaluation", async () => {
  let configuredCalls = 0;
  let evaluateCalls = 0;
  await withServer({
    evaluator: {
      isConfigured() {
        configuredCalls += 1;
        return true;
      },
      async evaluate() {
        evaluateCalls += 1;
        return result();
      },
    },
  }, async (baseUrl) => {
    const textResponse = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload()),
    });
    assert.equal(textResponse.status, 415);
    assert.equal((await readResponse(textResponse)).body.error, "Evaluation request must use application/json.");

    const missingResponse = await postRaw(baseUrl + EVALUATION_PATH, {}, JSON.stringify(payload()));
    assert.equal(missingResponse.status, 415);
    assert.equal(missingResponse.body.error, "Evaluation request must use application/json.");
    assert.equal(configuredCalls, 0);
    assert.equal(evaluateCalls, 0);
  });
});

test("rejects external and null Origins before evaluator configuration or evaluation", async () => {
  let configuredCalls = 0;
  let evaluateCalls = 0;
  await withServer({
    evaluator: {
      isConfigured() {
        configuredCalls += 1;
        return true;
      },
      async evaluate() {
        evaluateCalls += 1;
        return result();
      },
    },
  }, async (baseUrl) => {
    for (const origin of ["https://evil.example", "null"]) {
      const response = await fetch(baseUrl + EVALUATION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(payload()),
      });
      assert.equal(response.status, 403);
      assert.equal((await readResponse(response)).body.error, "Evaluation request origin is not allowed.");
    }
    assert.equal(configuredCalls, 0);
    assert.equal(evaluateCalls, 0);
  });
});

test("rejects arbitrary Host values before evaluator configuration or evaluation", async () => {
  let configuredCalls = 0;
  let evaluateCalls = 0;
  await withServer({
    evaluator: {
      isConfigured() {
        configuredCalls += 1;
        return true;
      },
      async evaluate() {
        evaluateCalls += 1;
        return result();
      },
    },
  }, async (baseUrl) => {
    const response = await postRaw(baseUrl + EVALUATION_PATH, {
      "Content-Type": "application/json",
      Host: "evil.example",
    }, JSON.stringify(payload()));
    assert.equal(response.status, 403);
    assert.equal(response.body.error, "Evaluation request host is not allowed.");
    assert.equal(configuredCalls, 0);
    assert.equal(evaluateCalls, 0);
  });
});

test("rejects malformed, oversized, and unsupported evaluation requests safely", async () => {
  let calls = 0;
  await withServer({
    maxBodyBytes: 64,
    evaluator: { isConfigured: () => true, async evaluate() { calls += 1; return result(); } },
  }, async (baseUrl) => {
    const malformed = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual((await readResponse(malformed)).body, {
      status: "error",
      error: "Evaluation request must be valid JSON.",
    });

    const oversized = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(200) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await readResponse(oversized)).body.error, "Evaluation request is too large.");

    const unsupported = await fetch(baseUrl + EVALUATION_PATH, { method: "PUT", body: "{}" });
    assert.equal(unsupported.status, 405);
    assert.equal(unsupported.headers.get("allow"), "POST");
    assert.equal(calls, 0);
  });
});

test("returns safe 503 when evaluator configuration is unavailable", async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const response = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const data = await readResponse(response);
    assert.equal(data.status, 503);
    assert.deepEqual(data.body, {
      status: "unavailable",
      error: "Behavior evaluation is not configured.",
    });
  });
});

test("skips the evaluator when every expectation is disabled and rejects invalid evaluator output", async () => {
  let calls = 0;
  await withServer({
    evaluator: {
      isConfigured: () => true,
      async evaluate() {
        calls += 1;
        return { ...result(), checks: [] };
      },
    },
  }, async (baseUrl) => {
    const skipped = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload({ answerLatestQuestion: false })),
    });
    assert.equal(skipped.status, 200);
    assert.equal((await readResponse(skipped)).body.status, "skipped");
    assert.equal(calls, 0);

    const invalid = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(invalid.status, 502);
    assert.deepEqual((await readResponse(invalid)).body, {
      status: "error",
      error: "Behavior evaluation failed.",
    });
  });
});

test("keeps AI result turnIndices bounded by the submitted messages", async () => {
  await withServer({
    evaluator: { isConfigured: () => true, async evaluate() {
      return { ...result(), checks: [{ ...result().checks[0], turnIndices: [2] }] };
    } },
  }, async (baseUrl) => {
    const response = await fetch(baseUrl + EVALUATION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    assert.equal(response.status, 502);
    assert.deepEqual((await readResponse(response)).body, {
      status: "error",
      error: "Behavior evaluation failed.",
    });
  });
});
