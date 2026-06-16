"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { randomUUID, randomBytes, createHash, timingSafeEqual } = require("crypto");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.resolve(__dirname, "dist");
const DATA_DIR = path.resolve(__dirname, "data");

// ── Supabase config (pipeline history) ───────────────────────────────────────
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || "https://qfgzenoyfeijmzxrkqkx.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_HOST = SUPABASE_URL.replace("https://", "");

// Steps que indicam que a tarefa está parada aguardando o cliente
const CLIENT_BLOCKING_STEPS = [
  "aprovação do cliente",
  "aprovação externa",
  "aguardando cliente",
  "aguardando aprovação",
  "aguardando insumo",
];

function isClientBlocking(step) {
  const s = (step || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return CLIENT_BLOCKING_STEPS.some(b =>
    s.includes(b.normalize("NFD").replace(/[̀-ͯ]/g, ""))
  );
}

const TOKENS_FILE = path.join(DATA_DIR, "nps_tokens.json");
const RESPONSES_FILE = path.join(DATA_DIR, "nps_responses.json");
const CYCLES_FILE = path.join(DATA_DIR, "nps_cycles.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const ALERTS_FILE = path.join(DATA_DIR, "alerts.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

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

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")); } catch { return {}; }
}
function saveConfig(d) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(d, null, 2), "utf-8"); }

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

// ── Pipeline history sync ─────────────────────────────────────────────────────

/** Faz uma chamada REST ao Supabase. Retorna o body parseado ou null. */
async function sbReq(method, table, body, qs) {
  const qStr = qs ? "?" + new URLSearchParams(qs).toString() : "";
  const bodyStr = body ? JSON.stringify(body) : null;

  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers["Prefer"] = "resolution=merge-duplicates,return=minimal";
  if (method === "PATCH") headers["Prefer"] = "return=minimal";
  if (bodyStr) headers["Content-Length"] = String(Buffer.byteLength(bodyStr));

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_HOST,
      port: 443,
      path: `/rest/v1/${table}${qStr}`,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(text ? JSON.parse(text) : null);
        } else {
          reject(new Error(`Supabase ${method} /${table}: ${res.statusCode} — ${text.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** Busca todas as linhas de uma tabela com paginação (até 100 k linhas). */
async function sbFetchAll(table, select) {
  const PAGE = 1000;
  let offset = 0;
  const all = [];
  while (true) {
    const rows = await sbReq("GET", table, null, {
      select,
      limit: String(PAGE),
      offset: String(offset),
    });
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/** Envia rows em lotes de `size` para não exceder o limite de payload. */
async function sbBatch(method, table, rows, size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    await sbReq(method, table, rows.slice(i, i + size));
  }
}

/**
 * Compara as tasks recém-buscadas contra os snapshots armazenados no Supabase.
 * Grava no Supabase apenas as mudanças de pipelineStep detectadas.
 *
 * Fluxo:
 *   1. Lê todos os snapshots existentes
 *   2. Para cada task:
 *      - nova: cria snapshot + primeira entrada no histórico
 *      - step mudou: fecha a entrada aberta + cria nova + atualiza snapshot
 *      - sem mudança: ignora
 *   3. Persiste tudo em batch
 */
async function syncPipelineHistory(tasks) {
  if (!SUPABASE_KEY) {
    console.log("[pipeline] SUPABASE_SERVICE_ROLE_KEY não configurado — histórico desabilitado.");
    return;
  }

  const now = new Date().toISOString();

  // 1. Carrega snapshots existentes
  const snapshots = await sbFetchAll("pipeline_snapshots", "task_id,pipeline_step");
  const snapshotMap = new Map(snapshots.map(s => [s.task_id, s.pipeline_step]));
  console.log(`[pipeline] ${snapshotMap.size} snapshots carregados, ${tasks.length} tasks para comparar.`);

  const newSnapshots = [];   // upsert
  const closedTaskIds = [];  // fechar entradas abertas
  const newHistory = [];     // novas entradas de histórico

  for (const task of tasks) {
    const step = task.pipelineStep || "";
    const prevStep = snapshotMap.get(task.taskID);

    if (prevStep === undefined) {
      // Task nova: snapshot + entrada inicial (entered_at = criação da tarefa)
      newSnapshots.push({ task_id: task.taskID, pipeline_step: step, updated_at: now });
      newHistory.push({
        task_id: task.taskID,
        pipeline_step: step,
        entered_at: task.creationDate || now,
        exited_at: task.closed ? (task.closeDate || now) : null,
        is_client_blocking: isClientBlocking(step),
      });
    } else if (prevStep !== step) {
      // Step mudou: fecha a entrada aberta e abre nova
      closedTaskIds.push(task.taskID);
      newSnapshots.push({ task_id: task.taskID, pipeline_step: step, updated_at: now });
      newHistory.push({
        task_id: task.taskID,
        pipeline_step: step,
        entered_at: now,
        exited_at: task.closed ? (task.closeDate || now) : null,
        is_client_blocking: isClientBlocking(step),
      });
    }
  }

  // 2. Fecha entradas abertas dos tasks que mudaram de step
  if (closedTaskIds.length) {
    // Processa em lotes de 200 IDs para não exceder o limite de URL
    const CLOSE_BATCH = 200;
    for (let i = 0; i < closedTaskIds.length; i += CLOSE_BATCH) {
      const ids = closedTaskIds.slice(i, i + CLOSE_BATCH).join(",");
      await sbReq("PATCH", `pipeline_history?task_id=in.(${ids})&exited_at=is.null`,
        { exited_at: now }
      );
    }
    console.log(`[pipeline] ${closedTaskIds.length} entradas abertas fechadas.`);
  }

  // 3. Upsert snapshots
  if (newSnapshots.length) {
    await sbBatch("POST", "pipeline_snapshots", newSnapshots);
    console.log(`[pipeline] ${newSnapshots.length} snapshots atualizados.`);
  }

  // 4. Insere novas entradas de histórico
  if (newHistory.length) {
    await sbBatch("POST", "pipeline_history", newHistory);
    console.log(`[pipeline] ${newHistory.length} novas entradas de histórico inseridas.`);
  }

  if (!newSnapshots.length && !closedTaskIds.length) {
    console.log("[pipeline] Nenhuma mudança de pipeline detectada.");
  }
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
  const apiKey = readConfig().taskrowApiKey || req.headers["__identifier"] || "";

  const chunks = [];
  req.on("data", (d) => chunks.push(d));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = {
      "host": "crtcomunicacao.taskrow.com",
      "content-type": req.headers["content-type"] || "application/json",
      "content-length": String(body.length),
      "__identifier": apiKey,
    };

    const proxyReq = https.request(
      {
        hostname: "crtcomunicacao.taskrow.com",
        port: 443,
        path: targetPath,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          "content-type": proxyRes.headers["content-type"] || "application/json",
          "access-control-allow-origin": "*",
        });
        proxyRes.pipe(res, { end: true });
      }
    );
    proxyReq.on("error", (err) => {
      console.error("[proxy]", err.message);
      if (!res.headersSent) sendJson(res, 502, { error: "Proxy error" });
    });
    proxyReq.write(body);
    proxyReq.end();
  });
}

// ── Analytics API ─────────────────────────────────────────────────────────────

const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 min
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
let analyticsCache = null; // { data, generatedAt }
let tasksFetchPromise = null; // previne fetches concorrentes

/**
 * Busca todas as tasks da Taskrow com paginação e salva em data/tasks.json.
 * Usa janela de 12 meses para dados históricos suficientes para a análise preditiva.
 * Deduplicado: se já há um fetch em andamento, aguarda o mesmo.
 */
function fetchTasksFromTaskrow(apiKey) {
  if (tasksFetchPromise) return tasksFetchPromise;

  tasksFetchPromise = new Promise((resolve, reject) => {
    const TASKROW_HOST = "crtcomunicacao.taskrow.com";
    const API_PATH = "/api/v2/search/tasks/advancedsearch";
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const allTasks = [];
    let offset = 0;

    const fetchPage = () => {
      const bodyStr = JSON.stringify({ StartDate: fmt(startDate), EndDate: fmt(endDate), Offset: offset });
      const req = https.request(
        {
          hostname: TASKROW_HOST,
          port: 443,
          path: API_PATH,
          method: "POST",
          headers: {
            "__identifier": apiKey,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
          },
        },
        (proxyRes) => {
          const chunks = [];
          proxyRes.on("data", (d) => chunks.push(d));
          proxyRes.on("end", () => {
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
              if (proxyRes.statusCode === 401 || proxyRes.statusCode === 403) {
                return reject(new Error("API key inválida ou sem permissão no Taskrow."));
              }
              const page = json.data || [];
              allTasks.push(...page);
              console.log(`[taskrow] offset=${offset} → ${page.length} tasks (total: ${allTasks.length})`);
              if (json.nextOffset && page.length >= 200) {
                offset = json.nextOffset;
                fetchPage();
              } else {
                fs.writeFileSync(TASKS_FILE, JSON.stringify(allTasks, null, 2), "utf-8");
                console.log(`[taskrow] Salvo ${allTasks.length} tasks em data/tasks.json`);
                analyticsCache = null; // invalida cache para forçar re-análise

                // Sync histórico de pipeline em background — nunca bloqueia o fluxo principal
                syncPipelineHistory(allTasks).catch(e =>
                  console.error("[pipeline] Sync falhou (não crítico):", e.message)
                );

                resolve(allTasks.length);
              }
            } catch (e) {
              reject(new Error(`Erro ao processar resposta da Taskrow: ${e.message}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    };

    fetchPage();
  }).finally(() => { tasksFetchPromise = null; });

  return tasksFetchPromise;
}

function runAnalyticsPipeline() {
  return new Promise((resolve, reject) => {
    const args = ["-m", "analytics.main", "--demands", TASKS_FILE];
    const npsFile = path.join(DATA_DIR, "nps_responses.json");
    if (fs.existsSync(npsFile)) args.push("--nps", npsFile);

    const stdoutChunks = [];
    const stderrChunks = [];
    const proc = spawn(path.join(__dirname, "venv/bin/python"), args, { cwd: __dirname });
    proc.stdout.on("data", (d) => stdoutChunks.push(d));
    proc.stderr.on("data", (d) => stderrChunks.push(d));
    proc.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code !== 0) return reject(new Error(`Pipeline analytics falhou (código ${code}): ${stderr}`));
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`Output do analytics não é JSON válido: ${e.message}`)); }
    });
    proc.on("error", reject);
  });
}

async function handleAnalyticsApi(req, res, urlPath, method) {
  // ── POST /api/config — salva API key no servidor ───────────────────────────
  if (urlPath === "/api/config" && method === "POST") {
    const body = await parseBody(req);
    const cfg = readConfig();
    if (body.taskrowApiKey !== undefined) {
      cfg.taskrowApiKey = body.taskrowApiKey;
      saveConfig(cfg);
      console.log("[config] API key do Taskrow atualizada.");
      // Se não tem tasks.json ainda, dispara fetch em background
      if (cfg.taskrowApiKey && !fs.existsSync(TASKS_FILE)) {
        fetchTasksFromTaskrow(cfg.taskrowApiKey).catch((e) =>
          console.error("[taskrow] Fetch background falhou:", e.message)
        );
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  // ── POST /api/analytics/refresh — força re-fetch da Taskrow + re-análise ──
  if (urlPath === "/api/analytics/refresh" && method === "POST") {
    analyticsCache = null;
    const body = await parseBody(req);
    const apiKey = body.apiKey || req.headers["x-taskrow-key"] || readConfig().taskrowApiKey || "";
    if (!apiKey) {
      return sendJson(res, 400, { error: "API key não configurada. Configure em Ajustes." });
    }
    // Salva key para uso futuro
    const cfg = readConfig();
    cfg.taskrowApiKey = apiKey;
    saveConfig(cfg);
    try {
      await fetchTasksFromTaskrow(apiKey);
    } catch (err) {
      console.error("[analytics] Refresh falhou:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ── GET /api/analytics ou retorno após refresh ─────────────────────────────
  if (urlPath === "/api/analytics" || urlPath === "/api/analytics/refresh") {
    const now = Date.now();
    if (analyticsCache && now - analyticsCache.generatedAt < ANALYTICS_CACHE_TTL) {
      return sendJson(res, 200, analyticsCache.data);
    }

    // Se tasks.json não existe, tenta buscar automaticamente com a key salva
    if (!fs.existsSync(TASKS_FILE)) {
      const storedKey = readConfig().taskrowApiKey;
      if (!storedKey) {
        return sendJson(res, 200, { needs_refresh: true, no_key: true });
      }
      console.log("[analytics] tasks.json ausente — buscando da Taskrow automaticamente...");
      try {
        await fetchTasksFromTaskrow(storedKey);
      } catch (err) {
        console.error("[analytics] Auto-fetch falhou:", err.message);
        return sendJson(res, 200, { needs_refresh: true, fetch_error: err.message });
      }
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

// Na inicialização: se já tem key salva mas não tem tasks.json → busca em background
{
  const cfg = readConfig();
  if (cfg.taskrowApiKey && !fs.existsSync(TASKS_FILE)) {
    console.log("[startup] Iniciando fetch de tasks da Taskrow em background...");
    fetchTasksFromTaskrow(cfg.taskrowApiKey).catch((e) =>
      console.error("[startup] Fetch inicial falhou:", e.message)
    );
  }
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

// ── Alertas de WhatsApp (tarefas atrasadas por área) ───────────────────────────

const DEFAULT_ALERTS = {
  auth: null, // { username, salt, passwordHash } — gerado no primeiro boot
  whatsapp: { phoneNumberId: "", accessToken: "", templateName: "", templateLang: "pt_BR" },
  schedule: { enabled: true, hour: 8, minute: 0, weekdaysOnly: true },
  responsaveis: [], // [{ area, name, phone }]
  lastRun: null,    // { at, dryRun, results: [{ area, count, status, detail }] }
  lastRunDate: null, // "YYYY-MM-DD" — evita disparo automático duplicado no dia
};

function readAlerts() {
  try {
    return { ...DEFAULT_ALERTS, ...JSON.parse(fs.readFileSync(ALERTS_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULT_ALERTS };
  }
}
function saveAlerts(d) { fs.writeFileSync(ALERTS_FILE, JSON.stringify(d, null, 2), "utf-8"); }

// ── Auth simples (sem dependências) ─────────────────────────────────────────────

const hashPassword = (password, salt) =>
  createHash("sha256").update(salt + password).digest("hex");

/** Gera login/senha no primeiro boot e devolve a senha em texto (uma única vez). */
function ensureAlertsAuth() {
  const alerts = readAlerts();
  if (alerts.auth && alerts.auth.passwordHash) return null;
  const username = "admin";
  const password = randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 12);
  const salt = randomBytes(16).toString("hex");
  alerts.auth = { username, salt, passwordHash: hashPassword(password, salt) };
  saveAlerts(alerts);
  console.log("\n========================================================");
  console.log("  ALERTAS WHATSAPP — credenciais de acesso geradas:");
  console.log(`  Login: ${username}`);
  console.log(`  Senha: ${password}`);
  console.log("  (guarde — só é exibida uma vez)");
  console.log("========================================================\n");
  return { username, password };
}

const sessions = new Map(); // token -> expiresAt (ms)
const SESSION_TTL = 12 * 60 * 60 * 1000; // 12h

function createSession() {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}
function validSession(token) {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}
function bearerToken(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}
function checkLogin(username, password) {
  const auth = readAlerts().auth;
  if (!auth) return false;
  if (username !== auth.username) return false;
  const got = Buffer.from(hashPassword(password, auth.salt));
  const want = Buffer.from(auth.passwordHash);
  return got.length === want.length && timingSafeEqual(got, want);
}

// ── Busca de usuários do Taskrow (mapa ownerUserID → área) ──────────────────────

function fetchUsersFromTaskrow(apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "crtcomunicacao.taskrow.com",
        port: 443,
        path: "/api/v1/User/ListUsers",
        method: "GET",
        headers: { "__identifier": apiKey, "Content-Type": "application/json" },
      },
      (proxyRes) => {
        const chunks = [];
        proxyRes.on("data", (d) => chunks.push(d));
        proxyRes.on("end", () => {
          try {
            if (proxyRes.statusCode === 401 || proxyRes.statusCode === 403) {
              return reject(new Error("API key inválida ou sem permissão no Taskrow."));
            }
            const users = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (Array.isArray(users)) fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
            resolve(Array.isArray(users) ? users : []);
          } catch (e) {
            reject(new Error(`Erro ao processar usuários da Taskrow: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Classificação de atraso (espelha src/lib/classifyTask.ts) ───────────────────

const CLIENT_APPROVAL_STEPS = ["aprovação do cliente", "aprovação externa"];

/** true se a tarefa está atrasada por culpa da CRT (não esperando o cliente). */
function isOverdueCRT(task) {
  if (task.closed) return false;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (!due) return false; // sem prazo = backlog, não conta como atraso
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due >= today) return false;
  const pipeline = (task.pipelineStep || "").toLowerCase();
  const tags = (task.tags || "").toLowerCase();
  // urgente/retrabalho/backlog têm precedência sobre atraso no app — espelhamos
  if (tags.includes("urgente") || pipeline.includes("urgente")) return false;
  if (tags.includes("retrabalho") || pipeline.includes("retrabalho")) return false;
  if (pipeline.includes("backlog") || pipeline.includes("aguardando")) return false;
  // atraso_cliente fica de fora — não é responsabilidade da área
  if (CLIENT_APPROVAL_STEPS.some((s) => pipeline.includes(s))) return false;
  return true;
}

/** Agrupa as tarefas atrasadas (CRT) por área usando o mapa ownerUserID→área. */
function buildOverdueByArea(tasks, users) {
  const userArea = new Map();
  users.forEach((u) => userArea.set(u.UserID, u.FunctionGroupName || "Sem Área"));
  const byArea = new Map(); // area -> tasks[]
  for (const t of tasks) {
    if (!isOverdueCRT(t)) continue;
    const area = userArea.get(t.ownerUserID) || "Sem Área";
    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push(t);
  }
  return byArea;
}

// ── Envio via WhatsApp Cloud API (Meta) ─────────────────────────────────────────

function sendWhatsAppTemplate(wa, phone, params) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: wa.templateName,
        language: { code: wa.templateLang || "pt_BR" },
        components: [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text: String(text) })),
          },
        ],
      },
    });
    const req = https.request(
      {
        hostname: "graph.facebook.com",
        port: 443,
        path: `/v20.0/${wa.phoneNumberId}/messages`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${wa.accessToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(text);
          let msg = text.slice(0, 300);
          try { msg = JSON.parse(text).error?.message || msg; } catch {}
          reject(new Error(`Meta API ${res.statusCode}: ${msg}`));
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Parâmetro de template não aceita quebra de linha/tab — sanitiza p/ uma linha. */
function sanitizeParam(s) {
  return String(s).replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
}

function buildTaskList(tasks, max = 8) {
  const titles = tasks.slice(0, max).map((t) => t.taskTitle || `#${t.taskNumber}`);
  let list = titles.join(" · ");
  if (tasks.length > max) list += ` (+${tasks.length - max})`;
  return sanitizeParam(list) || "—";
}

/**
 * Núcleo do job: lê tarefas/usuários, agrupa atrasadas por área e envia (ou
 * apenas pré-visualiza, em dryRun) o resumo para o responsável de cada área.
 */
async function runOverdueAlerts({ dryRun = false } = {}) {
  const alerts = readAlerts();
  const apiKey = readConfig().taskrowApiKey;
  if (!apiKey) throw new Error("API key do Taskrow não configurada (aba Configurações).");

  // 1. Atualiza tarefas (reutiliza fetch paginado) + usuários
  await fetchTasksFromTaskrow(apiKey);
  const tasks = readJSON(TASKS_FILE);
  const users = await fetchUsersFromTaskrow(apiKey);

  // 2. Agrupa atrasadas por área
  const byArea = buildOverdueByArea(tasks, users);

  // 3. Para cada responsável configurado, monta e envia o resumo
  const results = [];
  for (const r of alerts.responsaveis) {
    const overdue = byArea.get(r.area) || [];
    if (!r.phone || !r.name) {
      results.push({ area: r.area, count: overdue.length, status: "skipped", detail: "sem responsável/telefone" });
      continue;
    }
    if (overdue.length === 0) {
      results.push({ area: r.area, count: 0, status: "skipped", detail: "nenhuma atrasada" });
      continue;
    }
    const params = [sanitizeParam(r.area), String(overdue.length), buildTaskList(overdue)];
    const preview = `Bom dia! ⚠️ A área ${params[0]} tem ${params[1]} tarefa(s) atrasada(s): ${params[2]}.`;
    if (dryRun) {
      results.push({ area: r.area, count: overdue.length, status: "preview", detail: preview, phone: r.phone });
      continue;
    }
    const wa = alerts.whatsapp;
    if (!wa.phoneNumberId || !wa.accessToken || !wa.templateName) {
      results.push({ area: r.area, count: overdue.length, status: "error", detail: "credenciais do WhatsApp (Meta) incompletas" });
      continue;
    }
    try {
      await sendWhatsAppTemplate(wa, r.phone, params);
      results.push({ area: r.area, count: overdue.length, status: "sent", detail: `enviado p/ ${r.name}` });
    } catch (e) {
      results.push({ area: r.area, count: overdue.length, status: "error", detail: e.message });
    }
  }

  const fresh = readAlerts();
  fresh.lastRun = { at: new Date().toISOString(), dryRun, results };
  if (!dryRun) fresh.lastRunDate = new Date().toISOString().slice(0, 10);
  saveAlerts(fresh);
  return results;
}

// ── Alertas API ─────────────────────────────────────────────────────────────────

function maskedWhatsapp(wa) {
  return { ...wa, accessToken: wa.accessToken ? "••••••••" : "" };
}

async function handleAlertsApi(req, res, urlPath, method) {
  // POST /api/alerts/login — público
  if (urlPath === "/api/alerts/login" && method === "POST") {
    const body = await parseBody(req);
    if (!checkLogin(String(body.username || ""), String(body.password || ""))) {
      return sendJson(res, 401, { error: "Usuário ou senha inválidos." });
    }
    return sendJson(res, 200, { token: createSession() });
  }

  // Demais endpoints exigem sessão válida
  if (!validSession(bearerToken(req))) {
    return sendJson(res, 401, { error: "Não autenticado." });
  }

  // GET /api/alerts/config
  if (urlPath === "/api/alerts/config" && method === "GET") {
    const a = readAlerts();
    return sendJson(res, 200, {
      responsaveis: a.responsaveis,
      whatsapp: maskedWhatsapp(a.whatsapp),
      schedule: a.schedule,
      lastRun: a.lastRun,
    });
  }

  // POST /api/alerts/config — salva responsáveis / whatsapp / schedule
  if (urlPath === "/api/alerts/config" && method === "POST") {
    const body = await parseBody(req);
    const a = readAlerts();
    if (Array.isArray(body.responsaveis)) {
      a.responsaveis = body.responsaveis.map((r) => ({
        area: String(r.area || ""),
        name: String(r.name || ""),
        phone: String(r.phone || "").replace(/\D/g, ""),
      }));
    }
    if (body.whatsapp) {
      const w = body.whatsapp;
      a.whatsapp = {
        phoneNumberId: String(w.phoneNumberId ?? a.whatsapp.phoneNumberId),
        // não sobrescreve o token se vier mascarado
        accessToken: w.accessToken && !w.accessToken.includes("••") ? String(w.accessToken) : a.whatsapp.accessToken,
        templateName: String(w.templateName ?? a.whatsapp.templateName),
        templateLang: String(w.templateLang ?? a.whatsapp.templateLang),
      };
    }
    if (body.schedule) {
      a.schedule = {
        enabled: !!body.schedule.enabled,
        hour: Math.max(0, Math.min(23, Number(body.schedule.hour) || 0)),
        minute: Math.max(0, Math.min(59, Number(body.schedule.minute) || 0)),
        weekdaysOnly: !!body.schedule.weekdaysOnly,
      };
    }
    saveAlerts(a);
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/alerts/areas — áreas com contagem atual de atrasadas (CRT)
  if (urlPath === "/api/alerts/areas" && method === "GET") {
    const tasks = readJSON(TASKS_FILE);
    let users = readJSON(USERS_FILE);
    if (!Array.isArray(users) || !users.length) {
      const apiKey = readConfig().taskrowApiKey;
      if (apiKey) { try { users = await fetchUsersFromTaskrow(apiKey); } catch {} }
    }
    const byArea = buildOverdueByArea(Array.isArray(tasks) ? tasks : [], Array.isArray(users) ? users : []);
    const areas = Array.from(byArea.entries())
      .map(([area, list]) => ({ area, overdue: list.length }))
      .sort((a, b) => b.overdue - a.overdue);
    return sendJson(res, 200, { areas });
  }

  // POST /api/alerts/run?dryRun=1 — dispara agora (ou pré-visualiza)
  if (urlPath === "/api/alerts/run" && method === "POST") {
    const dryRun = /[?&]dryRun=1\b/.test(req.url || "");
    try {
      const results = await runOverdueAlerts({ dryRun });
      return sendJson(res, 200, { ok: true, dryRun, results });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: "Endpoint não encontrado" });
}

// ── Agendador (sem dependências) ────────────────────────────────────────────────

function alertsScheduleTick() {
  const a = readAlerts();
  if (!a.schedule?.enabled) return;
  const now = new Date();
  if (a.schedule.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return;
  if (now.getHours() !== a.schedule.hour || now.getMinutes() !== a.schedule.minute) return;
  const todayStr = now.toISOString().slice(0, 10);
  if (a.lastRunDate === todayStr) return; // já rodou hoje
  console.log(`[alertas] Disparo automático agendado (${todayStr} ${a.schedule.hour}:${a.schedule.minute})...`);
  runOverdueAlerts({ dryRun: false })
    .then((r) => console.log(`[alertas] Concluído: ${r.length} áreas processadas.`))
    .catch((e) => console.error("[alertas] Disparo automático falhou:", e.message));
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? "/";
  const urlPath = rawUrl.split("?")[0];
  const method = (req.method ?? "GET").toUpperCase();

  try {
    // Config API (API key server-side)
    if (urlPath === "/api/config") {
      await handleAnalyticsApi(req, res, urlPath, method);
      return;
    }

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

    // Alertas (WhatsApp) API
    if (urlPath.startsWith("/api/alerts")) {
      await handleAlertsApi(req, res, urlPath, method);
      return;
    }

    // Taskrow reverse-proxy
    if (urlPath.startsWith("/taskrow-api")) {
      proxyTaskrow(req, res, rawUrl);
      return;
    }

    // Static files — serve from dist root, SPA fallback to index.html
    const filePath = path.join(DIST_DIR, urlPath);
    if (urlPath !== "/" && serveFile(res, filePath)) return;
    serveFile(res, path.join(DIST_DIR, "index.html"));
  } catch (err) {
    console.error("[server]", err);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
  }
});

server.setTimeout(10 * 60 * 1000); // 10 min — fetch paginado da Taskrow pode demorar
server.listen(PORT, () => {
  console.log(`CRTTask running on http://localhost:${PORT}`);
  // Garante credenciais de acesso à aba de Alertas (exibe senha 1x no boot)
  ensureAlertsAuth();
  // Agendador de alertas — checa a cada 60s se está na hora do disparo diário
  setInterval(alertsScheduleTick, 60 * 1000);
});
