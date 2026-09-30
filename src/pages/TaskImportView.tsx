import { useMemo, useRef, useState } from "react";
import { FileJson, Upload, Loader2, CheckCircle2, XCircle, Circle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "@/hooks/use-toast";
import { useUsers } from "@/hooks/useUsers";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { apiPost } from "@/lib/api";

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
  title: string;
  ownerUserID: number | undefined;
  dueDate: string; // yyyy-mm-dd, vazio = sem prazo
  clientID: number | undefined;
  jobID: number | undefined;
  briefing: string;
  status: "idle" | "pending" | "success" | "error";
  resultMessage?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function composeBriefing(t: ImportedTask): string {
  const parts: string[] = [];
  if (t.description) parts.push(`<p>${escapeHtml(t.description)}</p>`);
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

export default function TaskImportView() {
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sameForAll, setSameForAll] = useState(true);
  const [globalClientID, setGlobalClientID] = useState<number | undefined>(undefined);
  const [globalJobID, setGlobalJobID] = useState<number | undefined>(undefined);
  const [inserting, setInserting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users, isLoading: loadingUsers } = useUsers();
  const { data: clients, isLoading: loadingClients } = useClients();
  const { data: globalProjects, isLoading: loadingGlobalProjects } = useProjects(globalClientID);

  const process = () => {
    setParseError("");
    try {
      const tasks = parseImportJson(raw);
      const newRows: ImportRow[] = tasks.map((t, i) => ({
        id: `${Date.now()}-${i}`,
        original: t,
        title: t.title.trim(),
        ownerUserID: undefined,
        dueDate: t.deadline && /^\d{4}-\d{2}-\d{2}/.test(t.deadline) ? t.deadline.slice(0, 10) : "",
        clientID: undefined,
        jobID: undefined,
        briefing: composeBriefing(t),
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

  const canInsert = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((r) => {
      const clientID = sameForAll ? globalClientID : r.clientID;
      const jobID = sameForAll ? globalJobID : r.jobID;
      return r.title.trim() && r.ownerUserID && clientID && jobID;
    });
  }, [rows, sameForAll, globalClientID, globalJobID]);

  const insertAll = async () => {
    setInserting(true);
    for (const row of rows) {
      const clientID = sameForAll ? globalClientID : row.clientID;
      const jobID = sameForAll ? globalJobID : row.jobID;
      if (!row.ownerUserID || !clientID || !jobID || !row.title.trim()) {
        updateRow(row.id, { status: "error", resultMessage: "Faltam campos obrigatórios" });
        continue;
      }
      updateRow(row.id, { status: "pending" });
      try {
        const payload: Record<string, unknown> = {
          TaskTitle: row.title.trim(),
          JobID: jobID,
          OwnerUserID: row.ownerUserID,
          TaskItemComment: row.briefing,
        };
        if (row.dueDate) payload.DueDate = `${row.dueDate}T00:00:00`;
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
    const successCount = rows.filter((r) => r.status === "success").length;
    toast({ title: "Importação concluída", description: `Veja o status por linha no painel.` });
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>{rows.length} tarefa(s) mapeada(s)</SheetTitle>
            <SheetDescription>Revise responsável, prazo, cliente e projeto antes de inserir no Taskrow.</SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="same-for-all">Mesmo cliente e projeto para todas as tarefas</Label>
              <Switch id="same-for-all" checked={sameForAll} onCheckedChange={setSameForAll} />
            </div>

            {sameForAll && (
              <div className="grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Select
                    value={globalClientID ? String(globalClientID) : ""}
                    onValueChange={(v) => { setGlobalClientID(Number(v)); setGlobalJobID(undefined); }}
                  >
                    <SelectTrigger><SelectValue placeholder={loadingClients ? "Carregando…" : "Selecione o cliente"} /></SelectTrigger>
                    <SelectContent>
                      {(clients || []).map((c) => (
                        <SelectItem key={c.ClientID} value={String(c.ClientID)}>{c.ClientName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  {!sameForAll && <TableHead>Cliente</TableHead>}
                  {!sameForAll && <TableHead>Projeto</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ImportRowView
                    key={row.id}
                    row={row}
                    users={users}
                    loadingUsers={loadingUsers}
                    clients={clients}
                    loadingClients={loadingClients}
                    sameForAll={sameForAll}
                    onChange={(patch) => updateRow(row.id, patch)}
                  />
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-end gap-2 pb-4">
              <Button onClick={insertAll} disabled={!canInsert || inserting} className="gap-2">
                {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Inserir no Taskrow
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ImportRowView({
  row, users, loadingUsers, clients, loadingClients, sameForAll, onChange,
}: {
  row: ImportRow;
  users: ReturnType<typeof useUsers>["data"];
  loadingUsers: boolean;
  clients: ReturnType<typeof useClients>["data"];
  loadingClients: boolean;
  sameForAll: boolean;
  onChange: (patch: Partial<ImportRow>) => void;
}) {
  const { data: rowProjects, isLoading: loadingRowProjects } = useProjects(sameForAll ? undefined : row.clientID);

  return (
    <TableRow>
      <TableCell>
        {row.status === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {row.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
        {row.status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {row.status === "idle" && <Circle className="h-3 w-3 text-muted-foreground" />}
      </TableCell>
      <TableCell className="min-w-52">
        <Input value={row.title} onChange={(e) => onChange({ title: e.target.value })} className="h-8" />
      </TableCell>
      <TableCell className="min-w-44">
        <Select value={row.ownerUserID ? String(row.ownerUserID) : ""} onValueChange={(v) => onChange({ ownerUserID: Number(v) })}>
          <SelectTrigger className="h-8"><SelectValue placeholder={loadingUsers ? "…" : "Responsável"} /></SelectTrigger>
          <SelectContent>
            {(users || []).filter((u) => !u.Inactive).map((u) => (
              <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="min-w-36">
        <Input type="date" value={row.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} className="h-8" />
      </TableCell>
      {!sameForAll && (
        <TableCell className="min-w-40">
          <Select
            value={row.clientID ? String(row.clientID) : ""}
            onValueChange={(v) => onChange({ clientID: Number(v), jobID: undefined })}
          >
            <SelectTrigger className="h-8"><SelectValue placeholder={loadingClients ? "…" : "Cliente"} /></SelectTrigger>
            <SelectContent>
              {(clients || []).map((c) => (
                <SelectItem key={c.ClientID} value={String(c.ClientID)}>{c.ClientName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      )}
      {!sameForAll && (
        <TableCell className="min-w-40">
          <Select value={row.jobID ? String(row.jobID) : ""} onValueChange={(v) => onChange({ jobID: Number(v) })} disabled={!row.clientID}>
            <SelectTrigger className="h-8"><SelectValue placeholder={loadingRowProjects ? "…" : "Projeto"} /></SelectTrigger>
            <SelectContent>
              {(rowProjects?.items || []).map((j) => (
                <SelectItem key={j.jobID} value={String(j.jobID)}>{j.jobTitle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      )}
      <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={row.resultMessage}>
        {row.resultMessage || ""}
      </TableCell>
    </TableRow>
  );
}
