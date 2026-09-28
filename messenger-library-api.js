"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const API_PREFIX = "/api/messenger";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGES_PER_CONVERSATION = 500;
const DEFAULT_GRAPH_VERSION = "v23.0";
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function safeText(value, maxLength = 12000, allowEmpty = false) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (!allowEmpty && !result) return null;
  return result.slice(0, maxLength);
}

function safeTextArray(values, maxItems = 20, maxLength = 12000) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeText(value, maxLength)).filter(Boolean).slice(0, maxItems);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += Buffer.byteLength(chunk);
      if (total > MAX_BODY_BYTES) {
        request.resume();
        reject(Object.assign(new Error("Body too large"), { code: "BODY_TOO_LARGE" }));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON"), { code: "INVALID_JSON" }));
      }
    });
    request.on("error", () => reject(Object.assign(new Error("Body read failed"), { code: "BODY_READ_ERROR" })));
  });
}

function createMessengerLibraryApi(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const dataPath = options.dataPath || path.join(__dirname, "data", "private", "messenger-library.json");
  const configuredPageId = String(env.MESSENGER_PAGE_ID || "").trim();
  const pageId = /^\d+$/u.test(configuredPageId) ? configuredPageId : "";
  const pageToken = String(env.MESSENGER_PAGE_ACCESS_TOKEN || "").trim();
  const graphVersion = String(env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim().replace(/^\/+|\/+$/gu, "");
  const geminiKey = String(env.GEMINI_API_KEY || "").trim();
  const geminiModel = String(env.GEMINI_LABEL_MODEL || env.GEMINI_SIMULATOR_MODEL || env.GEMINI_GENERATOR_MODEL || DEFAULT_GEMINI_MODEL).trim();

  async function readLibrary() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(dataPath, "utf8"));
      return {
        version: 1,
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
        cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      };
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, conversations: [], cases: [] };
      throw error;
    }
  }

  async function writeLibrary(data) {
    await fs.promises.mkdir(path.dirname(dataPath), { recursive: true });
    const temporaryPath = dataPath + ".tmp";
    await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    await fs.promises.rename(temporaryPath, dataPath);
  }

  async function graphGet(pathPart, params = {}) {
    if (!pageId || !pageToken) {
      const error = new Error("Meta Page credentials are not configured in the local tester .env.");
      error.status = 503;
      throw error;
    }
    if (typeof fetchImpl !== "function") {
      const error = new Error("Fetch is unavailable in this Node.js runtime.");
      error.status = 503;
      throw error;
    }
    const url = new URL("https://graph.facebook.com/" + graphVersion + "/" + pathPart.replace(/^\/+/, ""));
    url.searchParams.set("access_token", pageToken);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const stage = pathPart.endsWith("/conversations") ? "conversation_list" : "conversation_messages";
    const startedAt = Date.now();
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(30000) });
    } catch (error) {
      error.stage = stage;
      error.code = error.code || "META_NETWORK_ERROR";
      throw error;
    }
    let result;
    try {
      result = await response.json();
    } catch (error) {
      const failure = new Error("Meta returned an unreadable response.");
      failure.status = 502;
      throw failure;
    }
    if (!response.ok || result.error) {
      const failure = new Error(result.error && result.error.message
        ? String(result.error.message).slice(0, 500)
        : "Meta Graph API request failed.");
      failure.status = response.status || 502;
      failure.httpStatus = response.status || undefined;
      failure.metaCode = result.error && result.error.code;
      failure.stage = stage;
      throw failure;
    }
    console.info("[Messenger Library]", JSON.stringify({ stage, status: "OK", http: response.status, duration_ms: Date.now() - startedAt }));
    return result;
  }

  async function callGemini(question, pageReply, context) {
    if (!geminiKey) {
      const error = new Error("GEMINI_API_KEY is not configured in the local tester .env.");
      error.status = 503;
      throw error;
    }
    if (typeof fetchImpl !== "function") {
      const error = new Error("Fetch is unavailable in this Node.js runtime.");
      error.status = 503;
      throw error;
    }
    const prompt = [
      "Phân loại một ví dụ hội thoại tư vấn tiếng Việt để tạo thư viện kiểm thử chatbot.",
      "Chỉ trả về JSON hợp lệ với các trường: category, intent, replyType, summary, tags, confidence.",
      "category là nhóm ngắn, dễ lọc; intent mô tả nhu cầu client; replyType nhận một trong: answer, clarification, offer, handoff, other; tags là mảng tối đa 5 nhãn; confidence là số từ 0 đến 1.",
      "Không suy diễn dữ kiện không có trong đoạn chat. Nếu không rõ, dùng category 'Chưa phân loại' và confidence thấp.",
      "Client message: " + question,
      "Page reply (có thể là staff hoặc bot): " + (pageReply || "(không có phản hồi kế tiếp)"),
      "Context trước đó (nếu có): " + (context || "(không có)"),
    ].join("\n");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(geminiModel) + ":generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 350, responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        const error = new Error("AI label request failed (HTTP " + response.status + ").");
        error.status = 502;
        throw error;
      }
      const text = result.candidates && result.candidates[0] && result.candidates[0].content
        && result.candidates[0].content.parts && result.candidates[0].content.parts[0]
        && result.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(String(text || ""));
      const confidence = Number(parsed.confidence);
      return {
        category: safeText(parsed.category, 80) || "Chưa phân loại",
        intent: safeText(parsed.intent, 160) || "",
        replyType: ["answer", "clarification", "offer", "handoff", "other"].includes(parsed.replyType) ? parsed.replyType : "other",
        summary: safeText(parsed.summary, 280) || "",
        tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => safeText(String(tag), 50)).filter(Boolean).slice(0, 5) : [],
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        model: geminiModel,
      };
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("AI label request timed out.");
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith(API_PREFIX + "/")) return false;
    const pathname = url.pathname;
    try {
      if (pathname === API_PREFIX + "/status" && request.method === "GET") {
        sendJson(response, 200, {
          status: "ready",
          metaConfigured: Boolean(pageId && pageToken),
          aiConfigured: Boolean(geminiKey),
          pageId: pageId || null,
          graphVersion,
        });
        return true;
      }
      if (pathname === API_PREFIX + "/conversations" && request.method === "GET") {
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
        const result = await graphGet(pageId + "/conversations", {
          platform: "messenger",
          fields: "id,updated_time,participants",
          limit,
          after: url.searchParams.get("after"),
        });
        sendJson(response, 200, {
          status: "ready",
          conversations: Array.isArray(result.data) ? result.data : [],
          after: result.paging && result.paging.cursors && result.paging.cursors.after || null,
          hasMore: Boolean(result.paging && result.paging.next),
        });
        return true;
      }
      const messageMatch = pathname.match(/^\/api\/messenger\/conversations\/([\w.%$-]+)\/messages$/u);
      if (messageMatch && request.method === "GET") {
        const conversationId = decodeURIComponent(messageMatch[1]);
        if (conversationId.includes("/") || conversationId === "." || conversationId === "..") {
          sendJson(response, 400, { status: "error", error: "Conversation ID is invalid." });
          return true;
        }
        const result = await graphGet(conversationId + "/messages", {
          fields: "id,from,message,created_time",
          limit: Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 100)),
          after: url.searchParams.get("after"),
        });
        const messages = Array.isArray(result.data) ? result.data.map((message) => ({
          id: String(message.id || ""),
          senderId: message.from && message.from.id ? String(message.from.id) : "",
          senderName: message.from && message.from.name ? String(message.from.name) : "Unknown",
          role: message.from && String(message.from.id) === pageId ? "page" : "client",
          text: typeof message.message === "string" ? message.message : "",
          createdTime: message.created_time || null,
        })).filter((message) => message.id) : [];
        messages.sort((left, right) => String(left.createdTime || "").localeCompare(String(right.createdTime || "")));
        sendJson(response, 200, {
          status: "ready",
          messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
          after: result.paging && result.paging.cursors && result.paging.cursors.after || null,
          hasMore: Boolean(result.paging && result.paging.next),
        });
        return true;
      }
      if (pathname === API_PREFIX + "/library" && request.method === "GET") {
        const library = await readLibrary();
        sendJson(response, 200, {
          version: library.version,
          conversations: library.conversations.map((conversation) => ({
            id: conversation.id,
            updatedTime: conversation.updatedTime,
            participantNames: conversation.participantNames,
            importedAt: conversation.importedAt,
            messageCount: conversation.messages.length,
            hasMore: Boolean(conversation.hasMore),
          })),
          cases: library.cases,
        });
        return true;
      }
      const savedConversationMatch = pathname.match(/^\/api\/messenger\/library\/conversations\/([\w.%$-]+)$/u);
      if (savedConversationMatch && request.method === "GET") {
        const conversationId = decodeURIComponent(savedConversationMatch[1]);
        const library = await readLibrary();
        const conversation = library.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          sendJson(response, 404, { status: "error", error: "Saved conversation was not found." });
          return true;
        }
        sendJson(response, 200, { status: "ready", conversation });
        return true;
      }
      if (pathname === API_PREFIX + "/library/conversations" && request.method === "POST") {
        const body = await readBody(request);
        const id = safeText(body.id, 200);
        if (!id || !Array.isArray(body.messages) || body.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
          sendJson(response, 400, { status: "error", error: "Conversation data is invalid or too large." });
          return true;
        }
        const library = await readLibrary();
        const cleanConversation = {
          id,
          updatedTime: safeText(body.updatedTime, 80, true),
          participantNames: Array.isArray(body.participantNames) ? body.participantNames.map((name) => safeText(String(name), 120)).filter(Boolean).slice(0, 10) : [],
          importedAt: new Date().toISOString(),
          hasMore: Boolean(body.hasMore),
          messages: body.messages.map((message) => ({
            id: safeText(message.id, 200),
            senderId: safeText(message.senderId, 200, true),
            senderName: safeText(message.senderName, 120) || "Unknown",
            role: message.role === "page" ? "page" : "client",
            text: safeText(message.text, 12000, true),
            createdTime: safeText(message.createdTime, 80, true),
          })).filter((message) => message.id),
        };
        const index = library.conversations.findIndex((conversation) => conversation.id === id);
        if (index === -1) library.conversations.unshift(cleanConversation);
        else library.conversations[index] = { ...library.conversations[index], ...cleanConversation, importedAt: library.conversations[index].importedAt };
        await writeLibrary(library);
        sendJson(response, 200, { status: "saved", conversation: cleanConversation });
        return true;
      }
      if (pathname === API_PREFIX + "/library/cases" && request.method === "POST") {
        const body = await readBody(request);
        const conversationId = safeText(body.conversationId, 200);
        const clientMessageId = safeText(body.clientMessageId, 200);
        const question = safeText(body.question, 12000);
        if (!conversationId || !clientMessageId || !question) {
          sendJson(response, 400, { status: "error", error: "Test case data is incomplete." });
          return true;
        }
        const library = await readLibrary();
        const existing = library.cases.find((item) => item.conversationId === conversationId && item.clientMessageId === clientMessageId);
        if (existing) {
          sendJson(response, 200, { status: "exists", item: existing });
          return true;
        }
        const item = {
          id: crypto.randomUUID(),
          conversationId,
          clientMessageId,
          pageMessageId: safeText(body.pageMessageId, 200, true),
          question,
          pageReply: safeText(body.pageReply, 12000, true) || "",
          context: safeText(body.context, 2000, true) || "",
          clientContextMessages: safeTextArray(body.clientContextMessages),
          caseType: body.caseType === "journey" ? "journey" : "single",
          clientMessages: body.caseType === "journey"
            ? safeTextArray(body.clientMessages)
            : [question],
          category: "Chưa gán nhãn",
          intent: "",
          replyType: "other",
          summary: "",
          tags: [],
          confidence: null,
          channel: "messenger",
          createdAt: new Date().toISOString(),
        };
        library.cases.unshift(item);
        await writeLibrary(library);
        sendJson(response, 201, { status: "saved", item });
        return true;
      }
      const caseMatch = pathname.match(/^\/api\/messenger\/library\/cases\/([\w.-]+)$/u);
      if (caseMatch && request.method === "PATCH") {
        const body = await readBody(request);
        const library = await readLibrary();
        const item = library.cases.find((candidate) => candidate.id === caseMatch[1]);
        if (!item) {
          sendJson(response, 404, { status: "error", error: "Saved test case was not found." });
          return true;
        }
        if (Object.hasOwn(body, "question")) item.question = safeText(body.question, 12000) || item.question;
        if (Object.hasOwn(body, "pageReply")) item.pageReply = safeText(body.pageReply, 12000, true) || "";
        if (Object.hasOwn(body, "context")) item.context = safeText(body.context, 2000, true) || "";
        if (Object.hasOwn(body, "clientContextMessages") && Array.isArray(body.clientContextMessages)) {
          item.clientContextMessages = safeTextArray(body.clientContextMessages);
        }
        if (Object.hasOwn(body, "caseType")) item.caseType = body.caseType === "journey" ? "journey" : "single";
        if (Object.hasOwn(body, "clientMessages") && Array.isArray(body.clientMessages)) {
          const clientMessages = safeTextArray(body.clientMessages);
          if ((body.caseType === "journey" || item.caseType === "journey") && !clientMessages.length) {
            sendJson(response, 400, { status: "error", error: "A journey test case needs at least one client seed message." });
            return true;
          }
          item.clientMessages = clientMessages;
          if (item.caseType === "journey" && clientMessages.length) item.question = clientMessages[clientMessages.length - 1];
        }
        if (Object.hasOwn(body, "category")) item.category = safeText(body.category, 80) || "Chưa gán nhãn";
        if (Object.hasOwn(body, "intent")) item.intent = safeText(body.intent, 160, true) || "";
        if (Object.hasOwn(body, "replyType")) item.replyType = ["answer", "clarification", "offer", "handoff", "other"].includes(body.replyType) ? body.replyType : "other";
        if (Object.hasOwn(body, "summary")) item.summary = safeText(body.summary, 280, true) || "";
        if (Object.hasOwn(body, "confidence")) item.confidence = Number.isFinite(Number(body.confidence)) ? Math.max(0, Math.min(1, Number(body.confidence))) : null;
        if (Object.hasOwn(body, "tags") && Array.isArray(body.tags)) item.tags = body.tags.map((tag) => safeText(String(tag), 50)).filter(Boolean).slice(0, 8);
        await writeLibrary(library);
        sendJson(response, 200, { status: "saved", item });
        return true;
      }
      if (caseMatch && request.method === "DELETE") {
        const library = await readLibrary();
        const remaining = library.cases.filter((item) => item.id !== caseMatch[1]);
        if (remaining.length === library.cases.length) {
          sendJson(response, 404, { status: "error", error: "Saved test case was not found." });
          return true;
        }
        library.cases = remaining;
        await writeLibrary(library);
        sendJson(response, 200, { status: "deleted" });
        return true;
      }
      if (savedConversationMatch && request.method === "DELETE") {
        const conversationId = decodeURIComponent(savedConversationMatch[1]);
        const library = await readLibrary();
        library.conversations = library.conversations.filter((item) => item.id !== conversationId);
        library.cases = library.cases.filter((item) => item.conversationId !== conversationId);
        await writeLibrary(library);
        sendJson(response, 200, { status: "deleted" });
        return true;
      }
      if (pathname === API_PREFIX + "/label" && request.method === "POST") {
        const body = await readBody(request);
        const question = safeText(body.question, 12000);
        const pageReply = safeText(body.pageReply, 12000, true) || "";
        const context = safeText(body.context, 2000, true) || "";
        if (!question) {
          sendJson(response, 400, { status: "error", error: "A client question is required for labeling." });
          return true;
        }
        const labels = await callGemini(question, pageReply, context);
        sendJson(response, 200, { status: "labeled", labels });
        return true;
      }
      sendJson(response, 404, { status: "error", error: "Messenger library endpoint was not found." });
      return true;
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : error.code === "BODY_TOO_LARGE" ? 413 : error.code === "INVALID_JSON" ? 400 : 502;
      const safeMessage = error.code === "BODY_TOO_LARGE"
        ? "Request body is too large."
        : error.code === "INVALID_JSON"
          ? "Request body must be valid JSON."
          : String(error.message || "Messenger library request failed.")
            .split(pageToken || "\u0000").join("[REDACTED_SECRET]")
            .split(geminiKey || "\u0000").join("[REDACTED_SECRET]")
            .slice(0, 500);
      if (error.stage || status >= 500) console.error("[Messenger Library]", JSON.stringify({ stage: error.stage || "local_request", status: "ERROR", http: error.httpStatus || undefined, code: error.code || "REQUEST_FAILED", meta_code: error.metaCode || undefined }));
      sendJson(response, status, { status: "error", error: safeMessage, ...(error.metaCode ? { metaCode: error.metaCode } : {}), ...(error.stage ? { stage: error.stage } : {}) });
      return true;
    }
  }

  return { handle };
}

module.exports = { API_PREFIX, createMessengerLibraryApi };
