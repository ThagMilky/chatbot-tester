(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ReplayHelpers = factory();
  }
})(typeof self === "object" ? self : this, function () {
  "use strict";

  function createReplayPlan(importedMessages) {
    const messages = Array.isArray(importedMessages) ? importedMessages : [];

    return messages.reduce(function (plan, message, index) {
      if (!message || message.role !== "client") {
        return plan;
      }

      const nextMessage = messages[index + 1];
      plan.push({
        replayIndex: plan.length,
        sourceIndex: index,
        clientText: String(message.text == null ? "" : message.text),
        originalBotReply: nextMessage && nextMessage.role === "bot"
          ? String(nextMessage.text == null ? "" : nextMessage.text)
          : null,
      });
      return plan;
    }, []);
  }

  function createReplayState(plan) {
    return {
      status: "idle",
      plan: Array.isArray(plan) ? plan.slice() : [],
      nextIndex: 0,
      failedIndex: null,
      currentIndex: null,
      results: [],
      stopRequested: false,
      locked: false,
      requestInFlight: false,
    };
  }

  function getNextReplayIndex(replayState) {
    if (!replayState || !Array.isArray(replayState.plan)) {
      return null;
    }

    return replayState.nextIndex < replayState.plan.length ? replayState.nextIndex : null;
  }

  function canStartReplayTurn(replayState, index) {
    return Boolean(
      replayState &&
      replayState.status === "running" &&
      !replayState.stopRequested &&
      !replayState.requestInFlight &&
      replayState.nextIndex === index,
    );
  }

  function isReplayComplete(replayState) {
    return Boolean(
      replayState &&
      Array.isArray(replayState.plan) &&
      replayState.nextIndex >= replayState.plan.length,
    );
  }

  function isSendBlocked(options) {
    const settings = options || {};
    if (settings.replayLocked && !settings.isReplayRequest) {
      return true;
    }

    return Boolean(settings.isSending && !settings.edgeTestMode);
  }

  return {
    createReplayPlan: createReplayPlan,
    createReplayState: createReplayState,
    getNextReplayIndex: getNextReplayIndex,
    canStartReplayTurn: canStartReplayTurn,
    isReplayComplete: isReplayComplete,
    isSendBlocked: isSendBlocked,
  };
});
