"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = path.resolve(__dirname, "dist");
const DATA_DIR = path.resolve(__dirname, "data");

const TOKENS_FILE = path.join(DATA_DIR, "nps_tokens.json");
const RESPONSES_FILE = path.join(DATA_DIR, "nps_responses.json");
const CYCLES_FILE = path.join(DATA_DIR, "nps_cycles.json");

// ── Data helpers ──────────────────────────────────────────────────────────────

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, "[]", "utf-8");
  if (!fs.existsSync(RESPONSES_FILE)) fs.writeFileSync(RESPONSES_FILE, "[]", "utf-8");
  if (!fs.existsSync(CYCLES_FILE)) fs.writeFileSync(CYCLES_FILE, "[]", "utf-8");
}
ensureDataFiles();

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return []; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2), "utf-8");

const readTokens = () => readJSON(TOKENS_FILE);
const readResponses = () => readJSON(RESPONSES_FILE);
const readCycles = () => readJSON(CYCLES_FILE);
const saveTokens = (d) => writeJSON(TOKENS_FILE, d);
const saveResponses = (d) => writeJSON(RESPONSES_FILE, d);
const saveCycles = (d) => writeJSON(CYCLES_FILE, d);

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function currentQuarterLabel() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}/${now.getFullYear()}`;
}

// ── Static file serving ───────────────────────────────────────────────────────

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const stat = fs.statSync(filePath);
  res.writeHead(200, { "Content-Type": mime, "Content-Length": stat.size });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ── Taskrow proxy ─────────────────────────────────────────────────────────────

function proxyTaskrow(req, res, rawUrl) {
  const targetPath = rawUrl.replace(/^\/taskrow-api/, "") || "/";
  const headers = Object.assign({}, req.headers, { host: "crtcomunicacao.taskrow.com" });
  delete headers["content-length"];

  const proxyReq = https.request(
    {
      hostname: "crtcomunicacao.taskrow.com",
      port: 443,
      path: targetPath,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on("error", (err) => {
    console.error("[proxy]", err.message);
    if (!res.headersSent) sendJson(res, 502, { error: "Proxy error" });
  });
  req.pipe(proxyReq, { end: true });
}

// ── Analytics API ─────────────────────────────────────────────────────────────

const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 min
let analyticsCache = null; // { data, generatedAt }

function runAnalyticsPipeline() {
  return new Promise((resolve, reject) => {
    const tasksFile = path.join(DATA_DIR, "tasks.json");
    const args = ["-m", "analytics.main"];
    if (fs.existsSync(tasksFile)) {
      args.push("--demands", tasksFile);
    } else {
      args.push("--synthetic");
    }
    const npsFile = path.join(DATA_DIR, "nps_responses.json");
    if (fs.existsSync(npsFile)) {
      args.push("--nps", npsFile);
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    const proc = spawn("python3", args, { cwd: __dirname });
    proc.stdout.on("data", (d) => stdoutChunks.push(d));
    proc.stderr.on("data", (d) => stderrChunks.push(d));
    proc.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code !== 0) return reject(new Error(`Analytics process exited ${code}: ${stderr}`));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Analytics output is not valid JSON: ${e.message}`));
      }
    });
    proc.on("error", reject);
  });
}

async function handleAnalyticsApi(req, res, urlPath, method) {
  // POST /api/analytics/refresh — força re-execução
  if (urlPath === "/api/analytics/refresh" && method === "POST") {
    analyticsCache = null;
  }

  if (urlPath === "/api/analytics" || urlPath === "/api/analytics/refresh") {
    const now = Date.now();
    if (analyticsCache && now - analyticsCache.generatedAt < ANALYTICS_CACHE_TTL) {
      return sendJson(res, 200, analyticsCache.data);
    }
    try {
      const data = await runAnalyticsPipeline();
      analyticsCache = { data, generatedAt: now };
      return sendJson(res, 200, data);
    } catch (err) {
      console.error("[analytics]", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: "Endpoint não encontrado" });
}

// ── NPS API ───────────────────────────────────────────────────────────────────

async function handleNpsApi(req, res, urlPath, method) {
  // GET /api/nps/tokens
  if (urlPath === "/api/nps/tokens" && method === "GET") {
    return sendJson(res, 200, readTokens());
  }

  // POST /api/nps/token — always creates a new token
  if (urlPath === "/api/nps/token" && method === "POST") {
    const body = await parseBody(req);
    const clientId = String(body.clientId ?? "");
    const clientName = String(body.clientName ?? "");
    const label = String(body.label ?? currentQuarterLabel());
    if (!clientId) return sendJson(res, 400, { error: "clientId obrigatório" });

    const tokens = readTokens();
    const record = { clientId, clientName, token: randomUUID(), label, createdAt: new Date().toISOString() };
    tokens.push(record);
    saveTokens(tokens);
    return sendJson(res, 200, record);
  }

  // DELETE /api/nps/token/:token
  const deleteMatch = urlPath.match(/^\/api\/nps\/token\/([^/?]+)$/);
  if (deleteMatch && method === "DELETE") {
    const tokenValue = deleteMatch[1];
    saveTokens(readTokens().filter((t) => t.token !== tokenValue));
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/nps/cycles/:clientId
  const cyclesMatch = urlPath.match(/^\/api\/nps\/cycles\/([^/?]+)$/);
  if (cyclesMatch && method === "GET") {
    return sendJson(res, 200, readCycles().filter((c) => c.clientId === cyclesMatch[1]));
  }

  // POST /api/nps/cycles
  if (urlPath === "/api/nps/cycles" && method === "POST") {
    const body = await parseBody(req);
    const clientId = String(body.clientId ?? "");
    if (!clientId) return sendJson(res, 400, { error: "clientId obrigatório" });
    const cycles = readCycles();
    const now = new Date().toISOString();
    cycles.forEach((c) => { if (c.clientId === clientId && !c.closedAt) c.closedAt = now; });
    const newCycle = { id: randomUUID(), clientId, label: currentQuarterLabel(), startedAt: now, closedAt: null };
    cycles.push(newCycle);
    saveCycles(cycles);
    return sendJson(res, 201, newCycle);
  }

  // POST /api/nps/cycles/:id/close
  const closeMatch = urlPath.match(/^\/api\/nps\/cycles\/([^/?]+)\/close$/);
  if (closeMatch && method === "POST") {
    const cycles = readCycles();
    const cycle = cycles.find((c) => c.id === closeMatch[1]);
    if (!cycle) return sendJson(res, 404, { error: "Ciclo não encontrado" });
    cycle.closedAt = new Date().toISOString();
    saveCycles(cycles);
    return sendJson(res, 200, cycle);
  }

  // GET or POST /api/nps/respond/:token
  const respondMatch = urlPath.match(/^\/api\/nps\/respond\/([^/?]+)/);
  if (respondMatch) {
    const tokenValue = respondMatch[1];
    const tokens = readTokens();
    const record = tokens.find((t) => t.token === tokenValue);

    if (method === "GET") {
      if (!record) return sendJson(res, 404, { error: "Token inválido ou expirado." });
      const activeCycle = readCycles().find((c) => c.clientId === record.clientId && !c.closedAt) ?? null;
      return sendJson(res, 200, { ...record, activeCycle });
    }

    if (method === "POST") {
      if (!record) return sendJson(res, 404, { error: "Token inválido ou expirado." });
      const body = await parseBody(req);
      const answers = body.answers ?? {};
      const activeCycle = readCycles().find((c) => c.clientId === record.clientId && !c.closedAt) ?? null;
      const entry = {
        id: randomUUID(),
        clientId: record.clientId,
        clientName: record.clientName,
        token: tokenValue,
        cycleId: activeCycle ? activeCycle.id : null,
        cycleLabel: activeCycle ? activeCycle.label : null,
        answers,
        createdAt: new Date().toISOString(),
      };
      const responses = readResponses();
      responses.push(entry);
      saveResponses(responses);
      return sendJson(res, 201, { ok: true });
    }
  }

  // GET /api/nps/results/:clientId
  const resultsMatch = urlPath.match(/^\/api\/nps\/results\/([^/?]+)/);
  if (resultsMatch && method === "GET") {
    return sendJson(res, 200, readResponses().filter((r) => r.clientId === resultsMatch[1]));
  }

  return sendJson(res, 404, { error: "Endpoint não encontrado" });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? "/";
  const urlPath = rawUrl.split("?")[0];
  const method = (req.method ?? "GET").toUpperCase();

  try {
    // Analytics API
    if (urlPath.startsWith("/api/analytics")) {
      await handleAnalyticsApi(req, res, urlPath, method);
      return;
    }

    // NPS API
    if (urlPath.startsWith("/api/nps")) {
      await handleNpsApi(req, res, urlPath, method);
      return;
    }

    // Taskrow reverse-proxy
    if (urlPath.startsWith("/taskrow-api")) {
      proxyTaskrow(req, res, rawUrl);
      return;
    }

    // Static files under /v2/
    if (urlPath.startsWith("/v2/")) {
      const rel = urlPath.slice(4); // strip leading /v2/
      if (rel && rel !== "/") {
        const filePath = path.join(DIST_DIR, rel);
        if (serveFile(res, filePath)) return;
      }
      // SPA fallback → index.html
      serveFile(res, path.join(DIST_DIR, "index.html"));
      return;
    }

    // Root redirect
    if (urlPath === "/" || urlPath === "") {
      res.writeHead(302, { Location: "/v2/" });
      res.end();
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[server]", err);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`CRTTask running on http://localhost:${PORT}`);
});
