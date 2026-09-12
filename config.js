// Add a bot here to make it available in the selector. No UI code changes are needed.
window.CHATBOT_CONFIG = [
  {
    id: "cyno",
    name: "Cyno Software",
    adapter: "cyno-software",
    apiUrl: "http://localhost:3000/api/chat",
    enabled: true,
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
