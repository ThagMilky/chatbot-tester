(function () {
  "use strict";

  // Adapter boundary: change these functions when a bot uses a different contract.
  function buildRequest(bot, message, sessionId) {
    const request = {
      sessionId: sessionId,
      message: message,
      channel: "chat-test",
    };
    const testMode = getTestMode(bot);

    if (testMode && isObject(testMode.requestBody)) {
      Object.assign(request, testMode.requestBody);
    }

    return request;
  }

  // Cyno currently accepts the same request fields as the default contract.
  // Keeping this as a named adapter makes future contract changes local to this bot.
  function buildCynoRequest(bot, message, sessionId) {
    return buildRequest(bot, message, sessionId);
  }

  function buildFetchOptions(bot, requestPayload, controller) {
    const testMode = getTestMode(bot);
    const headers = Object.assign(
      {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      isObject(bot && bot.requestHeaders) ? bot.requestHeaders : {},
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
    isSending: false,
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
    state.isSending = isLoading;
    elements.sendButton.disabled = isLoading;
    elements.messageInput.disabled = isLoading;
    elements.botSelect.disabled = isLoading || !state.bots.length;
    elements.newConversation.disabled = isLoading;
    elements.clearChat.disabled = isLoading;
    elements.sendButton.classList.toggle("loading", isLoading);
    elements.sendLabel.textContent = isLoading ? "Đang gửi..." : "Send";
    setConnectionState(
      isLoading ? "Đang gửi" : getBotApiUrl(state.selectedBot) ? "Sẵn sàng" : "Chưa cấu hình",
      isLoading ? "loading" : "ready",
    );
  }

  function selectSuggestedOption(option) {
    if (!option || state.isSending) {
      return;
    }

    void sendMessage(option.sendValue, option.label);
  }

  function clearSuggestedOptions() {
    state.messages.forEach(function (message) {
      if (Array.isArray(message.options)) {
        message.options = [];
      }
    });
  }

  function renderMessages() {
    elements.messages.replaceChildren();

    if (!state.messages.length) {
      elements.messages.appendChild(elements.emptyState);
      return;
    }

    state.messages.forEach(function (message) {
      const row = document.createElement("div");
      row.className = "message-row " + message.type;

      const meta = document.createElement("span");
      meta.className = "message-meta";
      meta.textContent = message.type === "user" ? "Bạn" : message.type === "bot" ? "Bot" : "Tester";

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.textContent = message.text;

      row.append(meta, bubble);

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

    elements.messages.scrollTop = elements.messages.scrollHeight;
  }

  function addMessage(type, text, options) {
    state.messages.push({
      type: type,
      text: String(text),
      options: Array.isArray(options) ? options : [],
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
      ? "Latest message: " + data.message
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

  async function sendMessage(messageOverride, displayText) {
    const rawMessage = messageOverride === undefined ? elements.messageInput.value : String(messageOverride);
    const message = rawMessage.trim();
    const messageLabel = displayText === undefined ? message : String(displayText);
    const bot = state.selectedBot;

    if (!message || state.isSending) {
      return;
    }

    if (!bot) {
      addMessage("error", "Chưa có chatbot enabled. Hãy thêm bot vào config.js.");
      return;
    }

    const adapter = getAdapter(bot);
    const requestPayload = adapter.buildRequest(bot, message, state.sessionId);
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
    addMessage("user", messageLabel);
    elements.messageInput.value = "";
    updateDebug({
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

      const response = await fetch(apiUrl, adapter.buildFetchOptions(bot, requestPayload, controller));
      status = response.status + (response.statusText ? " " + response.statusText : "");
      rawResponse = parseJsonOrText(await response.text());
      normalizedDebug = adapter.parseDebug(bot, rawResponse);

      if (!response.ok) {
        failureType = "http";
        throw new Error("HTTP " + status);
      }

      failureType = "response";
      parsedReply = adapter.parseResponse(bot, rawResponse);
      addMessage("bot", parsedReply, adapter.parseSuggestedOptions(bot, rawResponse));
    } catch (error) {
      errorMessage = formatRequestError(error, failureType, status, timeoutMs);
      addMessage("error", errorMessage);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      const elapsedMs = Math.round(performance.now() - startedAt);
      updateDebug({
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
    state.sessionId = createSessionId();
    state.messages = [];
    updateSessionDisplay();
    renderMessages();
    resetDebug();
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
      await navigator.clipboard.writeText(state.sessionId);
      showToast("Đã copy Session ID.");
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
  });
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
  renderMessages();
  resetDebug();
})();

