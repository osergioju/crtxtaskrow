import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing, Lock, Clock, Send, Eye, Save, LogOut, Loader2, MessagesSquare,
  KeyRound, Link2, Layers, ChevronsUpDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/useUsers";

const TOKEN_KEY = "admin_token";

interface Responsavel { area: string; name: string; email: string; webhookUrl: string; }
interface ScheduleCfg { enabled: boolean; hour: number; minute: number; weekdaysOnly: boolean; }
interface RunResult { area: string; count: number; status: string; detail: string; }
interface LastRun { at: string; dryRun: boolean; results: RunResult[]; }
interface TeamsLink { userID: number; teamsEmail: string; disabled: boolean; }
type UserRole = "diretoria" | "equipe";
interface UserAreaOverride { userID: number; area?: string; role?: UserRole; }

type RowField = "name" | "email" | "webhookUrl";
type ApiFn = (path: string, init?: RequestInit) => Promise<any>;

export default function AdminSettingsView() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");

  if (!token) {
    return <LoginForm onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
  }
  return <AdminDashboard token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); }} />;
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
      const res = await fetch("/api/admin/login", {
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
          <CardTitle>Configurações Gerais</CardTitle>
          <CardDescription>Acesso restrito ao administrador. Entre com login e senha.</CardDescription>
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

function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const api = useCallback<ApiFn>(async (path, init) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (res.status === 401) { onLogout(); throw new Error("Sessão expirada. Entre novamente."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || "Erro na requisição");
    return data;
  }, [token, onLogout]);

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "ADMIN"]} title="Configurações Gerais" subtitle="Acesso restrito ao administrador">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </PageHeader>

      <Tabs defaultValue="apikey">
        <TabsList className="mb-4">
          <TabsTrigger value="apikey" className="gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Chave de API</TabsTrigger>
          <TabsTrigger value="teams" className="gap-1.5"><BellRing className="h-3.5 w-3.5" /> Alertas no Teams</TabsTrigger>
          <TabsTrigger value="links" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> Vínculo Taskrow ↔ Teams</TabsTrigger>
          <TabsTrigger value="areas" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Usuários por Área</TabsTrigger>
        </TabsList>
        <TabsContent value="apikey"><ApiKeyTab api={api} /></TabsContent>
        <TabsContent value="teams"><TeamsTab api={api} /></TabsContent>
        <TabsContent value="links"><TeamsLinksTab api={api} /></TabsContent>
        <TabsContent value="areas"><UserAreasTab api={api} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Aba: Chave de API de fundo ───────────────────────────────────────────────────

function ApiKeyTab({ api }: { api: ApiFn }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await api("/api/admin/config");
      setHasKey(!!cfg.taskrowApiKey);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string) => {
    setSaving(true);
    try {
      await api("/api/admin/config", { method: "POST", body: JSON.stringify({ taskrowApiKey: key }) });
      toast({ title: key ? "Chave salva" : "Chave removida" });
      setValue("");
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Chave de API do Taskrow (jobs de fundo)</CardTitle>
        <CardDescription>
          Usada só pelos processos automáticos do servidor (análise preditiva e disparo de
          alertas no Teams) — não é a chave pessoal de cada usuário, que fica em "Configurações"
          no rodapé do menu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <Badge variant={hasKey ? "secondary" : "outline"} className={hasKey ? "bg-emerald-100 text-emerald-700" : ""}>
              {hasKey ? "Chave configurada" : "Nenhuma chave configurada"}
            </Badge>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Cole a chave de API aqui..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && value.trim() && save(value.trim())}
              />
              <Button onClick={() => save(value.trim())} disabled={saving || !value.trim()} className="gap-2 shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </Button>
              {hasKey && (
                <Button variant="destructive" onClick={() => save("")} disabled={saving} className="shrink-0">
                  Remover
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Aba: Alertas no Teams (conteúdo já existente) ───────────────────────────────

function TeamsTab({ api }: { api: ApiFn }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<"" | "preview" | "send">("");
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [areas, setAreas] = useState<{ area: string; overdue: number }[]>([]);
  const [schedule, setSchedule] = useState<ScheduleCfg>({ enabled: true, hour: 8, minute: 0, weekdaysOnly: true });
  const [lastRun, setLastRun] = useState<LastRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, ar] = await Promise.all([api("/api/admin/teams"), api("/api/admin/teams/areas")]);
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
      await api("/api/admin/teams", { method: "POST", body: JSON.stringify({ responsaveis: cleaned, schedule }) });
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
      const data = await api(`/api/admin/teams/run${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
      setLastRun({ at: new Date().toISOString(), dryRun, results: data.results || [] });
      toast({ title: dryRun ? "Pré-visualização gerada" : "Disparo concluído" });
    } catch (e: any) {
      toast({ title: "Falha ao executar", description: e.message, variant: "destructive" });
    } finally {
      setRunning("");
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MessagesSquare className="h-4 w-4 text-primary" /> Como conectar cada canal do Teams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>1. No Teams, no canal da área, clique em <b>•••</b> → <b>Fluxos de Trabalho</b> (Workflows).</p>
          <p>2. Escolha o modelo <b>"Postar em um canal quando uma solicitação de webhook for recebida"</b>.</p>
          <p>3. Conclua e copie a <b>URL gerada</b> — cole na coluna <b>Webhook do canal</b> abaixo.</p>
          <p>4. Cada tarefa atrasada @menciona individualmente o dono dela (aba "Vínculo Taskrow ↔ Teams") — não é mais preciso um responsável geral por área, mas o webhook do canal continua obrigatório.</p>
          <p className="pt-1 text-xs">É gratuito (incluso no Microsoft 365) — não usa a API paga do WhatsApp.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" /> Canal por área</CardTitle>
          <CardDescription>Cada área posta no seu próprio canal. Nome/e-mail aqui é usado só como contato geral de fallback.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ÁREA</TableHead>
                <TableHead className="text-center">ATRASADAS HOJE</TableHead>
                <TableHead>CONTATO GERAL (OPCIONAL)</TableHead>
                <TableHead>E-MAIL</TableHead>
                <TableHead>WEBHOOK DO CANAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma área detectada ainda. Garanta que o Taskrow está conectado.</TableCell></TableRow>
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

// ── Aba: Vínculo Taskrow ↔ Teams ─────────────────────────────────────────────────

function TeamsLinksTab({ api }: { api: ApiFn }) {
  const { data: users, isLoading: loadingUsers } = useUsers();
  const [links, setLinks] = useState<Record<number, TeamsLink>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/admin/teams-links");
      const map: Record<number, TeamsLink> = {};
      (data.teamsLinks || []).forEach((l: TeamsLink) => { map[l.userID] = l; });
      setLinks(map);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const setEmail = (userID: number, teamsEmail: string) =>
    setLinks((prev) => ({ ...prev, [userID]: { userID, teamsEmail, disabled: prev[userID]?.disabled ?? false } }));
  const toggleDisabled = (userID: number, disabled: boolean) =>
    setLinks((prev) => ({ ...prev, [userID]: { userID, teamsEmail: prev[userID]?.teamsEmail ?? "", disabled } }));

  const save = async () => {
    setSaving(true);
    try {
      const list = Object.values(links).filter((l) => l.teamsEmail.trim() || l.disabled);
      await api("/api/admin/teams-links", { method: "POST", body: JSON.stringify({ teamsLinks: list }) });
      toast({ title: "Vínculos salvos" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4 text-primary" /> Vínculo Taskrow ↔ Teams</CardTitle>
        <CardDescription>
          Por padrão, cada usuário é mencionado no Teams pelo próprio e-mail cadastrado no
          Taskrow. Use isto só pra corrigir exceções (e-mail do Teams diferente) ou excluir
          alguém das menções.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || loadingUsers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>USUÁRIO (TASKROW)</TableHead>
                  <TableHead>E-MAIL PADRÃO</TableHead>
                  <TableHead>E-MAIL DO TEAMS (SE DIFERENTE)</TableHead>
                  <TableHead className="text-center">EXCLUIR DAS MENÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users || []).filter((u) => !u.Inactive).map((u) => {
                  const link = links[u.UserID];
                  return (
                    <TableRow key={u.UserID}>
                      <TableCell className="font-medium">{u.FullName}</TableCell>
                      <TableCell className="text-muted-foreground">{u.MainEmail}</TableCell>
                      <TableCell>
                        <Input
                          value={link?.teamsEmail ?? ""}
                          onChange={(e) => setEmail(u.UserID, e.target.value)}
                          placeholder={u.MainEmail}
                          className="h-8 min-w-52"
                          disabled={!!link?.disabled}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={!!link?.disabled} onCheckedChange={(v) => toggleDisabled(u.UserID, v)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar vínculos
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Aba: Usuários por Área ───────────────────────────────────────────────────────

/** Dropdown de área: escolhe entre as já existentes ou cria uma nova digitando. */
function AreaCombobox({
  value, onChange, knownAreas,
}: {
  value: string;
  onChange: (area: string) => void;
  knownAreas: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = knownAreas.filter((a) => a.toLowerCase().includes(search.trim().toLowerCase()));
  const exactMatch = knownAreas.some((a) => a.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="h-8 w-full justify-between font-normal">
          <span className="truncate">{value || "mesma área atual"}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar ou criar área…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandGroup>
              {value && (
                <CommandItem onSelect={() => { onChange(""); setOpen(false); }} className="text-muted-foreground">
                  (usar a área atual do Taskrow)
                </CommandItem>
              )}
              {filtered.map((a) => (
                <CommandItem key={a} value={a} onSelect={() => { onChange(a); setOpen(false); }}>
                  {a}
                </CommandItem>
              ))}
              {search.trim() && !exactMatch && (
                <CommandItem value={`__create__${search.trim()}`} onSelect={() => { onChange(search.trim()); setOpen(false); }}>
                  + Criar área "{search.trim()}"
                </CommandItem>
              )}
              {filtered.length === 0 && !search.trim() && (
                <div className="p-3 text-sm text-muted-foreground">Nenhuma área cadastrada ainda — digite pra criar.</div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function UserAreasTab({ api }: { api: ApiFn }) {
  const { data: users, isLoading: loadingUsers } = useUsers();
  const [overrides, setOverrides] = useState<Record<number, { area: string; role: UserRole | "" }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/admin/user-areas");
      const map: Record<number, { area: string; role: UserRole | "" }> = {};
      (data.userAreas as UserAreaOverride[] || []).forEach((o) => {
        map[o.userID] = { area: o.area || "", role: o.role || "" };
      });
      setOverrides(map);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const rowValue = (userID: number) => overrides[userID] ?? { area: "", role: "" as const };
  const setArea = (userID: number, area: string) =>
    setOverrides((prev) => ({ ...prev, [userID]: { area, role: prev[userID]?.role ?? "" } }));
  const setRole = (userID: number, role: UserRole | "") =>
    setOverrides((prev) => ({ ...prev, [userID]: { area: prev[userID]?.area ?? "", role } }));

  // Áreas conhecidas = áreas já efetivas dos usuários (Taskrow + overrides já salvos).
  const knownAreas = useMemo(() => {
    const set = new Set<string>();
    (users || []).forEach((u) => { if (u.FunctionGroupName) set.add(u.FunctionGroupName); });
    Object.values(overrides).forEach((o) => { if (o.area) set.add(o.area); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [users, overrides]);

  const save = async () => {
    setSaving(true);
    try {
      const list = Object.entries(overrides)
        .filter(([, o]) => o.area.trim() || o.role)
        .map(([userID, o]) => ({ userID: Number(userID), area: o.area.trim(), role: o.role || undefined }));
      await api("/api/admin/user-areas", { method: "POST", body: JSON.stringify({ userAreas: list }) });
      toast({ title: "Salvo" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-primary" /> Usuários — Área e Papel</CardTitle>
        <CardDescription>
          Área: por padrão vem do cadastro no Taskrow (FunctionGroupName) — sobrescreva só pra
          corrigir quem estiver errado, escolhendo entre áreas existentes ou criando uma nova.
          Papel: define quem entra em "Gestão" vs "Operação" na Visão Geral.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || loadingUsers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>USUÁRIO (TASKROW)</TableHead>
                  <TableHead>ÁREA ATUAL</TableHead>
                  <TableHead>SOBRESCREVER ÁREA PARA</TableHead>
                  <TableHead>PAPEL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users || []).filter((u) => !u.Inactive).map((u) => (
                  <TableRow key={u.UserID}>
                    <TableCell className="font-medium">{u.FullName}</TableCell>
                    <TableCell className="text-muted-foreground">{u.FunctionGroupName || "Sem Área"}</TableCell>
                    <TableCell className="min-w-44">
                      <AreaCombobox
                        value={rowValue(u.UserID).area}
                        onChange={(area) => setArea(u.UserID, area)}
                        knownAreas={knownAreas}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Select
                        value={rowValue(u.UserID).role || "none"}
                        onValueChange={(v) => setRole(u.UserID, v === "none" ? "" : (v as UserRole))}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Equipe (padrão)</SelectItem>
                          <SelectItem value="equipe">Equipe</SelectItem>
                          <SelectItem value="diretoria">Diretoria</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
