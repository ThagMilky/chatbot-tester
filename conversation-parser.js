(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ConversationParser = factory();
  }
})(typeof self === "object" ? self : this, function () {
  "use strict";

  const DEFAULT_BOT_NAMES = [
    "bot",
    "assistant",
    "admin",
    "agent",
    "support",
    "cyno",
    "cyno software",
    "nhân viên",
    "tư vấn viên",
  ];
  const DEFAULT_CLIENT_NAMES = ["client", "user", "customer", "you", "bạn", "khách", "khách hàng"];
  const ROLE_PREFIXES = {
    bot: new Set(["bot", "assistant", "admin", "agent", "support", "cyno", "tư vấn viên", "nhân viên"]),
    client: new Set(["client", "user", "customer", "you", "bạn", "khách", "khách hàng"]),
  };

  function stripDiacritics(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalize(value) {
    return stripDiacritics(value).replace(/\s+/g, " ").trim();
  }

  function asNameList(value, fallback) {
    const provided = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[\n,]/)
        : [];
    const values = fallback.concat(provided);

    return Array.from(new Set(values
      .map(function (name) { return normalize(name); })
      .filter(Boolean)));
  }

  function isUrlLine(line) {
    return /^(?:https?:\/\/|www\.)\S+$/iu.test(line.trim());
  }

  function parseStandaloneMarkdownLink(line) {
    const value = line.trim();
    if (!value.startsWith("[") || !value.endsWith(")")) return null;

    const separatorIndex = value.indexOf("](");
    if (separatorIndex <= 1) return null;

    const label = value.slice(1, separatorIndex).trim().replace(/^\*\*(.+)\*\*$/u, "$1").trim();
    const destination = value.slice(separatorIndex + 2, -1).trim();
    if (!label || !isUrlLine(destination)) return null;

    return { label: label, destination: destination };
  }

  function isTimestampLine(line) {
    const value = line.trim();
    return [
      /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?$/iu,
      /^(?:today|yesterday|hôm nay|hôm qua)(?:\s+at|\s+lúc)?\s+\d{1,2}:\d{2}/iu,
      /^\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?(?:\s+\d{1,2}:\d{2})?$/u,
    ].some(function (pattern) { return pattern.test(value); });
  }

  function isNoiseLine(line) {
    const value = line.trim();
    if (!value || isUrlLine(value) || isTimestampLine(value)) return true;
    if (parseStandaloneMarkdownLink(value)) return true;

    return [
      /^(?:seen by|seen|đã xem(?: bởi)?|đã đọc(?: bởi)?)/iu,
      /^(?:sent by|sent|delivered|message sent|message delivered|đã gửi|đã nhận|đã chuyển)/iu,
      /^(?:profile|avatar|photo|image)\s*(?:url|link)?\s*:/iu,
      /^(?:you|bạn)\s+(?:sent|đã gửi|replied|đã trả lời)\b/iu,
      /^(?:reacted to|đã bày tỏ cảm xúc|liked a message|đã thích một tin nhắn)/iu,
      /^svg$/iu,
      /^\*{0,2}\d+\*{0,2}$/u,
      /^[-_=]{3,}$/u,
    ].some(function (pattern) { return pattern.test(value); });
  }

  function isReactionLabel(label) {
    const value = String(label || "").replace(/[*_`]/g, "").trim();
    return !value || /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(value);
  }

  function roleForSender(sender, botNames, clientNames, fallbackRoles) {
    const key = normalize(sender);
    if (botNames.includes(key)) return "bot";
    if (clientNames.includes(key)) return "client";
    if (ROLE_PREFIXES.bot.has(key)) return "bot";
    if (ROLE_PREFIXES.client.has(key)) return "client";

    const botHint = /\b(?:bot|assistant|admin|agent|support|cyno|software|tư vấn|nhân viên)\b/iu.test(key);
    if (botHint) return "bot";

    if (!fallbackRoles.has(key)) {
      fallbackRoles.set(key, fallbackRoles.size === 0 ? "client" : "bot");
    }
    return fallbackRoles.get(key);
  }

  function isExplicitRoleName(name, botNames, clientNames) {
    const key = normalize(name);
    return botNames.includes(key) || clientNames.includes(key) || ROLE_PREFIXES.bot.has(key) || ROLE_PREFIXES.client.has(key);
  }

  function parseSenderLine(line, botNames, clientNames, repeatedLines) {
    const value = line.trim();
    const markdownLink = parseStandaloneMarkdownLink(value);
    if (markdownLink) {
      if (isReactionLabel(markdownLink.label) || /^seen\b/iu.test(markdownLink.label)) return null;
      const key = normalize(markdownLink.label);
      return {
        sender: markdownLink.label,
        inlineText: "",
        kind: "profile",
        role: botNames.includes(key) ? "bot" : clientNames.includes(key) ? "client" : "client",
      };
    }

    const colonIndex = value.indexOf(":");
    if (colonIndex > 0 && colonIndex <= 60) {
      const sender = value.slice(0, colonIndex).trim();
      const inlineText = value.slice(colonIndex + 1).trim();
      if (isExplicitRoleName(sender, botNames, clientNames) || /\b(?:bot|assistant|admin|agent|support|cyno|software|client|user|customer)\b/iu.test(sender)) {
        return { sender: sender, inlineText: inlineText, role: roleForSender(sender, botNames, clientNames, new Map()) };
      }
    }

    const key = normalize(value);
    if (isExplicitRoleName(value, botNames, clientNames) || repeatedLines.has(key)) {
      return { sender: value, inlineText: "", role: roleForSender(value, botNames, clientNames, new Map()) };
    }

    return null;
  }

  function parseMessengerTranscript(input, options) {
    const settings = options || {};
    const botNames = asNameList(settings.botNames, DEFAULT_BOT_NAMES);
    const clientNames = asNameList(settings.clientNames, DEFAULT_CLIENT_NAMES);
    const lines = String(input == null ? "" : input).replace(/\r\n?/g, "\n").split("\n");
    const counts = new Map();

    lines.forEach(function (line) {
      const value = line.trim();
      if (!value || isNoiseLine(value) || value.includes(":")) return;
      const key = normalize(value);
      if (key.length <= 80) counts.set(key, (counts.get(key) || 0) + 1);
    });

    const repeatedLines = new Set(
      Array.from(counts.entries())
        .filter(function (entry) { return entry[1] >= 2; })
        .map(function (entry) { return entry[0]; }),
    );
    const blocks = [];
    let currentParts = [];
    let markerForNextBlock = null;

    function flushBlock() {
      const text = currentParts.join("\n").replace(/[ \t]+\n/g, "\n").trim();
      if (text) blocks.push({ text: text, marker: markerForNextBlock });
      currentParts = [];
      markerForNextBlock = null;
    }

    lines.forEach(function (line) {
      const value = line.trim();
      if (!value) {
        flushBlock();
        return;
      }

      const staffAttribution = value.match(/^sent\s+by\s+(.+)$/iu);
      if (staffAttribution) {
        flushBlock();
        const staffLink = parseStandaloneMarkdownLink(staffAttribution[1].trim());
        const sender = staffLink ? staffLink.label : staffAttribution[1].trim().replace(/^\*\*(.+)\*\*$/u, "$1");
        const previous = blocks[blocks.length - 1];
        if (previous) {
          previous.attribution = true;
          previous.sender = sender;
        } else {
          markerForNextBlock = { role: "staff", sender: sender, kind: "staff" };
        }
        return;
      }

      const senderLine = parseSenderLine(value, botNames, clientNames, repeatedLines);
      if (senderLine) {
        flushBlock();
        markerForNextBlock = senderLine;
        if (senderLine.inlineText && !isNoiseLine(senderLine.inlineText)) currentParts.push(senderLine.inlineText);
        return;
      }

      if (isNoiseLine(value)) return;
      currentParts.push(value);
    });
    flushBlock();

    const hasExplicitClientMarker = blocks.some(function (block) {
      return block.marker && block.marker.role === "client";
    });
    const messages = [];
    let hasMeaningfulMessage = false;
    let nextUnmarkedRole = null;

    function appendMessage(role, text, sender) {
      const previous = messages[messages.length - 1];
      if (previous && previous.role === role && role !== "client") {
        previous.text += "\n\n" + text;
        if (!previous.sender && sender) previous.sender = sender;
        return;
      }
      messages.push({ role: role, text: text, sender: sender || null });
    }

    blocks.forEach(function (block) {
      const marker = block.marker;
      let role = block.attribution ? "staff" : marker && marker.role;
      let sender = block.attribution ? block.sender : marker && marker.sender;

      if (!role) {
        if (!hasMeaningfulMessage) role = "client";
        else if (!hasExplicitClientMarker && !nextUnmarkedRole) role = "bot";
        else role = nextUnmarkedRole || "bot";
      }

      appendMessage(role === "staff" || role === "bot" ? role : "client", block.text, sender);
      hasMeaningfulMessage = true;
      nextUnmarkedRole = role === "client" ? "bot" : "bot";
    });

    return messages;
  }

  return {
    isNoiseLine: isNoiseLine,
    parseMessengerTranscript: parseMessengerTranscript,
  };
});
