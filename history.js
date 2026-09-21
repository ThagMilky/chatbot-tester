(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.ChatbotTesterHistory = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STORAGE_KEY = "chatbot-tester-history-v1";
  const SCHEMA_VERSION = 1;
  const MAX_RECORDS = 30;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function nonEmptyString(value, fallback) {
    if (typeof value !== "string" || value.trim() === "") {
      return fallback;
    }

    return value.trim();
  }

  function validTimestamp(value, fallback) {
    const timestamp = nonEmptyString(value, "");
    return timestamp && !Number.isNaN(Date.parse(timestamp)) ? timestamp : fallback;
  }

  function createHistoryId() {
    const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

    return "history-" + Date.now().toString(36) + "-" + randomPart;
  }

  function getDefaultStorage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch (error) {
      return null;
    }
  }

  function resolveStorage(storage) {
    return storage || getDefaultStorage();
  }

  function normalizeMessage(message) {
    if (!isObject(message)) return null;

    const type = nonEmptyString(message.type, "");
    const text = typeof message.text === "string" ? message.text : "";
    if (!type || !text.trim()) return null;

    return {
      type: type,
      text: text,
    };
  }

  function normalizeRecord(record) {
    if (!isObject(record)) return null;

    const now = new Date().toISOString();
    const messages = Array.isArray(record.messages)
      ? record.messages.map(normalizeMessage).filter(Boolean)
      : [];
    const sessionId = nonEmptyString(record.sessionId, "");
    if (!sessionId || !messages.length) return null;

    return {
      id: nonEmptyString(record.id, createHistoryId()),
      sessionId: sessionId,
      botId: nonEmptyString(record.botId, null),
      botName: nonEmptyString(record.botName, "Unknown bot"),
      channelMode: nonEmptyString(record.channelMode, "website"),
      createdAt: validTimestamp(record.createdAt, now),
      updatedAt: validTimestamp(record.updatedAt, now),
      turnCount: Number.isInteger(record.turnCount) && record.turnCount >= 0
        ? record.turnCount
        : 0,
      messages: messages,
    };
  }

  function sortNewestFirst(records) {
    return records.sort(function (left, right) {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }

  function limitRecords(records) {
    return sortNewestFirst(records).slice(0, MAX_RECORDS);
  }

  function load(storage) {
    const target = resolveStorage(storage);
    if (!target || typeof target.getItem !== "function") return [];

    try {
      const raw = target.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);
      if (!isObject(parsed) || parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.conversations)) {
        return [];
      }

      return limitRecords(parsed.conversations.map(normalizeRecord).filter(Boolean));
    } catch (error) {
      return [];
    }
  }

  function save(records, storage) {
    const target = resolveStorage(storage);
    if (!target || typeof target.setItem !== "function") return false;

    try {
      const conversations = limitRecords(
        (Array.isArray(records) ? records : []).map(normalizeRecord).filter(Boolean)
      );
      target.setItem(STORAGE_KEY, JSON.stringify({
        version: SCHEMA_VERSION,
        conversations: conversations,
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function upsert(record, storage) {
    const normalized = normalizeRecord(record);
    if (!normalized) return load(storage);

    const records = load(storage);
    const existingIndex = records.findIndex(function (item) {
      return item.sessionId === normalized.sessionId;
    });

    if (existingIndex >= 0) {
      normalized.id = records[existingIndex].id;
      normalized.createdAt = records[existingIndex].createdAt;
      records[existingIndex] = normalized;
    } else {
      records.push(normalized);
    }

    const limited = limitRecords(records);
    save(limited, storage);
    return limited;
  }

  function remove(historyId, storage) {
    const records = load(storage).filter(function (record) {
      return record.id !== historyId;
    });
    save(records, storage);
    return records;
  }

  function clear(storage) {
    const target = resolveStorage(storage);
    if (!target || typeof target.removeItem !== "function") return false;

    try {
      target.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getById(historyId, storage) {
    return load(storage).find(function (record) {
      return record.id === historyId;
    }) || null;
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_RECORDS: MAX_RECORDS,
    createHistoryId: createHistoryId,
    load: load,
    save: save,
    upsert: upsert,
    remove: remove,
    clear: clear,
    getById: getById,
  };
});
