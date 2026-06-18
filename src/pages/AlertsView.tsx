import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Lock, Clock, Send, Eye, Save, LogOut, Loader2, MessagesSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "@/hooks/use-toast";

const TOKEN_KEY = "alerts_token";

interface Responsavel { area: string; name: string; email: string; webhookUrl: string; }
interface ScheduleCfg { enabled: boolean; hour: number; minute: number; weekdaysOnly: boolean; }
interface RunResult { area: string; count: number; status: string; detail: string; }
interface LastRun { at: string; dryRun: boolean; results: RunResult[]; }

type RowField = "name" | "email" | "webhookUrl";

export default function AlertsView() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");

  if (!token) {
    return <LoginForm onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }
  return <AlertsDashboard token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); }} />;
}

// ── Login ───────────────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/alerts/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no login");
      onLogin(data.token);
    } catch (e: any) {
      toast({ title: "Não foi possível entrar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Alertas no Teams</CardTitle>
          <CardDescription>Acesso restrito. Entre com login e senha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="u">Usuário</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p">Senha</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <Button className="w-full" onClick={submit} disabled={loading || !username || !password}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────────

function AlertsDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<"" | "preview" | "send">("");
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [areas, setAreas] = useState<{ area: string; overdue: number }[]>([]);
  const [schedule, setSchedule] = useState<ScheduleCfg>({ enabled: true, hour: 8, minute: 0, weekdaysOnly: true });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (res.status === 401) { onLogout(); throw new Error("Sessão expirada. Entre novamente."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || "Erro na requisição");
    return data;
  }, [token, onLogout]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ar] = await Promise.all([api("/api/alerts/config"), api("/api/alerts/areas")]);
      setResponsaveis(cfg.responsaveis || []);
      setSchedule(cfg.schedule || { enabled: true, hour: 8, minute: 0, weekdaysOnly: true });
      setLastRun(cfg.lastRun || null);
      setAreas(ar.areas || []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Linhas editáveis = união de áreas detectadas + responsáveis já cadastrados
  const rows = useMemo(() => {
    const map = new Map<string, Responsavel & { overdue: number }>();
    areas.forEach((a) => map.set(a.area, { area: a.area, name: "", email: "", webhookUrl: "", overdue: a.overdue }));
    responsaveis.forEach((r) => {
      const prev = map.get(r.area);
      map.set(r.area, { ...r, overdue: prev?.overdue ?? 0 });
    });
    return Array.from(map.values()).sort((a, b) => b.overdue - a.overdue || a.area.localeCompare(b.area));
  }, [areas, responsaveis]);

  const setRow = (area: string, field: RowField, value: string) => {
    setResponsaveis((prev) => {
      const idx = prev.findIndex((r) => r.area === area);
      if (idx === -1) return [...prev, { area, name: "", email: "", webhookUrl: "", [field]: value } as Responsavel];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };
  const rowValue = (area: string, field: RowField) =>
    responsaveis.find((r) => r.area === area)?.[field] ?? "";

  const saveConfig = async () => {
    setSaving(true);
    try {
      const cleaned = responsaveis.filter((r) => r.name.trim() || r.email.trim() || r.webhookUrl.trim());
      await api("/api/alerts/config", { method: "POST", body: JSON.stringify({ responsaveis: cleaned, schedule }) });
      toast({ title: "Configurações salvas" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const run = async (dryRun: boolean) => {
    setRunning(dryRun ? "preview" : "send");
    try {
      const data = await api(`/api/alerts/run${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
      setLastRun({ at: new Date().toISOString(), dryRun, results: data.results || [] });
      toast({ title: dryRun ? "Pré-visualização gerada" : "Disparo concluído" });
    } catch (e: any) {
      toast({ title: "Falha ao executar", description: e.message, variant: "destructive" });
    } finally {
      setRunning("");
    }
  };

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "ALERTAS"]} title="Alertas no Teams" subtitle="Avisos diários de tarefas atrasadas por área">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </PageHeader>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : (
        <div className="space-y-6">
          {/* Como conectar o Teams */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><MessagesSquare className="h-4 w-4 text-primary" /> Como conectar cada canal do Teams</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>1. No Teams, no canal da área, clique em <b>•••</b> → <b>Fluxos de Trabalho</b> (Workflows).</p>
              <p>2. Escolha o modelo <b>"Postar em um canal quando uma solicitação de webhook for recebida"</b>.</p>
              <p>3. Conclua e copie a <b>URL gerada</b> — cole na coluna <b>Webhook do canal</b> abaixo.</p>
              <p>4. No campo <b>E-mail</b>, use o e-mail corporativo (Microsoft 365) do responsável para que ele seja <b>@mencionado</b>.</p>
              <p className="pt-1 text-xs">É gratuito (incluso no Microsoft 365) — não usa a API paga do WhatsApp.</p>
            </CardContent>
          </Card>

          {/* Responsáveis por área */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" /> Responsáveis por área</CardTitle>
              <CardDescription>Cada área posta no seu próprio canal e marca o responsável.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ÁREA</TableHead>
                    <TableHead className="text-center">ATRASADAS HOJE</TableHead>
                    <TableHead>RESPONSÁVEL</TableHead>
                    <TableHead>E-MAIL (MENÇÃO)</TableHead>
                    <TableHead>WEBHOOK DO CANAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma área detectada ainda. Garanta que o Taskrow está conectado em Configurações.</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.area}>
                      <TableCell className="font-medium">{r.area}</TableCell>
                      <TableCell className="text-center">
                        {r.overdue > 0
                          ? <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-xs font-bold text-destructive">{r.overdue}</span>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell>
                        <Input value={rowValue(r.area, "name")} onChange={(e) => setRow(r.area, "name", e.target.value)} placeholder="Nome" className="h-8 min-w-28" />
                      </TableCell>
                      <TableCell>
                        <Input value={rowValue(r.area, "email")} onChange={(e) => setRow(r.area, "email", e.target.value)} placeholder="nome@crtcomunicacao.com.br" className="h-8 min-w-44" />
                      </TableCell>
                      <TableCell>
                        <Input value={rowValue(r.area, "webhookUrl")} onChange={(e) => setRow(r.area, "webhookUrl", e.target.value)} placeholder="https://… (Power Automate)" className="h-8 min-w-44" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Agendamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-primary" /> Agendamento</CardTitle>
              <CardDescription>Disparo automático do resumo diário.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched-enabled">Disparo automático ativado</Label>
                <Switch id="sched-enabled" checked={schedule.enabled} onCheckedChange={(v) => setSchedule({ ...schedule, enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sched-weekdays">Somente dias úteis (seg–sex)</Label>
                <Switch id="sched-weekdays" checked={schedule.weekdaysOnly} onCheckedChange={(v) => setSchedule({ ...schedule, weekdaysOnly: v })} />
              </div>
              <div className="flex items-center gap-3">
                <Label>Horário</Label>
                <Input type="number" min={0} max={23} value={schedule.hour} className="w-20"
                  onChange={(e) => setSchedule({ ...schedule, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })} />
                <span>:</span>
                <Input type="number" min={0} max={59} value={schedule.minute} className="w-20"
                  onChange={(e) => setSchedule({ ...schedule, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar configurações
            </Button>
          </div>

          <Separator />

          {/* Disparo manual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-primary" /> Disparo manual</CardTitle>
              <CardDescription>Pré-visualize as mensagens ou poste o resumo agora. Salve as configurações antes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => run(true)} disabled={!!running} className="gap-2">
                  {running === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Pré-visualizar
                </Button>
                <Button onClick={() => run(false)} disabled={!!running} className="gap-2">
                  {running === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Disparar agora
                </Button>
              </div>

              {lastRun && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Última execução: {new Date(lastRun.at).toLocaleString("pt-BR")} {lastRun.dryRun && <Badge variant="secondary" className="ml-1">prévia</Badge>}
                  </p>
                  <div className="space-y-2">
                    {lastRun.results.map((r, i) => (
                      <div key={i} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{r.area} <span className="text-muted-foreground">({r.count} atrasadas)</span></span>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{r.detail}</p>
                      </div>
                    ))}
                    {lastRun.results.length === 0 && <p className="text-sm text-muted-foreground">Nenhum responsável com tarefas atrasadas.</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "enviado", cls: "bg-emerald-100 text-emerald-700" },
    preview: { label: "prévia", cls: "bg-indigo-100 text-indigo-700" },
    skipped: { label: "ignorado", cls: "bg-muted text-muted-foreground" },
    error: { label: "erro", cls: "bg-destructive/10 text-destructive" },
  };
  const s = map[status] || map.skipped;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
