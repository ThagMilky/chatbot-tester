"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseMessengerTranscript } = require("../conversation-parser.js");

test("parses Vietnamese Messenger turns and removes metadata noise", () => {
  const transcript = [
    "Client",
    "https://www.facebook.com/cyno.software/photos/avatar",
    "10:01 AM",
    "Tôi muốn tư vấn phần mềm ERP",
    "Seen by Cyno Software",
    "Cyno Software",
    "Chào bạn, bên mình có thể tư vấn giải pháp ERP phù hợp.",
    "10:02 AM",
    "Client",
    "Gym ạ",
    "12:03",
    "Cyno Software",
    "Dạ, với mô hình gym, bên mình sẽ cần thêm thông tin về quy mô.",
    "Seen by Client",
    "Client",
    "ERP bán giá khoảng bao nhiêu v ạ",
    "10:04",
    "Cyno Software",
    "Chi phí phụ thuộc vào phạm vi và số lượng người dùng.",
    "https://cdn.example.com/avatar.jpg",
  ].join("\n");

  const messages = parseMessengerTranscript(transcript, {
    botNames: ["Cyno Software"],
    clientNames: ["Client"],
  });

  assert.deepEqual(messages.map((message) => ({ role: message.role, text: message.text })), [
    { role: "client", text: "Tôi muốn tư vấn phần mềm ERP" },
    { role: "bot", text: "Chào bạn, bên mình có thể tư vấn giải pháp ERP phù hợp." },
    { role: "client", text: "Gym ạ" },
    { role: "bot", text: "Dạ, với mô hình gym, bên mình sẽ cần thêm thông tin về quy mô." },
    { role: "client", text: "ERP bán giá khoảng bao nhiêu v ạ" },
    { role: "bot", text: "Chi phí phụ thuộc vào phạm vi và số lượng người dùng." },
  ]);
  assert.equal(messages.some((message) => /facebook|avatar|Seen|10:0|12:03/i.test(message.text)), false);
});

test("supports inline role prefixes and multiline messages", () => {
  const messages = parseMessengerTranscript([
    "Client: Tôi muốn tư vấn phần mềm ERP",
    "Cho ngành bán lẻ.",
    "Bot: Mình có thể hỗ trợ bạn.",
    "11:10",
    "Client: Gym ạ",
  ].join("\n"));

  assert.deepEqual(messages.map((message) => [message.role, message.text]), [
    ["client", "Tôi muốn tư vấn phần mềm ERP\nCho ngành bán lẻ."],
    ["bot", "Mình có thể hỗ trợ bạn."],
    ["client", "Gym ạ"],
  ]);
});

test("parses profile and timed Seen-by Markdown links as metadata", () => {
  const profileUrl = "https://scontent.example/avatar.jpg";
  const transcript = [
    `[Phaolô Phạm](${profileUrl})`,
    "Tôi muốn tư vấn phần mềm ERP",
    `[Seen by Phaolô Phạm at 9:20 AM](${profileUrl})`,
    `[Cyno Software](https://scontent.example/cyno-avatar.jpg)`,
    "Chào bạn, bên mình có thể tư vấn giải pháp ERP.",
    `[Seen by Phaolô Phạm at 9:21 AM](${profileUrl})`,
    `[Phaolô Phạm](${profileUrl})`,
    "Gym ạ",
    `[Seen by Phaolô Phạm at 9:22 AM](${profileUrl})`,
    `[Cyno Software](https://scontent.example/cyno-avatar.jpg)`,
    "Bên mình cần thêm thông tin về quy mô phòng tập.",
    `[Seen by Phaolô Phạm at 9:23 AM](${profileUrl})`,
    `[Phaolô Phạm](${profileUrl})`,
    "ERP bán giá khoảng bao nhiêu v ạ",
    `[Seen by Phaolô Phạm at 9:24 AM](${profileUrl})`,
    `[Cyno Software](https://scontent.example/cyno-avatar.jpg)`,
    "Chi phí phụ thuộc vào phạm vi triển khai.",
  ].join("\n");

  const messages = parseMessengerTranscript(transcript, {
    botNames: ["Cyno Software"],
    clientNames: ["Phaolô Phạm"],
  });

  assert.deepEqual(messages.map((message) => ({
    role: message.role,
    sender: message.sender,
    text: message.text,
  })), [
    { role: "client", sender: "Phaolô Phạm", text: "Tôi muốn tư vấn phần mềm ERP" },
    { role: "bot", sender: "Cyno Software", text: "Chào bạn, bên mình có thể tư vấn giải pháp ERP." },
    { role: "client", sender: "Phaolô Phạm", text: "Gym ạ" },
    { role: "bot", sender: "Cyno Software", text: "Bên mình cần thêm thông tin về quy mô phòng tập." },
    { role: "client", sender: "Phaolô Phạm", text: "ERP bán giá khoảng bao nhiêu v ạ" },
    { role: "bot", sender: "Cyno Software", text: "Chi phí phụ thuộc vào phạm vi triển khai." },
  ]);
  assert.equal(messages.some((message) => /scontent\.example|Seen by|avatar|9:2\d AM/i.test(message.text)), false);
});

test("infers unlabeled bot replies after asymmetric client profile markers", () => {
  const profileUrl = "https://scontent.example/avatar.jpg";
  const transcript = [
    "Tôi muốn tư vấn phần mềm ERP",
    "",
    "Dạ, chào anh/chị. Em là An Chi.",
    "",
    `[Phaolô Phạm](${profileUrl})`,
    "",
    "Gym ạ",
    "",
    "Dạ, em đã ghi nhận nhu cầu ERP của mình.",
    "",
    `[Phaolô Phạm](${profileUrl})`,
    "",
    "ERP bán giá khoảng bao nhiêu v ạ",
    "",
    `[Seen by Phaolô Phạm at 9:20 AM](${profileUrl})`,
    "",
    "Dạ, hiện Cyno chưa có mức giá ERP cố định để báo ngay ạ.",
  ].join("\n");

  const messages = parseMessengerTranscript(transcript, {
    clientNames: ["Phaolô Phạm"],
  });

  assert.deepEqual(messages.map((message) => ({
    role: message.role,
    sender: message.sender,
    text: message.text,
  })), [
    { role: "client", sender: null, text: "Tôi muốn tư vấn phần mềm ERP" },
    { role: "bot", sender: null, text: "Dạ, chào anh/chị. Em là An Chi." },
    { role: "client", sender: "Phaolô Phạm", text: "Gym ạ" },
    { role: "bot", sender: null, text: "Dạ, em đã ghi nhận nhu cầu ERP của mình." },
    { role: "client", sender: "Phaolô Phạm", text: "ERP bán giá khoảng bao nhiêu v ạ" },
    { role: "bot", sender: null, text: "Dạ, hiện Cyno chưa có mức giá ERP cố định để báo ngay ạ." },
  ]);
  assert.equal(messages.some((message) => /scontent\.example|Seen by|avatar|9:20 AM/i.test(message.text)), false);
});

test("does not emit profile, seen, timestamp, or delivery-only lines", () => {
  const messages = parseMessengerTranscript([
    "User",
    "https://m.me/example",
    "Delivered",
    "Seen by User",
    "12:30 PM",
    "Hello",
    "Assistant",
    "Message sent",
    "12:31 PM",
    "Hi there",
  ].join("\n"));

  assert.deepEqual(messages.map((message) => message.text), ["Hello", "Hi there"]);
  assert.deepEqual(messages.map((message) => message.role), ["client", "bot"]);
});

test("parses Messenger profile markers without alternating bot paragraphs into clients", () => {
  const profileUrl = "https://scontent.example/nguyen-the-mai.jpg";
  const transcript = [
    "Tôi muốn tư vấn phần mềm ERP",
    "",
    "Dạ, chào anh/chị...",
    "",
    "Dạ, Cyno có thể khảo sát...",
    "",
    "Cho em hỏi thêm...",
    "",
    `[Nguyễn Thế Mai](${profileUrl})`,
    "",
    "Bán lẻ / cửa hàng",
    "",
    "Hiện tại bên mình đang gặp khó khăn nhất ở khâu nào ạ?",
    "",
    `[Nguyễn Thế Mai](${profileUrl})`,
    "",
    "Tồn kho/dữ liệu lệch",
    "",
    "Dạ, em đã ghi nhận...",
    "",
    "Bên mình dùng excel",
    "",
    "[🥰](https://static.xx.fbcdn.net/reaction.svg)",
    "**1**",
    "svg",
    "Seen by Nguyễn Thế Mai",
  ].join("\n");

  const messages = parseMessengerTranscript(transcript);

  assert.deepEqual(messages.map((message) => [message.role, message.text]), [
    ["client", "Tôi muốn tư vấn phần mềm ERP"],
    ["bot", "Dạ, chào anh/chị...\n\nDạ, Cyno có thể khảo sát...\n\nCho em hỏi thêm..."],
    ["client", "Bán lẻ / cửa hàng"],
    ["bot", "Hiện tại bên mình đang gặp khó khăn nhất ở khâu nào ạ?"],
    ["client", "Tồn kho/dữ liệu lệch"],
    ["bot", "Dạ, em đã ghi nhận...\n\nBên mình dùng excel"],
  ]);
  assert.equal(messages.some((message) => /scontent|fbcdn|reaction|Seen|svg|\*\*1\*\*/iu.test(message.text)), false);
});

test("classifies Sent by staff attribution as non-client content", () => {
  const profileUrl = "https://scontent.example/avatar.jpg";
  const transcript = [
    `[Nguyễn Thế Mai](${profileUrl})`,
    "Tôi muốn tư vấn ERP",
    "",
    "Chào anh, em là Phát. Em hỗ trợ anh trực tiếp nhé.",
    `Sent by [**Vũ Thuận Phát**](${profileUrl})`,
    "",
    `[Nguyễn Thế Mai](${profileUrl})`,
    "Anh cần quản lý kho.",
  ].join("\n");

  const messages = parseMessengerTranscript(transcript);

  assert.deepEqual(messages.map((message) => ({ role: message.role, text: message.text })), [
    { role: "client", text: "Tôi muốn tư vấn ERP" },
    { role: "staff", text: "Chào anh, em là Phát. Em hỗ trợ anh trực tiếp nhé." },
    { role: "client", text: "Anh cần quản lý kho." },
  ]);
  assert.equal(messages.some((message) => message.role === "client" && /Phát/u.test(message.text)), false);
});
