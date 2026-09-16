(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RegressionHelpers = factory();
  }
})(typeof self === "object" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "chatbot-tester.regression-scenarios.v1";
  const FORMAT = "chatbot-tester-regression-v1";
  const COLLECTION_FORMAT = "chatbot-tester-regression-collection-v1";
  const BEHAVIOR_KEYS = [
    "answerLatestQuestion",
    "preserveContext",
    "noUnnecessaryRepetition",
    "noContradictionOrRenegotiation",
    "doNotIgnoreUserQuestion",
  ];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
  }

  function slugPart(value, fallback) {
    const slug = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return slug || fallback;
  }

  function createScenarioId(name, botId) {
    return "regression-" + slugPart(botId, "bot") + "-" + slugPart(name, "scenario");
  }

  function normalizeBehaviorExpectations(value, defaultValue) {
    const source = isObject(value) ? value : {};
    const result = {};
    BEHAVIOR_KEYS.forEach(function (key) {
      if (Object.hasOwn(source, key)) {
        if (typeof source[key] !== "boolean") {
          throw new Error("Behavior expectation \"" + key + "\" must be boolean.");
        }
        result[key] = source[key];
      } else if (defaultValue !== undefined) {
        result[key] = Boolean(defaultValue);
      }
    });
    return result;
  }

  function normalizeAssertions(value) {
    if (value === undefined) return {};
    if (!isObject(value)) throw new Error("Assertions must be an object.");

    const result = {};
    ["intent", "step", "state", "telegramStatus"].forEach(function (key) {
      if (Object.hasOwn(value, key)) {
        if (!hasValue(value[key]) || (typeof value[key] !== "string" && typeof value[key] !== "number")) {
          throw new Error("Assertion \"" + key + "\" must be a non-empty string or number.");
        }
        result[key] = value[key];
      }
    });

    const fields = Object.hasOwn(value, "fields") ? value.fields : value.extractedFields;
    if (fields !== undefined) {
      if (!isObject(fields)) throw new Error("Extracted fields assertion must be an object.");
      result.fields = clone(fields);
    }

    if (Object.hasOwn(value, "telegramTriggerCount")) {
      if (!Number.isInteger(value.telegramTriggerCount) || value.telegramTriggerCount < 0) {
        throw new Error("Telegram trigger count must be a non-negative integer.");
      }
      result.telegramTriggerCount = value.telegramTriggerCount;
    }
    return result;
  }

  function getStateStepAssertion(value) {
    const assertions = isObject(value) ? value : {};
    if (Object.hasOwn(assertions, "state")) {
      return { key: "state", value: assertions.state };
    }
    if (Object.hasOwn(assertions, "step")) {
      return { key: "step", value: assertions.step };
    }
    return { key: "step", value: undefined };
  }

  function updateStateStepAssertion(value, nextValue) {
    const assertions = normalizeAssertions(value);
    const stateStepKey = Object.hasOwn(assertions, "state") ? "state" : "step";
    delete assertions.state;
    delete assertions.step;
    if (!hasValue(nextValue)) {
      return assertions;
    }

    assertions[stateStepKey] = nextValue;
    return assertions;
  }

  function buildEditableAssertions(previousAssertions, values) {
    const current = isObject(values) ? values : {};
    const stateStep = getStateStepAssertion(previousAssertions);
    const assertions = {};

    if (hasValue(current.intent)) assertions.intent = clone(current.intent);
    if (hasValue(current.stateStepValue)) assertions[stateStep.key] = clone(current.stateStepValue);
    if (current.fields !== undefined && current.fields !== null && current.fields !== "") {
      if (!isObject(current.fields)) throw new Error("Extracted fields assertion must be an object.");
      assertions.fields = clone(current.fields);
    }
    if (hasValue(current.telegramStatus)) assertions.telegramStatus = clone(current.telegramStatus);
    if (hasValue(current.telegramTriggerCount)) {
      assertions.telegramTriggerCount = clone(current.telegramTriggerCount);
    }
    return assertions;
  }

  function validateScenario(value) {
    if (!isObject(value)) throw new Error("Scenario must be a JSON object.");

    const id = typeof value.id === "string" ? value.id.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!id) throw new Error("Scenario ID is required.");
    if (!name) throw new Error("Scenario name is required.");
    if (!Array.isArray(value.messages) || !value.messages.length) {
      throw new Error("Scenario messages must be a non-empty array.");
    }
    if (value.messages.some(function (message) {
      return typeof message !== "string" || !message.trim();
    })) {
      throw new Error("Scenario messages must contain non-empty strings only.");
    }
    if (value.botId !== undefined && value.botId !== null && typeof value.botId !== "string") {
      throw new Error("Scenario botId must be a string when provided.");
    }
    if (value.channelMode !== undefined && !["website", "messenger"].includes(value.channelMode)) {
      throw new Error("Scenario channelMode must be website or messenger.");
    }

    const result = {
      format: typeof value.format === "string" ? value.format : FORMAT,
      id: id,
      name: name,
      messages: value.messages.slice(),
      assertions: normalizeAssertions(value.assertions),
      behaviorExpectations: normalizeBehaviorExpectations(value.behaviorExpectations),
    };
    if (value.botId) result.botId = value.botId.trim();
    if (value.channelMode) result.channelMode = value.channelMode;
    if (value.source && isObject(value.source)) result.source = clone(value.source);
    if (value.createdAt && typeof value.createdAt === "string") result.createdAt = value.createdAt;
    if (value.updatedAt && typeof value.updatedAt === "string") result.updatedAt = value.updatedAt;
    return result;
  }

  function telegramWasTriggered(telegram) {
    if (!isObject(telegram)) return false;
    if (Number(telegram.triggerCount) > 0) return true;
    return ["would_send", "sent", "success", "triggered", "completed"].includes(
      String(telegram.status || "").toLowerCase(),
    );
  }

  function getEvidenceTurns(turns) {
    const list = Array.isArray(turns) ? turns.filter(isObject) : [];
    const replayTurns = list.filter(function (turn) { return turn.runType === "replay"; });
    return replayTurns.length ? replayTurns : list;
  }

  function getLatestDebug(turns) {
    const evidenceTurns = getEvidenceTurns(turns);
    for (let index = evidenceTurns.length - 1; index >= 0; index -= 1) {
      if (isObject(evidenceTurns[index].debug)) return evidenceTurns[index].debug;
    }
    return {};
  }

  function buildKnownAssertions(turns) {
    const evidenceTurns = getEvidenceTurns(turns);
    const debug = getLatestDebug(evidenceTurns);
    const assertions = {};
    if (hasValue(debug.intent)) assertions.intent = clone(debug.intent);
    if (hasValue(debug.step)) assertions.step = clone(debug.step);
    if (isObject(debug.fields) && Object.keys(debug.fields).length) assertions.fields = clone(debug.fields);

    const telegramTurns = evidenceTurns.filter(function (turn) {
      return isObject(turn.debug) && isObject(turn.debug.telegram);
    });
    const latestTelegram = telegramTurns.length
      ? telegramTurns[telegramTurns.length - 1].debug.telegram
      : null;
    if (latestTelegram && hasValue(latestTelegram.status)) {
      assertions.telegramStatus = String(latestTelegram.status);
    }
    if (telegramTurns.length) {
      assertions.telegramTriggerCount = telegramTurns.reduce(function (count, turn) {
        return count + (telegramWasTriggered(turn.debug.telegram) ? 1 : 0);
      }, 0);
    }
    return assertions;
  }

  function createRegressionScenario(options) {
    const settings = options || {};
    const importedMessages = Array.isArray(settings.importedMessages) ? settings.importedMessages : [];
    const messages = importedMessages
      .filter(function (message) { return isObject(message) && message.role === "client"; })
      .map(function (message) {
        if (typeof message.text !== "string" || !message.text.trim()) {
          throw new Error("Imported client messages must contain non-empty text.");
        }
        return message.text;
      });
    if (!messages.length) throw new Error("No imported client messages are available.");

    const name = String(settings.name || "Regression from conversation").trim();
    const botId = settings.botId ? String(settings.botId).trim() : undefined;
    const now = settings.now || new Date().toISOString();
    return validateScenario({
      format: FORMAT,
      id: createScenarioId(name, botId),
      name: name || "Regression from conversation",
      botId: botId,
      channelMode: settings.channelMode === "messenger" ? "messenger" : "website",
      messages: messages,
      assertions: buildKnownAssertions(settings.turns),
      behaviorExpectations: normalizeBehaviorExpectations({}, true),
      source: { type: "conversation-replay" },
      createdAt: now,
      updatedAt: now,
    });
  }

  function uniqueScenarioId(baseId, usedIds) {
    const base = String(baseId || "").trim() || "regression-scenario";
    const used = new Set(Array.isArray(usedIds) ? usedIds.map(String) : []);
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(base + "-" + suffix)) suffix += 1;
    return base + "-" + suffix;
  }

  function reconcileSavedScenarioIds(scenarios, configuredIds) {
    const usedIds = new Set(Array.isArray(configuredIds) ? configuredIds.map(String) : []);
    return (Array.isArray(scenarios) ? scenarios : []).map(function (scenario) {
      const next = clone(scenario);
      next.id = uniqueScenarioId(next.id, Array.from(usedIds));
      usedIds.add(next.id);
      return next;
    });
  }

  function parseScenarioJson(raw) {
    let parsed;
    try {
      parsed = JSON.parse(String(raw || ""));
    } catch (error) {
      throw new Error("Invalid scenario JSON.");
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.scenarios)
        ? parsed.scenarios
        : [parsed];
    if (!candidates.length) throw new Error("Scenario JSON contains no scenarios.");
    return candidates.map(validateScenario);
  }

  function serializeScenarios(value) {
    const candidates = Array.isArray(value) ? value : [value];
    const scenarios = candidates.map(validateScenario);
    return JSON.stringify({ format: COLLECTION_FORMAT, scenarios: scenarios }, null, 2);
  }

  function loadSavedScenarios(storage, configuredIds) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : parsed && parsed.scenarios;
      if (!Array.isArray(candidates)) return [];
      const valid = [];
      candidates.forEach(function (candidate) {
        try {
          const scenario = validateScenario(candidate);
          valid.push(scenario);
        } catch (error) {
          // Ignore malformed saved entries so one bad record cannot break the tester.
        }
      });
      const result = reconcileSavedScenarioIds(valid, configuredIds);
      const idsChanged = result.some(function (scenario, index) {
        return scenario.id !== valid[index].id;
      });
      if (idsChanged && storage && typeof storage.setItem === "function") {
        try {
          storage.setItem(STORAGE_KEY, serializeScenarios(result));
        } catch (error) {
          // Keep the reconciled runtime list when persistence is unavailable.
        }
      }
      return result;
    } catch (error) {
      return [];
    }
  }

  function saveSavedScenarios(storage, scenarios) {
    try {
      storage.setItem(STORAGE_KEY, serializeScenarios(scenarios));
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    BEHAVIOR_KEYS: BEHAVIOR_KEYS.slice(),
    STORAGE_KEY: STORAGE_KEY,
    createRegressionScenario: createRegressionScenario,
    createScenarioId: createScenarioId,
    getStateStepAssertion: getStateStepAssertion,
    updateStateStepAssertion: updateStateStepAssertion,
    buildEditableAssertions: buildEditableAssertions,
    uniqueScenarioId: uniqueScenarioId,
    reconcileSavedScenarioIds: reconcileSavedScenarioIds,
    validateScenario: validateScenario,
    parseScenarioJson: parseScenarioJson,
    serializeScenarios: serializeScenarios,
    loadSavedScenarios: loadSavedScenarios,
    saveSavedScenarios: saveSavedScenarios,
  };
});
