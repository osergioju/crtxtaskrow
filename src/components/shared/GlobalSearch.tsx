import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, ArrowRight, User, Building2, ListTodo, ExternalLink } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useUsers } from "@/hooks/useUsers";
import { taskrowLink } from "@/lib/taskrowLink";
import type { TaskrowTask, TaskrowUser } from "@/types/taskrow";

interface SearchResult {
  type: "task" | "client" | "collaborator";
  id: string;
  title: string;
  subtitle: string;
  url: string;
  external?: boolean;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: tasks } = useAllTasks();
  const { data: users } = useUsers();

  // Cmd+K handler
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    // Search tasks
    if (tasks) {
      tasks.filter(t =>
        t.taskTitle?.toLowerCase().includes(q) ||
        String(t.taskNumber).includes(q)
      ).slice(0, 8).forEach(t => {
        res.push({
          type: "task",
          id: `task-${t.taskID}`,
          title: `#${t.taskNumber} — ${t.taskTitle}`,
          subtitle: `${t.clientDisplayName || t.clientNickName} • ${t.jobTitle}`,
          url: taskrowLink(t),
          external: true,
        });
      });
    }

    // Search clients (from task data)
    if (tasks) {
      const clientMap = new Map<number, TaskrowTask>();
      tasks.forEach(t => {
        if (!clientMap.has(t.clientID)) clientMap.set(t.clientID, t);
      });
      Array.from(clientMap.values())
        .filter(t =>
          (t.clientDisplayName || "").toLowerCase().includes(q) ||
          (t.clientNickName || "").toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach(t => {
          res.push({
            type: "client",
            id: `client-${t.clientID}`,
            title: t.clientDisplayName || t.clientNickName,
            subtitle: "Cliente",
            url: `/clientes/${t.clientNickName}`,
          });
        });
    }

    // Search collaborators
    if (users) {
      (users as TaskrowUser[])
        .filter(u =>
          u.FullName?.toLowerCase().includes(q) ||
          u.UserLogin?.toLowerCase().includes(q)
        )
        .slice(0, 5)
        .forEach(u => {
          res.push({
            type: "collaborator",
            id: `user-${u.UserID}`,
            title: u.FullName,
            subtitle: `${u.FunctionGroupName || ""} • ${u.ProfileTitle || ""}`,
            url: `/colaboradores/${u.UserID}`,
          });
        });
    }

    return res;
  }, [query, tasks, users]);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    if (result.external) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      navigate(result.url);
    }
  }, [navigate]);

  const typeIcon = (type: string) => {
    if (type === "task") return <ListTodo className="h-4 w-4 text-primary" />;
    if (type === "client") return <Building2 className="h-4 w-4 text-amber-500" />;
    return <User className="h-4 w-4 text-emerald-500" />;
  };

  const typeLabel = (type: string) => {
    if (type === "task") return "Tarefa";
    if (type === "client") return "Cliente";
    return "Colaborador";
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg border bg-muted/50 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="ml-1 hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium sm:inline">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar tarefas, clientes, colaboradores..."
              className="h-12 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {query && (
              <button onClick={() => setQuery("")} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ScrollArea className="max-h-[360px]">
            {query.length < 2 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Digite pelo menos 2 caracteres para buscar
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum resultado encontrado para "<span className="font-medium text-foreground">{query}</span>"
              </div>
            ) : (
              <div className="p-1">
                {results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      {typeIcon(r.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{typeLabel(r.type)}</Badge>
                    {r.external
                      ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
