# Chatbot Tester

## UI reference

The dashboard UI is an original reimplementation inspired only by the public [Anngiie/Admin-Dashboard-Design](https://github.com/Anngiie/Admin-Dashboard-Design) Meridian reference. That reference is MIT licensed. No reference assets, remote fonts, icon libraries, or unrelated content are used here.

## Conversation import / parser (Phase 1)

The UI includes a `Paste Conversation` panel for Messenger-style transcript text. `Scan Conversation` parses an ordered preview of client and bot messages without sending anything to the configured chatbot API.

The parser ignores common transcript noise, including profile/avatar URLs, timestamps, `Seen by` lines, delivery markers, and other metadata-only lines. Configure bot sender names when the transcript uses a custom display name; the selected bot name is included automatically. The preview supports role correction, direct text editing, and deletion of individual parsed entries. These operations are isolated from the existing chat, scenario, debug-history, retry/edit-resend, export, and edge-test flows.

The parser is implemented in `conversation-parser.js` with no npm dependencies. Focused tests use Node's built-in test runner:

```bash
node --test test/conversation-parser.test.js
```

Phase 1 intentionally does not generate regressions or run AI evaluation. Phase 2 adds sequential replay of imported client messages; Phase 3 adds deterministic regression scenario generation; Phase 4 adds optional, separate AI behavior evaluation after a scenario run.

## Conversation replay (Phase 2)

After scanning and reviewing an imported conversation, use `Run Replay` to send only the parsed `client` messages to the currently selected bot. Replay creates a new session, waits for each response before sending the next message, and keeps the existing request adapters, response parsing, turn history, and debug panel. Website/Messenger mode and the selected bot adapter are preserved.

The replay preview keeps the imported bot reply mapped to each client turn and shows `Original Bot` beside `Current Bot`. `Pause`/`Resume` controls progress between turns, `Stop` prevents remaining turns from being sent, and a failed request stops the run and enables `Retry Failed Turn`. Retry uses the same client turn and does not overwrite the imported transcript or its original replies. Edge Test Mode does not make normal replay concurrent.

Replay state planning helpers live in `replay-helpers.js` and are covered by Node's built-in test runner:

```bash
node --test test/conversation-parser.test.js test/replay-helpers.test.js
```

## Regression Builder (Phase 3)

After importing a conversation, use `Generate from Conversation / Replay` to create a draft for the selected bot. The draft contains only ordered imported messages with `role=client`; imported bot messages remain reference context and are never sent as scenario inputs. Edit the scenario ID, name, deterministic assertions, and behavior expectations before saving or exporting.

Deterministic assertions are limited to `intent`, `step`/state, extracted fields, Telegram status, and Telegram trigger count. Values are prefilled only when available from the current replay/debug turns. Behavior expectations (`answerLatestQuestion`, `preserveContext`, `noUnnecessaryRepetition`, `noContradictionOrRenegotiation`, and `doNotIgnoreUserQuestion`) remain separate Phase 4 metadata and are evaluated by the local server after a completed scenario run; they are never counted as deterministic assertions.

Generated scenarios are stored locally in browser storage and are listed with configured scenarios in the existing Scenario Runner. `Import JSON` accepts a single scenario, an array, or an exported collection. `Export JSON` produces a portable collection without raw backend responses or secrets. Invalid data is rejected without replacing saved scenarios; ID collisions receive deterministic suffixes.

## Behavior evaluation (Phase 4)

After a Scenario Runner execution finishes, the deterministic assertions render immediately and remain the authoritative PASS/FAIL result. When one or more behavior expectations are enabled, the browser sends only the scenario metadata, ordered client messages, visible current bot replies, enabled expectations, and channel mode to `POST /api/evaluate-behavior` on the local server. The separate AI Behavior panel reports pending, PASS, FAIL, unavailable, error, or skipped status, with per-expectation evidence, relevant turn numbers, model, and safe token usage when available. `Re-evaluate Behavior` retries the completed turns without sending chatbot messages again.

The evaluator uses the OpenAI Responses API from the Node server with strict JSON Schema output, `reasoning: { effort }`, `store: false`, and a timeout. Deterministic assertions and AI behavior checks are never merged. AI evaluation judges only observable conversation behavior and does not assess hidden backend state, product/pricing truth, Telegram behavior, or business rules.

Configure the evaluator only through the server environment. `OPENAI_API_KEY` is required for a live evaluation; the other values are optional:

```text
OPENAI_API_KEY=...
OPENAI_EVAL_MODEL=gpt-5.6-luna
OPENAI_EVAL_REASONING=high
OPENAI_EVAL_TIMEOUT_MS=30000
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

PowerShell example using placeholders only:

```powershell
$env:OPENAI_API_KEY = "[REDACTED_OPENAI_KEY]"
$env:OPENAI_EVAL_MODEL = "gpt-5.6-luna"
$env:OPENAI_EVAL_REASONING = "high"
$env:OPENAI_EVAL_TIMEOUT_MS = "30000"
$env:OPENAI_API_BASE_URL = "https://api.openai.com/v1"
node server.js
```

The API key is never sent to browser code, `config.js`, QA exports, logs, errors, or evaluator response data. Conversation text is treated as untrusted data and is not treated as instructions. If the evaluator is unconfigured, unavailable, times out, refuses, returns an HTTP error, or produces invalid output, the deterministic Scenario Runner remains usable and the AI Behavior panel reports unavailable or error without inventing a verdict. Do not place real keys in this repository or in exported files.

## AI Client Simulator

Start the local tester with `node server.js`, then open `http://127.0.0.1:8080` and configure the chatbot API as usual.

The separate `AI Client Simulator` panel runs an exploratory conversation in a fresh tester session. Choose a service (`Website Design`, `ERP`, `CRM`, or `Custom Software`), a built-in client profile, `Normal` or `Challenging` difficulty, and a maximum number of client turns. `Start` asks the local tester server for the client's first message, sends it through the existing `sendMessage()` path, then sends only the visible client/bot transcript back for the next decision. The simulator chooses its own wording, question order, follow-ups, objections, and whether to stop; it is not a deterministic script and does not produce PASS/FAIL assertions.

The built-in profiles live in `ai-client-simulator.js`. The local server exposes their public service/scenario catalog at `GET /api/simulate-client-scenarios` and the AI turn endpoint at `POST /api/simulate-client-turn`. Pause/Resume stops progress between sequential turns, and Stop invalidates the active run so stale responses cannot restart a stopped or newer run. Simulator turns are recorded in the existing Turn Log with `runType: "simulator"`; the completed conversation remains available for manual inspection, export, or regression drafting.

The simulator uses the Gemini GenerateContent API server-side so it can use a Gemini API key from the free tier. `server.js` loads a local `.env` file automatically. The simulator uses `GEMINI_SIMULATOR_MODEL`, falls back to `GEMINI_GENERATOR_MODEL`, then to its built-in default.

```text
GEMINI_API_KEY=...
GEMINI_SIMULATOR_MODEL=gemini-3.6-flash
GEMINI_SIMULATOR_TIMEOUT_MS=30000
GEMINI_SIMULATOR_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

The AI Behavior evaluator remains separate and can still use OpenAI when `OPENAI_API_KEY` is configured. Gemini configuration for the simulator does not require an OpenAI key.

For a local workspace, the tester can reuse another env file without copying credentials. Put `CHATBOT_SHARED_ENV_PATH=..\chatbot-software-cyno\.env` in the tester's ignored `.env`; the server loads that file after the tester `.env`.

If the key or simulator configuration is unavailable, the panel reports an unavailable/error state without breaking manual chat, replay, deterministic scenarios, or exports. The simulator receives no backend debug data, hidden chatbot state, Telegram payloads, API keys, expected answers, regression assertions, or evaluator internals. Bot replies are untrusted transcript data and cannot change the simulator's role or reveal its private profile.

Pure validation, snapshot, storage, and serialization helpers live in `regression-helpers.js` and use only Node/browser built-ins. Focused and existing tests can be run with:

```bash
node --test
```

Local QA tool để giả lập client chat, xem backend debug có cấu trúc và kiểm tra Telegram notification dry-run cho nhiều chatbot. Project dùng HTML, CSS, vanilla JavaScript và Node.js built-in modules; không có npm dependency và không chứa business logic chatbot.

## Chạy local

Yêu cầu Node.js, không cần `npm install`:

```bash
node server.js
```

Mở [http://localhost:8080](http://localhost:8080).

Có thể đổi port bằng biến môi trường:

```bash
PORT=8081 node server.js
```

Server chỉ serve static files trong folder này. Nó không proxy request, không gọi Telegram và không kết nối production.

## Thêm chatbot

Mở `config.js` và thêm một object vào `CHATBOT_CONFIG`:

```js
{
  id: "my-bot",
  name: "My Bot",
  apiUrl: "http://localhost:3000/api/chat",
  enabled: true,
  testMode: {
    enabled: true,
    label: "Telegram dry-run",
    requestBody: {
      testMode: "telegram-dry-run"
    },
    headers: {
      "X-Chatbot-Test-Mode": "telegram-dry-run"
    }
  }
}
```

Bot có `enabled: false` sẽ không xuất hiện trong selector. Thêm bot chỉ cần sửa config, không cần sửa UI. `testMode` là cấu hình generic; nếu API dùng flag/header khác, chỉnh object này hoặc adapter.

Config sẵn có cho `Cyno Software` đã trỏ tới `http://localhost:3000/api/chat` và dùng adapter `cyno-software`. Adapter này đọc response hiện tại của Cyno dạng `{ "type": "text", "text": "..." }`, đồng thời fallback về `{ "reply": "..." }`.

## API adapter

Các điểm kết nối chính nằm trong `app.js`:

- `buildRequest(bot, message, sessionId)`: map request payload và thêm test-mode body flag nếu bot bật dry-run.
- `buildFetchOptions(bot, requestPayload, controller)`: map method, headers, timeout và test-mode headers.
- `parseResponse(bot, response)`: map response về reply text.
- `parseSuggestedOptions(bot, response)`: normalize suggested options/quick replies cho UI; adapter Cyno hiển thị `label` và gửi `value` qua `/api/chat` vì endpoint website hiện chỉ nhận text, không nhận `quickReplyPayload`; raw response vẫn giữ `id/value` để debug.
- `parseDebug(bot, response)`: normalize debug backend về format UI dùng.

Tester chọn adapter qua trường `adapter` trong `config.js`. Adapter chỉ map request/response/debug; business logic vẫn nằm ở chatbot backend.

Contract request mặc định:

```json
{
  "sessionId": "test-xxx",
  "message": "Tôi muốn làm ERP",
  "channel": "chat-test",
  "testMode": "telegram-dry-run"
}
```

Nếu `testMode` không bật, request vẫn giữ contract cơ bản ban đầu.

Response tối thiểu vẫn chỉ cần:

```json
{
  "reply": "..."
}
```

Với adapter `cyno-software`, response tối thiểu hiện tại cũng có thể là:

```json
{
  "type": "text",
  "text": "..."
}
```

Backend có thể trả thêm debug chuẩn hóa:

```json
{
  "reply": "...",
  "debug": {
    "intent": "erp",
    "step": "businessType",
    "extractedFields": {
      "businessType": "Manufacturing",
      "companySize": 50
    },
    "model": "gemini",
    "durationMs": 532,
    "pipeline": [
      { "step": "receiveMessage", "status": "success" },
      { "step": "generateResponse", "status": "failed", "error": "GEMINI_RATE_LIMIT" }
    ],
    "telegramMock": {
      "trigger": "lead_completed",
      "status": "would_send",
      "payload": {
        "service": "ERP",
        "business": "Manufacturing",
        "companySize": 50,
        "budget": "200M VND",
        "phone": "0901234567"
      },
      "events": [
        { "label": "Lead qualification completed", "status": "success" },
        { "label": "Contact captured", "status": "success" },
        { "label": "Telegram notification triggered", "status": "success" },
        { "label": "Telegram send skipped (test mode)", "status": "skipped" }
      ]
    }
  }
}
```

`debug` là optional. Khi không có debug, chat vẫn hiển thị `reply`; panel chỉ hiển thị các trường chưa có dữ liệu. Pipeline event có thể là string hoặc object có `step`/`name`, `status`, `error`/`detail`.

## Telegram dry-run

Tester không chứa qualification logic và không gửi Telegram. Backend phải xử lý theo flow:

```text
normal qualification logic
→ production trigger condition
→ build real notification payload
→ replace final Telegram send with mock/log event
```

Khi `testMode.enabled` bật, tester gửi flag đã cấu hình và hiển thị `debug.telegramMock` (hoặc `debug.telegram`) nếu backend trả về. Backend vẫn phải dùng đúng trigger rules production để thể hiện rõ:

- Thiếu required lead data: không trigger, có `status: "not_triggered"`/`"skipped"` và `reason`.
- Thiếu consent: không trigger nếu consent là bắt buộc.
- Lead đầy đủ: trigger đúng một lần, `status: "would_send"`, payload đầy đủ.
- Contact được cập nhật: payload phải phản ánh dữ liệu mới nhất.
- Chat tiếp sau completion: không tạo notification duplicate.
- Reply chatbot vẫn được trả về bình thường dù Telegram send bị skip.

Nếu backend không trả `telegramMock`, tester không tự suy luận trigger và không tự gửi gì; hãy bổ sung structured debug ở backend.

## Lỗi backend và bảo mật debug

Panel hiển thị request payload, HTTP status, client response time, backend duration, intent, state/step, extracted fields, model, pipeline, raw response, parsed reply và error. Lỗi kết nối được hiển thị dạng `Backend connection failed` kèm timeout/network/HTTP detail. Stack trace chỉ hiện ở localhost/dev mode.

Nếu API chạy khác origin, API cần cho phép CORS cho trang local này. Tool không tự thêm proxy.

## Chuẩn bị kết nối Cyno

Tester gọi backend Cyno local ở port `3000`, không cần deploy hoặc fanpage. Nếu `.env` local đang đặt port khác, override port khi chạy backend. Chạy backend và tester ở hai terminal:

```bash
# chatbot-software-cyno
npm.cmd start

# chatbot-tester
node server.js
```

Trên PowerShell, nếu cần ép backend chạy đúng port mặc định của tester:

```powershell
$env:PORT = "3000"
npm.cmd start
```

Mở `http://localhost:8080`. Request từ tester đi thẳng tới `POST http://localhost:3000/api/chat`.

Bot Cyno mặc định bật `telegram-dry-run`: backend vẫn chạy qualification và lead trigger thật, nhưng bỏ qua Telegram send cuối cùng và trả `debug.telegramMock` để kiểm tra trên frontend.

Backend Cyno đã cho phép CORS giới hạn cho `http://localhost:8080` và `http://127.0.0.1:8080`. Nếu đổi port tester, cập nhật `CORS_ALLOWED_ORIGINS` trong `.env` backend. Tester chỉ gửi cờ và hiển thị dữ liệu backend trả về, không tự chạy qualification hay gửi Telegram.

## Conversation behavior

- Mở app lần đầu sẽ tạo session ID mới.
- `New Conversation` xóa message, reset debug và tạo session ID mới.
- `Clear Chat` chỉ xóa message trên UI, giữ nguyên session ID và debug hiện tại.
- Send bị disable trong lúc request chạy; bot/session controls cũng khóa để tránh race condition.
- Tin nhắn rỗng không được gửi.
- `Enter` gửi; `Shift+Enter` xuống dòng.
- API URL trống sẽ hiện `Backend connection failed` với hướng dẫn cấu hình và không crash UI.

## Turn debug history

Mỗi request được lưu thành một turn riêng gồm request payload, raw response, parsed reply, HTTP status, client timing, backend duration, intent, state/step, extracted fields, model, pipeline, Telegram dry-run và lỗi. Bấm vào bubble user/bot hoặc lỗi để chọn turn và xem lại debug tương ứng; turn mới nhất tự được chọn.

Các action dưới user message:

- `Retry`: gửi lại đúng input gốc và giữ turn cũ.
- `Edit & Resend`: sửa input rồi tạo turn mới.
- `Copy request`: copy request payload của turn.

## Website / Messenger mode

Chọn `Website` để giữ request contract hiện tại (`channel: "chat-test"`, option gửi bằng `value`). Chọn `Messenger` để adapter gửi thêm payload quick reply, mặc định qua `quickReplyPayload` với giá trị `id`; text hiển thị của option vẫn được gửi trong trường `message`.

Contract Messenger được cấu hình per bot:

```js
channels: {
  website: { requestChannel: "chat-test" },
  messenger: {
    requestChannel: "messenger",
    quickReplyPayloadField: "quickReplyPayload",
    quickReplyPayloadValueField: "id"
  }
}
```

Backend nào dùng tên trường khác có thể đổi `quickReplyPayloadField` và `quickReplyPayloadValueField`; tester không giả định chi tiết triển khai Messenger production.

## Test Scenarios / Regression Runner

Thêm scenario vào `window.CHATBOT_SCENARIOS` trong `config.js`, hoặc thêm mảng `scenarios` vào từng bot:

```js
{
  id: "erp-complete-lead",
  botId: "cyno",
  name: "ERP complete lead",
  channelMode: "website",
  messages: ["Tôi cần ERP", "Sản xuất", "50 nhân sự", "200 triệu", "0901234567"],
  assertions: {
    intent: "PROVIDE_CONTACT",
    step: "leadConsent",
    fields: { companySize: 50 },
    telegramStatus: "would_send",
    telegramTriggerCount: 1
  }
}
```

Scenario runner luôn tạo session mới, gửi message tuần tự, hiển thị tiến độ và báo `PASS`/`FAIL` kèm assertion lỗi. Tester chỉ kiểm tra dữ liệu debug được backend trả về, không chứa qualification logic.

## Export QA report

Chọn `JSON` hoặc `TXT` rồi bấm `Export QA` để tải toàn bộ conversation, session, per-turn request/response, debug, pipeline, Telegram dry-run, lỗi và timing. Report có thể gửi trực tiếp khi báo bug.

## Rapid / duplicate edge test

`Edge test mode` tắt mặc định và giữ nguyên hành vi khóa input khi request đang chạy. Khi bật, có thể gửi nhiều request song song. Bật thêm `Reuse messageId khi Duplicate`, sau đó dùng action `Duplicate` dưới user message để gửi lại cùng event/message ID và kiểm tra dedupe backend.

## Suggested replies / quick replies

Cyno trả option trong response text bằng schema:

```json
{
  "type": "text",
  "text": "Bạn đang cần tư vấn phần nào?",
  "suggestedOptions": [
    {
      "id": "cyno:v4:o:technicalCategory:erp",
      "field": "technicalCategory",
      "value": "erp",
      "label": "ERP"
    }
  ]
}
```

Tester hiển thị `label` thành chip dưới bubble bot. Ở Website mode, tester gửi `value` qua trường `message` để endpoint `/api/chat` giữ nguyên request contract hiện tại. Ở Messenger mode, tester gửi thêm trường payload được cấu hình trong `channels.messenger`; mặc định là `quickReplyPayload: option.id` và `message: option.label`. Response có thể dùng `quickReplies`, `quick_replies`, `suggestedReplies` hoặc `options` với adapter generic; Cyno adapter đọc `suggestedOptions`. Option dạng chuỗi sẽ vừa hiển thị vừa gửi chính chuỗi đó. Khi người dùng gửi turn mới, các chip cũ được xóa.

