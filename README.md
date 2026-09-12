# Chatbot Tester

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

Tester hiển thị `label` thành chip dưới bubble bot và gửi `value` qua trường `message` khi chip được chọn, để endpoint `/api/chat` giữ nguyên request contract hiện tại. Messenger thật dùng `id` làm `quick_reply.payload`, nhưng website endpoint hiện không nhận `quickReplyPayload`. API generic có thể đặt `optionValueField: "id"` trong config nếu cần gửi `id`; response cũng có thể dùng `quickReplies`, `quick_replies`, `suggestedReplies` hoặc `options`. Option dạng chuỗi sẽ vừa hiển thị vừa gửi chính chuỗi đó. Khi người dùng gửi turn mới, các chip cũ được xóa.

