"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

function loadLocalEnv(filePath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) return;
    const name = trimmed.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || process.env[name] !== undefined) return;
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  });
}

loadLocalEnv();
if (typeof process.env.CHATBOT_SHARED_ENV_PATH === "string" && process.env.CHATBOT_SHARED_ENV_PATH.trim()) {
  const configuredPath = process.env.CHATBOT_SHARED_ENV_PATH.trim();
  const sharedEnvPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, configuredPath);
  loadLocalEnv(sharedEnvPath);
}
const {
  createAiEvaluator,
  validateAiEvaluationResult,
  validateEvaluationPayload,
} = require("./ai-evaluator.js");
const {
  createAiClientSimulator,
  getPublicSimulatorCatalog,
  validateSimulatorTurnPayload,
} = require("./ai-client-simulator.js");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8080;
const ROOT_DIR = __dirname;
const EVALUATION_PATH = "/api/evaluate-behavior";
const SIMULATOR_CATALOG_PATH = "/api/simulate-client-scenarios";
const SIMULATOR_TURN_PATH = "/api/simulate-client-turn";
const MAX_BODY_BYTES = 256 * 1024;

const MIME_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function hasJsonContentType(contentType) {
  if (typeof contentType !== "string") return false;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function isAllowedLocalHost(hostHeader) {
  if (typeof hostHeader !== "string") return false;
  const match = /^(localhost|127\.0\.0\.1)(?::([0-9]{1,5}))?$/iu.exec(hostHeader.trim());
  if (!match) return false;
  return match[2] === undefined || Number(match[2]) <= 65535;
}

function isAllowedOrigin(originHeader) {
  if (originHeader === undefined) return true;
  if (typeof originHeader !== "string" || originHeader === "null") return false;
  let origin;
  try {
    origin = new URL(originHeader);
  } catch (error) {
    return false;
  }
  return ["http:", "https:"].includes(origin.protocol)
    && ["localhost", "127.0.0.1"].includes(origin.hostname.toLowerCase())
    && !origin.username
    && !origin.password
    && origin.pathname === "/"
    && !origin.search
    && !origin.hash;
}

function resolveRequestedFile(requestUrl, rootDir = ROOT_DIR) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch (error) {
    return null;
  }
  if (pathname === "/") pathname = "/index.html";
  const requestedPath = path.resolve(rootDir, "." + pathname);
  const rootWithSeparator = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (requestedPath !== rootDir && !requestedPath.startsWith(rootWithSeparator)) return null;
  return requestedPath;
}

function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers && request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      request.resume();
      reject(Object.assign(new Error("Request body is too large."), { code: "BODY_TOO_LARGE" }));
      return;
    }
    const chunks = [];
    let total = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      total += Buffer.byteLength(chunk);
      if (total > maxBytes) {
        settled = true;
        request.resume();
        reject(Object.assign(new Error("Request body is too large."), { code: "BODY_TOO_LARGE" }));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(Object.assign(new Error("Request body must be valid JSON."), { code: "INVALID_JSON" }));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error("Request body could not be read."), { code: "BODY_READ_ERROR", cause: error }));
    });
  });
}

function createUnavailableEvaluator() {
  return {
    isConfigured: () => false,
    async evaluate() {
      const error = new Error("Behavior evaluation is not configured.");
      error.code = "EVAL_UNCONFIGURED";
      throw error;
    },
  };
}

function createSafeEvaluator(options) {
  if (options && options.evaluator) return options.evaluator;
  try {
    return createAiEvaluator({
      env: options && options.env ? options.env : process.env,
      fetchImpl: options && options.fetchImpl,
    });
  } catch (error) {
    return createUnavailableEvaluator();
  }
}

function createUnavailableSimulator() {
  return {
    isConfigured: () => false,
    async simulate() {
      const error = new Error("AI client simulation is not configured.");
      error.code = "SIM_UNCONFIGURED";
      throw error;
    },
  };
}

function createSafeSimulator(options) {
  if (options && options.simulator) return options.simulator;
  try {
    return createAiClientSimulator({
      env: options && options.env ? options.env : process.env,
      fetchImpl: options && options.fetchImpl,
    });
  } catch (error) {
    return createUnavailableSimulator();
  }
}

function createStaticHandler(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  return (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "Method Not Allowed");
      return;
    }
    const filePath = resolveRequestedFile(request.url || "/", rootDir);
    if (!filePath) {
      sendText(response, 400, "Bad Request");
      return;
    }
    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        sendText(response, 404, "Not Found");
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "Content-Type": (MIME_TYPES[extension] || "application/octet-stream") + "; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": stats.size,
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(filePath)
        .on("error", () => {
          if (!response.headersSent) sendText(response, 500, "Internal Server Error");
          else response.destroy();
        })
        .pipe(response);
    });
  };
}

function createHandler(options = {}) {
  const evaluator = createSafeEvaluator(options);
  const simulator = createSafeSimulator(options);
  const maxBodyBytes = options.maxBodyBytes || MAX_BODY_BYTES;
  const staticHandler = createStaticHandler(options);
  return async (request, response) => {
    let pathname;
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch (error) {
      sendText(response, 400, "Bad Request");
      return;
    }
    const isEvaluationRequest = pathname === EVALUATION_PATH;
    const isSimulatorCatalogRequest = pathname === SIMULATOR_CATALOG_PATH;
    const isSimulatorTurnRequest = pathname === SIMULATOR_TURN_PATH;
    const apiRequestLabel = isSimulatorCatalogRequest || isSimulatorTurnRequest ? "Simulator" : "Evaluation";
    if (!isEvaluationRequest && !isSimulatorCatalogRequest && !isSimulatorTurnRequest) {
      staticHandler(request, response);
      return;
    }
    if (!isAllowedLocalHost(request.headers && request.headers.host)) {
      sendJson(response, 403, { status: "error", error: apiRequestLabel + " request host is not allowed." });
      return;
    }
    if (!isAllowedOrigin(request.headers && request.headers.origin)) {
      sendJson(response, 403, { status: "error", error: apiRequestLabel + " request origin is not allowed." });
      return;
    }

    if (isSimulatorCatalogRequest) {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendText(response, 405, "Method Not Allowed");
        return;
      }
      sendJson(response, 200, { status: "ready", scenarios: getPublicSimulatorCatalog() });
      return;
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendText(response, 405, "Method Not Allowed");
      return;
    }
    if (!hasJsonContentType(request.headers && request.headers["content-type"])) {
      sendJson(response, 415, {
        status: "error",
        error: isSimulatorTurnRequest
          ? "Simulator request must use application/json."
          : "Evaluation request must use application/json.",
      });
      return;
    }
    let rawPayload;
    try {
      rawPayload = await readJsonBody(request, maxBodyBytes);
    } catch (error) {
      if (error && error.code === "BODY_TOO_LARGE") {
        sendJson(response, 413, {
          status: "error",
          error: isSimulatorTurnRequest ? "Simulator request is too large." : "Evaluation request is too large.",
        });
        return;
      }
      if (error && error.code === "INVALID_JSON") {
        sendJson(response, 400, {
          status: "error",
          error: isSimulatorTurnRequest ? "Simulator request must be valid JSON." : "Evaluation request must be valid JSON.",
        });
        return;
      }
      sendJson(response, 400, {
        status: "error",
        error: isSimulatorTurnRequest ? "Simulator request could not be read." : "Evaluation request could not be read.",
      });
      return;
    }

    let validatedPayload;
    try {
      validatedPayload = isSimulatorTurnRequest
        ? { payload: validateSimulatorTurnPayload(rawPayload) }
        : validateEvaluationPayload(rawPayload);
    } catch (error) {
      sendJson(response, 400, {
        status: "error",
        error: isSimulatorTurnRequest ? "Simulator request is invalid." : "Evaluation request is invalid.",
      });
      return;
    }

    if (isSimulatorTurnRequest) {
      if (typeof simulator.isConfigured === "function" && !simulator.isConfigured()) {
        sendJson(response, 503, { status: "unavailable", error: "AI Client Simulator is not configured." });
        return;
      }
      try {
        const simulated = await simulator.simulate(validatedPayload.payload);
        sendJson(response, 200, {
          status: "completed",
          action: simulated.action,
          message: simulated.message,
          reason: simulated.reason,
          ...(typeof simulated.model === "string" ? { model: simulated.model } : {}),
          ...(typeof simulated.provider === "string" ? { provider: simulated.provider } : {}),
          ...(simulated.usage && typeof simulated.usage === "object" ? { usage: simulated.usage } : {}),
        });
      } catch (error) {
        if (error && error.code === "SIM_UNCONFIGURED") {
          sendJson(response, 503, { status: "unavailable", error: "AI Client Simulator is not configured." });
          return;
        }
        if (error && error.code === "SIM_TIMEOUT") {
          sendJson(response, 504, { status: "error", error: "AI Client Simulator timed out." });
          return;
        }
        if (error && typeof error.code === "string" && error.code.startsWith("SIM_")) {
          sendJson(response, 502, { status: "error", error: "AI Client Simulator failed safely." });
          return;
        }
        sendJson(response, 502, { status: "error", error: "AI Client Simulator failed safely." });
      }
      return;
    }

    const { payload, enabledKeys } = validatedPayload;
    if (!enabledKeys.length) {
      sendJson(response, 200, {
        status: "skipped",
        overallPassed: null,
        summary: "No behavior expectations are enabled.",
        checks: [],
      });
      return;
    }
    if (typeof evaluator.isConfigured === "function" && !evaluator.isConfigured()) {
      sendJson(response, 503, { status: "unavailable", error: "Behavior evaluation is not configured." });
      return;
    }
    try {
      const evaluated = await evaluator.evaluate(payload);
      const validated = validateAiEvaluationResult(evaluated, enabledKeys, payload.messages.length);
      sendJson(response, 200, {
        status: "completed",
        ...validated,
        ...(typeof evaluated.model === "string" ? { model: evaluated.model } : {}),
        ...(evaluated.usage && typeof evaluated.usage === "object" ? { usage: evaluated.usage } : {}),
      });
    } catch (error) {
      if (error && error.code === "EVAL_UNCONFIGURED") {
        sendJson(response, 503, { status: "unavailable", error: "Behavior evaluation is not configured." });
        return;
      }
      if (error && error.code === "AI_TIMEOUT") {
        sendJson(response, 504, { status: "error", error: "Behavior evaluation timed out." });
        return;
      }
      if (error && typeof error.code === "string" && error.code.startsWith("AI_")) {
        sendJson(response, 502, { status: "error", error: "Behavior evaluation failed." });
        return;
      }
      sendJson(response, 502, { status: "error", error: "Behavior evaluation failed." });
    }
  };
}

function createServer(options = {}) {
  return http.createServer(createHandler(options));
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log("Chatbot Tester running at http://" + HOST + ":" + PORT);
    console.log("Serving static files from " + ROOT_DIR);
  });
}

module.exports = {
  EVALUATION_PATH,
  HOST,
  MAX_BODY_BYTES,
  SIMULATOR_CATALOG_PATH,
  SIMULATOR_TURN_PATH,
  createHandler,
  createServer,
  resolveRequestedFile,
};
