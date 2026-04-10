import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { IncomingMessage, ServerResponse } from "http";

// ─── NPS Types ────────────────────────────────────────────────────────────────

interface NpsToken {
  clientId: string;
  clientName: string;
  token: string;
  label: string;
  createdAt: string;
}
interface NpsCycle {
  id: string;
  clientId: string;
  label: string;
  startedAt: string;
  closedAt: string | null;
}
interface NpsResponse {
  id: string;
  clientId: string;
  clientName: string;
  token: string;
  cycleId: string | null;
  cycleLabel: string | null;
  answers: Record<string, number | string>;
  createdAt: string;
}

// ─── NPS File Helpers ─────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const TOKENS_FILE = path.join(DATA_DIR, "nps_tokens.json");
const RESPONSES_FILE = path.join(DATA_DIR, "nps_responses.json");
const CYCLES_FILE = path.join(DATA_DIR, "nps_cycles.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, "[]", "utf-8");
  if (!fs.existsSync(RESPONSES_FILE)) fs.writeFileSync(RESPONSES_FILE, "[]", "utf-8");
  if (!fs.existsSync(CYCLES_FILE)) fs.writeFileSync(CYCLES_FILE, "[]", "utf-8");
}

const readTokens = (): NpsToken[] => { try { return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8")); } catch { return []; } };
const readResponses = (): NpsResponse[] => { try { return JSON.parse(fs.readFileSync(RESPONSES_FILE, "utf-8")); } catch { return []; } };
const readCycles = (): NpsCycle[] => { try { return JSON.parse(fs.readFileSync(CYCLES_FILE, "utf-8")); } catch { return []; } };

const saveTokens = (d: NpsToken[]) => fs.writeFileSync(TOKENS_FILE, JSON.stringify(d, null, 2), "utf-8");
const saveResponses = (d: NpsResponse[]) => fs.writeFileSync(RESPONSES_FILE, JSON.stringify(d, null, 2), "utf-8");
const saveCycles = (d: NpsCycle[]) => fs.writeFileSync(CYCLES_FILE, JSON.stringify(d, null, 2), "utf-8");

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function currentQuarterLabel(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}/${now.getFullYear()}`;
}

// ─── NPS Vite Plugin ──────────────────────────────────────────────────────────

function npsApiPlugin() {
  return {
    name: "nps-api",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const method = req.method ?? "GET";

        if (!url.startsWith("/api/nps")) return next();

        ensureDataFiles();

        // ── Tokens ──────────────────────────────────────────────────────────

        if (url === "/api/nps/tokens" && method === "GET") {
          return send(res, 200, readTokens());
        }

        if (url === "/api/nps/token" && method === "POST") {
          const body = await parseBody(req);
          const clientId = String(body.clientId ?? "");
          const clientName = String(body.clientName ?? "");
          const label = String(body.label ?? currentQuarterLabel());
          if (!clientId) return send(res, 400, { error: "clientId obrigatório" });

          const tokens = readTokens();
          const record: NpsToken = { clientId, clientName, token: randomUUID(), label, createdAt: new Date().toISOString() };
          tokens.push(record);
          saveTokens(tokens);
          return send(res, 200, record);
        }

        // DELETE /api/nps/token/:token
        const deleteMatch = url.match(/^\/api\/nps\/token\/([^/?]+)$/);
        if (deleteMatch && method === "DELETE") {
          const tokenValue = deleteMatch[1];
          const tokens = readTokens().filter((t: NpsToken) => t.token !== tokenValue);
          saveTokens(tokens);
          return send(res, 200, { ok: true });
        }

        // ── Cycles ──────────────────────────────────────────────────────────

        // GET /api/nps/cycles/:clientId
        const cyclesMatch = url.match(/^\/api\/nps\/cycles\/([^/?]+)$/);
        if (cyclesMatch && method === "GET") {
          const clientId = cyclesMatch[1];
          const cycles = readCycles().filter((c) => c.clientId === clientId);
          return send(res, 200, cycles);
        }

        // POST /api/nps/cycles — start new cycle (auto-closes previous)
        if (url === "/api/nps/cycles" && method === "POST") {
          const body = await parseBody(req);
          const clientId = String(body.clientId ?? "");
          if (!clientId) return send(res, 400, { error: "clientId obrigatório" });

          const cycles = readCycles();
          const now = new Date().toISOString();

          // Close any open cycle for this client
          cycles.forEach((c) => {
            if (c.clientId === clientId && !c.closedAt) c.closedAt = now;
          });

          const newCycle: NpsCycle = {
            id: randomUUID(),
            clientId,
            label: currentQuarterLabel(),
            startedAt: now,
            closedAt: null,
          };
          cycles.push(newCycle);
          saveCycles(cycles);
          return send(res, 201, newCycle);
        }

        // POST /api/nps/cycles/:id/close
        const closeMatch = url.match(/^\/api\/nps\/cycles\/([^/?]+)\/close$/);
        if (closeMatch && method === "POST") {
          const cycleId = closeMatch[1];
          const cycles = readCycles();
          const cycle = cycles.find((c) => c.id === cycleId);
          if (!cycle) return send(res, 404, { error: "Ciclo não encontrado" });
          cycle.closedAt = new Date().toISOString();
          saveCycles(cycles);
          return send(res, 200, cycle);
        }

        // ── Respond ─────────────────────────────────────────────────────────

        const respondMatch = url.match(/^\/api\/nps\/respond\/([^/?]+)/);
        if (respondMatch) {
          const tokenValue = respondMatch[1];
          const tokens = readTokens();
          const record = tokens.find((t) => t.token === tokenValue);

          if (method === "GET") {
            if (!record) return send(res, 404, { error: "Token inválido ou expirado." });
            // Include active cycle info for the form
            const activeCycle = readCycles().find(
              (c) => c.clientId === record.clientId && !c.closedAt
            ) ?? null;
            return send(res, 200, { ...record, activeCycle });
          }

          if (method === "POST") {
            if (!record) return send(res, 404, { error: "Token inválido ou expirado." });
            const body = await parseBody(req);
            const answers = (body.answers ?? {}) as Record<string, number | string>;

            // Tag with active cycle (if any)
            const activeCycle = readCycles().find(
              (c) => c.clientId === record.clientId && !c.closedAt
            ) ?? null;

            const entry: NpsResponse = {
              id: randomUUID(),
              clientId: record.clientId,
              clientName: record.clientName,
              token: tokenValue,
              cycleId: activeCycle?.id ?? null,
              cycleLabel: activeCycle?.label ?? null,
              answers,
              createdAt: new Date().toISOString(),
            };
            const responses = readResponses();
            responses.push(entry);
            saveResponses(responses);
            return send(res, 201, { ok: true });
          }
        }

        // ── Results ─────────────────────────────────────────────────────────

        const resultsMatch = url.match(/^\/api\/nps\/results\/([^/?]+)/);
        if (resultsMatch && method === "GET") {
          const clientId = resultsMatch[1];
          return send(res, 200, readResponses().filter((r) => r.clientId === clientId));
        }

        return send(res, 404, { error: "Endpoint não encontrado" });
      });
    },
  };
}

// ─── Analytics Plugin ─────────────────────────────────────────────────────────

const ANALYTICS_TTL = 5 * 60 * 1000;
let analyticsCache: { data: unknown; ts: number } | null = null;

function runAnalyticsPipeline(cwd: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tasksFile = path.join(cwd, "data", "tasks.json");
    const npsFile = path.join(cwd, "data", "nps_responses.json");
    const args = ["-m", "analytics.main"];
    if (fs.existsSync(tasksFile)) {
      args.push("--demands", tasksFile);
    } else {
      args.push("--synthetic");
    }
    if (fs.existsSync(npsFile)) args.push("--nps", npsFile);

    console.log("[analytics] spawn:", "python3", args.join(" "), "| cwd:", cwd);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const proc = spawn("python3", args, { cwd });
    proc.stdout.on("data", (d: Buffer) => stdoutChunks.push(d));
    proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d));
    proc.on("close", (code: number) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      console.log("[analytics] exit:", code, "| stdout bytes:", Buffer.concat(stdoutChunks).length);
      if (code !== 0) return reject(new Error(`Python saiu com código ${code}:\n${stderr.slice(0, 500)}`));
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`Output não é JSON válido: ${(e as Error).message}`)); }
    });
    proc.on("error", (e: Error) => {
      console.log("[analytics] spawn error:", e.message);
      reject(new Error(`Falha ao iniciar python3: ${e.message}`));
    });
  });
}

function analyticsApiPlugin() {
  const cwd = process.cwd();
  return {
    name: "analytics-api",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const method = req.method ?? "GET";

        if (url.includes("analytics")) {
          console.log("[analytics-mw] recebido:", method, JSON.stringify(url), "headersSent:", res.headersSent);
        }

        if (!url.startsWith("/api/analytics")) return next();

        if (url === "/api/analytics/refresh" && method === "POST") {
          analyticsCache = null;
        }

        if (url === "/api/analytics" || url === "/api/analytics/refresh") {
          const now = Date.now();
          if (analyticsCache && now - analyticsCache.ts < ANALYTICS_TTL) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify(analyticsCache.data));
          }
          try {
            const data = await runAnalyticsPipeline(cwd);
            analyticsCache = { data, ts: Date.now() };
            const body = JSON.stringify(data);
            console.log("[analytics-mw] enviando 200, headersSent:", res.headersSent, "bytes:", body.length);
            if (!res.headersSent) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Content-Length", Buffer.byteLength(body));
              res.end(body);
            }
            return;
          } catch (err) {
            console.log("[analytics-mw] erro:", (err as Error).message);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: (err as Error).message }));
            }
            return;
          }
        }

        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not found" }));
      });
    },
  };
}

// ─── Vite Config ──────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  base: "/v2/",

  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
    proxy: {
      "/v2/taskrow-api": {
        target: "https://crtcomunicacao.taskrow.com",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/v2\/taskrow-api/, ""),
      },
    },
  },

  plugins: [
    react(),
    npsApiPlugin(),
    analyticsApiPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
