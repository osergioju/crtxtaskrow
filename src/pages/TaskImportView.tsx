import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Upload, Loader2, CheckCircle2, XCircle, Circle, Send, ChevronsUpDown, ExternalLink, Link2Off } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/useUsers";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { apiPost, fetchAllTasks } from "@/lib/api";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask, TaskrowUser } from "@/types/taskrow";

/** action: presente no formato v1.1 (schema "actions") — ausente no v1.0 (schema "tasks", sempre nova tarefa). */
type ImportAction = "create_task" | "update_task" | "create_subtask" | "needs_classification" | null | undefined;

interface ImportedTask {
  title: string;
  description?: string | null;
  requested_by?: string | null;
  deadline?: string | null;
  priority?: string | null;
  status?: string | null;
  notes?: string | null;
  source?: { meeting?: string | null; timestamp?: string | null } | null;
  action?: ImportAction;
  target_task_code?: string | null;
  classification?: string | null;
}

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  create_task: { label: "Nova tarefa", cls: "bg-emerald-100 text-emerald-700" },
  update_task: { label: "Atualizar tarefa existente", cls: "bg-amber-100 text-amber-700" },
  create_subtask: { label: "Nova subtarefa", cls: "bg-indigo-100 text-indigo-700" },
  needs_classification: { label: "Precisa classificação", cls: "bg-muted text-muted-foreground" },
};

/** Só tarefa genuinamente nova (ou formato antigo, sem "action") deve criar por padrão — o
 *  resto aponta pra uma tarefa já existente (target_task_code) e criar do zero duplicaria. */
function isSafeToCreateByDefault(action: ImportAction): boolean {
  return !action || action === "create_task";
}

interface JobRef {
  id: number;
  number: number;
  title: string;
}

interface ImportRow {
  id: string;
  original: ImportedTask;
  selected: boolean;
  title: string;
  description: string;
  ownerUserID: number | undefined;
  participantIDs: number[];
  dueDate: string; // yyyy-mm-dd, vazio = sem prazo
  clientID: number | undefined;
  clientName: string;
  job: JobRef | undefined;
  status: "idle" | "pending" | "success" | "error";
  resultMessage?: string;
}

/** Item que se refere a uma tarefa já existente (update_task/create_subtask) — cliente/projeto
 *  resolvidos automaticamente a partir do cache local de tarefas, pelo número referenciado. */
interface ExistingRefRow {
  id: string;
  original: ImportedTask;
  resolved: TaskrowTask | null; // null = ainda não resolvido ou não encontrado no cache local
}

/**
 * ID do tipo de solicitação usado em toda tarefa criada por aqui — fixo,
 * confirmado pelo usuário como o que funciona pra essa conta/projetos.
 * Não existe endpoint documentado pra listar/validar tipos dinamicamente.
 */
const FIXED_REQUEST_TYPE_ID = 12644;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "");
}

/** Código externo único por tarefa criada — cliente+projeto+timestamp, pra rastreio. */
function generateExternalCode(clientName: string, jobTitle: string): string {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); // YYYYMMDDHHmmss
  const rand = Math.random().toString(36).slice(2, 6);
  return `CRT-${slugify(clientName)}-${slugify(jobTitle)}-${ts}-${rand}`;
}

/** Monta o briefing final (TaskItemComment) a partir da descrição já editada + contexto original. */
function composeBriefing(row: ImportRow): string {
  const t = row.original;
  const parts: string[] = [];
  if (row.description.trim()) parts.push(`<p>${escapeHtml(row.description.trim())}</p>`);
  if (t.requested_by) parts.push(`<p><b>Solicitado por:</b> ${escapeHtml(t.requested_by)}</p>`);
  if (t.notes) parts.push(`<p><b>Obs:</b> ${escapeHtml(t.notes)}</p>`);
  if (t.priority) parts.push(`<p><b>Prioridade:</b> ${escapeHtml(String(t.priority))}</p>`);
  if (t.source?.meeting) {
    const ts = t.source.timestamp ? ` @ ${escapeHtml(t.source.timestamp)}` : "";
    parts.push(`<p><em>Origem: reunião "${escapeHtml(t.source.meeting)}"${ts}</em></p>`);
  }
  return parts.join("");
}

function parseImportJson(raw: string): ImportedTask[] {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido — confira a formatação.");
  }
  const tasks = Array.isArray(data) ? data : (data?.tasks ?? data?.actions);
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Formato inesperado — esperado um array, ou um objeto com "tasks": [...] ou "actions": [...]');
  }
  const withTitle = tasks.filter((t) => t && typeof t.title === "string" && t.title.trim());
  if (withTitle.length === 0) {
    throw new Error('Nenhuma tarefa com "title" válido encontrada.');
  }
  return withTitle;
}

/** Combobox com busca (debounced) — a API só devolve uma amostra pequena sem termo. */
function ClientCombobox({
  value, onChange, placeholder = "Selecione o cliente",
}: {
  value: number | undefined;
  onChange: (clientID: number, clientName: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: clients, isLoading } = useClients(debounced);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="h-9 w-full justify-between font-normal">
          <span className="truncate">{value ? selectedLabel || `Cliente #${value}` : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente por nome…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isLoading && <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</div>}
            {!isLoading && <CommandEmpty>{search ? "Nenhum cliente encontrado." : "Digite para buscar."}</CommandEmpty>}
            <CommandGroup>
              {(clients || []).map((c) => (
                <CommandItem
                  key={c.ClientID}
                  value={String(c.ClientID)}
                  onSelect={() => {
                    onChange(c.ClientID, c.ClientName);
                    setSelectedLabel(c.ClientName);
                    setOpen(false);
                  }}
                >
                  {c.ClientName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Multi-seleção de participantes (MemberListString), além do responsável. */
function ParticipantsMultiSelect({
  value, onChange, users, loadingUsers,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  users: TaskrowUser[] | undefined;
  loadingUsers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedUsers = (users || []).filter((u) => value.includes(u.UserID));

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="h-9 w-full justify-between font-normal">
          <span className="truncate">
            {selectedUsers.length
              ? selectedUsers.map((u) => u.FullName.split(" ")[0]).join(", ")
              : (loadingUsers ? "…" : "Participantes (opcional)")}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar pessoa…" />
          <CommandList>
            <CommandEmpty>Ninguém encontrado.</CommandEmpty>
            <CommandGroup>
              {(users || []).filter((u) => !u.Inactive).map((u) => (
                <CommandItem key={u.UserID} value={u.FullName} onSelect={() => toggle(u.UserID)}>
                  <Checkbox checked={value.includes(u.UserID)} className="mr-2" />
                  {u.FullName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function TaskImportView() {
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [existingRows, setExistingRows] = useState<ExistingRefRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sameForAll, setSameForAll] = useState(true);
  const [globalClientID, setGlobalClientID] = useState<number | undefined>(undefined);
  const [globalClientName, setGlobalClientName] = useState("");
  const [globalJob, setGlobalJob] = useState<JobRef | undefined>(undefined);
  const [inserting, setInserting] = useState(false);
  const [existingClientID, setExistingClientID] = useState<number | undefined>(undefined);
  const [resolvingExisting, setResolvingExisting] = useState(false);
  const [hasSearchedExisting, setHasSearchedExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: globalProjects, isLoading: loadingGlobalProjects } = useProjects(globalClientID);

  /**
   * Busca ao vivo na Taskrow (não no cache local) as tarefas do cliente
   * escolhido e casa cada item pelo número referenciado — pedir o cliente
   * antes de buscar evita varrer a conta inteira e usa dado sempre atual.
   */
  const searchExistingRefs = async () => {
    if (!existingClientID) return;
    setResolvingExisting(true);
    try {
      const tasks = await fetchAllTasks({ ClientID: existingClientID, Closed: null });
      const byNumber = new Map(tasks.map((t) => [String(t.taskNumber), t]));
      setExistingRows((prev) => prev.map((r) => ({
        ...r,
        resolved: (r.original.target_task_code && byNumber.get(r.original.target_task_code)) || null,
      })));
      setHasSearchedExisting(true);
    } catch (e: any) {
      toast({ title: "Erro ao buscar tarefas na Taskrow", description: e.message, variant: "destructive" });
    } finally {
      setResolvingExisting(false);
    }
  };

  const process = () => {
    setParseError("");
    try {
      const tasks = parseImportJson(raw);
      // update_task/create_subtask apontam pra uma tarefa já existente
      // (target_task_code) — vão pra um bloco separado, sem passar pelo
      // fluxo de "criar tarefa nova".
      const mainTasks = tasks.filter((t) => !t.target_task_code);
      const refTasks = tasks.filter((t) => t.target_task_code);

      const newRows: ImportRow[] = mainTasks.map((t, i) => ({
        id: `${Date.now()}-${i}`,
        original: t,
        selected: isSafeToCreateByDefault(t.action),
        title: t.title.trim(),
        description: t.description || "",
        ownerUserID: undefined,
        participantIDs: [],
        dueDate: t.deadline && /^\d{4}-\d{2}-\d{2}/.test(t.deadline) ? t.deadline.slice(0, 10) : "",
        clientID: undefined,
        clientName: "",
        job: undefined,
        status: "idle",
      }));
      setRows(newRows);

      const newExistingRows: ExistingRefRow[] = refTasks.map((t, i) => ({
        id: `ref-${Date.now()}-${i}`,
        original: t,
        resolved: null,
      }));
      setExistingRows(newExistingRows);
      setExistingClientID(undefined);
      setHasSearchedExisting(false);

      setSheetOpen(true);
    } catch (e: any) {
      setParseError(e.message || "Erro ao processar o JSON.");
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result || ""));
    reader.readAsText(file);
  };

  const updateRow = (id: string, patch: Partial<ImportRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const selectedCount = rows.filter((r) => r.selected).length;

  const canInsert = useMemo(() => {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) return false;
    return selected.every((r) => {
      const job = sameForAll ? globalJob : r.job;
      return r.title.trim() && r.ownerUserID && job;
    });
  }, [rows, sameForAll, globalJob]);

  const insertAll = async () => {
    setInserting(true);
    for (const row of rows) {
      if (!row.selected) continue;
      const job = sameForAll ? globalJob : row.job;
      const clientName = sameForAll ? globalClientName : row.clientName;
      if (!row.ownerUserID || !job || !row.title.trim()) {
        updateRow(row.id, { status: "error", resultMessage: "Faltam campos obrigatórios" });
        continue;
      }
      updateRow(row.id, { status: "pending" });
      try {
        const payload: Record<string, unknown> = {
          TaskTitle: row.title.trim(),
          JobID: job.id,
          jobNumber: job.number,
          OwnerUserID: row.ownerUserID,
          RequestTypeID: FIXED_REQUEST_TYPE_ID,
          ExternalCode: generateExternalCode(clientName, job.title),
          // TaskItemComment nunca vazio — string vazia já causou um 500 sem
          // corpo de erro por parte da Taskrow; título serve de fallback.
          TaskItemComment: composeBriefing(row) || `<p>${escapeHtml(row.title.trim())}</p>`,
        };
        if (row.dueDate) payload.DueDate = `${row.dueDate}T00:00:00`;
        // Só manda MemberListString quando há participante extra além do
        // responsável — campo novo, ainda não confirmado como seguro em
        // todos os formatos contra a API real da Taskrow.
        if (row.participantIDs.length > 0) {
          const memberIDs = Array.from(new Set([row.ownerUserID, ...row.participantIDs]));
          payload.MemberListString = memberIDs.join(",");
        }
        const res = await apiPost<{ Success: boolean; Message?: string; Entity?: { TaskID: number; TaskNumber: number } }>(
          "/api/v1/Task/SaveTask",
          payload
        );
        if (res.Success === false) {
          updateRow(row.id, { status: "error", resultMessage: res.Message || "Falha ao criar" });
        } else {
          updateRow(row.id, { status: "success", resultMessage: `Criada #${res.Entity?.TaskNumber ?? "?"}` });
        }
      } catch (e: any) {
        updateRow(row.id, { status: "error", resultMessage: e.message || "Erro na requisição" });
      }
    }
    setInserting(false);
    toast({ title: "Importação concluída", description: "Veja o status em cada tarefa no painel." });
  };

  return (
    <div>
      <PageHeader breadcrumb={["CRT", "IMPORTAR"]} title="Importar Tarefas" subtitle="Cole ou envie um JSON com tarefas para criar em massa no Taskrow" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><FileJson className="h-4 w-4 text-primary" /> Entrada</CardTitle>
          <CardDescription>Cole o JSON abaixo ou envie um arquivo .json. Formato esperado: array de tarefas, ou <code>{"{ \"tasks\": [...] }"}</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{"tasks": [{"title": "..."}]}'
            className="min-h-56 font-mono text-xs"
          />
          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Enviar arquivo .json
            </Button>
            <Button onClick={process} disabled={!raw.trim()} className="gap-2">
              <FileJson className="h-4 w-4" /> Processar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[1100px]">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{selectedCount} de {rows.length} nova(s) tarefa(s) selecionada(s){existingRows.length > 0 ? ` · ${existingRows.length} relacionada(s) a tarefas existentes` : ""}</SheetTitle>
            <SheetDescription>Marque o que entra, edite título/descrição, e defina responsável, participantes, prazo, cliente e projeto.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <Label htmlFor="same-for-all">Mesmo cliente e projeto para todas as tarefas</Label>
                <Switch id="same-for-all" checked={sameForAll} onCheckedChange={setSameForAll} />
              </div>

              {sameForAll && (
                <div className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <ClientCombobox
                      value={globalClientID}
                      onChange={(id, name) => { setGlobalClientID(id); setGlobalClientName(name); setGlobalJob(undefined); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Projeto</Label>
                    <Select
                      value={globalJob ? String(globalJob.id) : ""}
                      onValueChange={(v) => {
                        const j = globalProjects?.items.find((p) => String(p.jobID) === v);
                        if (j) setGlobalJob({ id: j.jobID, number: j.jobNumber, title: j.jobTitle });
                      }}
                      disabled={!globalClientID}
                    >
                      <SelectTrigger><SelectValue placeholder={loadingGlobalProjects ? "Carregando…" : "Selecione o projeto"} /></SelectTrigger>
                      <SelectContent>
                        {(globalProjects?.items || []).map((j) => (
                          <SelectItem key={j.jobID} value={String(j.jobID)}>{j.jobTitle}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: true })))}>Marcar todas</Button>
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: false })))}>Desmarcar todas</Button>
                <span className="text-xs text-muted-foreground">
                  "Precisa classificação" vem desmarcada por padrão — revise antes de criar.
                </span>
              </div>

              <div className="space-y-3">
                {rows.map((row) => (
                  <TaskCard
                    key={row.id}
                    row={row}
                    users={users}
                    loadingUsers={loadingUsers}
                    sameForAll={sameForAll}
                    onChange={(patch) => updateRow(row.id, patch)}
                  />
                ))}
              </div>

              {existingRows.length > 0 && (
                <>
                  <div className="pt-2">
                    <h3 className="text-sm font-semibold">Relacionadas a tarefas existentes</h3>
                    <p className="text-xs text-muted-foreground">
                      Atualização de tarefa ou nova subtarefa — escolha o cliente pra buscar ao vivo na Taskrow (não
                      usa cache) e casar cada item pelo número referenciado. Ainda não criam/atualizam nada por aqui:
                      use o link pra abrir a tarefa no Taskrow e aplicar manualmente.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
                    <div className="min-w-56 flex-1 space-y-1.5">
                      <Label>Cliente das tarefas referenciadas</Label>
                      <ClientCombobox value={existingClientID} onChange={(id) => setExistingClientID(id)} />
                    </div>
                    <Button onClick={searchExistingRefs} disabled={!existingClientID || resolvingExisting} className="gap-2">
                      {resolvingExisting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />} Buscar
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {existingRows.map((row) => (
                      <ExistingRefCard key={row.id} row={row} hasSearched={hasSearchedExisting} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button onClick={insertAll} disabled={!canInsert || inserting} className="gap-2">
              {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Inserir {selectedCount} tarefa(s) no Taskrow
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatusIcon({ status }: { status: ImportRow["status"] }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "pending") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return <Circle className="h-3 w-3 text-muted-foreground" />;
}

function TaskCard({
  row, users, loadingUsers, sameForAll, onChange,
}: {
  row: ImportRow;
  users: TaskrowUser[] | undefined;
  loadingUsers: boolean;
  sameForAll: boolean;
  onChange: (patch: Partial<ImportRow>) => void;
}) {
  const { data: rowProjects, isLoading: loadingRowProjects } = useProjects(sameForAll ? undefined : row.clientID);

  return (
    <Card className={row.selected ? "" : "opacity-60"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={row.selected}
            onCheckedChange={(v) => onChange({ selected: !!v })}
            className="mt-2.5"
          />
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Título</Label>
              {row.original.action && ACTION_LABELS[row.original.action] && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACTION_LABELS[row.original.action].cls}`}>
                  {ACTION_LABELS[row.original.action].label}
                </span>
              )}
              {row.original.target_task_code && (
                <span className="text-[11px] text-muted-foreground">
                  ref. tarefa #{row.original.target_task_code}
                </span>
              )}
            </div>
            <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} className="font-medium" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <StatusIcon status={row.status} />
            {row.resultMessage && (
              <span className={`max-w-40 truncate text-xs ${row.status === "error" ? "text-destructive" : "text-muted-foreground"}`} title={row.resultMessage}>
                {row.resultMessage}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <Select value={row.ownerUserID ? String(row.ownerUserID) : ""} onValueChange={(v) => onChange({ ownerUserID: Number(v) })}>
              <SelectTrigger className="h-9"><SelectValue placeholder={loadingUsers ? "…" : "Selecione"} /></SelectTrigger>
              <SelectContent>
                {(users || []).filter((u) => !u.Inactive).map((u) => (
                  <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Participantes</Label>
            <ParticipantsMultiSelect
              value={row.participantIDs}
              onChange={(ids) => onChange({ participantIDs: ids })}
              users={users}
              loadingUsers={loadingUsers}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prazo</Label>
            <Input type="date" value={row.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} className="h-9" />
          </div>
          {!sameForAll && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <ClientCombobox
                value={row.clientID}
                onChange={(id, name) => onChange({ clientID: id, clientName: name, job: undefined })}
                placeholder="Cliente"
              />
            </div>
          )}
          {!sameForAll && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Projeto</Label>
              <Select
                value={row.job ? String(row.job.id) : ""}
                onValueChange={(v) => {
                  const j = rowProjects?.items.find((p) => String(p.jobID) === v);
                  if (j) onChange({ job: { id: j.jobID, number: j.jobNumber, title: j.jobTitle } });
                }}
                disabled={!row.clientID}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder={loadingRowProjects ? "…" : "Projeto"} /></SelectTrigger>
                <SelectContent>
                  {(rowProjects?.items || []).map((j) => (
                    <SelectItem key={j.jobID} value={String(j.jobID)}>{j.jobTitle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            {row.original.priority && <Badge variant="outline" className="text-xs">Prioridade: {row.original.priority}</Badge>}
          </div>
          <Textarea
            value={row.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className="min-h-20 text-sm"
            placeholder="Descrição da tarefa…"
          />
          {(row.original.requested_by || row.original.notes || row.original.source?.meeting) && (
            <p className="text-xs text-muted-foreground">
              {row.original.requested_by && <>Solicitado por <b>{row.original.requested_by}</b>. </>}
              {row.original.notes && <>Obs: {row.original.notes}. </>}
              {row.original.source?.meeting && <>Origem: reunião "{row.original.source.meeting}"{row.original.source.timestamp ? ` @ ${row.original.source.timestamp}` : ""}.</>}
              {" "}(vai junto no briefing automaticamente)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExistingRefCard({ row, hasSearched }: { row: ExistingRefRow; hasSearched: boolean }) {
  const t = row.original;
  const action = t.action ? ACTION_LABELS[t.action] : undefined;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {action && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${action.cls}`}>{action.label}</span>
          )}
          <span className="text-[11px] text-muted-foreground">ref. tarefa #{t.target_task_code}</span>
        </div>
        <p className="font-medium">{t.title}</p>
        {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}

        {row.resolved ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
            <div>
              <p className="font-medium">{row.resolved.taskTitle}</p>
              <p className="text-xs text-muted-foreground">
                {row.resolved.clientDisplayName} — {row.resolved.jobTitle}
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={taskrowLink(row.resolved)} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir no Taskrow
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
            <Link2Off className="h-3.5 w-3.5 shrink-0" />
            {hasSearched
              ? `Tarefa #${t.target_task_code} não encontrada nesse cliente — confira se é o cliente certo, ou busque manualmente no Taskrow.`
              : "Escolha o cliente acima e clique em Buscar."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
