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
          { label: "Tư vấn Website", message: "Tôi muốn tư vấn Website", payload: "icebreaker:website" },
          { label: "Thiết kế lại Website", message: "Tôi muốn thiết kế lại Website", payload: "icebreaker:website_redesign" },
          { label: "SEO Website", message: "Tôi muốn tư vấn SEO Website", payload: "icebreaker:seo" },
          { label: "Phần mềm ERP", message: "Tôi muốn tư vấn phần mềm ERP", payload: "icebreaker:erp" },
          { label: "Phần mềm CRM", message: "Tôi muốn tư vấn phần mềm CRM", payload: "icebreaker:crm" },
          { label: "Phần mềm theo yêu cầu", message: "Tôi muốn tư vấn phần mềm theo yêu cầu", payload: "icebreaker:custom_software" },
          { label: "Tối ưu chuyển đổi", message: "Tôi muốn tối ưu chuyển đổi", payload: "icebreaker:conversion_optimization" },
          { label: "Bảo trì Website", message: "Tôi muốn tư vấn bảo trì Website", payload: "icebreaker:maintenance" },
        ],
      },
      messenger: {
        requestChannel: "messenger",
        quickReplyPayloadField: "quickReplyPayload",
        quickReplyPayloadValueField: "id",
        icebreakers: [
          { label: "Tư vấn Website", message: "Tôi muốn tư vấn Website", payload: "icebreaker:website" },
          { label: "Thiết kế lại Website", message: "Tôi muốn thiết kế lại Website", payload: "icebreaker:website_redesign" },
          { label: "SEO Website", message: "Tôi muốn tư vấn SEO Website", payload: "icebreaker:seo" },
          { label: "Phần mềm ERP", message: "Tôi muốn tư vấn phần mềm ERP", payload: "icebreaker:erp" },
          { label: "Phần mềm CRM", message: "Tôi muốn tư vấn phần mềm CRM", payload: "icebreaker:crm" },
          { label: "Phần mềm theo yêu cầu", message: "Tôi muốn tư vấn phần mềm theo yêu cầu", payload: "icebreaker:custom_software" },
          { label: "Tối ưu chuyển đổi", message: "Tôi muốn tối ưu chuyển đổi", payload: "icebreaker:conversion_optimization" },
          { label: "Bảo trì Website", message: "Tôi muốn tư vấn bảo trì Website", payload: "icebreaker:maintenance" },
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
    id: "cyno-v2",
    name: "Cyno Software V2",
    adapter: "cyno-software",
    apiUrl: "http://127.0.0.1:3000/api/chat",
    enabled: true,
    channels: {
      website: {
        requestChannel: "chat-test",
        icebreakers: [
          { label: "Tư vấn Website", message: "Tôi muốn tư vấn Website", payload: "icebreaker:website" },
          { label: "Thiết kế lại Website", message: "Tôi muốn thiết kế lại Website", payload: "icebreaker:website_redesign" },
          { label: "SEO Website", message: "Tôi muốn tư vấn SEO Website", payload: "icebreaker:seo" },
          { label: "Tối ưu chuyển đổi", message: "Tôi muốn tối ưu chuyển đổi", payload: "icebreaker:conversion_optimization" },
          { label: "Bảo trì Website", message: "Tôi muốn tư vấn bảo trì Website", payload: "icebreaker:maintenance" },
        ],
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
