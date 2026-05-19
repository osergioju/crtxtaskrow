import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Check, BarChart2, Link2, Star, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useNpsTokens, useCreateNpsToken, useDeleteNpsToken, useNpsResults } from "@/hooks/useNPS";
import { calcNPS } from "@/types/nps";
import type { NpsToken } from "@/types/nps";
import type { TaskrowClient } from "@/types/taskrow";

function currentQuarterLabel() {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q}/${now.getFullYear()}`;
}

function npsLink(token: string) {
  return `${window.location.origin}/nps/respond/${token}`;
}

function NpsScoreBadge({ clientId }: { clientId: string }) {
  const { data: responses } = useNpsResults(clientId);
  if (!responses || responses.length === 0) return (
    <span className="text-xs text-muted-foreground">Sem respostas</span>
  );
  const { nps, total } = calcNPS(responses);
  const color = nps >= 50 ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : nps >= 0 ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <Badge variant="outline" className={`text-xs ${color}`}>
      NPS {nps > 0 ? "+" : ""}{nps} · {total} resp.
    </Badge>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} title="Copiar link">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function TokenRow({ t, onDelete, deleting }: { t: NpsToken; onDelete: () => void; deleting: boolean }) {
  const navigate = useNavigate();
  const link = npsLink(t.token);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{t.label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-[0.68rem] text-muted-foreground font-mono">{link}</span>
        </div>
      </div>
      <CopyButton text={link} />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        title="Ver avaliações"
        onClick={() => navigate(`/nps/resultados/${t.clientId}`)}
      >
        <BarChart2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
        title="Remover link"
        onClick={onDelete}
        disabled={deleting}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ClientRow({ client, tokens, onCreate, creating, onDelete, deleting }: {
  client: TaskrowClient;
  tokens: NpsToken[];
  onCreate: (label: string) => void;
  creating: boolean;
  onDelete: (token: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState(currentQuarterLabel);

  const visible = expanded ? tokens : tokens.slice(0, 1);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{client.ClientName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <NpsScoreBadge clientId={String(client.ClientID)} />
            {tokens.length > 0 && (
              <span className="text-[0.65rem] text-muted-foreground">
                {tokens.length} link{tokens.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 shrink-0"
          onClick={() => { setShowForm((v) => !v); setLabel(currentQuarterLabel()); }}
        >
          <Plus className="h-3 w-3" />
          Novo Link
        </Button>
      </div>

      {/* New link form */}
      {showForm && (
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Q2/2026"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7 text-xs shrink-0"
            onClick={() => { onCreate(label); setShowForm(false); }}
            disabled={creating || !label.trim()}
          >
            Criar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => setShowForm(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground pl-1">Nenhum link gerado</p>
      )}

      {visible.map((t) => (
        <TokenRow key={t.token} t={t} onDelete={() => onDelete(t.token)} deleting={deleting} />
      ))}

      {tokens.length > 1 && (
        <button
          className="flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> Mostrar menos</>
            : <><ChevronDown className="h-3 w-3" /> Ver todos ({tokens.length - 1} mais)</>}
        </button>
      )}
    </div>
  );
}

export default function NPSSatisfaction() {
  const [search, setSearch] = useState("");

  const { data: tasks, isLoading: loadingTasks } = useAllTasks();
  const { data: tokens, isLoading: loadingTokens } = useNpsTokens();
  const createToken = useCreateNpsToken();
  const deleteToken = useDeleteNpsToken();

  const allClients: TaskrowClient[] = (() => {
    if (!tasks) return [];
    const seen = new Map<number, TaskrowClient>();
    tasks.forEach((t) => {
      if (!seen.has(t.clientID)) {
        seen.set(t.clientID, {
          ClientID: t.clientID,
          ClientName: t.clientDisplayName || t.clientNickName || `Cliente ${t.clientID}`,
          ClientNickName: t.clientNickName || "",
          value: String(t.clientID),
          Inactive: false,
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.ClientName.localeCompare(b.ClientName));
  })();

  const filtered = allClients.filter((c) =>
    c.ClientName.toLowerCase().includes(search.toLowerCase())
  );

  // Map clientId → NpsToken[] (sorted newest first)
  const tokenMap = new Map<string, NpsToken[]>();
  (tokens ?? []).forEach((t) => {
    const arr = tokenMap.get(t.clientId) ?? [];
    arr.push(t);
    tokenMap.set(t.clientId, arr);
  });
  tokenMap.forEach((arr) => arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  function handleCreate(client: TaskrowClient, label: string) {
    createToken.mutate({ clientId: String(client.ClientID), clientName: client.ClientName, label });
  }

  const totalLinks = tokens?.length ?? 0;
  const isLoading = loadingTasks || loadingTokens;

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "NPS"]}
        title="Pesquisa de Satisfação"
        subtitle="Gerencie links de avaliação e acompanhe os resultados por cliente"
      />

      <div className="mt-4 mb-3 flex items-center gap-3">
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5" />
          {allClients.length} clientes · {totalLinks} link{totalLinks !== 1 ? "s" : ""} gerado{totalLinks !== 1 ? "s" : ""}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((client) => (
            <ClientRow
              key={client.ClientID}
              client={client}
              tokens={tokenMap.get(String(client.ClientID)) ?? []}
              onCreate={(label) => handleCreate(client, label)}
              creating={createToken.isPending}
              onDelete={(token) => deleteToken.mutate(token)}
              deleting={deleteToken.isPending}
            />
          ))}
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
