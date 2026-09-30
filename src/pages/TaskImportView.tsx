import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Upload, Loader2, CheckCircle2, XCircle, Circle, Send, ChevronsUpDown } from "lucide-react";
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
import { apiPost } from "@/lib/api";
import type { TaskrowUser } from "@/types/taskrow";

interface ImportedTask {
  title: string;
  description?: string | null;
  requested_by?: string | null;
  deadline?: string | null;
  priority?: string | null;
  status?: string | null;
  notes?: string | null;
  source?: { meeting?: string | null; timestamp?: string | null } | null;
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
  jobID: number | undefined;
  requestTypeID: number | undefined;
  status: "idle" | "pending" | "success" | "error";
  resultMessage?: string;
}

/**
 * Tipos de solicitação cadastrados na conta Taskrow da CRT — não existe
 * endpoint documentado pra listar isso dinamicamente; lista repassada pelo
 * suporte do Taskrow por e-mail em 2025-10-30. RequestTypeID é exigido pelo
 * Task/SaveTask (sem ele, a chamada falha).
 */
const REQUEST_TYPES: { id: number; label: string }[] = [
  { id: 11176, label: "Correção Interna" },
  { id: 11189, label: "Revisão de Texto" },
  { id: 11190, label: "Criação de Conteúdo" },
  { id: 11191, label: "Aprovação Cliente" },
  { id: 11192, label: "Postagem em Rede Social" },
  { id: 11193, label: "Envio de Briefing" },
  { id: 11194, label: "Reunião de Alinhamento" },
  { id: 11195, label: "Produção de Arte" },
  { id: 11196, label: "Edição de Vídeo" },
  { id: 11255, label: "Planejamento de Campanha" },
  { id: 11256, label: "Monitoramento de Métricas" },
  { id: 11272, label: "Relatório de Performance" },
  { id: 11273, label: "Criação de Anúncio" },
  { id: 11274, label: "Configuração de Campanha" },
  { id: 11334, label: "Aprovação Interna" },
  { id: 11335, label: "Envio para Cliente" },
  { id: 11336, label: "Ajustes Finais" },
  { id: 11337, label: "Publicação" },
  { id: 11338, label: "Arquivamento" },
  { id: 11780, label: "Pesquisa de Mercado" },
  { id: 11801, label: "Brainstorm" },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const tasks = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('Formato inesperado — esperado um array ou um objeto com "tasks": [...]');
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sameForAll, setSameForAll] = useState(true);
  const [globalClientID, setGlobalClientID] = useState<number | undefined>(undefined);
  const [globalJobID, setGlobalJobID] = useState<number | undefined>(undefined);
  const [globalRequestTypeID, setGlobalRequestTypeID] = useState<number | undefined>(undefined);
  const [inserting, setInserting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: globalProjects, isLoading: loadingGlobalProjects } = useProjects(globalClientID);

  const process = () => {
    setParseError("");
    try {
      const tasks = parseImportJson(raw);
      const newRows: ImportRow[] = tasks.map((t, i) => ({
        id: `${Date.now()}-${i}`,
        original: t,
        selected: true,
        title: t.title.trim(),
        description: t.description || "",
        ownerUserID: undefined,
        participantIDs: [],
        dueDate: t.deadline && /^\d{4}-\d{2}-\d{2}/.test(t.deadline) ? t.deadline.slice(0, 10) : "",
        clientID: undefined,
        jobID: undefined,
        requestTypeID: undefined,
        status: "idle",
      }));
      setRows(newRows);
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
      const clientID = sameForAll ? globalClientID : r.clientID;
      const jobID = sameForAll ? globalJobID : r.jobID;
      const requestTypeID = sameForAll ? globalRequestTypeID : r.requestTypeID;
      return r.title.trim() && r.ownerUserID && clientID && jobID && requestTypeID;
    });
  }, [rows, sameForAll, globalClientID, globalJobID, globalRequestTypeID]);

  const insertAll = async () => {
    setInserting(true);
    for (const row of rows) {
      if (!row.selected) continue;
      const clientID = sameForAll ? globalClientID : row.clientID;
      const jobID = sameForAll ? globalJobID : row.jobID;
      const requestTypeID = sameForAll ? globalRequestTypeID : row.requestTypeID;
      if (!row.ownerUserID || !clientID || !jobID || !requestTypeID || !row.title.trim()) {
        updateRow(row.id, { status: "error", resultMessage: "Faltam campos obrigatórios" });
        continue;
      }
      updateRow(row.id, { status: "pending" });
      try {
        const payload: Record<string, unknown> = {
          TaskTitle: row.title.trim(),
          JobID: jobID,
          OwnerUserID: row.ownerUserID,
          RequestTypeID: requestTypeID,
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
            <SheetTitle>{selectedCount} de {rows.length} tarefa(s) selecionada(s) para importar</SheetTitle>
            <SheetDescription>Marque o que entra, edite título/descrição, e defina responsável, participantes, prazo, cliente e projeto.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <Label htmlFor="same-for-all">Mesmo cliente, projeto e tipo de solicitação para todas as tarefas</Label>
                <Switch id="same-for-all" checked={sameForAll} onCheckedChange={setSameForAll} />
              </div>

              {sameForAll && (
                <div className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <ClientCombobox
                      value={globalClientID}
                      onChange={(id) => { setGlobalClientID(id); setGlobalJobID(undefined); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Projeto</Label>
                    <Select
                      value={globalJobID ? String(globalJobID) : ""}
                      onValueChange={(v) => setGlobalJobID(Number(v))}
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
                  <div className="space-y-1.5">
                    <Label>Tipo de solicitação</Label>
                    <Select
                      value={globalRequestTypeID ? String(globalRequestTypeID) : ""}
                      onValueChange={(v) => setGlobalRequestTypeID(Number(v))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                      <SelectContent>
                        {REQUEST_TYPES.map((rt) => (
                          <SelectItem key={rt.id} value={String(rt.id)}>{rt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: true })))}>Marcar todas</Button>
                <Button variant="ghost" size="sm" onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: false })))}>Desmarcar todas</Button>
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
            <Label className="text-xs text-muted-foreground">Título</Label>
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
                onChange={(id) => onChange({ clientID: id, jobID: undefined })}
                placeholder="Cliente"
              />
            </div>
          )}
          {!sameForAll && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Projeto</Label>
              <Select value={row.jobID ? String(row.jobID) : ""} onValueChange={(v) => onChange({ jobID: Number(v) })} disabled={!row.clientID}>
                <SelectTrigger className="h-9"><SelectValue placeholder={loadingRowProjects ? "…" : "Projeto"} /></SelectTrigger>
                <SelectContent>
                  {(rowProjects?.items || []).map((j) => (
                    <SelectItem key={j.jobID} value={String(j.jobID)}>{j.jobTitle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!sameForAll && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo de solicitação</Label>
              <Select value={row.requestTypeID ? String(row.requestTypeID) : ""} onValueChange={(v) => onChange({ requestTypeID: Number(v) })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map((rt) => (
                    <SelectItem key={rt.id} value={String(rt.id)}>{rt.label}</SelectItem>
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
