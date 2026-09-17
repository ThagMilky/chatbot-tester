"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createReplayPlan,
  createReplayState,
  canStartReplayTurn,
  getNextReplayIndex,
  isReplayComplete,
  isSendBlocked,
} = require("../replay-helpers.js");

test("builds a client-only replay plan with the immediately following original bot reply", () => {
  const importedMessages = [
    { role: "bot", text: "Opening bot message" },
    { role: "client", text: "First client message" },
    { role: "bot", text: "First original reply" },
    { role: "client", text: "Second client message" },
    { role: "client", text: "Third client message" },
  ];

  const plan = createReplayPlan(importedMessages);

  assert.deepEqual(plan, [
    {
      replayIndex: 0,
      sourceIndex: 1,
      clientText: "First client message",
      originalBotReply: "First original reply",
    },
    {
      replayIndex: 1,
      sourceIndex: 3,
      clientText: "Second client message",
      originalBotReply: null,
    },
    {
      replayIndex: 2,
      sourceIndex: 4,
      clientText: "Third client message",
      originalBotReply: null,
    },
  ]);
  assert.equal(importedMessages[2].text, "First original reply");
});

test("does not include staff transcript content in the replay plan", () => {
  const plan = createReplayPlan([
    { role: "client", text: "Client question" },
    { role: "staff", text: "Staff reference reply" },
    { role: "client", text: "Next client question" },
  ]);

  assert.deepEqual(plan.map((entry) => entry.clientText), [
    "Client question",
    "Next client question",
  ]);
  assert.equal(plan[0].originalBotReply, null);
});

test("creates fresh replay progress and advances only after a completed turn", () => {
  const plan = createReplayPlan([
    { role: "client", text: "One" },
    { role: "bot", text: "Reply" },
  ]);
  const replay = createReplayState(plan);

  assert.equal(replay.status, "idle");
  assert.equal(replay.nextIndex, 0);
  assert.equal(getNextReplayIndex(replay), 0);
  assert.equal(isReplayComplete(replay), false);

  replay.status = "running";
  assert.equal(canStartReplayTurn(replay, 0), true);
  replay.requestInFlight = true;
  assert.equal(canStartReplayTurn(replay, 0), false);
  replay.requestInFlight = false;
  replay.stopRequested = true;
  assert.equal(canStartReplayTurn(replay, 0), false);

  replay.nextIndex = 1;
  assert.equal(getNextReplayIndex(replay), null);
  assert.equal(isReplayComplete(replay), true);
});

test("blocks ordinary sends while replay is locked, including Edge Test Mode", () => {
  assert.equal(isSendBlocked({
    replayLocked: true,
    isReplayRequest: false,
    isSending: false,
    edgeTestMode: true,
  }), true);
  assert.equal(isSendBlocked({
    replayLocked: true,
    isReplayRequest: false,
    isSending: false,
    edgeTestMode: false,
  }), true);
});

test("allows dedicated replay sends while replay is locked", () => {
  assert.equal(isSendBlocked({
    replayLocked: true,
    isReplayRequest: true,
    isSending: false,
    edgeTestMode: true,
  }), false);
});

test("keeps the existing in-flight guard for non-edge sends", () => {
  assert.equal(isSendBlocked({
    replayLocked: false,
    isReplayRequest: false,
    isSending: true,
    edgeTestMode: false,
  }), true);
  assert.equal(isSendBlocked({
    replayLocked: false,
    isReplayRequest: false,
    isSending: true,
    edgeTestMode: true,
  }), false);
});
