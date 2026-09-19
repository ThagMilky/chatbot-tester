// Add a bot here to make it available in the selector. No UI code changes are needed.
window.CHATBOT_CONFIG = [
  {
    id: "cyno",
    name: "Cyno Software",
    adapter: "cyno-software",
    apiUrl: "http://127.0.0.1:3000/api/chat",
    staffApiUrl: "http://127.0.0.1:3000/api/chat-test/staff-message",
    enabled: true,
    channels: {
      website: {
        requestChannel: "chat-test",
        icebreakers: [
          { label: "Tư vấn website", payload: "icebreaker:website_new" },
          { label: "Thiết kế lại website", payload: "icebreaker:website_redesign" },
          { label: "SEO website", payload: "icebreaker:seo" },
          { label: "Tối ưu chuyển đổi", payload: "icebreaker:conversion_optimization" },
          { label: "Bảo trì website", payload: "icebreaker:maintenance" },
        ],
      },
      messenger: {
        requestChannel: "messenger",
        quickReplyPayloadField: "quickReplyPayload",
        quickReplyPayloadValueField: "id",
        icebreakers: [
          { label: "Tư vấn website", payload: "icebreaker:website_new" },
          { label: "Thiết kế lại website", payload: "icebreaker:website_redesign" },
          { label: "SEO website", payload: "icebreaker:seo" },
          { label: "Tối ưu chuyển đổi", payload: "icebreaker:conversion_optimization" },
          { label: "Bảo trì website", payload: "icebreaker:maintenance" },
        ],
      },
    },
    testMode: {
      enabled: true,
      label: "Telegram dry-run",
      requestBody: {
        testMode: "telegram-dry-run",
      },
      headers: {
        "X-Chatbot-Test-Mode": "telegram-dry-run",
      },
    },
  },
  {
    id: "demo",
    name: "Demo Chatbot",
    apiUrl: "",
    enabled: true,
    channels: {
      website: {
        requestChannel: "chat-test",
      },
      messenger: {
        requestChannel: "messenger",
        quickReplyPayloadField: "quickReplyPayload",
        quickReplyPayloadValueField: "id",
      },
    },
    testMode: {
      enabled: true,
      label: "Telegram dry-run",
      requestBody: {
        testMode: "telegram-dry-run",
      },
      headers: {
        "X-Chatbot-Test-Mode": "telegram-dry-run",
      },
    },
  },
];

// Add regression scenarios here. A scenario with botId omitted applies to the selected bot.
window.CHATBOT_SCENARIOS = [
  {
    id: "cyno-greeting-smoke",
    botId: "cyno",
    name: "Cyno greeting smoke",
    messages: ["Xin chào"],
    assertions: {
      intent: "GREETING",
    },
  },
];
