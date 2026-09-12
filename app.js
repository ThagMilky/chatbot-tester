(function () {
  "use strict";

  // Adapter boundary: change these functions when a bot uses a different contract.
  function getChannelSettings(bot, channelMode) {
    const channels = bot && isObject(bot.channels) ? bot.channels : {};
    const mode = channelMode === "messenger" ? "messenger" : "website";
    return isObject(channels[mode]) ? channels[mode] : {};
  }

  function getConfiguredOptionValue(option, settings) {
    if (!option || !isObject(option)) {
      return undefined;
    }

    const field = settings && settings.quickReplyPayloadValueField
      ? String(settings.quickReplyPayloadValueField)
      : "id";
    if (option[field] !== undefined && option[field] !== null && option[field] !== "") {
      return option[field];
    }

    return firstValue(option.id, option.payload, option.value, option.sendValue, option.label);
  }

  function buildRequest(bot, message, sessionId, context) {
    const channelMode = context && context.channelMode === "messenger" ? "messenger" : "website";
    const channelSettings = getChannelSettings(bot, channelMode);
    const request = {
      sessionId: sessionId,
      message: message,
      channel: channelSettings.requestChannel || (channelMode === "messenger" ? "messenger" : "chat-test"),
    };

    if (isObject(channelSettings.requestBody)) {
      Object.assign(request, channelSettings.requestBody);
    }

    if (channelMode === "messenger" && context && context.selectedOption) {
      const payload = getConfiguredOptionValue(context.selectedOption, channelSettings);
      const payloadField = channelSettings.quickReplyPayloadField || "quickReplyPayload";
      if (payload !== undefined && payload !== null && payload !== "") {
        request[payloadField] = payload;
      }
    }

    if (context && context.edgeTestMode && context.requestId) {
      request.messageId = context.requestId;
    }

    const testMode = getTestMode(bot);

    if (testMode && isObject(testMode.requestBody)) {
      Object.assign(request, testMode.requestBody);
    }

    return request;
  }

  // Cyno currently accepts the same request fields as the default contract.
  // Keeping this as a named adapter makes future contract changes local to this bot.
  function buildCynoRequest(bot, message, sessionId, context) {
    return buildRequest(bot, message, sessionId, context);
  }

  function buildFetchOptions(bot, requestPayload, controller, context) {
    const testMode = getTestMode(bot);
    const channelSettings = getChannelSettings(bot, context && context.channelMode);
    const headers = Object.assign(
      {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      isObject(bot && bot.requestHeaders) ? bot.requestHeaders : {},
      isObject(channelSettings.headers) ? channelSettings.headers : {},
      testMode && isObject(testMode.headers) ? testMode.headers : {},
    );
    const options = {
      method: (bot && bot.method) || "POST",
      headers: headers,
      body: JSON.stringify(requestPayload),
    };

    if (controller) {
      options.signal = controller.signal;
    }

    return options;
  }

  function parseResponse(bot, response) {
    if (!response || typeof response.reply !== "string") {
      throw new Error('Response không có trường "reply" dạng chuỗi.');
    }

    return response.reply;
  }

  function normalizeSuggestedOptions(rawOptions, settings) {
    if (!Array.isArray(rawOptions)) {
      return [];
    }

    const preferId = Boolean(settings && settings.preferId);

    return rawOptions
      .map(function (option) {
        if (typeof option === "string") {
          const text = option.trim();
          return text ? { label: text, sendValue: text } : null;
        }

        if (!isObject(option)) {
          return null;
        }

        const label = firstValue(option.label, option.title, option.text, option.name, option.value, option.id);
        const sendValue = preferId
          ? firstValue(option.id, option.value, option.payload, option.text, label)
          : firstValue(option.value, option.id, option.payload, option.text, label);

        if (label === undefined || label === null || label === "" || sendValue === undefined || sendValue === null) {
          return null;
        }

        return {
          label: String(label).trim(),
          sendValue: String(sendValue),
          ...(option.id !== undefined && option.id !== null ? { id: String(option.id) } : {}),
          ...(option.value !== undefined && option.value !== null ? { value: String(option.value) } : {}),
          ...(option.payload !== undefined && option.payload !== null ? { payload: String(option.payload) } : {}),
          ...(option.field !== undefined && option.field !== null ? { field: String(option.field) } : {}),
        };
      })
      .filter(function (option) {
        return option && option.label;
      })
      .slice(0, 13);
  }

  function parseSuggestedOptions(bot, response) {
    const rawOptions = response && [
      response.suggestedOptions,
      response.quickReplies,
      response.quick_replies,
      response.suggestedReplies,
      response.options,
    ].find(Array.isArray);

    return normalizeSuggestedOptions(rawOptions, {
      preferId: bot && bot.optionValueField === "id",
    });
  }

  function parseCynoSuggestedOptions(bot, response) {
    return normalizeSuggestedOptions(response && response.suggestedOptions);
  }

  function parseCynoResponse(bot, response) {
    // Cyno may return text responses with different semantic types, such as
    // "text" or "handover". The UI only needs the shared text payload.
    if (response && typeof response.text === "string") {
      return response.text;
    }

    // Keep the generic response as a fallback while the backend contract evolves.
    if (response && typeof response.reply === "string") {
      return response.reply;
    }

    throw new Error('Response Cyno không có trường "text" hoặc "reply" dạng chuỗi.');
  }

  // Default normalized debug contract. Per-bot mapping can be added here without changing UI code.
  function parseDebug(bot, response) {
    const source = response && isObject(response.debug) ? response.debug : {};
    const telegramSource =
      source.telegramMock ||
      source.telegram ||
      source.telegramDryRun ||
      (response && response.telegramMock);
    const telegram = normalizeTelegram(telegramSource);

    return {
      available: Object.keys(source).length > 0 || Boolean(telegram),
      intent: firstValue(source.intent, source.selectedIntent),
      step: firstValue(source.step, source.state, source.currentState, source.currentStep),
      fields: firstValue(source.extractedFields, source.fields, source.leadFields),
      model: firstValue(source.model, source.llm),
      durationMs: toNumberOrNull(source.durationMs),
      pipeline: normalizePipeline(firstValue(source.pipeline, source.events, source.steps)),
      error: firstValue(source.error, source.errorMessage),
      stack: firstValue(source.stackTrace, source.stack),
      telegram: telegram,
    };
  }

  const ADAPTERS = {
    default: {
      buildRequest: buildRequest,
      buildFetchOptions: buildFetchOptions,
      parseResponse: parseResponse,
      parseSuggestedOptions: parseSuggestedOptions,
      parseDebug: parseDebug,
    },
    "cyno-software": {
      buildRequest: buildCynoRequest,
      buildFetchOptions: buildFetchOptions,
      parseResponse: parseCynoResponse,
      parseSuggestedOptions: parseCynoSuggestedOptions,
      parseDebug: parseDebug,
    },
  };

  function getAdapter(bot) {
    return ADAPTERS[(bot && bot.adapter) || "default"] || ADAPTERS.default;
  }

  const elements = {
    botSelect: document.getElementById("bot-select"),
    botStatus: document.getElementById("bot-status"),
    apiUrl: document.getElementById("api-url"),
    testModeLabel: document.getElementById("test-mode-label"),
    testModeBadge: document.getElementById("test-mode-badge"),
    testModeHint: document.getElementById("test-mode-hint"),
    sessionId: document.getElementById("session-id"),
    copySession: document.getElementById("copy-session"),
    newConversation: document.getElementById("new-conversation"),
    clearChat: document.getElementById("clear-chat"),
    channelMode: document.getElementById("channel-mode"),
    edgeTestMode: document.getElementById("edge-test-mode"),
    edgeTestHint: document.getElementById("edge-test-hint"),
    edgeTestLabel: document.getElementById("edge-test-label"),
    duplicateEventMode: document.getElementById("duplicate-event-mode"),
    scenarioSelect: document.getElementById("scenario-select"),
    runScenario: document.getElementById("run-scenario"),
    scenarioProgress: document.getElementById("scenario-progress"),
    scenarioResult: document.getElementById("scenario-result"),
    exportFormat: document.getElementById("export-format"),
    exportQa: document.getElementById("export-qa"),
    chatTitle: document.getElementById("chat-title"),
    connectionState: document.getElementById("connection-state"),
    messages: document.getElementById("chat-messages"),
    emptyState: document.getElementById("empty-state"),
    form: document.getElementById("chat-form"),
    messageInput: document.getElementById("message-input"),
    sendButton: document.getElementById("send-button"),
    sendLabel: document.getElementById("send-label"),
    debugMessageLabel: document.getElementById("debug-message-label"),
    debugStatus: document.getElementById("debug-status"),
    debugTime: document.getElementById("debug-time"),
    debugDuration: document.getElementById("debug-duration"),
    debugIntent: document.getElementById("debug-intent"),
    debugStep: document.getElementById("debug-step"),
    debugModel: document.getElementById("debug-model"),
    requestJson: document.getElementById("request-json"),
    debugFields: document.getElementById("debug-fields"),
    pipelineList: document.getElementById("pipeline-list"),
    telegramDebug: document.getElementById("telegram-debug"),
    telegramStatus: document.getElementById("telegram-status"),
    telegramTrigger: document.getElementById("telegram-trigger"),
    telegramOutcome: document.getElementById("telegram-outcome"),
    telegramEvents: document.getElementById("telegram-events"),
    telegramPayload: document.getElementById("telegram-payload"),
    telegramReason: document.getElementById("telegram-reason"),
    rawResponse: document.getElementById("raw-response"),
    parsedReply: document.getElementById("parsed-reply"),
    debugErrorBlock: document.getElementById("debug-error-block"),
    debugError: document.getElementById("debug-error"),
    debugStackBlock: document.getElementById("debug-stack-block"),
    debugStack: document.getElementById("debug-stack"),
    toast: document.getElementById("toast"),
  };

  const state = {
    bots: Array.isArray(window.CHATBOT_CONFIG)
      ? window.CHATBOT_CONFIG.filter(function (bot) {
          return bot && bot.enabled !== false;
        })
      : [],
    selectedBot: null,
    sessionId: createSessionId(),
    messages: [],
    turns: [],
    selectedTurnId: null,
    nextTurnNumber: 1,
    isSending: false,
    activeRequestCount: 0,
    channelMode: "website",
    edgeTestMode: false,
    duplicateEventMode: false,
    scenario: {
      running: false,
      scenarioId: null,
      current: 0,
      total: 0,
      result: null,
    },
    toastTimer: null,
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function firstValue() {
    const values = Array.prototype.slice.call(arguments);
    return values.find(function (value) {
      return value !== undefined && value !== null && value !== "";
    });
  }

  function toNumberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function createSessionId() {
    const randomPart =
      window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

    return "test-" + Date.now().toString(36) + "-" + randomPart;
  }

  function createRequestId() {
    return "edge-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function isRequestBlocked() {
    return state.isSending && !state.edgeTestMode;
  }

  function getBotApiUrl(bot) {
    return bot && typeof bot.apiUrl === "string" ? bot.apiUrl.trim() : "";
  }

  function getTestMode(bot) {
    return bot && isObject(bot.testMode) && bot.testMode.enabled !== false ? bot.testMode : null;
  }

  function isLocalDevMode(bot) {
    const localHost = ["localhost", "127.0.0.1", "::1", ""].includes(window.location.hostname);
    return localHost || Boolean(bot && bot.devMode === true);
  }

  function formatDebugValue(value, emptyLabel) {
    if (value === null || value === undefined || value === "") {
      return emptyLabel || "—";
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  function formatDuration(value) {
    return value === null || value === undefined ? "—" : value + " ms";
  }

  function normalizePipelineStatus(value) {
    const status = String(value || "success").toLowerCase();

    if (["failed", "failure", "error", "✗"].some(function (token) { return status.includes(token); })) {
      return "failed";
    }
    if (["skipped", "skip", "not_run", "not-triggered", "⊘"].some(function (token) { return status.includes(token); })) {
      return "skipped";
    }
    if (["pending", "running", "in_progress"].some(function (token) { return status.includes(token); })) {
      return "pending";
    }

    return "success";
  }

  function normalizePipeline(rawPipeline) {
    if (!Array.isArray(rawPipeline)) {
      return [];
    }

    return rawPipeline.map(function (event, index) {
      if (typeof event === "string") {
        return { label: event, status: "success", detail: "" };
      }

      const safeEvent = isObject(event) ? event : {};
      const label = firstValue(safeEvent.step, safeEvent.name, safeEvent.event, safeEvent.label) || "Step " + (index + 1);
      const status = normalizePipelineStatus(
        firstValue(
          safeEvent.status,
          safeEvent.state,
          safeEvent.ok === false ? "failed" : safeEvent.ok === true ? "success" : "success",
        ),
      );
      const detail = firstValue(safeEvent.error, safeEvent.message, safeEvent.detail) || "";

      return { label: String(label), status: status, detail: String(detail) };
    });
  }

  function normalizeTelegram(rawTelegram) {
    if (!isObject(rawTelegram)) {
      return null;
    }

    const status = String(firstValue(rawTelegram.status, rawTelegram.outcome, rawTelegram.action) || "unknown");
    const rawEvents = firstValue(rawTelegram.events, rawTelegram.checks, rawTelegram.steps);
    let events = normalizePipeline(rawEvents);

    if (!events.length && status.toLowerCase() === "would_send") {
      events = [
        { label: "Telegram notification triggered", status: "success", detail: "" },
        { label: "Telegram send skipped (test mode)", status: "skipped", detail: "" },
      ];
    }

    return {
      trigger: String(firstValue(rawTelegram.trigger, rawTelegram.event, rawTelegram.triggerName) || "—"),
      status: status,
      payload: firstValue(rawTelegram.payload, rawTelegram.notificationPayload, rawTelegram.messagePayload),
      events: events,
      reason: String(firstValue(rawTelegram.reason, rawTelegram.skipReason, rawTelegram.error) || ""),
    };
  }

  function updateSessionDisplay() {
    elements.sessionId.value = state.sessionId;
  }

  function updateTestModeDisplay() {
    const testMode = getTestMode(state.selectedBot);

    if (!testMode) {
      elements.testModeLabel.textContent = "Chưa cấu hình";
      elements.testModeBadge.textContent = "OFF";
      elements.testModeBadge.className = "mode-badge off";
      elements.testModeHint.textContent = "Request không thêm test-mode flag.";
      return;
    }

    elements.testModeLabel.textContent = testMode.label || "Telegram dry-run";
    elements.testModeBadge.textContent = "ON";
    elements.testModeBadge.className = "mode-badge on";
    elements.testModeHint.textContent =
      "Tester gửi test-mode flag để backend chạy trigger rules nhưng bỏ qua thao tác gửi Telegram cuối cùng.";
  }

  function updateChannelDisplay() {
    const isMessenger = state.channelMode === "messenger";
    if (elements.channelMode) {
      elements.channelMode.value = state.channelMode;
    }
    if (elements.edgeTestMode) {
      elements.edgeTestMode.checked = state.edgeTestMode;
    }
    if (elements.edgeTestLabel) {
      elements.edgeTestLabel.textContent = state.edgeTestMode ? "ON" : "OFF";
    }
    if (elements.duplicateEventMode) {
      elements.duplicateEventMode.checked = state.duplicateEventMode;
      elements.duplicateEventMode.disabled = !state.edgeTestMode || state.isSending;
    }
    if (elements.edgeTestHint) {
      elements.edgeTestHint.textContent = state.edgeTestMode
        ? "Đang bật: có thể gửi song song. Duplicate dùng lại messageId khi chọn Duplicate."
        : "Tắt mặc định: khi gửi, input sẽ khóa để tránh request chồng nhau.";
    }
    if (elements.channelMode) {
      elements.channelMode.setAttribute("aria-label", isMessenger ? "Messenger mode" : "Website mode");
    }
  }

  function updateBotDisplay() {
    const bot = state.selectedBot;
    const apiUrl = getBotApiUrl(bot);

    elements.chatTitle.textContent = bot ? bot.name : "Chưa có chatbot";
    elements.apiUrl.textContent = apiUrl || "Chưa cấu hình API URL trong config.js";
    elements.apiUrl.classList.toggle("unconfigured", !apiUrl);

    if (!bot) {
      elements.botStatus.textContent = "Chưa có bot enabled trong config.js.";
      elements.connectionState.textContent = "Chưa cấu hình";
    } else {
      elements.botStatus.textContent = apiUrl
        ? "Bot đã có API URL và sẵn sàng gửi request."
        : "Bot đang chờ cấu hình apiUrl trong config.js.";
      elements.connectionState.textContent = apiUrl ? "Sẵn sàng" : "Chưa cấu hình";
    }

    updateTestModeDisplay();
  }

  function populateBotSelect() {
    elements.botSelect.replaceChildren();

    if (!state.bots.length) {
      const option = document.createElement("option");
      option.textContent = "Chưa có bot enabled";
      option.value = "";
      elements.botSelect.appendChild(option);
      elements.botSelect.disabled = true;
      updateBotDisplay();
      return;
    }

    state.bots.forEach(function (bot) {
      const option = document.createElement("option");
      option.value = bot.id;
      option.textContent = bot.name;
      elements.botSelect.appendChild(option);
    });

    state.selectedBot = state.bots[0];
    elements.botSelect.value = state.selectedBot.id;
    updateBotDisplay();
  }

  function setConnectionState(label, mode) {
    elements.connectionState.textContent = label;
    elements.connectionState.classList.toggle("loading", mode === "loading");
  }

  function setLoading(isLoading) {
    state.activeRequestCount = Math.max(0, state.activeRequestCount + (isLoading ? 1 : -1));
    state.isSending = state.activeRequestCount > 0;
    const lockInput = state.isSending && !state.edgeTestMode;
    elements.sendButton.disabled = lockInput || !getBotApiUrl(state.selectedBot);
    elements.messageInput.disabled = lockInput;
    elements.botSelect.disabled = state.isSending || !state.bots.length;
    elements.newConversation.disabled = state.isSending;
    elements.clearChat.disabled = state.isSending;
    if (elements.channelMode) elements.channelMode.disabled = state.isSending;
    if (elements.edgeTestMode) elements.edgeTestMode.disabled = state.isSending;
    elements.sendButton.classList.toggle("loading", state.isSending);
    elements.sendLabel.textContent = state.isSending
      ? state.edgeTestMode && state.activeRequestCount > 1
        ? "Đang gửi " + state.activeRequestCount + "..."
        : "Đang gửi..."
      : "Send";
    setConnectionState(
      state.isSending
        ? state.edgeTestMode && state.activeRequestCount > 1
          ? "Đang gửi " + state.activeRequestCount + " request"
          : "Đang gửi"
        : getBotApiUrl(state.selectedBot) ? "Sẵn sàng" : "Chưa cấu hình",
      state.isSending ? "loading" : "ready",
    );
    updateChannelDisplay();
    updateScenarioControls();
  }

  function selectSuggestedOption(option) {
    if (!option || isRequestBlocked()) {
      return;
    }

    const message = state.channelMode === "messenger" ? option.label : option.sendValue;
    void sendMessage(message, option.label, { selectedOption: option });
  }

  function clearSuggestedOptions() {
    state.messages.forEach(function (message) {
      if (Array.isArray(message.options)) {
        message.options = [];
      }
    });
  }

  function getTurn(turnId) {
    return state.turns.find(function (turn) {
      return turn.id === turnId;
    }) || null;
  }

  function createTurn(bot, message, displayText, requestPayload, adapter) {
    const turn = {
      id: "turn-" + state.nextTurnNumber,
      number: state.nextTurnNumber,
      botId: bot && bot.id ? bot.id : null,
      botName: bot && bot.name ? bot.name : null,
      sessionId: state.sessionId,
      channelMode: state.channelMode,
      inputText: message,
      displayText: displayText,
      request: requestPayload,
      response: null,
      reply: null,
      status: "Đang chờ...",
      responseTime: "—",
      debug: adapter.parseDebug(bot, null),
      error: null,
      stack: null,
      createdAt: new Date().toISOString(),
    };

    state.nextTurnNumber += 1;
    state.turns.push(turn);
    state.selectedTurnId = turn.id;
    return turn;
  }

  function updateTurn(turn, patch) {
    Object.assign(turn, patch);
    if (state.selectedTurnId === turn.id) {
      updateDebug(turn);
    }
  }

  function selectTurn(turnId) {
    const turn = getTurn(turnId);
    if (!turn) return;
    state.selectedTurnId = turn.id;
    renderMessages(false);
    updateDebug(turn);
  }

  function copyText(text, successMessage) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(function () {
        showToast(successMessage);
      }).catch(function () {
        return copyTextFallback(text, successMessage);
      });
    }

    return copyTextFallback(text, successMessage);
  }

  function copyTextFallback(text, successMessage) {
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.setAttribute("readonly", "true");
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.appendChild(temporary);
    temporary.select();
    document.execCommand("copy");
    temporary.remove();
    showToast(successMessage);
    return Promise.resolve();
  }

  function copyTurnRequest(turn) {
    if (!turn || !turn.request) {
      showToast("Turn này chưa có request để copy.");
      return;
    }
    void copyText(formatDebugValue(turn.request), "Đã copy request của turn.");
  }

  function resendUserMessage(message, mode) {
    const turn = getTurn(message && message.turnId);
    if (!turn) {
      showToast("Không tìm thấy dữ liệu turn để gửi lại.");
      return;
    }
    if (isRequestBlocked()) {
      showToast("Đang có request chạy. Bật Edge test mode nếu muốn gửi song song.");
      return;
    }

    let inputText = turn.inputText || message.text;
    if (mode === "edit") {
      inputText = window.prompt("Chỉnh sửa nội dung trước khi gửi lại:", inputText);
      if (inputText === null) return;
      inputText = String(inputText).trim();
      if (!inputText) {
        showToast("Nội dung chỉnh sửa không được để trống.");
        return;
      }
    }

    const sendOptions = {};
    if (mode === "duplicate" && state.edgeTestMode && turn.request) {
      const requestId = turn.request.messageId || turn.request.eventId;
      if (requestId) sendOptions.requestId = requestId;
    }
    void sendMessage(inputText, mode === "edit" ? inputText : message.text, sendOptions);
  }

  function renderMessages(shouldScroll) {
    elements.messages.replaceChildren();

    if (!state.messages.length) {
      elements.messages.appendChild(elements.emptyState);
      return;
    }

    state.messages.forEach(function (message) {
      const row = document.createElement("div");
      row.className = "message-row " + message.type;
      if (message.turnId) {
        row.dataset.turnId = message.turnId;
        row.classList.toggle("selected-turn", state.selectedTurnId === message.turnId);
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-pressed", state.selectedTurnId === message.turnId ? "true" : "false");
        row.addEventListener("click", function (event) {
          if (event.target.closest("button")) return;
          selectTurn(message.turnId);
        });
        row.addEventListener("keydown", function (event) {
          if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
            event.preventDefault();
            selectTurn(message.turnId);
          }
        });
      }

      const meta = document.createElement("span");
      meta.className = "message-meta";
      meta.textContent = message.type === "user" ? "Bạn" : message.type === "bot" ? "Bot" : "Tester";

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.textContent = message.text;

      row.append(meta, bubble);

      if (message.type === "user" && message.turnId) {
        const actions = document.createElement("div");
        actions.className = "message-actions";
        [
          ["Retry", "retry"],
          ["Edit & Resend", "edit"],
          ["Copy request", "copy"],
        ].forEach(function (action) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "message-action";
          button.textContent = action[0];
          button.addEventListener("click", function () {
            if (action[1] === "copy") {
              copyTurnRequest(getTurn(message.turnId));
              return;
            }
            resendUserMessage(message, action[1]);
          });
          actions.appendChild(button);
        });
        if (state.edgeTestMode) {
          const duplicate = document.createElement("button");
          duplicate.type = "button";
          duplicate.className = "message-action edge-action";
          duplicate.textContent = "Duplicate";
          duplicate.disabled = !state.duplicateEventMode || !getTurn(message.turnId)?.request?.messageId;
          duplicate.addEventListener("click", function () {
            resendUserMessage(message, "duplicate");
          });
          actions.appendChild(duplicate);
        }
        row.appendChild(actions);
      }

      if (message.type === "bot" && Array.isArray(message.options) && message.options.length) {
        const options = document.createElement("div");
        options.className = "suggested-options";
        options.setAttribute("aria-label", "Suggested replies");

        message.options.forEach(function (option) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "suggested-option";
          button.textContent = option.label;
          button.addEventListener("click", function () {
            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");
            Array.prototype.forEach.call(options.children, function (candidate) {
              candidate.disabled = true;
            });
            window.setTimeout(function () {
              selectSuggestedOption(option);
            }, 0);
          });
          options.appendChild(button);
        });

        row.appendChild(options);
      }

      elements.messages.appendChild(row);
    });

    if (shouldScroll !== false) {
      elements.messages.scrollTop = elements.messages.scrollHeight;
    }
  }

  function addMessage(type, text, options, turnId) {
    state.messages.push({
      type: type,
      text: String(text),
      options: Array.isArray(options) ? options : [],
      turnId: turnId || null,
    });
    renderMessages();
  }

  function setStatusClass(element, status) {
    const normalized = String(status || "").toLowerCase();
    element.className = "mode-badge " +
      (normalized === "would_send" || normalized === "success" || normalized === "completed" ? "on" :
        normalized === "skipped" || normalized === "not_triggered" ? "skipped" : "off");
  }

  function renderPipeline(pipeline) {
    elements.pipelineList.replaceChildren();

    if (!pipeline.length) {
      elements.pipelineList.className = "pipeline-list empty-debug-value";
      elements.pipelineList.textContent = "Chưa có pipeline data";
      return;
    }

    elements.pipelineList.className = "pipeline-list";
    pipeline.forEach(function (event) {
      const row = document.createElement("div");
      row.className = "pipeline-event " + event.status;

      const icon = document.createElement("span");
      icon.className = "pipeline-icon";
      icon.textContent = event.status === "success" ? "✓" : event.status === "failed" ? "✗" : event.status === "skipped" ? "⊘" : "…";

      const label = document.createElement("strong");
      label.textContent = event.label;
      row.append(icon, label);

      if (event.detail) {
        const detail = document.createElement("span");
        detail.className = "pipeline-detail";
        detail.textContent = event.detail;
        row.appendChild(detail);
      }

      elements.pipelineList.appendChild(row);
    });
  }

  function renderTelegramPayload(payload) {
    elements.telegramPayload.replaceChildren();

    if (payload === null || payload === undefined || payload === "") {
      elements.telegramPayload.textContent = "Chưa có payload";
      return;
    }

    if (!isObject(payload)) {
      const pre = document.createElement("pre");
      pre.textContent = formatDebugValue(payload);
      elements.telegramPayload.appendChild(pre);
      return;
    }

    Object.keys(payload).forEach(function (key) {
      const row = document.createElement("div");
      row.className = "payload-row";
      const keyElement = document.createElement("span");
      keyElement.textContent = key;
      const valueElement = document.createElement("strong");
      valueElement.textContent = formatDebugValue(payload[key]);
      row.append(keyElement, valueElement);
      elements.telegramPayload.appendChild(row);
    });
  }

  function renderTelegramEvents(events) {
    elements.telegramEvents.replaceChildren();

    events.forEach(function (event) {
      const row = document.createElement("div");
      row.className = "telegram-event " + event.status;
      const icon = document.createElement("span");
      icon.textContent = event.status === "success" ? "✓" : event.status === "skipped" ? "⊘" : event.status === "failed" ? "✗" : "…";
      const label = document.createElement("span");
      label.textContent = event.label + (event.detail ? " — " + event.detail : "");
      row.append(icon, label);
      elements.telegramEvents.appendChild(row);
    });
  }

  function renderTelegramDebug(telegram) {
    if (!telegram) {
      elements.telegramDebug.hidden = true;
      return;
    }

    elements.telegramDebug.hidden = false;
    elements.telegramTrigger.textContent = telegram.trigger;
    elements.telegramOutcome.textContent = telegram.status;
    elements.telegramStatus.textContent = telegram.status;
    setStatusClass(elements.telegramStatus, telegram.status);
    renderTelegramEvents(telegram.events);
    renderTelegramPayload(telegram.payload);
    elements.telegramReason.textContent = telegram.reason ? "Reason: " + telegram.reason : "";
  }

  function shouldShowStack(bot) {
    return isLocalDevMode(bot);
  }

  function updateDebug(data) {
    const debug = data.debug || {};
    const errorText = [data.error, debug.error && debug.error !== data.error ? debug.error : ""]
      .filter(Boolean)
      .join("\n");
    const stackText = data.stack || debug.stack || "";

    elements.debugMessageLabel.textContent = data.message
      ? (data.number ? "Turn #" + data.number + " · " + (data.channelMode || "website") + " · " : "Latest message: ") + data.message
      : "Chưa có message nào được gửi.";
    elements.debugStatus.textContent = data.status || "—";
    elements.debugTime.textContent = data.responseTime || "—";
    elements.debugDuration.textContent = formatDuration(debug.durationMs);
    elements.debugIntent.textContent = formatDebugValue(debug.intent);
    elements.debugStep.textContent = formatDebugValue(debug.step);
    elements.debugModel.textContent = formatDebugValue(debug.model);
    elements.requestJson.textContent = formatDebugValue(data.request, "Chưa có request");
    elements.debugFields.textContent = formatDebugValue(debug.fields, "Chưa có extracted fields");
    elements.rawResponse.textContent = formatDebugValue(data.response, "Chưa có response");
    elements.parsedReply.textContent = formatDebugValue(data.reply, "Chưa có reply");
    elements.debugError.textContent = errorText || "—";
    elements.debugErrorBlock.hidden = !errorText;
    elements.debugStack.textContent = stackText || "—";
    elements.debugStackBlock.hidden = !stackText || !shouldShowStack(state.selectedBot);
    renderPipeline(debug.pipeline || []);
    renderTelegramDebug(debug.telegram);
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      elements.toast.classList.remove("visible");
    }, 2200);
  }

  function parseJsonOrText(responseText) {
    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      return responseText;
    }
  }

  function formatRequestError(error, failureType, status, timeoutMs) {
    if (failureType === "configuration") {
      return "Backend connection failed\nAPI URL chưa cấu hình trong config.js.";
    }
    if (failureType === "http") {
      return "Backend connection failed\nHTTP error: " + status;
    }
    if (failureType === "response") {
      return "Backend response invalid\n" + error.message;
    }
    if (error && error.name === "AbortError") {
      return "Backend connection failed\nTimeout after " + timeoutMs + " ms.";
    }

    return "Backend connection failed\n" + (error && error.message ? error.message : "Network error / backend unreachable.");
  }

  async function sendMessage(messageOverride, displayText, sendOptions) {
    const rawMessage = messageOverride === undefined ? elements.messageInput.value : String(messageOverride);
    const message = rawMessage.trim();
    const messageLabel = displayText === undefined ? message : String(displayText);
    const bot = state.selectedBot;

    if (!message || isRequestBlocked()) {
      return null;
    }

    if (!bot) {
      addMessage("error", "Chưa có chatbot enabled. Hãy thêm bot vào config.js.");
      return null;
    }

    const adapter = getAdapter(bot);
    const requestId = state.edgeTestMode && sendOptions && sendOptions.requestId
      ? sendOptions.requestId
      : state.edgeTestMode
        ? createRequestId()
        : null;
    const requestContext = {
      channelMode: state.channelMode,
      selectedOption: sendOptions && sendOptions.selectedOption,
      edgeTestMode: state.edgeTestMode,
      requestId: requestId,
    };
    const requestPayload = adapter.buildRequest(bot, message, state.sessionId, requestContext);
    const turn = createTurn(bot, message, messageLabel, requestPayload, adapter);
    const startedAt = performance.now();
    const timeoutMs = Number(bot.timeoutMs) > 0 ? Number(bot.timeoutMs) : 30000;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId = null;
    let rawResponse = null;
    let parsedReply = null;
    let normalizedDebug = adapter.parseDebug(bot, null);
    let status = "—";
    let errorMessage = null;
    let failureType = "connection";

    clearSuggestedOptions();
    addMessage("user", messageLabel, [], turn.id);
    elements.messageInput.value = "";
    updateTurn(turn, {
      message: message,
      request: requestPayload,
      response: null,
      reply: null,
      status: "Đang chờ...",
      responseTime: "—",
      debug: normalizedDebug,
      error: null,
      stack: null,
    });
    setLoading(true);

    try {
      const apiUrl = getBotApiUrl(bot);

      if (!apiUrl) {
        failureType = "configuration";
        throw new Error("API URL chưa cấu hình trong config.js.");
      }

      if (controller) {
        timeoutId = window.setTimeout(function () {
          controller.abort();
        }, timeoutMs);
      }

      const response = await fetch(apiUrl, adapter.buildFetchOptions(bot, requestPayload, controller, requestContext));
      status = response.status + (response.statusText ? " " + response.statusText : "");
      rawResponse = parseJsonOrText(await response.text());
      normalizedDebug = adapter.parseDebug(bot, rawResponse);

      if (!response.ok) {
        failureType = "http";
        throw new Error("HTTP " + status);
      }

      failureType = "response";
      parsedReply = adapter.parseResponse(bot, rawResponse);
      addMessage("bot", parsedReply, adapter.parseSuggestedOptions(bot, rawResponse, requestContext), turn.id);
    } catch (error) {
      errorMessage = formatRequestError(error, failureType, status, timeoutMs);
      addMessage("error", errorMessage, [], turn.id);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      updateTurn(turn, {
        message: message,
        request: requestPayload,
        response: rawResponse,
        reply: parsedReply,
        status: status,
        responseTime: elapsedMs + " ms",
        debug: normalizedDebug,
        error: errorMessage,
        stack: errorMessage ? new Error(errorMessage).stack : null,
      });
      setLoading(false);
    }

    return turn;
  }

  function getConfiguredScenarios() {
    const scenarios = [];
    const globalScenarios = Array.isArray(window.CHATBOT_SCENARIOS) ? window.CHATBOT_SCENARIOS : [];
    const botScenarios = state.selectedBot && Array.isArray(state.selectedBot.scenarios)
      ? state.selectedBot.scenarios
      : [];

    globalScenarios.concat(botScenarios).forEach(function (scenario, index) {
      if (!isObject(scenario) || !Array.isArray(scenario.messages)) return;
      if (scenario.botId && (!state.selectedBot || scenario.botId !== state.selectedBot.id)) return;
      scenarios.push({
        ...scenario,
        id: scenario.id || "scenario-" + index,
      });
    });
    return scenarios;
  }

  function getSelectedScenario() {
    const scenarios = getConfiguredScenarios();
    return scenarios.find(function (scenario) {
      return scenario.id === state.scenario.scenarioId;
    }) || null;
  }

  function renderScenarioResult(report) {
    if (!elements.scenarioResult) return;
    elements.scenarioResult.replaceChildren();
    if (!report) {
      elements.scenarioResult.className = "scenario-result empty-debug-value";
      elements.scenarioResult.textContent = "Chưa chạy scenario";
      return;
    }

    elements.scenarioResult.className = "scenario-result " + (report.passed ? "passed" : "failed");
    const heading = document.createElement("strong");
    heading.textContent = report.passed ? "PASS" : "FAIL";
    elements.scenarioResult.appendChild(heading);

    const summary = document.createElement("span");
    summary.textContent = " " + report.scenarioName + " · " + report.checks.filter(function (check) {
      return check.passed;
    }).length + "/" + report.checks.length + " assertions";
    elements.scenarioResult.appendChild(summary);

    if (report.checks.length) {
      const list = document.createElement("ul");
      report.checks.forEach(function (check) {
        const item = document.createElement("li");
        item.className = check.passed ? "passed" : "failed";
        item.textContent = (check.passed ? "✓ " : "✗ ") + check.label +
          " · expected " + formatDebugValue(check.expected) +
          " · actual " + formatDebugValue(check.actual);
        list.appendChild(item);
      });
      elements.scenarioResult.appendChild(list);
    }
  }

  function updateScenarioControls() {
    if (!elements.scenarioSelect) return;
    const scenarios = getConfiguredScenarios();
    const selectedId = state.scenario.scenarioId;
    elements.scenarioSelect.replaceChildren();

    if (!scenarios.length) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Chưa có scenario trong config.js";
      elements.scenarioSelect.appendChild(empty);
      elements.scenarioSelect.disabled = true;
      elements.runScenario.disabled = true;
    } else {
      scenarios.forEach(function (scenario) {
        const option = document.createElement("option");
        option.value = scenario.id;
        option.textContent = scenario.name || scenario.id;
        elements.scenarioSelect.appendChild(option);
      });
      state.scenario.scenarioId = scenarios.some(function (scenario) { return scenario.id === selectedId; })
        ? selectedId
        : scenarios[0].id;
      elements.scenarioSelect.value = state.scenario.scenarioId;
      elements.scenarioSelect.disabled = state.scenario.running || state.isSending;
      elements.runScenario.disabled = state.scenario.running || state.isSending;
    }

    if (elements.scenarioProgress) {
      if (state.scenario.running) {
        elements.scenarioProgress.textContent = "Đang chạy " + state.scenario.current + "/" + state.scenario.total;
      } else if (state.scenario.total) {
        elements.scenarioProgress.textContent = "Đã chạy " + state.scenario.total + " message" +
          (state.scenario.total === 1 ? "" : "s");
      } else {
        elements.scenarioProgress.textContent = "Chưa chạy";
      }
    }
    renderScenarioResult(state.scenario.result);
  }

  function valuesMatch(actual, expected) {
    if (actual === expected) return true;
    if (actual === undefined || actual === null || expected === undefined || expected === null) return false;
    if (isObject(actual) || Array.isArray(actual) || isObject(expected) || Array.isArray(expected)) {
      return formatDebugValue(actual) === formatDebugValue(expected);
    }
    return String(actual).trim() === String(expected).trim();
  }

  function telegramWasTriggered(telegram) {
    if (!telegram) return false;
    if (Number(telegram.triggerCount) > 0) return true;
    const status = String(telegram.status || "").toLowerCase();
    return ["would_send", "sent", "success", "triggered", "completed"].includes(status);
  }

  function getTelegramTriggerCount(turns) {
    return turns.reduce(function (count, turn) {
      return count + (telegramWasTriggered(turn.debug && turn.debug.telegram) ? 1 : 0);
    }, 0);
  }

  function evaluateScenario(scenario, turns) {
    const assertions = isObject(scenario.assertions) ? scenario.assertions : {};
    const lastTurn = turns[turns.length - 1] || null;
    const debug = lastTurn && lastTurn.debug ? lastTurn.debug : {};
    const checks = [];
    const addCheck = function (label, expected, actual) {
      checks.push({ label: label, expected: expected, actual: actual, passed: valuesMatch(actual, expected) });
    };

    if (Object.hasOwn(assertions, "intent")) addCheck("intent", assertions.intent, debug.intent);
    if (Object.hasOwn(assertions, "step")) addCheck("state / step", assertions.step, debug.step);
    if (Object.hasOwn(assertions, "state")) addCheck("state / step", assertions.state, debug.step);

    const expectedFields = isObject(assertions.fields)
      ? assertions.fields
      : isObject(assertions.extractedFields)
        ? assertions.extractedFields
        : null;
    if (expectedFields) {
      Object.keys(expectedFields).forEach(function (field) {
        addCheck("field " + field, expectedFields[field], debug.fields && debug.fields[field]);
      });
    }

    if (Object.hasOwn(assertions, "telegramStatus")) {
      addCheck("Telegram status", assertions.telegramStatus, debug.telegram && debug.telegram.status);
    }
    if (Object.hasOwn(assertions, "telegramTriggerCount")) {
      addCheck("Telegram trigger count", assertions.telegramTriggerCount, getTelegramTriggerCount(turns));
    }

    return {
      scenarioName: scenario.name || scenario.id,
      passed: checks.every(function (check) { return check.passed; }),
      checks: checks,
      turnCount: turns.length,
    };
  }

  function resetConversationData() {
    state.sessionId = createSessionId();
    state.messages = [];
    state.turns = [];
    state.selectedTurnId = null;
    state.nextTurnNumber = 1;
    updateSessionDisplay();
    renderMessages();
    resetDebug();
  }

  async function runScenario() {
    if (state.scenario.running || state.isSending) return;
    const scenario = getSelectedScenario();
    if (!scenario) {
      showToast("Chưa có scenario hợp lệ trong config.js.");
      return;
    }

    const targetBot = scenario.botId
      ? state.bots.find(function (bot) { return bot.id === scenario.botId; })
      : state.selectedBot;
    if (!targetBot) {
      showToast("Scenario không tìm thấy bot " + scenario.botId + ".");
      return;
    }

    state.selectedBot = targetBot;
    elements.botSelect.value = targetBot.id;
    if (["website", "messenger"].includes(scenario.channelMode)) {
      state.channelMode = scenario.channelMode;
    }
    state.scenario.running = true;
    state.scenario.current = 0;
    state.scenario.total = scenario.messages.length;
    state.scenario.result = null;
    resetConversationData();
    updateBotDisplay();
    updateChannelDisplay();
    updateScenarioControls();

    for (let index = 0; index < scenario.messages.length; index += 1) {
      state.scenario.current = index + 1;
      updateScenarioControls();
      const message = String(scenario.messages[index] == null ? "" : scenario.messages[index]);
      await sendMessage(message, message, { scenarioId: scenario.id });
    }

    state.scenario.running = false;
    state.scenario.result = evaluateScenario(scenario, state.turns);
    updateScenarioControls();
    showToast(state.scenario.result.passed ? "Scenario PASS." : "Scenario FAIL.");
  }

  function buildQaReport() {
    return {
      format: "chatbot-tester-qa-v1",
      exportedAt: new Date().toISOString(),
      bot: state.selectedBot ? {
        id: state.selectedBot.id,
        name: state.selectedBot.name,
        adapter: state.selectedBot.adapter || "default",
        apiUrl: getBotApiUrl(state.selectedBot),
      } : null,
      channelMode: state.channelMode,
      sessionId: state.sessionId,
      messages: state.messages.map(function (message) {
        return {
          type: message.type,
          text: message.text,
          turnId: message.turnId,
          options: message.options,
        };
      }),
      turns: state.turns,
      scenario: state.scenario.result,
    };
  }

  function qaReportText(report) {
    const lines = [
      "CHATBOT QA REPORT",
      "Bot: " + (report.bot && report.bot.name || "—"),
      "Adapter: " + (report.bot && report.bot.adapter || "—"),
      "Channel: " + report.channelMode,
      "Session ID: " + report.sessionId,
      "Exported: " + report.exportedAt,
      "",
      "CONVERSATION",
    ];

    report.messages.forEach(function (message) {
      lines.push("[" + message.type + "] " + message.text);
    });
    lines.push("", "TURNS");
    report.turns.forEach(function (turn) {
      lines.push(
        "Turn #" + turn.number + " · " + turn.status + " · " + turn.responseTime,
        "Request: " + formatDebugValue(turn.request),
        "Response: " + formatDebugValue(turn.response),
        "Parsed reply: " + formatDebugValue(turn.reply),
        "Debug: " + formatDebugValue(turn.debug),
        "Error: " + formatDebugValue(turn.error),
        "",
      );
    });
    if (report.scenario) lines.push("SCENARIO", formatDebugValue(report.scenario));
    return lines.join("\n");
  }

  function exportQa() {
    const report = buildQaReport();
    const format = elements.exportFormat && elements.exportFormat.value === "txt" ? "txt" : "json";
    const content = format === "txt" ? qaReportText(report) : JSON.stringify(report, null, 2);
    const blob = new Blob([content], { type: format === "txt" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8" });
    const link = document.createElement("a");
    const botId = report.bot && report.bot.id || "chatbot";
    const safeSessionId = report.sessionId.replace(/[^a-z0-9_-]/giu, "-");
    link.href = URL.createObjectURL(blob);
    link.download = "qa-report-" + botId + "-" + safeSessionId + "." + format;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
    showToast("Đã export QA report dạng " + format.toUpperCase() + ".");
  }

  function resetDebug() {
    updateDebug({
      message: null,
      request: null,
      response: null,
      reply: null,
      status: "—",
      responseTime: "—",
      debug: getAdapter(state.selectedBot).parseDebug(state.selectedBot, null),
      error: null,
      stack: null,
    });
  }

  function startNewConversation() {
    if (state.scenario.running) return;
    state.scenario = { running: false, scenarioId: state.scenario.scenarioId, current: 0, total: 0, result: null };
    resetConversationData();
    updateScenarioControls();
    showToast("Đã tạo conversation và session mới.");
    elements.messageInput.focus();
  }

  function clearChat() {
    state.messages = [];
    renderMessages();
    showToast("Đã clear chat. Session ID được giữ nguyên.");
    elements.messageInput.focus();
  }

  async function copySessionId() {
    try {
      await copyText(state.sessionId, "Đã copy Session ID.");
    } catch (error) {
      elements.sessionId.select();
      showToast("Không copy tự động được; Session ID đã được chọn.");
    }
  }

  elements.botSelect.addEventListener("change", function (event) {
    state.selectedBot = state.bots.find(function (bot) {
      return bot.id === event.target.value;
    }) || null;
    clearSuggestedOptions();
    renderMessages();
    updateBotDisplay();
    updateScenarioControls();
    if (state.selectedTurnId) {
      updateDebug(getTurn(state.selectedTurnId));
    } else {
      resetDebug();
    }
  });
  if (elements.channelMode) {
    elements.channelMode.addEventListener("change", function (event) {
      state.channelMode = event.target.value === "messenger" ? "messenger" : "website";
      clearSuggestedOptions();
      renderMessages();
      updateChannelDisplay();
    });
  }
  if (elements.edgeTestMode) {
    elements.edgeTestMode.addEventListener("change", function (event) {
      state.edgeTestMode = event.target.checked;
      if (!state.edgeTestMode) state.duplicateEventMode = false;
      updateChannelDisplay();
      renderMessages(false);
    });
  }
  if (elements.duplicateEventMode) {
    elements.duplicateEventMode.addEventListener("change", function (event) {
      state.duplicateEventMode = event.target.checked && state.edgeTestMode;
      updateChannelDisplay();
      renderMessages(false);
    });
  }
  if (elements.scenarioSelect) {
    elements.scenarioSelect.addEventListener("change", function (event) {
      state.scenario.scenarioId = event.target.value || null;
      state.scenario.result = null;
      state.scenario.current = 0;
      state.scenario.total = 0;
      updateScenarioControls();
    });
  }
  if (elements.runScenario) {
    elements.runScenario.addEventListener("click", function () {
      void runScenario();
    });
  }
  if (elements.exportQa) {
    elements.exportQa.addEventListener("click", exportQa);
  }
  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    void sendMessage();
  });
  elements.messageInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });
  elements.newConversation.addEventListener("click", startNewConversation);
  elements.clearChat.addEventListener("click", clearChat);
  elements.copySession.addEventListener("click", function () {
    void copySessionId();
  });

  updateSessionDisplay();
  populateBotSelect();
  updateChannelDisplay();
  updateScenarioControls();
  renderMessages();
  resetDebug();
})();

