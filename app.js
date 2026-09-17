(function () {
  "use strict";

  const THEME_STORAGE_KEY = "chatbot-tester-theme";

  function readThemePreference() {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function writeThemePreference(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Theme persistence is optional when browser storage is unavailable.
    }
  }

  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    if (elements.themeToggle) {
      const isDark = nextTheme === "dark";
      elements.themeToggle.setAttribute("aria-pressed", String(isDark));
      elements.themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light theme" : "Switch to dark theme",
      );
    }
    return nextTheme;
  }

  function toggleTheme() {
    const nextTheme = applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    writeThemePreference(nextTheme);
  }

  function setNavigationOpen(isOpen) {
    if (!elements.sidebar || !elements.sidebarToggle || !elements.sidebarScrim) return;
    elements.sidebar.classList.toggle("is-open", isOpen);
    elements.sidebarScrim.classList.toggle("is-visible", isOpen);
    elements.sidebarToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("nav-open", isOpen);
  }

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
      humanTakeover: isObject(source.humanTakeover) ? {
        active: source.humanTakeover.active === true,
        reason: firstValue(source.humanTakeover.reason),
        mode: firstValue(source.humanTakeover.mode),
        freezeUntil: firstValue(source.humanTakeover.freezeUntil),
        lastStaffMessageAt: firstValue(source.humanTakeover.lastStaffMessageAt),
      } : null,
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
    sidebar: document.getElementById("sidebar"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    sidebarScrim: document.getElementById("sidebar-scrim"),
    themeToggle: document.getElementById("theme-toggle"),
    headerBotContext: document.getElementById("header-bot-context"),
    headerStatusContext: document.getElementById("header-status-context"),
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
    senderModeControls: document.getElementById("sender-mode-controls"),
    senderModeInputs: document.querySelectorAll("input[name='sender-mode']"),
    edgeTestMode: document.getElementById("edge-test-mode"),
    edgeTestHint: document.getElementById("edge-test-hint"),
    edgeTestLabel: document.getElementById("edge-test-label"),
    duplicateEventMode: document.getElementById("duplicate-event-mode"),
    scenarioSelect: document.getElementById("scenario-select"),
    runScenario: document.getElementById("run-scenario"),
    scenarioProgress: document.getElementById("scenario-progress"),
    scenarioResult: document.getElementById("scenario-result"),
    aiBehaviorResult: document.getElementById("ai-behavior-result"),
    reevaluateBehavior: document.getElementById("reevaluate-behavior"),
    simulatorService: document.getElementById("simulator-service"),
    simulatorScenario: document.getElementById("simulator-scenario"),
    simulatorDifficulty: document.getElementById("simulator-difficulty"),
    simulatorMaxTurns: document.getElementById("simulator-max-turns"),
    startSimulator: document.getElementById("start-simulator"),
    pauseSimulator: document.getElementById("pause-simulator"),
    stopSimulator: document.getElementById("stop-simulator"),
    simulatorStatus: document.getElementById("simulator-status"),
    simulatorSummary: document.getElementById("simulator-summary"),
    exportFormat: document.getElementById("export-format"),
    exportQa: document.getElementById("export-qa"),
    conversationInput: document.getElementById("conversation-input"),
    importBotNames: document.getElementById("import-bot-names"),
    scanConversation: document.getElementById("scan-conversation"),
    importStatus: document.getElementById("import-status"),
    runReplay: document.getElementById("run-replay"),
    pauseReplay: document.getElementById("pause-replay"),
    stopReplay: document.getElementById("stop-replay"),
    retryReplay: document.getElementById("retry-replay"),
    replayStatus: document.getElementById("replay-status"),
    conversationPreview: document.getElementById("conversation-preview"),
    regressionStatus: document.getElementById("regression-status"),
    generateRegression: document.getElementById("generate-regression"),
    saveRegression: document.getElementById("save-regression"),
    importRegression: document.getElementById("import-regression"),
    exportRegression: document.getElementById("export-regression"),
    regressionImportJson: document.getElementById("regression-import-json"),
    regressionName: document.getElementById("regression-name"),
    regressionId: document.getElementById("regression-id"),
    regressionIntent: document.getElementById("regression-intent"),
    regressionStep: document.getElementById("regression-step"),
    regressionFields: document.getElementById("regression-fields"),
    regressionTelegramStatus: document.getElementById("regression-telegram-status"),
    regressionTelegramTriggerCount: document.getElementById("regression-telegram-trigger-count"),
    chatTitle: document.getElementById("chat-title"),
    connectionState: document.getElementById("connection-state"),
    messages: document.getElementById("chat-messages"),
    emptyState: document.getElementById("empty-state"),
    form: document.getElementById("chat-form"),
    messageInput: document.getElementById("message-input"),
    sendButton: document.getElementById("send-button"),
    sendLabel: document.getElementById("send-label"),
    debugMessageLabel: document.getElementById("debug-message-label"),
    turnLogCount: document.getElementById("turn-log-count"),
    turnLogEmpty: document.getElementById("turn-log-empty"),
    turnLogTableWrap: document.getElementById("turn-log-table-wrap"),
    turnLogBody: document.getElementById("turn-log-body"),
    debugStatus: document.getElementById("debug-status"),
    debugTime: document.getElementById("debug-time"),
    debugDuration: document.getElementById("debug-duration"),
    debugIntent: document.getElementById("debug-intent"),
    debugStep: document.getElementById("debug-step"),
    debugModel: document.getElementById("debug-model"),
    debugHumanTakeover: document.getElementById("debug-human-takeover"),
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
    senderMode: "client",
    edgeTestMode: false,
    duplicateEventMode: false,
    scenario: {
      running: false,
      scenarioId: null,
      current: 0,
      total: 0,
      result: null,
      runToken: null,
      evaluationInput: null,
      behaviorEvaluation: null,
      evaluationRequestToken: null,
    },
    importedMessages: [],
    regression: {
      draft: null,
      editingSavedId: null,
      savedScenarios: [],
    },
    replay: {
      status: "idle",
      plan: [],
      nextIndex: 0,
      failedIndex: null,
      currentIndex: null,
      results: [],
      stopRequested: false,
      locked: false,
      runToken: null,
    },
    simulator: {
      catalog: [],
      catalogLoading: true,
      catalogError: false,
      serviceId: null,
      scenarioId: null,
      difficulty: "normal",
      status: "idle",
      current: 0,
      total: 0,
      summary: "",
      reason: "",
      requestInFlight: false,
      stopRequested: false,
      runToken: null,
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

  function isReplayLocked() {
    return Boolean(state.replay && (
      state.replay.locked ||
      ["running", "paused", "failed"].includes(state.replay.status)
    ));
  }

  function isSimulatorLocked() {
    return Boolean(state.simulator && ["running", "paused"].includes(state.simulator.status));
  }

  function isRequestBlocked(sendOptions) {
    const isReplayRequest = Boolean(sendOptions && sendOptions.replay === true);
    const isSimulatorRequest = Boolean(sendOptions && sendOptions.simulator === true);
    const replayLocked = isReplayLocked();
    const simulatorLocked = isSimulatorLocked();
    let blockedByReplayOrSending;
    if (window.ReplayHelpers && typeof window.ReplayHelpers.isSendBlocked === "function") {
      blockedByReplayOrSending = window.ReplayHelpers.isSendBlocked({
        replayLocked: replayLocked,
        isReplayRequest: isReplayRequest,
        isSending: state.isSending,
        edgeTestMode: state.edgeTestMode,
      });
    } else {
      blockedByReplayOrSending = (replayLocked && !isReplayRequest) || (state.isSending && !state.edgeTestMode);
    }

    return blockedByReplayOrSending || (simulatorLocked && !isSimulatorRequest);
  }

  function getBotApiUrl(bot) {
    return bot && typeof bot.apiUrl === "string" ? bot.apiUrl.trim() : "";
  }

  function getStaffApiUrl(bot) {
    return bot && typeof bot.staffApiUrl === "string" ? bot.staffApiUrl.trim() : "";
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
    if (!isMessenger) {
      state.senderMode = "client";
    } else if (!["client", "staff"].includes(state.senderMode)) {
      state.senderMode = "client";
    }
    const senderModeLocked = !isMessenger || isRequestBlocked();
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
      elements.duplicateEventMode.disabled = !state.edgeTestMode || state.isSending || isReplayLocked();
    }
    if (elements.edgeTestHint) {
      elements.edgeTestHint.textContent = state.edgeTestMode
        ? "Đang bật: có thể gửi song song. Duplicate dùng lại messageId khi chọn Duplicate."
        : "Tắt mặc định: khi gửi, input sẽ khóa để tránh request chồng nhau.";
    }
    if (elements.channelMode) {
      elements.channelMode.setAttribute("aria-label", isMessenger ? "Messenger mode" : "Website mode");
    }
    if (elements.senderModeControls) {
      elements.senderModeControls.hidden = !isMessenger;
    }
    if (elements.senderModeInputs) {
      elements.senderModeInputs.forEach(function (input) {
        input.checked = isMessenger && input.value === state.senderMode;
        input.disabled = senderModeLocked;
      });
    }
    if (elements.senderModeControls) {
      elements.senderModeControls.setAttribute("aria-disabled", String(senderModeLocked));
    }
  }

  function updateBotDisplay() {
    const bot = state.selectedBot;
    const apiUrl = getBotApiUrl(bot);

    elements.chatTitle.textContent = bot ? bot.name : "Chưa có chatbot";
    elements.apiUrl.textContent = apiUrl || "Chưa cấu hình API URL trong config.js";
    elements.apiUrl.classList.toggle("unconfigured", !apiUrl);
    if (elements.headerBotContext) {
      elements.headerBotContext.textContent = bot ? bot.name : "Not configured";
    }

    if (!bot) {
      elements.botStatus.textContent = "Chưa có bot enabled trong config.js.";
      elements.connectionState.textContent = "Chưa cấu hình";
    } else {
      elements.botStatus.textContent = apiUrl
        ? "Bot đã có API URL và sẵn sàng gửi request."
        : "Bot đang chờ cấu hình apiUrl trong config.js.";
      elements.connectionState.textContent = apiUrl ? "Sẵn sàng" : "Chưa cấu hình";
    }

    if (elements.headerStatusContext) {
      elements.headerStatusContext.textContent = apiUrl ? "Ready" : "Not configured";
      elements.headerStatusContext.className = "status-pill " + (apiUrl ? "ready" : "pending");
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
    if (elements.headerStatusContext) {
      elements.headerStatusContext.textContent = label;
      elements.headerStatusContext.className = "status-pill " + (
        mode === "loading" ? "running" : getBotApiUrl(state.selectedBot) ? "ready" : "pending"
      );
    }
  }

  function updateLoadingControls() {
    const simulatorLocked = isSimulatorLocked();
    const lockInput = isReplayLocked() || simulatorLocked || (state.isSending && !state.edgeTestMode);
    elements.sendButton.disabled = lockInput || !getBotApiUrl(state.selectedBot);
    if (state.channelMode === "messenger" && state.senderMode === "staff") {
      elements.sendButton.disabled = lockInput || !getStaffApiUrl(state.selectedBot);
    }
    elements.messageInput.disabled = lockInput;
    elements.botSelect.disabled = state.isSending || isReplayLocked() || simulatorLocked || !state.bots.length;
    elements.newConversation.disabled = state.isSending || isReplayLocked() || simulatorLocked;
    elements.clearChat.disabled = state.isSending || isReplayLocked() || simulatorLocked;
    if (elements.channelMode) elements.channelMode.disabled = state.isSending || isReplayLocked() || simulatorLocked;
    if (elements.edgeTestMode) elements.edgeTestMode.disabled = state.isSending || isReplayLocked() || simulatorLocked;
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
    updateReplayControls();
    updateSimulatorControls();
  }

  function setLoading(isLoading) {
    state.activeRequestCount = Math.max(0, state.activeRequestCount + (isLoading ? 1 : -1));
    state.isSending = state.activeRequestCount > 0;
    updateLoadingControls();
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

  function classifyTurnStatus(turn) {
    const status = String(turn && turn.status || "").toLowerCase();
    if (turn && turn.error) return "error";
    if (!turn || status.includes("đang chờ") || status.includes("pending") || status === "—" || !status) {
      return "pending";
    }
    if (/^[45]\d\d\b/.test(status) || ["failed", "failure", "error"].some(function (token) {
      return status.includes(token);
    })) {
      return "error";
    }
    return "success";
  }

  function formatTurnTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatTurnContext(turn) {
    const run = turn && turn.runType ? turn.runType : "manual";
    const channel = turn && turn.channelMode ? turn.channelMode : "website";
    const sender = turn && turn.sender ? " · " + turn.sender : "";
    return run + " · " + channel + sender;
  }

  function formatTurnStatus(turn, statusKind) {
    if (statusKind === "pending") return "Pending";
    const rawStatus = String(turn && turn.status || "").trim();
    return (statusKind === "error" ? "Error" : "Success") + (
      rawStatus && rawStatus !== "—" ? " · " + rawStatus : ""
    );
  }

  function formatTurnTelegram(turn) {
    const telegram = turn && turn.debug && turn.debug.telegram;
    return telegram && (telegram.status || telegram.outcome || telegram.action)
      ? String(telegram.status || telegram.outcome || telegram.action)
      : "—";
  }

  function appendTurnLogCell(row, label, value, className, title) {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    if (className) cell.className = className;
    const content = document.createElement("span");
    content.className = "turn-log-cell-content";
    content.textContent = value;
    if (title || value !== "—") {
      content.title = title || value;
      content.setAttribute("aria-label", title || value);
    }
    cell.appendChild(content);
    row.appendChild(cell);
  }

  function renderTurnLog() {
    if (!elements.turnLogBody) return;
    elements.turnLogBody.replaceChildren();
    const turns = state.turns.slice().sort(function (left, right) {
      return right.number - left.number;
    });
    const hasTurns = turns.length > 0;
    elements.turnLogEmpty.hidden = hasTurns;
    elements.turnLogTableWrap.hidden = !hasTurns;
    elements.turnLogCount.textContent = turns.length + (turns.length === 1 ? " turn" : " turns");

    turns.forEach(function (turn) {
      const statusKind = classifyTurnStatus(turn);
      const row = document.createElement("tr");
      row.className = "turn-log-row status-" + statusKind;
      row.dataset.turnId = turn.id;
      row.tabIndex = 0;
      row.setAttribute("aria-selected", state.selectedTurnId === turn.id ? "true" : "false");
      row.classList.toggle("is-selected", state.selectedTurnId === turn.id);
      row.addEventListener("click", function () {
        selectTurn(turn.id);
      });
      row.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTurn(turn.id);
        }
      });

      appendTurnLogCell(row, "Turn", "#" + turn.number, "turn-log-number");
      appendTurnLogCell(row, "Time", formatTurnTime(turn.createdAt), "turn-log-time", turn.createdAt);
      appendTurnLogCell(row, "Run / channel", formatTurnContext(turn), "turn-log-context");
      appendTurnLogCell(row, "User message", turn.displayText || turn.inputText || "—", "turn-log-message");

      const statusCell = document.createElement("td");
      statusCell.dataset.label = "HTTP / result";
      const statusBadge = document.createElement("span");
      statusBadge.className = "turn-status-badge " + statusKind;
      statusBadge.textContent = formatTurnStatus(turn, statusKind);
      statusBadge.title = turn.error || turn.status || statusBadge.textContent;
      statusBadge.setAttribute("aria-label", statusBadge.title);
      statusCell.appendChild(statusBadge);
      row.appendChild(statusCell);

      appendTurnLogCell(row, "Response", turn.responseTime || "—", "turn-log-response");
      appendTurnLogCell(row, "Intent", formatDebugValue(turn.debug && turn.debug.intent), "turn-log-value");
      appendTurnLogCell(row, "Step", formatDebugValue(turn.debug && turn.debug.step), "turn-log-value");
      appendTurnLogCell(row, "Telegram", formatTurnTelegram(turn), "turn-log-telegram");
      elements.turnLogBody.appendChild(row);
    });
  }

  function createTurn(bot, message, displayText, requestPayload, adapter, runType, senderMode) {
    const turn = {
      id: "turn-" + state.nextTurnNumber,
      number: state.nextTurnNumber,
      botId: bot && bot.id ? bot.id : null,
      botName: bot && bot.name ? bot.name : null,
      sessionId: state.sessionId,
      channelMode: state.channelMode,
      inputText: message,
      displayText: displayText,
      runType: runType || "manual",
      sender: senderMode === "staff" ? "staff" : "client",
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
    renderTurnLog();
    return turn;
  }

  function updateTurn(turn, patch) {
    Object.assign(turn, patch);
    renderTurnLog();
    if (state.selectedTurnId === turn.id) {
      updateDebug(turn);
    }
  }

  function selectTurn(turnId) {
    const turn = getTurn(turnId);
    if (!turn) return;
    state.selectedTurnId = turn.id;
    renderTurnLog();
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
    if (turn.sender === "staff") sendOptions.senderMode = "staff";
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
      meta.textContent = message.type === "user"
        ? "Client"
        : message.type === "staff"
          ? "Staff"
          : message.type === "bot"
            ? "Bot"
            : message.type === "system"
              ? "Bot status"
              : "Tester";

      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      bubble.textContent = message.text;

      row.append(meta, bubble);

      if (["user", "staff"].includes(message.type) && message.turnId) {
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
          button.disabled = action[1] !== "copy" && isReplayLocked();
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
          duplicate.disabled = isReplayLocked() || !state.duplicateEventMode || !getTurn(message.turnId)?.request?.messageId;
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
          button.disabled = isReplayLocked();
          button.addEventListener("click", function () {
            if (isReplayLocked()) return;
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

  function getImportBotNames() {
    const configuredNames = elements.importBotNames && elements.importBotNames.value
      ? elements.importBotNames.value.split(/[\n,]/).map(function (name) { return name.trim(); }).filter(Boolean)
      : [];
    if (state.selectedBot && state.selectedBot.name) {
      configuredNames.unshift(state.selectedBot.name);
    }
    return configuredNames;
  }

  function getReplayResultForMessage(sourceIndex) {
    if (!state.replay || !Array.isArray(state.replay.plan)) {
      return null;
    }

    const planEntry = getReplayPreviewPlan().find(function (entry) {
      return entry.sourceIndex === sourceIndex;
    });
    return planEntry && state.replay.results[planEntry.replayIndex]
      ? state.replay.results[planEntry.replayIndex]
      : null;
  }

  function getReplayPreviewPlan() {
    return state.replay.plan.length
      ? state.replay.plan
      : window.ReplayHelpers.createReplayPlan(state.importedMessages);
  }

  function addReplayComparison(item, sourceIndex) {
    const planEntry = getReplayPreviewPlan().find(function (entry) {
      return entry.sourceIndex === sourceIndex;
    });
    if (!planEntry) {
      return;
    }

    const result = getReplayResultForMessage(sourceIndex);
    const comparison = document.createElement("div");
    comparison.className = "replay-comparison";

    const heading = document.createElement("strong");
    heading.textContent = "Replay comparison";
    comparison.appendChild(heading);

    [["Original Bot", planEntry.originalBotReply, "Not available"], [
      "Current Bot",
      result && result.currentBotReply,
      result && result.status === "failed" ? "Not captured (turn failed)" : "Not replayed",
    ]].forEach(function (entry) {
      const row = document.createElement("div");
      row.className = "replay-comparison-row";
      const label = document.createElement("span");
      label.className = "replay-comparison-label";
      label.textContent = entry[0];
      const value = document.createElement("span");
      value.className = "replay-comparison-value";
      value.textContent = entry[1] === null || entry[1] === undefined || entry[1] === ""
        ? entry[2]
        : entry[1];
      row.append(label, value);
      comparison.appendChild(row);
    });

    if (result) {
      const status = document.createElement("span");
      status.className = "replay-turn-status " + result.status;
      status.textContent = result.status === "completed"
        ? "Completed"
        : result.status === "failed" ? "Failed" : result.status;
      comparison.appendChild(status);
    }

    item.appendChild(comparison);
  }

  function renderConversationPreview() {
    if (!elements.conversationPreview) return;
    elements.conversationPreview.replaceChildren();

    if (!state.importedMessages.length) {
      elements.conversationPreview.className = "conversation-preview empty-debug-value";
      elements.conversationPreview.textContent = "No parsed messages yet.";
      return;
    }

    elements.conversationPreview.className = "conversation-preview";
    state.importedMessages.forEach(function (message, index) {
      const item = document.createElement("article");
      item.className = "imported-message " + message.role;

      const heading = document.createElement("div");
      heading.className = "imported-message-heading";

      const roleSelect = document.createElement("select");
      roleSelect.className = "imported-message-role-select";
      roleSelect.setAttribute("aria-label", "Role for parsed message " + (index + 1));
      [
        ["client", "Client"],
        ["bot", "Bot"],
        ["staff", "Staff"],
      ].forEach(function (roleOption) {
        const option = document.createElement("option");
        option.value = roleOption[0];
        option.textContent = roleOption[1];
        roleSelect.appendChild(option);
      });
      roleSelect.value = ["bot", "staff"].includes(message.role) ? message.role : "client";
      roleSelect.disabled = isReplayLocked();
      roleSelect.addEventListener("change", function (event) {
        state.importedMessages[index].role = ["bot", "staff"].includes(event.target.value) ? event.target.value : "client";
        clearReplayResults();
        renderConversationPreview();
        updateReplayControls();
      });

      const sender = document.createElement("span");
      sender.className = "imported-message-sender";
      sender.textContent = message.sender ? " · " + message.sender : "";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "message-action import-delete";
      deleteButton.textContent = "Delete";
      deleteButton.disabled = isReplayLocked();
      deleteButton.setAttribute("aria-label", "Delete parsed message " + (index + 1));
      deleteButton.addEventListener("click", function () {
        state.importedMessages.splice(index, 1);
        clearReplayResults();
        renderConversationPreview();
        updateReplayControls();
        if (elements.importStatus) {
          elements.importStatus.textContent = state.importedMessages.length + " message" +
            (state.importedMessages.length === 1 ? "" : "s") + " in preview";
        }
      });

      heading.append(roleSelect, sender, deleteButton);

      const editor = document.createElement("textarea");
      editor.className = "imported-message-editor";
      editor.rows = Math.max(2, Math.min(7, String(message.text).split("\n").length + 1));
      editor.value = message.text;
      editor.disabled = isReplayLocked();
      editor.setAttribute("aria-label", "Edit parsed " + (message.role === "bot" ? "bot" : message.role === "staff" ? "staff" : "client") + " message " + (index + 1));
      editor.addEventListener("input", function (event) {
        state.importedMessages[index].text = event.target.value;
        clearReplayResults();
        renderReplayStatus();
      });

      item.append(heading, editor);
      if (message.role === "client") {
        addReplayComparison(item, index);
      }
      elements.conversationPreview.appendChild(item);
    });
    renderRegressionDraft();
  }

  function scanConversation() {
    if (!elements.conversationInput || !window.ConversationParser || isReplayLocked()) return;
    const transcript = elements.conversationInput.value;
    clearReplayResults();
    state.importedMessages = window.ConversationParser.parseMessengerTranscript(transcript, {
      botNames: getImportBotNames(),
    });
    renderConversationPreview();
    if (elements.importStatus) {
      elements.importStatus.textContent = state.importedMessages.length + " message" +
        (state.importedMessages.length === 1 ? "" : "s") + " in preview";
    }
    renderRegressionDraft();
    showToast(state.importedMessages.length
      ? "Conversation scanned. Review the parsed preview before using it."
      : "No messages found in the transcript.");
    updateReplayControls();
  }

  function renderReplayStatus() {
    if (!elements.replayStatus) return;
    const replay = state.replay;
    const total = replay.plan.length;
    const completed = Math.min(replay.nextIndex, total);
    const current = replay.currentIndex === null || replay.currentIndex === undefined
      ? completed
      : replay.currentIndex + 1;

    elements.replayStatus.textContent = replay.status === "running"
      ? "Running " + current + "/" + total
      : replay.status === "paused"
        ? "Paused after " + completed + "/" + total
        : replay.status === "failed"
          ? "Failed at turn " + (replay.failedIndex + 1) + "/" + total
          : replay.status === "stopped"
            ? "Stopped after " + completed + "/" + total
            : replay.status === "completed"
              ? "Completed " + total + "/" + total
              : "Not run";
  }

  function clearReplayResults() {
    if (isReplayLocked()) return;
    state.replay = window.ReplayHelpers.createReplayState([]);
    state.replay.runToken = null;
  }

  function updateReplayControls() {
    const replay = state.replay;
    const hasPlan = replay.plan.length > 0;
    const canStart = !state.isSending && !isReplayLocked() && !isSimulatorLocked();
    const canPause = replay.status === "running" || replay.status === "paused";

    if (elements.runReplay) {
      const hasImportedClient = state.importedMessages.some(function (message) {
        return message && message.role === "client";
      });
      elements.runReplay.disabled = !canStart || (!hasPlan && !hasImportedClient);
    }
    if (elements.pauseReplay) {
      elements.pauseReplay.disabled = !canPause || (replay.status === "paused" && replay.requestInFlight);
      elements.pauseReplay.textContent = replay.status === "paused" ? "Resume" : "Pause";
    }
    if (elements.stopReplay) elements.stopReplay.disabled = !canPause;
    if (elements.retryReplay) {
      elements.retryReplay.disabled = replay.status !== "failed" || replay.failedIndex === null;
    }
    if (elements.scanConversation) elements.scanConversation.disabled = state.isSending || isReplayLocked() || isSimulatorLocked();
    if (elements.conversationInput) elements.conversationInput.disabled = isReplayLocked();
    if (elements.importBotNames) elements.importBotNames.disabled = isReplayLocked();
    renderReplayStatus();
  }

  function createReplayResult(entry, turn, attempt) {
    const failed = !turn || Boolean(turn.error);
    return {
      replayIndex: entry.replayIndex,
      sourceIndex: entry.sourceIndex,
      clientText: entry.clientText,
      originalBotReply: entry.originalBotReply,
      currentBotReply: turn && typeof turn.reply === "string" ? turn.reply : null,
      turnId: turn ? turn.id : null,
      attempt: attempt || 1,
      status: failed ? "failed" : "completed",
      error: turn ? turn.error : "Replay turn was not sent.",
    };
  }

  function isCurrentReplayToken(token) {
    return state.replay.runToken === token;
  }

  function finishReplay(token, status) {
    if (!isCurrentReplayToken(token)) return;
    state.replay.status = status;
    state.replay.currentIndex = null;
    state.replay.locked = false;
    updateLoadingControls();
    renderMessages(false);
    renderConversationPreview();
  }

  async function runReplayLoop(token) {
    while (isCurrentReplayToken(token)) {
      const replay = state.replay;
      if (replay.stopRequested) {
        finishReplay(token, "stopped");
        return;
      }
      if (replay.status === "paused") {
        updateReplayControls();
        return;
      }
      if (window.ReplayHelpers.isReplayComplete(replay)) {
        finishReplay(token, "completed");
        showToast("Replay completed.");
        return;
      }

      const index = window.ReplayHelpers.getNextReplayIndex(replay);
      if (!window.ReplayHelpers.canStartReplayTurn(replay, index)) {
        updateReplayControls();
        return;
      }
      const entry = replay.plan[index];
      replay.currentIndex = index;
      replay.requestInFlight = true;
      updateReplayControls();
      const turn = await sendMessage(entry.clientText, entry.clientText, {
        replay: true,
        replaySourceIndex: entry.sourceIndex,
      });
      replay.requestInFlight = false;

      if (!isCurrentReplayToken(token)) return;
      const result = createReplayResult(entry, turn, 1);
      replay.results[index] = result;
      renderConversationPreview();

      if (replay.stopRequested) {
        finishReplay(token, "stopped");
        return;
      }

      if (result.status === "failed") {
        replay.failedIndex = index;
        replay.status = "failed";
        replay.currentIndex = null;
        updateReplayControls();
        showToast("Replay failed at turn " + (index + 1) + ". Retry the failed turn to continue.");
        return;
      }

      replay.nextIndex = index + 1;
      replay.currentIndex = null;
      updateReplayControls();
    }
  }

  function runReplay() {
    if (state.isSending || isReplayLocked() || isSimulatorLocked() || state.scenario.running) return;
    if (!window.ReplayHelpers) {
      showToast("Replay helpers are not available.");
      return;
    }

    const plan = window.ReplayHelpers.createReplayPlan(state.importedMessages);
    if (!plan.length) {
      showToast("No imported client messages are available for replay.");
      return;
    }

    const replay = window.ReplayHelpers.createReplayState(plan);
    replay.status = "running";
    replay.locked = true;
    replay.runToken = {};
    state.replay = replay;
    resetConversationData();
    updateReplayControls();
    renderConversationPreview();
    showToast("Replay started with a fresh session.");
    void runReplayLoop(replay.runToken);
  }

  function pauseOrResumeReplay() {
    const replay = state.replay;
    if (replay.status === "running") {
      replay.status = "paused";
      updateReplayControls();
      showToast("Replay paused. No next turn will start.");
      return;
    }
    if (replay.status === "paused" && !replay.requestInFlight) {
      replay.status = "running";
      updateReplayControls();
      void runReplayLoop(replay.runToken);
    }
  }

  function stopReplay() {
    const replay = state.replay;
    if (replay.status !== "running" && replay.status !== "paused") return;
    replay.stopRequested = true;
    replay.status = "stopped";
    replay.currentIndex = null;
    if (!replay.requestInFlight) {
      replay.locked = false;
    }
    if (replay.requestInFlight) {
      updateReplayControls();
    } else {
      updateLoadingControls();
    }
    if (!replay.requestInFlight) {
      renderMessages(false);
      renderConversationPreview();
    }
    showToast("Replay stopped. Remaining turns were not sent.");
  }

  async function retryFailedReplayTurn() {
    const replay = state.replay;
    if (isSimulatorLocked()) return;
    const index = replay.failedIndex;
    if (replay.status !== "failed" || index === null || !replay.plan[index]) return;

    const entry = replay.plan[index];
    const previousResult = replay.results[index];
    const attempt = previousResult ? previousResult.attempt + 1 : 2;
    replay.stopRequested = false;
    replay.status = "running";
    replay.currentIndex = index;
    replay.requestInFlight = true;
    updateReplayControls();

    const turn = await sendMessage(entry.clientText, entry.clientText, {
      replay: true,
      replaySourceIndex: entry.sourceIndex,
    });
    replay.requestInFlight = false;

    if (!isCurrentReplayToken(replay.runToken)) return;
    const result = createReplayResult(entry, turn, attempt);
    replay.results[index] = result;
    renderConversationPreview();

    if (result.status === "failed") {
      replay.status = "failed";
      replay.currentIndex = null;
      updateReplayControls();
      showToast("Retry failed at turn " + (index + 1) + ".");
      return;
    }

    replay.nextIndex = index + 1;
    replay.failedIndex = null;
    replay.currentIndex = null;
    if (replay.stopRequested) {
      finishReplay(replay.runToken, "stopped");
      return;
    }
    if (window.ReplayHelpers.isReplayComplete(replay)) {
      finishReplay(replay.runToken, "completed");
      showToast("Replay completed after retry.");
      return;
    }
    replay.status = "paused";
    updateReplayControls();
    showToast("Failed turn retried. Resume to continue replay.");
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
    if (elements.debugHumanTakeover) {
      const takeover = debug.humanTakeover;
      elements.debugHumanTakeover.textContent = takeover && takeover.active ? "ACTIVE" : "INACTIVE";
      elements.debugHumanTakeover.className = "takeover-status " + (takeover && takeover.active ? "active" : "inactive");
      if (takeover && takeover.active && takeover.freezeUntil) {
        elements.debugHumanTakeover.title = "Frozen until " + takeover.freezeUntil;
      } else {
        elements.debugHumanTakeover.removeAttribute("title");
      }
    }
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

    const isReplayRequest = Boolean(sendOptions && sendOptions.replay === true);
    const requestedSenderMode = (sendOptions && sendOptions.senderMode) || state.senderMode;
    const isStaffRequest = state.channelMode === "messenger" && requestedSenderMode === "staff" &&
      !isReplayRequest && !(sendOptions && sendOptions.simulator) && !(sendOptions && sendOptions.scenarioId);
    const senderMode = isStaffRequest ? "staff" : "client";
    if (!message || isRequestBlocked(sendOptions)) {
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
      senderMode: senderMode,
      selectedOption: sendOptions && sendOptions.selectedOption,
      edgeTestMode: state.edgeTestMode,
      requestId: requestId,
    };
    const requestPayload = adapter.buildRequest(bot, message, state.sessionId, requestContext);
    const runType = isReplayRequest
      ? "replay"
      : sendOptions && sendOptions.simulator
        ? "simulator"
        : sendOptions && sendOptions.scenarioId
          ? "scenario"
          : isStaffRequest
            ? "manual-staff"
            : "manual-client";
    const turn = createTurn(bot, message, messageLabel, requestPayload, adapter, runType, senderMode);
    if (isReplayRequest && sendOptions.replaySourceIndex !== undefined) {
      turn.importedSourceIndex = sendOptions.replaySourceIndex;
    }
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
    addMessage(isStaffRequest ? "staff" : "user", messageLabel, [], turn.id);
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
      const apiUrl = isStaffRequest ? getStaffApiUrl(bot) : getBotApiUrl(bot);

      if (!apiUrl) {
        failureType = "configuration";
        throw new Error(isStaffRequest
          ? "Staff test API URL chưa cấu hình trong config.js."
          : "API URL chưa cấu hình trong config.js.");
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
      if (isStaffRequest) {
        parsedReply = null;
      } else if (rawResponse && rawResponse.type === "silent") {
        parsedReply = null;
        addMessage(
          "system",
          normalizedDebug.humanTakeover && normalizedDebug.humanTakeover.active
            ? "Bot reply suppressed — Human Takeover is active."
            : "Bot returned no message.",
          [],
          turn.id,
        );
      } else {
        parsedReply = adapter.parseResponse(bot, rawResponse);
        addMessage("bot", parsedReply, adapter.parseSuggestedOptions(bot, rawResponse, requestContext), turn.id);
      }
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

  function getSelectedSimulatorScenario() {
    return state.simulator.catalog.find(function (scenario) {
      return scenario.serviceId === state.simulator.serviceId && scenario.scenarioId === state.simulator.scenarioId;
    }) || null;
  }

  function populateSimulatorSelectors() {
    if (!elements.simulatorService || !elements.simulatorScenario) return;
    const catalog = state.simulator.catalog;
    const previousServiceId = state.simulator.serviceId;
    const previousScenarioId = state.simulator.scenarioId;
    const services = [];
    catalog.forEach(function (scenario) {
      if (!services.some(function (service) { return service.id === scenario.serviceId; })) {
        services.push({ id: scenario.serviceId, name: scenario.serviceName });
      }
    });

    elements.simulatorService.replaceChildren();
    if (!services.length) {
      const emptyService = document.createElement("option");
      emptyService.value = "";
      emptyService.textContent = state.simulator.catalogError ? "Simulator unavailable" : "Loading services...";
      elements.simulatorService.appendChild(emptyService);
      elements.simulatorService.disabled = true;
      elements.simulatorScenario.replaceChildren();
      const emptyScenario = document.createElement("option");
      emptyScenario.value = "";
      emptyScenario.textContent = state.simulator.catalogError ? "Simulator unavailable" : "Loading scenarios...";
      elements.simulatorScenario.appendChild(emptyScenario);
      elements.simulatorScenario.disabled = true;
      return;
    }

    state.simulator.serviceId = services.some(function (service) { return service.id === previousServiceId; })
      ? previousServiceId
      : services[0].id;
    services.forEach(function (service) {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.name;
      elements.simulatorService.appendChild(option);
    });
    elements.simulatorService.value = state.simulator.serviceId;

    const scenarios = catalog.filter(function (scenario) {
      return scenario.serviceId === state.simulator.serviceId;
    });
    state.simulator.scenarioId = scenarios.some(function (scenario) { return scenario.scenarioId === previousScenarioId; })
      ? previousScenarioId
      : scenarios[0].scenarioId;
    elements.simulatorScenario.replaceChildren();
    scenarios.forEach(function (scenario) {
      const option = document.createElement("option");
      option.value = scenario.scenarioId;
      option.textContent = scenario.scenarioName;
      elements.simulatorScenario.appendChild(option);
    });
    elements.simulatorScenario.value = state.simulator.scenarioId;
  }

  function renderSimulatorStatus() {
    if (!elements.simulatorStatus || !elements.simulatorSummary) return;
    const simulator = state.simulator;
    let statusText = "Not run";
    if (simulator.catalogLoading) {
      statusText = "Loading scenarios...";
    } else if (simulator.catalogError && simulator.status === "idle") {
      statusText = "Unavailable";
    } else if (simulator.status === "running") {
      statusText = "Running " + simulator.current + "/" + simulator.total;
    } else if (simulator.status === "paused") {
      statusText = "Paused after " + simulator.current + "/" + simulator.total;
    } else if (simulator.status === "completed") {
      statusText = "Completed after " + simulator.current + " client " + (simulator.current === 1 ? "turn" : "turns");
    } else if (simulator.status === "max-turns") {
      statusText = "Max turns reached " + simulator.current + "/" + simulator.total;
    } else if (simulator.status === "stopped") {
      statusText = "Stopped after " + simulator.current + "/" + simulator.total;
    } else if (simulator.status === "error") {
      statusText = "Error after " + simulator.current + "/" + simulator.total;
    }
    elements.simulatorStatus.textContent = statusText;
    const summary = simulator.summary || (simulator.catalogError
      ? "AI Client Simulator is unavailable. Manual chat and existing QA tools remain available."
      : "Not run");
    const summaryClass = simulator.catalogError && simulator.status === "idle" ? "unavailable" : simulator.status;
    elements.simulatorSummary.className = "simulator-summary status-" + summaryClass;
    elements.simulatorSummary.textContent = summary;
  }

  function updateSimulatorControls() {
    if (!elements.startSimulator) return;
    const simulator = state.simulator;
    const locked = isSimulatorLocked();
    const canStart = !state.isSending && !isReplayLocked() && !locked && simulator.catalog.length > 0 && !simulator.catalogError;
    elements.startSimulator.disabled = !canStart;
    elements.pauseSimulator.disabled = !locked || (simulator.status === "paused" && simulator.requestInFlight);
    elements.pauseSimulator.textContent = simulator.status === "paused" ? "Resume" : "Pause";
    elements.stopSimulator.disabled = !locked;
    const controlsLocked = state.isSending || isReplayLocked() || locked;
    elements.simulatorService.disabled = controlsLocked || simulator.catalog.length === 0;
    elements.simulatorScenario.disabled = controlsLocked || simulator.catalog.length === 0;
    elements.simulatorDifficulty.disabled = controlsLocked;
    elements.simulatorMaxTurns.disabled = controlsLocked;
    renderSimulatorStatus();
  }

  function getSimulatorMaxTurns() {
    const value = Number(elements.simulatorMaxTurns && elements.simulatorMaxTurns.value);
    if (Number.isSafeInteger(value) && value >= 1 && value <= 20) return value;
    if (elements.simulatorMaxTurns) elements.simulatorMaxTurns.value = "8";
    return 8;
  }

  function getVisibleSimulatorConversation() {
    return state.messages
      .filter(function (message) { return message.type === "user" || message.type === "bot"; })
      .map(function (message) {
        return {
          role: message.type === "user" ? "client" : "bot",
          text: String(message.text),
        };
      });
  }

  function parseSimulatorDecision(body) {
    if (!isObject(body) || !["message", "stop"].includes(body.action)) {
      throw new Error("Simulator response was invalid.");
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.action === "message" && !message) throw new Error("Simulator response did not include a client message.");
    if (!reason) throw new Error("Simulator response did not include a reason.");
    return {
      action: body.action,
      message: body.action === "stop" ? "" : message,
      reason: reason,
    };
  }

  async function requestSimulatorTurn(run) {
    const response = await fetch("/api/simulate-client-turn", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: run.serviceId,
        scenarioId: run.scenarioId,
        difficulty: run.difficulty,
        turnNumber: run.current,
        maxTurns: run.total,
        messages: getVisibleSimulatorConversation(),
      }),
    });
    const body = parseJsonOrText(await response.text());
    if (!response.ok) {
      const error = new Error(body && typeof body.error === "string" ? body.error : "AI Client Simulator request failed.");
      error.status = response.status;
      error.unavailable = Boolean(body && body.status === "unavailable");
      error.code = body && typeof body.code === "string" ? body.code : "";
      error.details = body && body.details && typeof body.details === "object" ? body.details : null;
      throw error;
    }
    return parseSimulatorDecision(body);
  }

  function isCurrentSimulatorToken(token) {
    return state.simulator.runToken === token;
  }

  function finishSimulator(token, status, summary, reason) {
    if (!isCurrentSimulatorToken(token)) return;
    const simulator = state.simulator;
    simulator.status = status;
    simulator.requestInFlight = false;
    simulator.summary = summary;
    simulator.reason = reason || "";
    updateLoadingControls();
    renderMessages(false);
    showToast(summary);
  }

  async function runSimulatorLoop(token, run) {
    while (isCurrentSimulatorToken(token)) {
      if (run.stopRequested || run.status === "stopped") return;
      if (run.status === "paused") {
        updateSimulatorControls();
        return;
      }
      if (run.current >= run.total) {
        finishSimulator(token, "max-turns", "Reached the max of " + run.total + " client turns. The conversation remains available for inspection.");
        return;
      }

      run.requestInFlight = true;
      updateSimulatorControls();
      let decision;
      try {
        decision = await requestSimulatorTurn(run);
      } catch (error) {
        run.requestInFlight = false;
        if (!isCurrentSimulatorToken(token) || run.stopRequested || run.status === "stopped") return;
        finishSimulator(
          token,
          error && error.unavailable ? "unavailable" : "error",
          error && error.unavailable
            ? "AI Client Simulator is unavailable. Manual chat and existing QA tools remain available."
            : "AI Client Simulator stopped: " + (error && error.message ? error.message : "unknown simulator error") + " The conversation remains available for inspection.",
        );
        return;
      }
      run.requestInFlight = false;
      if (!isCurrentSimulatorToken(token) || run.stopRequested || run.status === "stopped") return;
      if (run.status === "paused") {
        updateSimulatorControls();
        return;
      }
      if (decision.action === "stop") {
        finishSimulator(
          token,
          "completed",
          "Client chose to stop after " + run.current + " client " + (run.current === 1 ? "turn" : "turns") + "." + (decision.reason ? " " + decision.reason : ""),
          decision.reason,
        );
        return;
      }

      run.current += 1;
      run.requestInFlight = true;
      updateSimulatorControls();
      let turn;
      try {
        turn = await sendMessage(decision.message, decision.message, {
          simulator: true,
          simulatorScenarioId: run.scenarioId,
        });
      } catch (error) {
        run.requestInFlight = false;
        if (!isCurrentSimulatorToken(token) || run.stopRequested || run.status === "stopped") return;
        finishSimulator(token, "error", "AI Client Simulator stopped because the chatbot request failed. Inspect the Turn Log.");
        return;
      }
      run.requestInFlight = false;
      if (!isCurrentSimulatorToken(token) || run.stopRequested || run.status === "stopped") return;
      if (!turn || turn.error || typeof turn.reply !== "string") {
        finishSimulator(token, "error", "AI Client Simulator stopped because the chatbot request failed. Inspect the Turn Log.");
        return;
      }
      updateSimulatorControls();
    }
  }

  function startSimulator() {
    if (state.isSending || isReplayLocked() || isSimulatorLocked()) return;
    const scenario = getSelectedSimulatorScenario();
    if (!scenario) {
      showToast("Select an available AI Client Simulator scenario first.");
      return;
    }
    const run = Object.assign({}, state.simulator, {
      serviceId: scenario.serviceId,
      scenarioId: scenario.scenarioId,
      difficulty: elements.simulatorDifficulty.value === "challenging" ? "challenging" : "normal",
      status: "running",
      current: 0,
      total: getSimulatorMaxTurns(),
      summary: "Starting a fresh tester conversation...",
      reason: "",
      requestInFlight: false,
      stopRequested: false,
      runToken: {},
    });
    state.simulator = run;
    state.scenario.result = null;
    state.scenario.evaluationInput = null;
    state.scenario.behaviorEvaluation = null;
    resetConversationData();
    updateLoadingControls();
    showToast("AI Client Simulator started with a fresh session.");
    void runSimulatorLoop(run.runToken, run);
  }

  function pauseOrResumeSimulator() {
    const simulator = state.simulator;
    if (simulator.status === "running") {
      simulator.status = "paused";
      simulator.summary = "Paused after " + simulator.current + "/" + simulator.total + " client turns.";
      updateSimulatorControls();
      showToast("AI Client Simulator paused.");
      return;
    }
    if (simulator.status === "paused" && !simulator.requestInFlight) {
      simulator.status = "running";
      simulator.summary = "Resuming the client conversation...";
      updateSimulatorControls();
      void runSimulatorLoop(simulator.runToken, simulator);
    }
  }

  function stopSimulator() {
    const simulator = state.simulator;
    if (!isSimulatorLocked()) return;
    simulator.stopRequested = true;
    simulator.status = "stopped";
    simulator.runToken = {};
    simulator.summary = "Stopped by the user after " + simulator.current + "/" + simulator.total + " client turns. The conversation remains available.";
    updateLoadingControls();
    showToast("AI Client Simulator stopped.");
  }

  async function loadSimulatorCatalog() {
    try {
      const response = await fetch("/api/simulate-client-scenarios", { headers: { Accept: "application/json" } });
      const body = parseJsonOrText(await response.text());
      if (!response.ok || !body || !Array.isArray(body.scenarios)) throw new Error("Simulator catalog unavailable.");
      state.simulator.catalog = body.scenarios.filter(function (scenario) {
        return isObject(scenario) && scenario.serviceId && scenario.serviceName && scenario.scenarioId && scenario.scenarioName;
      });
      state.simulator.catalogError = false;
    } catch (error) {
      state.simulator.catalog = [];
      state.simulator.catalogError = true;
    } finally {
      state.simulator.catalogLoading = false;
      populateSimulatorSelectors();
      updateSimulatorControls();
    }
  }

  function getRegressionHelpers() {
    return window.RegressionHelpers && typeof window.RegressionHelpers.validateScenario === "function"
      ? window.RegressionHelpers
      : null;
  }

  function getRegressionStorage() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function getRegressionBehaviorInputs() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-behavior-key]"));
  }

  function setRegressionStatus(message, isError) {
    if (!elements.regressionStatus) return;
    elements.regressionStatus.textContent = message;
    elements.regressionStatus.classList.toggle("regression-status-error", Boolean(isError));
  }

  function renderRegressionDraft() {
    const helpers = getRegressionHelpers();
    const draft = state.regression.draft;
    const editableControls = [
      elements.regressionName,
      elements.regressionId,
      elements.regressionIntent,
      elements.regressionStep,
      elements.regressionFields,
      elements.regressionTelegramStatus,
      elements.regressionTelegramTriggerCount,
    ].filter(Boolean);
    const locked = !draft || state.isSending || isReplayLocked();
    editableControls.forEach(function (control) {
      control.disabled = locked;
    });
    getRegressionBehaviorInputs().forEach(function (input) {
      input.disabled = locked;
    });

    if (draft && helpers) {
      elements.regressionName.value = draft.name || "";
      elements.regressionId.value = draft.id || "";
      elements.regressionIntent.value = Object.hasOwn(draft.assertions, "intent") ? draft.assertions.intent : "";
      const stateStepAssertion = helpers.getStateStepAssertion(draft.assertions);
      elements.regressionStep.value = stateStepAssertion.value === undefined ? "" : stateStepAssertion.value;
      elements.regressionFields.value = Object.hasOwn(draft.assertions, "fields")
        ? JSON.stringify(draft.assertions.fields, null, 2)
        : "";
      elements.regressionTelegramStatus.value = Object.hasOwn(draft.assertions, "telegramStatus")
        ? draft.assertions.telegramStatus
        : "";
      elements.regressionTelegramTriggerCount.value = Object.hasOwn(draft.assertions, "telegramTriggerCount")
        ? draft.assertions.telegramTriggerCount
        : "";
      getRegressionBehaviorInputs().forEach(function (input) {
        input.checked = draft.behaviorExpectations && draft.behaviorExpectations[input.dataset.behaviorKey] === true;
      });
    }

    if (elements.generateRegression) {
      elements.generateRegression.disabled = state.isSending || isReplayLocked() || !state.importedMessages.some(function (message) {
        return message && message.role === "client";
      });
    }
    if (elements.saveRegression) elements.saveRegression.disabled = locked;
    if (elements.exportRegression) elements.exportRegression.disabled = locked;
    if (elements.importRegression) elements.importRegression.disabled = state.isSending || isReplayLocked();
    if (elements.regressionImportJson) elements.regressionImportJson.disabled = state.isSending || isReplayLocked();
  }

  function readRegressionDraft() {
    const helpers = getRegressionHelpers();
    if (!helpers || !state.regression.draft) throw new Error("Regression helpers are not available.");

    const intent = elements.regressionIntent.value.trim();
    const stateStepValue = elements.regressionStep.value.trim();
    const telegramStatus = elements.regressionTelegramStatus.value.trim();
    const fieldsText = elements.regressionFields.value.trim();
    let fields;
    if (fieldsText) {
      try {
        fields = JSON.parse(fieldsText);
      } catch (error) {
        throw new Error("Extracted fields must be valid JSON.");
      }
      if (!isObject(fields)) throw new Error("Extracted fields must be a JSON object.");
    }

    const triggerCountText = elements.regressionTelegramTriggerCount.value.trim();
    let triggerCount;
    if (triggerCountText) {
      triggerCount = Number(triggerCountText);
      if (!Number.isInteger(triggerCount) || triggerCount < 0) {
        throw new Error("Telegram trigger count must be a non-negative integer.");
      }
    }

    const assertions = helpers.buildEditableAssertions(state.regression.draft.assertions, {
      intent: intent,
      stateStepValue: stateStepValue,
      fields: fields,
      telegramStatus: telegramStatus,
      telegramTriggerCount: triggerCount,
    });

    const behaviorExpectations = {};
    getRegressionBehaviorInputs().forEach(function (input) {
      behaviorExpectations[input.dataset.behaviorKey] = input.checked;
    });

    return helpers.validateScenario(Object.assign({}, state.regression.draft, {
      name: elements.regressionName.value,
      id: elements.regressionId.value,
      assertions: assertions,
      behaviorExpectations: behaviorExpectations,
    }));
  }

  function loadRegressionDraft(scenario, statusMessage) {
    const helpers = getRegressionHelpers();
    if (!helpers) return;
    try {
      state.regression.draft = helpers.validateScenario(scenario);
      state.regression.editingSavedId = null;
      renderRegressionDraft();
      if (statusMessage) setRegressionStatus(statusMessage);
    } catch (error) {
      setRegressionStatus(error.message, true);
    }
  }

  function getConfiguredScenarioIds() {
    const ids = [];
    const globalScenarios = Array.isArray(window.CHATBOT_SCENARIOS) ? window.CHATBOT_SCENARIOS : [];
    const botScenarios = state.bots.reduce(function (all, bot) {
      return all.concat(Array.isArray(bot.scenarios) ? bot.scenarios : []);
    }, []);
    globalScenarios.concat(botScenarios).forEach(function (scenario, index) {
      if (!isObject(scenario)) return;
      ids.push(String(scenario.id || "scenario-" + index));
    });
    return ids;
  }

  function saveRegressionDraft() {
    const helpers = getRegressionHelpers();
    if (!helpers || !state.regression.draft) return;
    try {
      const draft = readRegressionDraft();
      const configuredIds = getConfiguredScenarioIds();
      const saved = state.regression.savedScenarios.slice();
      const existingIndex = saved.findIndex(function (scenario) { return scenario.id === draft.id; });
      const canReplace = existingIndex >= 0 && state.regression.editingSavedId === draft.id && !configuredIds.includes(draft.id);
      if ((existingIndex >= 0 || configuredIds.includes(draft.id)) && !canReplace) {
        draft.id = helpers.uniqueScenarioId(draft.id, configuredIds.concat(saved.map(function (scenario) { return scenario.id; })));
      }
      draft.updatedAt = new Date().toISOString();
      const next = canReplace
        ? saved.map(function (scenario, index) { return index === existingIndex ? draft : scenario; })
        : saved.concat(draft);
      if (!helpers.saveSavedScenarios(getRegressionStorage(), next)) {
        throw new Error("Could not save scenario. Local storage is unavailable.");
      }
      state.regression.savedScenarios = next;
      state.regression.draft = draft;
      state.regression.editingSavedId = draft.id;
      state.scenario.scenarioId = draft.id;
      updateScenarioControls();
      renderRegressionDraft();
      setRegressionStatus("Saved " + draft.id + ".");
      showToast("Scenario saved locally.");
    } catch (error) {
      setRegressionStatus(error.message, true);
      showToast("Scenario was not saved.");
    }
  }

  function importRegressionScenarios() {
    const helpers = getRegressionHelpers();
    if (!helpers || !elements.regressionImportJson) return;
    try {
      const imported = helpers.parseScenarioJson(elements.regressionImportJson.value);
      const configuredIds = getConfiguredScenarioIds();
      const saved = state.regression.savedScenarios.slice();
      const usedIds = configuredIds.concat(saved.map(function (scenario) { return scenario.id; }));
      const added = imported.map(function (scenario) {
        const next = helpers.validateScenario(scenario);
        next.id = helpers.uniqueScenarioId(next.id, usedIds);
        usedIds.push(next.id);
        return next;
      });
      const next = saved.concat(added);
      if (!helpers.saveSavedScenarios(getRegressionStorage(), next)) {
        throw new Error("Could not import scenario. Local storage is unavailable.");
      }
      state.regression.savedScenarios = next;
      loadRegressionDraft(added[0], "Imported " + added.length + " scenario" + (added.length === 1 ? "" : "s") + ".");
      state.regression.editingSavedId = added[0].id;
      state.scenario.scenarioId = added[0].id;
      updateScenarioControls();
      elements.regressionImportJson.value = "";
      showToast("Scenario JSON imported locally.");
    } catch (error) {
      setRegressionStatus(error.message, true);
      showToast("Scenario JSON was rejected.");
    }
  }

  function exportRegressionScenario() {
    const helpers = getRegressionHelpers();
    if (!helpers || !state.regression.draft) return;
    try {
      const draft = readRegressionDraft();
      const content = helpers.serializeScenarios([draft]);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = (draft.id || "regression-scenario") + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
      state.regression.draft = draft;
      renderRegressionDraft();
      setRegressionStatus("Exported " + draft.id + ".");
    } catch (error) {
      setRegressionStatus(error.message, true);
      showToast("Scenario was not exported.");
    }
  }

  function generateRegressionScenario() {
    const helpers = getRegressionHelpers();
    if (!helpers || isReplayLocked() || state.isSending) return;
    try {
      const scenario = helpers.createRegressionScenario({
        importedMessages: state.importedMessages,
        turns: state.turns,
        botId: state.selectedBot && state.selectedBot.id,
        channelMode: state.channelMode,
      });
      state.regression.draft = scenario;
      state.regression.editingSavedId = null;
      renderRegressionDraft();
      setRegressionStatus("Draft generated with " + scenario.messages.length + " client message" + (scenario.messages.length === 1 ? "" : "s") + ".");
      showToast("Regression draft generated. Review it before saving.");
    } catch (error) {
      setRegressionStatus(error.message, true);
      showToast("Could not generate regression scenario.");
    }
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
    state.regression.savedScenarios.forEach(function (scenario) {
      if (!isObject(scenario) || !Array.isArray(scenario.messages)) return;
      if (scenario.botId && (!state.selectedBot || scenario.botId !== state.selectedBot.id)) return;
      scenarios.push({ ...scenario });
    });
    return scenarios;
  }

  function getSelectedScenario() {
    const scenarios = getConfiguredScenarios();
    return scenarios.find(function (scenario) {
      return scenario.id === state.scenario.scenarioId;
    }) || null;
  }

  function getBehaviorKeys() {
    return window.RegressionHelpers && Array.isArray(window.RegressionHelpers.BEHAVIOR_KEYS)
      ? window.RegressionHelpers.BEHAVIOR_KEYS.slice()
      : [
          "answerLatestQuestion",
          "preserveContext",
          "noUnnecessaryRepetition",
          "noContradictionOrRenegotiation",
          "doNotIgnoreUserQuestion",
        ];
  }

  function getEnabledBehaviorKeys(expectations) {
    const source = isObject(expectations) ? expectations : {};
    return getBehaviorKeys().filter(function (key) { return source[key] === true; });
  }

  function invalidateScenarioEvaluation() {
    state.scenario.runToken = {};
    state.scenario.evaluationInput = null;
    state.scenario.behaviorEvaluation = null;
    state.scenario.evaluationRequestToken = null;
  }

  function formatBehaviorKey(key) {
    return {
      answerLatestQuestion: "Answer latest question",
      preserveContext: "Preserve context",
      noUnnecessaryRepetition: "No unnecessary repetition",
      noContradictionOrRenegotiation: "No contradiction or renegotiation",
      doNotIgnoreUserQuestion: "Do not ignore user question",
    }[key] || key;
  }

  function renderBehaviorEvaluation(evaluation) {
    if (!elements.aiBehaviorResult) return;
    elements.aiBehaviorResult.replaceChildren();
    const current = evaluation || { status: "not-requested" };
    const status = ["pending", "completed", "skipped", "unavailable", "error", "not-requested"].includes(current.status)
      ? current.status
      : "error";
    elements.aiBehaviorResult.className = "ai-behavior-result status-" + status;
    const heading = document.createElement("strong");
    heading.textContent = "AI Behavior · " + (
      status === "completed" ? (current.overallPassed ? "PASS" : "FAIL") : status.toUpperCase()
    );
    elements.aiBehaviorResult.appendChild(heading);

    const summary = document.createElement("span");
    summary.textContent = current.summary || (
      status === "pending" ? "Evaluating completed scenario turns..." :
          status === "skipped" ? "No behavior expectations are enabled." :
            status === "not-requested" ? "Run a scenario to request behavior evaluation." :
          status === "unavailable" ? "Behavior evaluation is unavailable." :
            status === "error" ? "Behavior evaluation failed safely." : ""
    );
    elements.aiBehaviorResult.appendChild(summary);

    if (status === "completed" && Array.isArray(current.checks)) {
      const list = document.createElement("ul");
      current.checks.forEach(function (check) {
        const item = document.createElement("li");
        item.className = check.passed ? "passed" : "failed";
        const turns = Array.isArray(check.turnIndices) && check.turnIndices.length
          ? " · turns " + check.turnIndices.join(", ")
          : "";
        item.textContent = (check.passed ? "✓ " : "✗ ") + formatBehaviorKey(check.key) + " · " + check.reason + turns;
        list.appendChild(item);
      });
      elements.aiBehaviorResult.appendChild(list);
    }

    const metadata = [];
    if (current.model) metadata.push("Model: " + current.model);
    if (current.usage && isObject(current.usage)) {
      const tokenParts = ["input_tokens", "output_tokens", "total_tokens"]
        .filter(function (key) { return Number.isSafeInteger(current.usage[key]); })
        .map(function (key) { return key.replace("_tokens", "") + " " + current.usage[key]; });
      if (tokenParts.length) metadata.push("Tokens: " + tokenParts.join(" / "));
    }
    if (metadata.length) {
      const meta = document.createElement("span");
      meta.className = "ai-behavior-meta";
      meta.textContent = metadata.join(" · ");
      elements.aiBehaviorResult.appendChild(meta);
    }
  }

  function renderScenarioResult(report) {
    if (!elements.scenarioResult) return;
    elements.scenarioResult.replaceChildren();
    renderBehaviorEvaluation(state.scenario.behaviorEvaluation);
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
    if (report.behaviorExpectations && Object.keys(report.behaviorExpectations).length) {
      const note = document.createElement("p");
      note.className = "scenario-behavior-note";
      note.textContent = "AI behavior checks are shown separately and never change deterministic assertions.";
      elements.scenarioResult.appendChild(note);
    }
    renderBehaviorEvaluation(state.scenario.behaviorEvaluation);
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
      elements.scenarioSelect.disabled = state.scenario.running || state.isSending || isReplayLocked() || isSimulatorLocked();
      elements.runScenario.disabled = state.scenario.running || state.isSending || isReplayLocked() || isSimulatorLocked();
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
    if (elements.reevaluateBehavior) {
      const enabled = getEnabledBehaviorKeys(state.scenario.evaluationInput && state.scenario.evaluationInput.behaviorExpectations);
      elements.reevaluateBehavior.disabled = state.scenario.running ||
        !state.scenario.result || !state.scenario.evaluationInput || !enabled.length ||
        (state.scenario.behaviorEvaluation && state.scenario.behaviorEvaluation.status === "pending");
    }
    renderRegressionDraft();
  }

  function createBehaviorEvaluationInput(scenario, turns) {
    const expectations = {};
    getEnabledBehaviorKeys(scenario.behaviorExpectations).forEach(function (key) {
      expectations[key] = true;
    });
    return {
      scenario: {
        id: String(scenario.id || "scenario"),
        name: String(scenario.name || scenario.id || "Scenario"),
      },
      messages: scenario.messages.map(function (message) { return String(message); }),
      replies: scenario.messages.map(function (message, index) {
        const turn = turns[index];
        return turn && typeof turn.reply === "string" ? turn.reply : "";
      }),
      behaviorExpectations: expectations,
      channelMode: ["website", "messenger"].includes(scenario.channelMode)
        ? scenario.channelMode
        : state.channelMode,
    };
  }

  function isValidBehaviorEvaluation(value, enabledKeys) {
    if (!isObject(value) || typeof value.overallPassed !== "boolean" || typeof value.summary !== "string" || !Array.isArray(value.checks)) {
      return false;
    }
    if (value.checks.length !== enabledKeys.length) return false;
    const seen = new Set();
    let allPassed = true;
    for (const check of value.checks) {
      if (!isObject(check) || !enabledKeys.includes(check.key) || seen.has(check.key) ||
        typeof check.passed !== "boolean" || typeof check.reason !== "string" || !Array.isArray(check.turnIndices)) {
        return false;
      }
      seen.add(check.key);
      allPassed = allPassed && check.passed;
    }
    return seen.size === enabledKeys.length && allPassed === value.overallPassed;
  }

  async function evaluateScenarioBehavior(input, runToken) {
    if (!input || !runToken || state.scenario.runToken !== runToken) return;
    const enabledKeys = getEnabledBehaviorKeys(input.behaviorExpectations);
    if (!enabledKeys.length) {
      state.scenario.behaviorEvaluation = {
        status: "skipped",
        summary: "No behavior expectations are enabled.",
        checks: [],
      };
      updateScenarioControls();
      return;
    }

    const requestToken = {};
    state.scenario.evaluationRequestToken = requestToken;
    state.scenario.behaviorEvaluation = { status: "pending" };
    updateScenarioControls();
    try {
      const response = await fetch("/api/evaluate-behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      let body = null;
      try {
        body = JSON.parse(await response.text());
      } catch (error) {
        body = null;
      }
      if (state.scenario.runToken !== runToken || state.scenario.evaluationRequestToken !== requestToken) return;
      if (!response.ok) {
        state.scenario.behaviorEvaluation = {
          status: body && body.status === "unavailable" ? "unavailable" : "error",
        };
      } else if (body && body.status === "skipped") {
        state.scenario.behaviorEvaluation = { status: "skipped", summary: body.summary, checks: [] };
      } else if (!isValidBehaviorEvaluation(body, enabledKeys)) {
        state.scenario.behaviorEvaluation = { status: "error" };
      } else {
        state.scenario.behaviorEvaluation = {
          status: "completed",
          overallPassed: body.overallPassed,
          summary: body.summary,
          checks: body.checks,
          model: typeof body.model === "string" ? body.model : undefined,
          usage: isObject(body.usage) ? body.usage : undefined,
        };
      }
      updateScenarioControls();
    } catch (error) {
      if (state.scenario.runToken !== runToken || state.scenario.evaluationRequestToken !== requestToken) return;
      state.scenario.behaviorEvaluation = { status: "error" };
      updateScenarioControls();
    }
  }

  function reevaluateBehavior() {
    if (state.scenario.running || !state.scenario.result || !state.scenario.evaluationInput) return;
    void evaluateScenarioBehavior(state.scenario.evaluationInput, state.scenario.runToken);
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
      behaviorExpectations: isObject(scenario.behaviorExpectations)
        ? { ...scenario.behaviorExpectations }
        : {},
    };
  }

  function resetConversationData() {
    invalidateScenarioEvaluation();
    state.sessionId = createSessionId();
    state.messages = [];
    state.turns = [];
    state.selectedTurnId = null;
    state.nextTurnNumber = 1;
    renderTurnLog();
    updateSessionDisplay();
    renderMessages();
    resetDebug();
  }

  async function runScenario() {
    if (state.scenario.running || state.isSending || isReplayLocked() || isSimulatorLocked()) return;
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
    const runToken = {};
    state.scenario.runToken = runToken;
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
    state.scenario.evaluationInput = createBehaviorEvaluationInput(scenario, state.turns);
    state.scenario.behaviorEvaluation = getEnabledBehaviorKeys(state.scenario.evaluationInput.behaviorExpectations).length
      ? { status: "pending" }
      : { status: "skipped", summary: "No behavior expectations are enabled.", checks: [] };
    updateScenarioControls();
    showToast(state.scenario.result.passed ? "Scenario PASS." : "Scenario FAIL.");
    void evaluateScenarioBehavior(state.scenario.evaluationInput, runToken);
  }

  function buildQaReport() {
    const scenarioReport = state.scenario.result
      ? Object.assign({}, state.scenario.result, {
          behaviorEvaluation: state.scenario.behaviorEvaluation,
        })
      : null;
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
      scenario: scenarioReport,
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
    if (state.scenario.running || isReplayLocked() || isSimulatorLocked()) return;
    state.scenario = {
      running: false,
      scenarioId: state.scenario.scenarioId,
      current: 0,
      total: 0,
      result: null,
      runToken: {},
      evaluationInput: null,
      behaviorEvaluation: null,
      evaluationRequestToken: null,
    };
    resetConversationData();
    updateScenarioControls();
    showToast("Đã tạo conversation và session mới.");
    elements.messageInput.focus();
  }

  function clearChat() {
    if (isReplayLocked() || isSimulatorLocked()) return;
    invalidateScenarioEvaluation();
    state.messages = [];
    renderMessages();
    updateScenarioControls();
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
    invalidateScenarioEvaluation();
    state.selectedBot = state.bots.find(function (bot) {
      return bot.id === event.target.value;
    }) || null;
    clearSuggestedOptions();
    renderMessages();
    updateBotDisplay();
    updateLoadingControls();
    updateScenarioControls();
    if (state.selectedTurnId) {
      updateDebug(getTurn(state.selectedTurnId));
    } else {
      resetDebug();
    }
  });
  if (elements.channelMode) {
    elements.channelMode.addEventListener("change", function (event) {
      invalidateScenarioEvaluation();
      state.channelMode = event.target.value === "messenger" ? "messenger" : "website";
      if (state.channelMode !== "messenger") state.senderMode = "client";
      clearSuggestedOptions();
      renderMessages();
      updateLoadingControls();
    });
  }
  if (elements.senderModeInputs) {
    elements.senderModeInputs.forEach(function (input) {
      input.addEventListener("change", function (event) {
        if (state.channelMode !== "messenger" || isRequestBlocked()) return;
        state.senderMode = event.target.value === "staff" ? "staff" : "client";
        updateLoadingControls();
      });
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
      invalidateScenarioEvaluation();
      state.scenario.scenarioId = event.target.value || null;
      state.scenario.result = null;
      state.scenario.current = 0;
      state.scenario.total = 0;
      const selectedScenario = getSelectedScenario();
      if (selectedScenario && state.regression.savedScenarios.some(function (scenario) {
        return scenario.id === selectedScenario.id;
      })) {
        loadRegressionDraft(selectedScenario, "Loaded saved scenario.");
        state.regression.editingSavedId = selectedScenario.id;
      }
      updateScenarioControls();
    });
  }
  if (elements.runScenario) {
    elements.runScenario.addEventListener("click", function () {
      void runScenario();
    });
  }
  if (elements.reevaluateBehavior) {
    elements.reevaluateBehavior.addEventListener("click", reevaluateBehavior);
  }
  if (elements.simulatorService) {
    elements.simulatorService.addEventListener("change", function (event) {
      if (isSimulatorLocked()) return;
      state.simulator.serviceId = event.target.value || null;
      state.simulator.scenarioId = null;
      populateSimulatorSelectors();
      updateSimulatorControls();
    });
  }
  if (elements.simulatorScenario) {
    elements.simulatorScenario.addEventListener("change", function (event) {
      if (isSimulatorLocked()) return;
      state.simulator.scenarioId = event.target.value || null;
      updateSimulatorControls();
    });
  }
  if (elements.simulatorDifficulty) {
    elements.simulatorDifficulty.addEventListener("change", function (event) {
      state.simulator.difficulty = event.target.value === "challenging" ? "challenging" : "normal";
    });
  }
  if (elements.startSimulator) {
    elements.startSimulator.addEventListener("click", startSimulator);
  }
  if (elements.pauseSimulator) {
    elements.pauseSimulator.addEventListener("click", pauseOrResumeSimulator);
  }
  if (elements.stopSimulator) {
    elements.stopSimulator.addEventListener("click", stopSimulator);
  }
  if (elements.runReplay) {
    elements.runReplay.addEventListener("click", runReplay);
  }
  if (elements.pauseReplay) {
    elements.pauseReplay.addEventListener("click", pauseOrResumeReplay);
  }
  if (elements.stopReplay) {
    elements.stopReplay.addEventListener("click", stopReplay);
  }
  if (elements.retryReplay) {
    elements.retryReplay.addEventListener("click", function () {
      void retryFailedReplayTurn();
    });
  }
  if (elements.generateRegression) {
    elements.generateRegression.addEventListener("click", generateRegressionScenario);
  }
  if (elements.saveRegression) {
    elements.saveRegression.addEventListener("click", saveRegressionDraft);
  }
  if (elements.importRegression) {
    elements.importRegression.addEventListener("click", importRegressionScenarios);
  }
  if (elements.exportRegression) {
    elements.exportRegression.addEventListener("click", exportRegressionScenario);
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
  applyTheme(readThemePreference() || document.documentElement.getAttribute("data-theme") || "light");
  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", toggleTheme);
  }
  if (elements.sidebarToggle) {
    elements.sidebarToggle.addEventListener("click", function () {
      setNavigationOpen(!elements.sidebar.classList.contains("is-open"));
    });
  }
  if (elements.sidebarScrim) {
    elements.sidebarScrim.addEventListener("click", function () {
      setNavigationOpen(false);
    });
  }
  if (elements.sidebar) {
    elements.sidebar.addEventListener("click", function (event) {
      if (event.target.closest("a")) setNavigationOpen(false);
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setNavigationOpen(false);
  });
  elements.copySession.addEventListener("click", function () {
    void copySessionId();
  });
  if (elements.scanConversation) {
    elements.scanConversation.addEventListener("click", scanConversation);
  }

  if (getRegressionHelpers()) {
    state.regression.savedScenarios = getRegressionHelpers().loadSavedScenarios(
      getRegressionStorage(),
      getConfiguredScenarioIds(),
    );
  }
  updateSessionDisplay();
  populateBotSelect();
  updateChannelDisplay();
  updateScenarioControls();
  renderMessages();
  renderConversationPreview();
  updateReplayControls();
  updateSimulatorControls();
  resetDebug();
  renderRegressionDraft();
  void loadSimulatorCatalog();
})();

