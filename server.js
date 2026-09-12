const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function resolveRequestedFile(requestUrl) {
  let pathname;

  try {
    pathname = new URL(requestUrl, "http://localhost").pathname;
    pathname = decodeURIComponent(pathname);
  } catch (error) {
    return null;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const requestedPath = path.resolve(ROOT_DIR, "." + pathname);
  const rootWithSeparator = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;

  if (requestedPath !== ROOT_DIR && !requestedPath.startsWith(rootWithSeparator)) {
    return null;
  }

  return requestedPath;
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method Not Allowed");
    return;
  }

  const filePath = resolveRequestedFile(request.url || "/");

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
        if (!response.headersSent) {
          sendText(response, 500, "Internal Server Error");
        } else {
          response.destroy();
        }
      })
      .pipe(response);
  });
});

server.listen(PORT, HOST, () => {
  console.log("Chatbot Tester running at http://localhost:" + PORT);
  console.log("Serving static files from " + ROOT_DIR);
});
