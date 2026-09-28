(function () {
  "use strict";

  const API = "/api/messenger";
  const elements = {
    status: document.getElementById("messenger-library-status"),
    notice: document.getElementById("messenger-library-notice"),
    load: document.getElementById("messenger-load-conversations"),
    refresh: document.getElementById("messenger-refresh-library"),
    conversationList: document.getElementById("messenger-conversation-list"),
    savedConversations: document.getElementById("messenger-saved-conversations"),
    messagePairs: document.getElementById("messenger-message-pairs"),
    saveSelected: document.getElementById("messenger-save-selected"),
    deleteConversation: document.getElementById("messenger-delete-conversation"),
    savedCases: document.getElementById("messenger-saved-cases"),
    caseFilter: document.getElementById("messenger-case-filter"),
    testChannel: document.getElementById("messenger-case-test-channel"),
    labelAll: document.getElementById("messenger-label-all"),
  };
  const state = {
    conversations: [],
    savedConversations: [],
    messages: [],
    selectedConversationId: null,
    cases: [],
    aiConfigured: false,
    busy: false,
  };

  function setNotice(message, isError) {
    if (!elements.notice) return;
    elements.notice.textContent = message || "";
    elements.notice.classList.toggle("error-text", Boolean(isError));
  }

  async function requestJson(path, options) {
    const response = await fetch(API + path, Object.assign({ cache: "no-store" }, options || {}));
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error("Tester server returned an unreadable response.");
    }
    if (!response.ok) {
      const details = [result.stage, result.metaCode ? "Meta code " + result.metaCode : "", result.error || "HTTP " + response.status].filter(Boolean);
      throw new Error(details.join(" · "));
    }
    return result;
  }

  function jsonOptions(method, body) {
    return {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  function clearNode(node) {
    if (node) node.replaceChildren();
  }

  function makeText(tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  }

  function formatDate(value) {
    if (!value) return "Date not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function conversationName(conversation) {
    const names = conversation.participants && conversation.participants.data
      ? conversation.participants.data.map((person) => person.name).filter(Boolean)
      : [];
    return names.length ? names.join(", ") : "Messenger conversation …" + String(conversation.id || "").slice(-7);
  }

  async function refreshStatus() {
    try {
      const result = await requestJson("/status");
      state.aiConfigured = Boolean(result.aiConfigured);
      if (elements.status) {
        const metaText = result.metaConfigured
          ? "Meta configured · Page " + result.pageId
          : "Add Page ID/token to local .env";
        elements.status.textContent = metaText + (state.aiConfigured ? " · AI labels ready" : " · AI key missing");
      }
      if (!result.metaConfigured) setNotice("Cần MESSENGER_PAGE_ID và MESSENGER_PAGE_ACCESS_TOKEN trong .env của chatbot-tester.", true);
      else if (!state.aiConfigured) setNotice("Meta đã cấu hình. AI labeling cần GEMINI_API_KEY trong local .env.", false);
      else setNotice("Meta và AI label đã cấu hình. Dữ liệu chỉ tải khi bạn bấm nút.", false);
      return result;
    } catch (error) {
      if (elements.status) elements.status.textContent = "Local tester server unavailable";
      setNotice(error.message, true);
      return null;
    }
  }

  function renderConversations() {
    if (!elements.conversationList) return;
    clearNode(elements.conversationList);
    if (!state.conversations.length) {
      elements.conversationList.className = "messenger-conversation-list empty-debug-value";
      elements.conversationList.textContent = "No recent conversations loaded.";
      return;
    }
    elements.conversationList.className = "messenger-conversation-list";
    state.conversations.forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "messenger-conversation-option" + (conversation.id === state.selectedConversationId ? " is-selected" : "");
      button.appendChild(makeText("strong", "", conversationName(conversation)));
      button.appendChild(makeText("small", "", formatDate(conversation.updated_time)));
      button.addEventListener("click", () => { void loadConversation(conversation); });
      elements.conversationList.appendChild(button);
    });
  }

  function renderSavedConversations() {
    if (!elements.savedConversations) return;
    clearNode(elements.savedConversations);
    if (!state.savedConversations.length) {
      elements.savedConversations.className = "messenger-conversation-list empty-debug-value";
      elements.savedConversations.textContent = "No local conversations saved.";
      return;
    }
    elements.savedConversations.className = "messenger-conversation-list";
    state.savedConversations.forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "messenger-conversation-option" + (conversation.id === state.selectedConversationId ? " is-selected" : "");
      button.appendChild(makeText("strong", "", (conversation.participantNames || []).join(", ") || "Saved conversation …" + String(conversation.id).slice(-7)));
      button.appendChild(makeText("small", "", (conversation.messageCount || 0) + " messages" + (conversation.hasMore ? " · more messages available" : "") + " · saved " + formatDate(conversation.importedAt)));
      button.addEventListener("click", () => { void loadSavedConversation(conversation); });
      elements.savedConversations.appendChild(button);
    });
  }

  function buildTurns(messages) {
    const turns = [];
    (Array.isArray(messages) ? messages : []).forEach((message) => {
      if (!message || !message.text || !message.text.trim()) return;
      const role = message.role === "page" ? "page" : "client";
      const previous = turns[turns.length - 1];
      if (previous && previous.role === role) {
        previous.text += "\n" + message.text;
        previous.ids.push(message.id);
      } else {
        turns.push({ role: role, text: message.text, ids: [message.id], senderName: message.senderName, createdTime: message.createdTime });
      }
    });
    return turns;
  }

  function renderMessagePairs() {
    if (!elements.messagePairs) return;
    clearNode(elements.messagePairs);
    if (!state.selectedConversationId) {
      elements.messagePairs.className = "messenger-message-pairs empty-debug-value";
      elements.messagePairs.textContent = "Choose a conversation.";
      if (elements.deleteConversation) elements.deleteConversation.disabled = true;
      return;
    }
    if (elements.deleteConversation) elements.deleteConversation.disabled = state.busy;
    const turns = buildTurns(state.messages);
    const pairs = [];
    turns.forEach((turn, index) => {
      if (turn.role !== "client") return;
      let response = null;
      for (let next = index + 1; next < turns.length; next += 1) {
        if (turns[next].role === "page") {
          response = turns[next];
          break;
        }
      }
      const priorTurns = turns.slice(Math.max(0, index - 2), index);
      const priorContext = priorTurns.map((item) => (item.role === "page" ? "Page: " : "Client: ") + item.text).join("\n");
      const clientContextMessages = priorTurns.filter((item) => item.role === "client").map((item) => item.text);
      pairs.push({ question: turn.text, clientMessageId: turn.ids[0], pageReply: response ? response.text : "", pageMessageId: response ? response.ids[0] : "", context: priorContext, clientContextMessages: clientContextMessages });
    });
    elements.messagePairs.className = "messenger-message-pairs";
    if (!pairs.length) {
      elements.messagePairs.classList.add("empty-debug-value");
      elements.messagePairs.textContent = "No text messages from the client in this conversation.";
      return;
    }
    pairs.forEach((pair, index) => {
      const card = document.createElement("article");
      card.className = "messenger-pair-card";
      card.dataset.pairIndex = String(index);
      const heading = document.createElement("div");
      heading.className = "messenger-pair-heading";
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "messenger-pair-select";
      checkbox.setAttribute("aria-label", "Save this client question");
      checkbox.addEventListener("change", updateSaveButton);
      label.append(checkbox, document.createTextNode(" Save test case"));
      heading.append(makeText("strong", "", "Client question " + (index + 1)), label);
      card.appendChild(heading);
      card.appendChild(makeText("p", "messenger-pair-meta", "Client"));
      card.appendChild(makeText("p", "messenger-pair-text", pair.question));
      card.appendChild(makeText("p", "messenger-pair-meta", "Next Page message (review: may be staff or bot)"));
      card.appendChild(makeText("p", "messenger-pair-text", pair.pageReply || "No following Page message"));
      card._pair = pair;
      elements.messagePairs.appendChild(card);
    });
    updateSaveButton();
  }

  function updateSaveButton() {
    const hasChecked = elements.messagePairs && elements.messagePairs.querySelector(".messenger-pair-select:checked");
    if (elements.saveSelected) elements.saveSelected.disabled = state.busy || !hasChecked;
  }

  async function loadConversations() {
    if (state.busy) return;
    state.busy = true;
    elements.load.disabled = true;
    setNotice("Loading recent Page conversations…", false);
    try {
      const result = await requestJson("/conversations?limit=20");
      state.conversations = Array.isArray(result.conversations) ? result.conversations : [];
      state.selectedConversationId = null;
      state.messages = [];
      renderConversations();
      renderMessagePairs();
      setNotice("Loaded " + state.conversations.length + " recent conversation(s). Choose one to import locally.", false);
    } catch (error) {
      setNotice(error.message, true);
    } finally {
      state.busy = false;
      elements.load.disabled = false;
      updateSaveButton();
    }
  }

  async function loadConversation(conversation) {
    if (state.busy || !conversation || !conversation.id) return;
    state.busy = true;
    elements.messagePairs.textContent = "Loading conversation messages…";
    renderConversations();
    setNotice("Reading conversation from Meta…", false);
    try {
      const result = await requestJson("/conversations/" + encodeURIComponent(conversation.id) + "/messages?limit=100");
      state.selectedConversationId = conversation.id;
      state.messages = Array.isArray(result.messages) ? result.messages : [];
      const participantNames = conversation.participants && conversation.participants.data
        ? conversation.participants.data.map((person) => person.name).filter(Boolean)
        : [];
      await requestJson("/library/conversations", jsonOptions("POST", {
        id: conversation.id,
        updatedTime: conversation.updated_time || "",
        participantNames: participantNames,
        hasMore: Boolean(result.hasMore),
        messages: state.messages,
      }));
      renderConversations();
      renderMessagePairs();
      renderSavedConversations();
      await refreshLibrary();
      setNotice("Conversation saved locally" + (result.hasMore ? " (only the latest 100 messages are imported in this version)" : "") + ". Page messages may come from staff or bot; review before using as reference.", false);
    } catch (error) {
      state.selectedConversationId = conversation.id;
      state.messages = [];
      renderMessagePairs();
      setNotice(error.message, true);
    } finally {
      state.busy = false;
      if (elements.deleteConversation) elements.deleteConversation.disabled = !state.selectedConversationId;
      updateSaveButton();
    }
  }

  async function loadSavedConversation(conversation) {
    if (state.busy || !conversation || !conversation.id) return;
    state.busy = true;
    if (elements.messagePairs) elements.messagePairs.textContent = "Loading local conversation…";
    try {
      const result = await requestJson("/library/conversations/" + encodeURIComponent(conversation.id));
      state.selectedConversationId = conversation.id;
      state.messages = result.conversation && Array.isArray(result.conversation.messages) ? result.conversation.messages : [];
      renderSavedConversations();
      renderMessagePairs();
      setNotice("Loaded saved data from this computer; no Meta request was made." + (conversation.hasMore ? " The saved copy contains only the latest 100 messages." : ""), false);
    } catch (error) {
      setNotice(error.message, true);
    } finally {
      state.busy = false;
      if (elements.deleteConversation) elements.deleteConversation.disabled = !state.selectedConversationId;
      updateSaveButton();
    }
  }

  async function saveSelectedCases() {
    if (state.busy || !state.selectedConversationId) return;
    const cards = Array.from(elements.messagePairs.querySelectorAll(".messenger-pair-card"));
    const selected = cards.filter((card) => card.querySelector(".messenger-pair-select").checked);
    if (!selected.length) return;
    state.busy = true;
    elements.saveSelected.disabled = true;
    try {
      for (const card of selected) {
        const pair = card._pair;
        await requestJson("/library/cases", jsonOptions("POST", {
          conversationId: state.selectedConversationId,
          clientMessageId: pair.clientMessageId,
          pageMessageId: pair.pageMessageId,
          question: pair.question,
          pageReply: pair.pageReply,
          context: pair.context,
          clientContextMessages: pair.clientContextMessages,
        }));
      }
      await refreshLibrary();
      setNotice("Saved " + selected.length + " test case(s) in the local library.", false);
    } catch (error) {
      setNotice(error.message, true);
    } finally {
      state.busy = false;
      updateSaveButton();
    }
  }

  function getClientContextMessages(item) {
    if (Array.isArray(item.clientContextMessages)) {
      return item.clientContextMessages.filter((message) => typeof message === "string" && message.trim());
    }
    return String(item.context || "")
      .split(/\n(?=(?:Page|Client): )/u)
      .filter((part) => part.startsWith("Client: "))
      .map((part) => part.slice("Client: ".length).trim())
      .filter(Boolean);
  }

  function createCaseCard(item) {
    const card = document.createElement("article");
    card.className = "messenger-case-card";
    card.dataset.caseId = item.id;
    const meta = makeText("small", "messenger-case-meta", "Messenger · " + formatDate(item.createdAt));
    const caseType = document.createElement("select");
    caseType.setAttribute("aria-label", "Test case type");
    [["single", "Single message"], ["journey", "Journey (sequential messages)"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      caseType.appendChild(option);
    });
    caseType.value = item.caseType === "journey" ? "journey" : "single";
    const category = document.createElement("input");
    category.type = "text";
    category.maxLength = 80;
    category.value = item.category || "Chưa gán nhãn";
    category.setAttribute("aria-label", "Category");
    const question = document.createElement("textarea");
    question.value = item.question || "";
    question.setAttribute("aria-label", "Client question");
    const pageReply = document.createElement("textarea");
    pageReply.value = item.pageReply || "";
    pageReply.setAttribute("aria-label", "Page reply reference");
    const singleField = document.createElement("div");
    singleField.className = "messenger-case-field";
    singleField.append(makeText("strong", "", "Client question"), question);
    const journeyMessages = document.createElement("textarea");
    journeyMessages.setAttribute("aria-label", "Ordered client seed messages");
    const initialJourneyMessages = Array.isArray(item.clientMessages) && item.clientMessages.length
      ? item.clientMessages
      : [...getClientContextMessages(item), item.question].filter(Boolean);
    journeyMessages.value = initialJourneyMessages.join("\n");
    journeyMessages.placeholder = "One client message per line";
    journeyMessages.setAttribute("aria-describedby", "messenger-journey-hint-" + item.id);
    const journeyField = document.createElement("div");
    journeyField.className = "messenger-case-field";
    journeyField.append(makeText("strong", "", "Ordered client seed messages"), journeyMessages);
    const journeyHint = makeText("small", "messenger-case-meta", "One client message per line. Messages are sent in order within one fresh session.");
    journeyHint.id = "messenger-journey-hint-" + item.id;
    journeyField.appendChild(journeyHint);
    let journeyMessagesEdited = item.caseType === "journey";
    let previousCaseType = caseType.value;
    journeyMessages.addEventListener("input", () => { journeyMessagesEdited = true; });
    function getDraft() {
      const isJourney = caseType.value === "journey";
      const clientMessages = isJourney
        ? journeyMessages.value.split(/\r?\n/u).map((message) => message.trim()).filter(Boolean).slice(0, 20)
        : [question.value.trim()].filter(Boolean);
      return {
        caseType: isJourney ? "journey" : "single",
        clientMessages,
        question: isJourney ? (clientMessages[clientMessages.length - 1] || "") : question.value.trim(),
        pageReply: pageReply.value,
        context: item.context || "",
        clientContextMessages: getClientContextMessages(item),
      };
    }
    function syncCaseType(fromChange) {
      const isJourney = caseType.value === "journey";
      if (fromChange && isJourney && previousCaseType !== "journey") {
        const existingSeeds = journeyMessages.value.split(/\r?\n/u).map((message) => message.trim()).filter(Boolean);
        if (!journeyMessagesEdited) {
          journeyMessages.value = [...getClientContextMessages(item), question.value.trim()].filter(Boolean).join("\n");
        } else if (question.value.trim() && existingSeeds.length && question.value.trim() !== existingSeeds[existingSeeds.length - 1]) {
          existingSeeds[existingSeeds.length - 1] = question.value.trim();
          journeyMessages.value = existingSeeds.join("\n");
        }
      }
      if (fromChange && !isJourney && previousCaseType === "journey" && journeyMessages.value.trim()) {
        const messages = journeyMessages.value.split(/\r?\n/u).map((message) => message.trim()).filter(Boolean);
        if (messages.length) question.value = messages[messages.length - 1];
      }
      previousCaseType = caseType.value;
      singleField.hidden = isJourney;
      journeyField.hidden = !isJourney;
    }
    caseType.addEventListener("change", () => syncCaseType(true));
    syncCaseType(false);
    const tags = makeText("small", "messenger-case-meta", item.intent ? "Intent: " + item.intent + " · " + (item.replyType || "other") : "Not AI labeled yet");
    card.dataset.search = [item.category, item.intent, item.summary, item.question, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase();
    const tagRow = document.createElement("div");
    tagRow.className = "messenger-case-labels";
    (Array.isArray(item.tags) ? item.tags : []).forEach((tag) => tagRow.appendChild(makeText("span", "", tag)));
    const actions = document.createElement("div");
    actions.className = "messenger-case-actions";
    const save = makeText("button", "secondary-button", "Save edits");
    save.type = "button";
    save.addEventListener("click", async () => {
      try {
        const draft = getDraft();
        if (!draft.clientMessages.length) throw new Error("Add at least one client message.");
        await requestJson("/library/cases/" + encodeURIComponent(item.id), jsonOptions("PATCH", { ...draft, category: category.value }));
        await refreshLibrary();
        setNotice("Saved local edits.", false);
      } catch (error) { setNotice(error.message, true); }
    });
    const label = makeText("button", "secondary-button", "AI label");
    label.type = "button";
    label.disabled = !state.aiConfigured;
    label.addEventListener("click", async () => {
      label.disabled = true;
      setNotice("Sending this selected question and Page reply for AI labeling…", false);
      let editsSaved = false;
      try {
        const draft = getDraft();
        if (!draft.clientMessages.length) throw new Error("Add at least one client message.");
        await requestJson("/library/cases/" + encodeURIComponent(item.id), jsonOptions("PATCH", { ...draft, category: category.value }));
        editsSaved = true;
        const result = await requestJson("/label", jsonOptions("POST", {
          question: draft.caseType === "journey" ? draft.clientMessages.join("\n") : draft.question,
          pageReply: draft.pageReply,
          context: draft.context,
        }));
        const labels = result.labels || {};
        await requestJson("/library/cases/" + encodeURIComponent(item.id), jsonOptions("PATCH", {
          category: labels.category,
          intent: labels.intent,
          replyType: labels.replyType,
          summary: labels.summary,
          confidence: labels.confidence,
          tags: labels.tags,
        }));
        Object.assign(item, labels);
        await refreshLibrary();
        setNotice("AI label saved locally. Review the category and tags.", false);
      } catch (error) { setNotice((editsSaved ? "Edits saved; AI label failed: " : "") + error.message, true); }
      finally { label.disabled = !state.aiConfigured; }
    });
    const run = makeText("button", "primary-button", "Test this question");
    run.type = "button";
    run.addEventListener("click", () => {
      const draft = getDraft();
      if (!draft.clientMessages.length) {
        setNotice("Add at least one client message before testing.", true);
        return;
      }
      window.dispatchEvent(new CustomEvent("chatbotTester:runLibraryCase", {
        detail: {
          question: draft.question,
          clientMessages: draft.clientMessages,
          clientContextMessages: draft.clientContextMessages,
          context: draft.context,
          caseType: draft.caseType,
          pageReply: draft.pageReply,
          category: category.value,
          channel: elements.testChannel && elements.testChannel.value === "website" ? "website" : "messenger",
        },
      }));
    });
    const remove = makeText("button", "secondary-button", "Delete");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      try {
        await requestJson("/library/cases/" + encodeURIComponent(item.id), { method: "DELETE" });
        await refreshLibrary();
        setNotice("Deleted local test case.", false);
      } catch (error) { setNotice(error.message, true); }
    });
    actions.append(save, label, run, remove);
    card.append(meta, makeText("strong", "", "Test case type"), caseType, makeText("strong", "", "Category"), category, singleField, journeyField, makeText("strong", "", "Page reply reference (reference only)"), pageReply, tags, tagRow, actions);
    return card;
  }

  function labelInputFor(item) {
    const clientMessages = item.caseType === "journey" && Array.isArray(item.clientMessages) && item.clientMessages.length
      ? item.clientMessages
      : [item.question];
    return item.caseType === "journey" ? clientMessages.join("\n") : item.question;
  }

  async function refreshLibrary() {
    try {
      const result = await requestJson("/library");
      state.savedConversations = Array.isArray(result.conversations) ? result.conversations : [];
      state.cases = Array.isArray(result.cases) ? result.cases : [];
      renderSavedConversations();
      if (elements.savedCases) {
        clearNode(elements.savedCases);
        if (!state.cases.length) {
          elements.savedCases.className = "messenger-saved-cases empty-debug-value";
          elements.savedCases.textContent = "No saved test cases yet.";
        } else {
          elements.savedCases.className = "messenger-saved-cases";
          state.cases.forEach((item) => elements.savedCases.appendChild(createCaseCard(item)));
        }
      }
      applyCaseFilter();
      if (elements.labelAll) elements.labelAll.disabled = !state.aiConfigured || !state.cases.some((item) => !item.intent);
    } catch (error) {
      if (elements.savedCases) elements.savedCases.textContent = error.message;
    }
  }

  function applyCaseFilter() {
    if (!elements.savedCases) return;
    const query = String(elements.caseFilter && elements.caseFilter.value || "").trim().toLowerCase();
    elements.savedCases.querySelectorAll(".messenger-case-card").forEach((card) => {
      card.hidden = Boolean(query) && !String(card.dataset.search || "").includes(query);
    });
  }

  async function deleteLocalConversation() {
    if (!state.selectedConversationId) return;
    if (!window.confirm("Delete this local conversation and all its saved test cases? Facebook data will not be changed.")) return;
    try {
      await requestJson("/library/conversations/" + encodeURIComponent(state.selectedConversationId), { method: "DELETE" });
      state.messages = [];
      state.selectedConversationId = null;
      renderMessagePairs();
      await refreshLibrary();
      setNotice("Deleted the local conversation and its saved test cases. Meta data was not changed.", false);
    } catch (error) { setNotice(error.message, true); }
  }

  async function labelAllUntagged() {
    const untagged = state.cases.filter((item) => !item.intent);
    if (!untagged.length || !state.aiConfigured) return;
    if (!window.confirm("Send " + untagged.length + " selected test case(s) to Gemini for labeling? This uses AI tokens.")) return;
    elements.labelAll.disabled = true;
    let failed = false;
    for (let index = 0; index < untagged.length; index += 1) {
      const item = untagged[index];
      setNotice("AI labeling " + (index + 1) + " of " + untagged.length + "…", false);
      try {
        const result = await requestJson("/label", jsonOptions("POST", { question: labelInputFor(item), pageReply: item.pageReply, context: item.context || "" }));
        const labels = result.labels || {};
        await requestJson("/library/cases/" + encodeURIComponent(item.id), jsonOptions("PATCH", {
          category: labels.category,
          intent: labels.intent,
          replyType: labels.replyType,
          summary: labels.summary,
          confidence: labels.confidence,
          tags: labels.tags,
        }));
      } catch (error) {
        setNotice(error.message, true);
        failed = true;
        break;
      }
    }
    await refreshLibrary();
    if (elements.labelAll) elements.labelAll.disabled = !state.aiConfigured || !state.cases.some((item) => !item.intent);
    if (!failed) setNotice("Finished AI labeling the untagged test cases. Review the suggestions.", false);
  }

  if (elements.load) elements.load.addEventListener("click", () => { void loadConversations(); });
  if (elements.refresh) elements.refresh.addEventListener("click", () => { void refreshLibrary(); });
  if (elements.saveSelected) elements.saveSelected.addEventListener("click", () => { void saveSelectedCases(); });
  if (elements.deleteConversation) elements.deleteConversation.addEventListener("click", () => { void deleteLocalConversation(); });
  if (elements.labelAll) elements.labelAll.addEventListener("click", () => { void labelAllUntagged(); });
  if (elements.caseFilter) elements.caseFilter.addEventListener("input", applyCaseFilter);

  void refreshStatus().then(() => refreshLibrary());
})();
