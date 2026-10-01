import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Upload, Loader2, CheckCircle2, XCircle, Circle, Send, ChevronsUpDown, ExternalLink, Link2Off, RefreshCw, AlertTriangle } from "lucide-react";
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
type ImportAction = "create_task" | "update_task" | "create_subtask" | "needs_classification";

interface ImportedTask {
  title: string;
  description?: string | null;
  requested_by?: string | null;
  deadline?: string | null;
  priority?: string | null;
  status?: string | null;
  notes?: string | null;
  source?: { meeting?: string | null; timestamp?: string | null } | null;
  action?: ImportAction | null;
  /** ID local deste item dentro do mesmo lote — usado por outros itens como parent_action_id. */
  id?: string | null;
  /** aponta pra uma tarefa já existente no Taskrow (fora deste lote). */
  target_task_code?: string | null;
  /** aponta pro "id" de outro item NESTE MESMO lote (tarefa-pai ainda não criada). */
  parent_action_id?: string | null;
  classification?: string | null;
}

const ACTION_LABELS: Record<ImportAction, { label: string; cls: string }> = {
  create_task: { label: "Nova tarefa", cls: "bg-emerald-100 text-emerald-700" },
  update_task: { label: "Atualizar tarefa existente", cls: "bg-amber-100 text-amber-700" },
  create_subtask: { label: "Nova subtarefa", cls: "bg-indigo-100 text-indigo-700" },
  needs_classification: { label: "Precisa classificação", cls: "bg-muted text-muted-foreground" },
};

/** Classificação inicial: respeita o que veio no JSON; sem "action" (formato v1.0) = sempre nova tarefa. */
function defaultAction(t: ImportedTask): ImportAction {
  if (t.action === "update_task" || t.action === "create_subtask" || t.action === "needs_classification") return t.action;
  return "create_task";
}

/** Nova tarefa, ou subtarefa de uma tarefa nova deste mesmo lote — ambas seguras pra marcar por padrão. */
function defaultSelected(t: ImportedTask, action: ImportAction): boolean {
  if (action === "create_task") return true;
  if (action === "create_subtask" && t.parent_action_id && !t.target_task_code) return true;
  return false;
}

interface JobRef {
  id: number;
  number: number;
  title: string;
}

interface ImportRow {
  id: string;
  original: ImportedTask;
  localId: string; // = original.id — usado só pra outros itens acharem o pai (parent_action_id)
  action: ImportAction; // editável — reclassificar move o card entre os blocos
  selected: boolean;
  title: string;
  description: string;
  ownerUserID: number | undefined;
  participantIDs: number[];
  dueDate: string; // yyyy-mm-dd, vazio = sem prazo
  clientID: number | undefined;
  clientName: string;
  job: JobRef | undefined;
  targetTaskCode: string; // editável — tarefa já existente fora deste lote
  parentActionId: string; // editável — tarefa-pai dentro deste mesmo lote
  resolved: TaskrowTask | null;
  status: "idle" | "pending" | "success" | "error";
  resultMessage?: string;
}

/** Acha a linha-pai (mesmo lote) de uma subtarefa, por parentActionId ↔ localId. */
function findParentRow(rows: ImportRow[], row: ImportRow): ImportRow | undefined {
  if (row.action !== "create_subtask") return undefined;
  const pid = row.parentActionId.trim();
  if (!pid) return undefined;
  return rows.find((r) => r.id !== row.id && r.localId && r.localId === pid);
}

/**
 * "new" = cria direto (tarefa nova, ou precisa classificação).
 * "batchChild" = subtarefa de uma tarefa nova deste mesmo lote (cria em 2 passos, depois da pai).
 * "existingRef" = atualização/subtarefa de algo já existente no Taskrow (fora deste lote).
 */
function rowBucket(row: ImportRow, allRows: ImportRow[]): "new" | "batchChild" | "existingRef" {
  if (row.action === "update_task") return "existingRef";
  if (row.action === "create_subtask") return findParentRow(allRows, row) ? "batchChild" : "existingRef";
  return "new";
}

interface SaveTaskResponse {
  Success: boolean;
  Message?: string;
  Entity?: { TaskID: number; TaskNumber: number };
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

/** Payload base do SaveTask — reaproveitado por tarefas novas e por cada passo 2 de subtarefa. */
function buildSaveTaskPayload(row: ImportRow, job: JobRef, clientName: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    TaskTitle: row.title.trim(),
    JobID: job.id,
    jobNumber: job.number,
    OwnerUserID: row.ownerUserID,
    RequestTypeID: FIXED_REQUEST_TYPE_ID,
    ExternalCode: generateExternalCode(clientName, job.title),
    // TaskItemComment nunca vazio — string vazia já causou um 500 sem corpo
    // de erro por parte da Taskrow; título serve de fallback.
    TaskItemComment: composeBriefing(row) || `<p>${escapeHtml(row.title.trim())}</p>`,
  };
  if (row.dueDate) payload.DueDate = `${row.dueDate}T00:00:00`;
  // Só manda MemberListString quando há participante extra além do
  // responsável — campo mais novo, não totalmente validado em todo formato.
  if (row.ownerUserID && row.participantIDs.length > 0) {
    const memberIDs = Array.from(new Set([row.ownerUserID, ...row.participantIDs]));
    payload.MemberListString = memberIDs.join(",");
  }
  return payload;
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

/** Select compacto, colorido conforme o tipo — deixa reclassificar cada item. */
function ActionSelect({ value, onChange }: { value: ImportAction; onChange: (v: ImportAction) => void }) {
  const info = ACTION_LABELS[value];
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ImportAction)}>
      <SelectTrigger className={`h-6 w-auto gap-1 rounded-full border-none px-2.5 py-0 text-[11px] font-medium shadow-none focus:ring-0 focus:ring-offset-0 ${info.cls}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="create_task">Nova tarefa</SelectItem>
        <SelectItem value="update_task">Atualizar tarefa existente</SelectItem>
        <SelectItem value="create_subtask">Nova subtarefa</SelectItem>
        {value === "needs_classification" && <SelectItem value="needs_classification">Precisa classificação</SelectItem>}
      </SelectContent>
    </Select>
  );
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sameForAll, setSameForAll] = useState(true);
  const [globalClientID, setGlobalClientID] = useState<number | undefined>(undefined);
  const [globalClientName, setGlobalClientName] = useState("");
  const [globalJob, setGlobalJob] = useState<JobRef | undefined>(undefined);
  const [inserting, setInserting] = useState(false);
  const [existingClientID, setExistingClientID] = useState<number | undefined>(undefined);
  const [existingTasksByNumber, setExistingTasksByNumber] = useState<Map<string, TaskrowTask> | null>(null);
  const [resolvingExisting, setResolvingExisting] = useState(false);
  const [hasSearchedExisting, setHasSearchedExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: globalProjects, isLoading: loadingGlobalProjects } = useProjects(globalClientID);

  const updateRow = (id: string, patch: Partial<ImportRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const newRows = rows.filter((r) => rowBucket(r, rows) === "new");
  const batchChildRows = rows.filter((r) => rowBucket(r, rows) === "batchChild");
  const existingRefRows = rows.filter((r) => rowBucket(r, rows) === "existingRef");
  const orphanedChildren = batchChildRows.filter((c) => !newRows.some((p) => p.id === findParentRow(rows, c)?.id));

  const insertablePlan = useMemo(() => {
    return rows.filter((r) => {
      const bucket = rowBucket(r, rows);
      if (bucket === "new") return r.selected;
      if (bucket === "batchChild") return r.selected && !!findParentRow(rows, r)?.selected;
      return false;
    });
  }, [rows]);
  const selectedCount = insertablePlan.length;

  /**
   * Busca ao vivo na Taskrow (não em cache) as tarefas do cliente escolhido e
   * casa cada item pelo número referenciado — pedir o cliente antes de
   * buscar evita varrer a conta inteira e usa dado sempre atual.
   */
  const searchExistingRefs = async () => {
    if (!existingClientID) return;
    setResolvingExisting(true);
    try {
      const tasks = await fetchAllTasks({ ClientID: existingClientID, Closed: null });
      const byNumber = new Map(tasks.map((t) => [String(t.taskNumber), t]));
      setExistingTasksByNumber(byNumber);
      setRows((prev) => prev.map((r) => (
        rowBucket(r, prev) === "existingRef"
          ? { ...r, resolved: (r.targetTaskCode.trim() && byNumber.get(r.targetTaskCode.trim())) || null }
          : r
      )));
      setHasSearchedExisting(true);
    } catch (e: any) {
      toast({ title: "Erro ao buscar tarefas na Taskrow", description: e.message, variant: "destructive" });
    } finally {
      setResolvingExisting(false);
    }
  };

  /** Rebusca só uma linha (sem nova chamada à API) — útil depois de corrigir um número errado. */
  const rematchRow = (id: string) => {
    setRows((prev) => prev.map((r) => (
      r.id === id
        ? { ...r, resolved: (existingTasksByNumber && r.targetTaskCode.trim() && existingTasksByNumber.get(r.targetTaskCode.trim())) || null }
        : r
    )));
  };

  const process = () => {
    setParseError("");
    try {
      const tasks = parseImportJson(raw);
      const newImportRows: ImportRow[] = tasks.map((t, i) => {
        const action = defaultAction(t);
        return {
          id: `${Date.now()}-${i}`,
          original: t,
          localId: t.id || "",
          action,
          selected: defaultSelected(t, action),
          title: t.title.trim(),
          description: t.description || "",
          ownerUserID: undefined,
          participantIDs: [],
          dueDate: t.deadline && /^\d{4}-\d{2}-\d{2}/.test(t.deadline) ? t.deadline.slice(0, 10) : "",
          clientID: undefined,
          clientName: "",
          job: undefined,
          targetTaskCode: t.target_task_code || "",
          parentActionId: t.parent_action_id || "",
          resolved: null,
          status: "idle",
        };
      });
      setRows(newImportRows);
      setExistingClientID(undefined);
      setExistingTasksByNumber(null);
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

  const canInsert = useMemo(() => {
    if (insertablePlan.length === 0) return false;
    return insertablePlan.every((r) => {
      if (rowBucket(r, rows) === "batchChild") return r.title.trim() && r.ownerUserID;
      const job = sameForAll ? globalJob : r.job;
      return r.title.trim() && r.ownerUserID && job;
    });
  }, [insertablePlan, rows, sameForAll, globalJob]);

  /** Passo 2: cria o item de checklist e promove pra tarefa completa, vinculada à pai já criada. */
  const createChildSubtask = async (child: ImportRow, parentTaskID: number, parentTaskNumber: number, job: JobRef, clientName: string) => {
    if (!child.ownerUserID || !child.title.trim()) {
      updateRow(child.id, { status: "error", resultMessage: "Faltam campos obrigatórios" });
      return;
    }
    updateRow(child.id, { status: "pending" });
    try {
      const sub = await apiPost<{ Entity?: { SubtaskID?: number; Task1?: { RowVersion?: string } } }>(
        "/api/v1/Task/SaveSubtask",
        { subtask: { TaskID: parentTaskID, SubtaskID: 0, Title: child.title.trim(), Done: false } }
      );
      const subtaskID = sub.Entity?.SubtaskID;
      const rowVersion = sub.Entity?.Task1?.RowVersion;
      if (!subtaskID || !rowVersion) {
        updateRow(child.id, { status: "error", resultMessage: "Falha ao criar item de subtarefa (resposta inesperada da Taskrow)" });
        return;
      }
      const payload = {
        ...buildSaveTaskPayload(child, job, clientName),
        Title: child.title.trim(),
        TaskID: parentTaskID,
        TaskNumber: parentTaskNumber,
        RowVersion: rowVersion,
        createChildTask: true,
        SubtaskID: subtaskID,
      };
      const res = await apiPost<SaveTaskResponse>("/api/v1/Task/SaveTask", payload);
      if (res.Success === false) {
        updateRow(child.id, { status: "error", resultMessage: res.Message || "Falha ao criar subtarefa" });
      } else {
        updateRow(child.id, { status: "success", resultMessage: `Subtarefa criada #${res.Entity?.TaskNumber ?? "?"}` });
      }
    } catch (e: any) {
      updateRow(child.id, { status: "error", resultMessage: e.message || "Erro na requisição" });
    }
  };

  const insertAll = async () => {
    setInserting(true);
    for (const row of rows) {
      if (rowBucket(row, rows) !== "new" || !row.selected) continue;
      const job = sameForAll ? globalJob : row.job;
      const clientName = sameForAll ? globalClientName : row.clientName;
      if (!row.ownerUserID || !job || !row.title.trim()) {
        updateRow(row.id, { status: "error", resultMessage: "Faltam campos obrigatórios" });
        continue;
      }
      updateRow(row.id, { status: "pending" });
      let parentTaskID: number | undefined;
      let parentTaskNumber: number | undefined;
      try {
        const res = await apiPost<SaveTaskResponse>("/api/v1/Task/SaveTask", buildSaveTaskPayload(row, job, clientName));
        if (res.Success === false || !res.Entity) {
          updateRow(row.id, { status: "error", resultMessage: res.Message || "Falha ao criar" });
          continue;
        }
        updateRow(row.id, { status: "success", resultMessage: `Criada #${res.Entity.TaskNumber}` });
        parentTaskID = res.Entity.TaskID;
        parentTaskNumber = res.Entity.TaskNumber;
      } catch (e: any) {
        updateRow(row.id, { status: "error", resultMessage: e.message || "Erro na requisição" });
        continue;
      }

      // Subtarefas deste mesmo lote, selecionadas — só roda depois da pai existir de verdade.
      const children = batchChildRows.filter((c) => c.selected && findParentRow(rows, c)?.id === row.id);
      for (const child of children) {
        await createChildSubtask(child, parentTaskID, parentTaskNumber, job, clientName);
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
            <SheetTitle>
              {selectedCount} tarefa(s)/subtarefa(s) selecionada(s) para criar
              {existingRefRows.length > 0 ? ` · ${existingRefRows.length} relacionada(s) a tarefas existentes` : ""}
            </SheetTitle>
            <SheetDescription>
              Reclassifique com o rótulo colorido em cada card, marque o que entra, edite título/descrição, e defina
              responsável, participantes, prazo, cliente e projeto.
            </SheetDescription>
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
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => (rowBucket(r, prev) === "new" ? { ...r, selected: true } : r)))}>Marcar todas</Button>
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => (rowBucket(r, prev) === "new" ? { ...r, selected: false } : r)))}>Desmarcar todas</Button>
                <span className="text-xs text-muted-foreground">
                  "Precisa classificação" vem desmarcada por padrão — revise antes de criar.
                </span>
              </div>

              <div className="space-y-3">
                {newRows.map((row) => {
                  const children = batchChildRows.filter((c) => findParentRow(rows, c)?.id === row.id);
                  return (
                    <div key={row.id} className="space-y-2">
                      <TaskCard
                        row={row}
                        users={users}
                        loadingUsers={loadingUsers}
                        sameForAll={sameForAll}
                        onChange={(patch) => updateRow(row.id, patch)}
                      />
                      {children.length > 0 && (
                        <div className="ml-6 space-y-2 border-l-2 pl-4">
                          <p className="text-xs font-medium text-muted-foreground">{children.length} subtarefa(s) desta tarefa</p>
                          {children.map((child) => (
                            <ChildSubtaskRow
                              key={child.id}
                              row={child}
                              parentSelected={row.selected}
                              users={users}
                              loadingUsers={loadingUsers}
                              onChange={(patch) => updateRow(child.id, patch)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {orphanedChildren.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p className="font-medium">{orphanedChildren.length} subtarefa(s) sem tarefa-pai visível</p>
                    <p>A tarefa-pai referenciada não está mais classificada como "Nova tarefa". Reclassifique a pai de volta, ou reclassifique estas: {orphanedChildren.map((c) => `"${c.title}"`).join(", ")}.</p>
                  </div>
                </div>
              )}

              {existingRefRows.length > 0 && (
                <>
                  <div className="pt-2">
                    <h3 className="text-sm font-semibold">Relacionadas a tarefas existentes</h3>
                    <p className="text-xs text-muted-foreground">
                      Atualização de tarefa ou subtarefa de algo fora deste lote — escolha o cliente pra buscar ao
                      vivo na Taskrow (não usa cache) e casar cada item pelo número referenciado. Se o número
                      estiver errado, edite e clique em "Rebuscar" no próprio card. Ainda não cria/atualiza nada
                      por aqui: use o link pra abrir a tarefa no Taskrow e aplicar manualmente.
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
                    {existingRefRows.map((row) => (
                      <ExistingRefCard
                        key={row.id}
                        row={row}
                        hasSearched={hasSearchedExisting}
                        canRematch={!!existingTasksByNumber}
                        onChange={(patch) => updateRow(row.id, patch)}
                        onRematch={() => rematchRow(row.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
            <Button onClick={insertAll} disabled={!canInsert || inserting} className="gap-2">
              {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Inserir {selectedCount} no Taskrow
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
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <ActionSelect
                value={row.action}
                onChange={(action) => onChange(action === "create_task" ? { action, selected: true } : { action, selected: false })}
              />
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

/** Linha compacta de subtarefa aninhada sob a tarefa-pai (mesmo lote) — cliente/projeto herdados da pai. */
function ChildSubtaskRow({
  row, parentSelected, users, loadingUsers, onChange,
}: {
  row: ImportRow;
  parentSelected: boolean;
  users: TaskrowUser[] | undefined;
  loadingUsers: boolean;
  onChange: (patch: Partial<ImportRow>) => void;
}) {
  return (
    <Card className={row.selected && parentSelected ? "" : "opacity-60"}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={row.selected}
            onCheckedChange={(v) => onChange({ selected: !!v })}
            disabled={!parentSelected}
            className="mt-2"
          />
          <div className="flex-1 space-y-1">
            <ActionSelect value={row.action} onChange={(action) => onChange({ action })} />
            <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} className="h-8 text-sm font-medium" />
          </div>
          <StatusIcon status={row.status} />
        </div>
        {!parentSelected && (
          <p className="text-xs text-amber-600">Marque a tarefa-pai acima pra poder criar esta subtarefa.</p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={row.ownerUserID ? String(row.ownerUserID) : ""} onValueChange={(v) => onChange({ ownerUserID: Number(v) })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={loadingUsers ? "…" : "Responsável"} /></SelectTrigger>
            <SelectContent>
              {(users || []).filter((u) => !u.Inactive).map((u) => (
                <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={row.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} className="h-8 text-xs" />
        </div>
        <Textarea
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="min-h-14 text-xs"
          placeholder="Descrição…"
        />
        {row.resultMessage && (
          <p className={`text-xs ${row.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{row.resultMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ExistingRefCard({
  row, hasSearched, canRematch, onChange, onRematch,
}: {
  row: ImportRow;
  hasSearched: boolean;
  canRematch: boolean;
  onChange: (patch: Partial<ImportRow>) => void;
  onRematch: () => void;
}) {
  const t = row.original;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionSelect value={row.action} onChange={(action) => onChange({ action })} />
          <Label className="text-[11px] text-muted-foreground">Nº da tarefa referenciada</Label>
          <Input
            value={row.targetTaskCode}
            onChange={(e) => onChange({ targetTaskCode: e.target.value, resolved: null })}
            placeholder="ex: 3935"
            className="h-6 w-24 text-xs"
          />
          <Button
            variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]"
            onClick={onRematch}
            disabled={!canRematch || !row.targetTaskCode.trim()}
          >
            <RefreshCw className="h-3 w-3" /> Rebuscar
          </Button>
        </div>
        <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} className="font-medium" />
        <Textarea
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="min-h-16 text-sm"
          placeholder="Descrição…"
        />
        {(t.requested_by || t.notes || t.source?.meeting) && (
          <p className="text-xs text-muted-foreground">
            {t.requested_by && <>Solicitado por <b>{t.requested_by}</b>. </>}
            {t.notes && <>Obs: {t.notes}. </>}
            {t.source?.meeting && <>Origem: reunião "{t.source.meeting}"{t.source.timestamp ? ` @ ${t.source.timestamp}` : ""}.</>}
          </p>
        )}

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
            {!row.targetTaskCode.trim()
              ? "Informe o número da tarefa acima."
              : hasSearched
                ? `Tarefa #${row.targetTaskCode} não encontrada nesse cliente — confira o número/cliente e tente "Rebuscar".`
                : "Escolha o cliente acima e clique em Buscar."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
