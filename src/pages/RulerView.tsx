import { useMemo, useState } from "react";
import { format, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, ExternalLink, Trash2, AlertTriangle, Ruler, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { taskrowLink } from "@/lib/taskrowLink";
import { useRulerBoard, OVERDUE_BUCKET, type RulerBucket, type RulerItem } from "@/hooks/useRulerBoard";
import { useCreateLocalRulerTask, useDeleteLocalRulerTask, useUpdateLocalRulerTask } from "@/hooks/useRegua";
import {
  SLA_DESIGN_CATEGORIES, SLA_DAILY_CAPACITY_HOURS, SLA_PEOPLE,
  matchSlaPerson, getCategoryHours, categoriesForPerson,
} from "@/data/slaDesign";
import type { TaskrowUser } from "@/types/taskrow";

const WINDOW_OPTIONS = [6, 10, 15];

/** Soma as horas do SLA de Design já alocadas por responsável num balde (só conta tarefas locais com categoria). */
function loadByOwner(items: RulerItem[]): Map<number, number> {
  const map = new Map<number, number>();
  items.forEach((item) => {
    if (!item.category || item.ownerUserID == null) return;
    const person = matchSlaPerson(item.ownerName);
    const hours = getCategoryHours(item.category, person);
    if (hours == null) return;
    map.set(item.ownerUserID, (map.get(item.ownerUserID) || 0) + hours);
  });
  return map;
}

function tierClass(index: number): string {
  if (index < 5) return "bg-red-500";
  if (index < 10) return "bg-amber-400";
  return "bg-slate-300";
}

function bucketLabel(bucket: RulerBucket): { title: string; subtitle: string } {
  if (!bucket.date) return { title: "Atrasadas", subtitle: "Já venceram" };
  if (isToday(bucket.date)) return { title: "Hoje", subtitle: format(bucket.date, "dd 'de' MMM", { locale: ptBR }) };
  return {
    title: format(bucket.date, "EEEEEE, dd/MM", { locale: ptBR }),
    subtitle: format(bucket.date, "MMMM", { locale: ptBR }),
  };
}

export default function RulerView() {
  const [windowDays, setWindowDays] = useState(6);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const { buckets, isLoading, reorderBucket, users } = useRulerBoard(windowDays);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const activeUsers = useMemo(
    () => [...users].filter((u) => !u.Inactive).sort((a, b) => a.FullName.localeCompare(b.FullName)),
    [users]
  );

  const visibleBuckets = useMemo(() => {
    if (ownerFilter === "all") return buckets;
    const ownerID = Number(ownerFilter);
    return buckets.map((b) => ({ ...b, items: b.items.filter((i) => i.ownerUserID === ownerID) }));
  }, [buckets, ownerFilter]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const bucket = buckets.find((b) => b.items.some((i) => i.key === active.id));
    if (!bucket) return;
    const overInSameBucket = bucket.items.some((i) => i.key === over.id);
    if (!overInSameBucket) return; // prioridade só se reordena dentro do mesmo dia
    const oldIndex = bucket.items.findIndex((i) => i.key === active.id);
    const newIndex = bucket.items.findIndex((i) => i.key === over.id);
    reorderBucket(bucket.key, arrayMove(bucket.items, oldIndex, newIndex));
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRT", "RÉGUA"]}
        title="Régua"
        subtitle="Tudo que todas as áreas têm pra entregar, dia por dia — arraste pra definir a prioridade"
      >
        <div className="flex items-center gap-2">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Funcionário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funcionários</SelectItem>
              {activeUsers.map((u) => (
                <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SlaDesignDialog />
          <div className="flex items-center gap-1 rounded-md border p-1">
            {WINDOW_OPTIONS.map((n) => (
              <Button
                key={n}
                size="sm"
                variant={windowDays === n ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setWindowDays(n)}
              >
                {n} dias
              </Button>
            ))}
          </div>
        </div>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando régua…</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {visibleBuckets.map((bucket, i) => (
              <RulerColumn key={bucket.key} bucket={bucket} allItems={buckets[i].items} users={users} />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function RulerColumn({
  bucket, allItems, users,
}: {
  bucket: RulerBucket;
  /** Itens do balde sem o filtro de funcionário — usado pra calcular a carga de SLA do dia. */
  allItems: RulerItem[];
  users: TaskrowUser[];
}) {
  const { title, subtitle } = bucketLabel(bucket);
  const isOverdue = bucket.key === OVERDUE_BUCKET;
  const updateLocal = useUpdateLocalRulerTask();
  const deleteLocal = useDeleteLocalRulerTask();

  const load = useMemo(() => loadByOwner(allItems), [allItems]);
  const loadEntries = useMemo(() => {
    const userMap = new Map(users.map((u) => [u.UserID, u]));
    return [...load.entries()]
      .map(([ownerUserID, hours]) => ({ ownerUserID, hours, name: userMap.get(ownerUserID)?.FullName?.split(" ")[0] || "?" }))
      .filter((e) => e.hours > 0);
  }, [load, users]);

  return (
    <div className={cn(
      "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 max-h-[calc(100vh-211px)]",
      isOverdue && "border-destructive/40 bg-destructive/5"
    )}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div>
          <p className={cn("text-sm font-semibold capitalize", isOverdue && "text-destructive")}>{title}</p>
          <p className="text-xs capitalize text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="text-xs">{bucket.items.length}</Badge>
      </div>

      {loadEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b px-2 py-1.5">
          {loadEntries.map((e) => {
            const over = e.hours > SLA_DAILY_CAPACITY_HOURS;
            return (
              <Badge
                key={e.ownerUserID}
                variant="outline"
                className={cn(
                  "h-5 gap-1 px-1.5 text-[10px] font-normal",
                  over ? "border-destructive/50 text-destructive" : "border-muted-foreground/30 text-muted-foreground"
                )}
                title={`${e.name}: ${e.hours}h de SLA de Design alocadas (capacidade considerada: ${SLA_DAILY_CAPACITY_HOURS}h/dia)`}
              >
                <Clock className="h-2.5 w-2.5" />
                {e.name} {e.hours}h{over && " ⚠"}
              </Badge>
            );
          })}
        </div>
      )}

      <SortableContext items={bucket.items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {bucket.items.map((item, index) => (
            <RulerCard
              key={item.key}
              item={item}
              index={index}
              users={users}
              onUpdateLocal={(patch) => updateLocal.mutate({ id: item.localTask!.id, ...patch })}
              onDeleteLocal={() => deleteLocal.mutate(item.localTask!.id)}
            />
          ))}
          {bucket.items.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nada por aqui.</p>
          )}
        </div>
      </SortableContext>

      {!isOverdue && (
        <div className="border-t p-2">
          <NewLocalTaskDialog bucketKey={bucket.key} users={users} existingItems={allItems} />
        </div>
      )}
    </div>
  );
}

function RulerCard({
  item, index, users, onUpdateLocal, onDeleteLocal,
}: {
  item: RulerItem;
  index: number;
  users: TaskrowUser[];
  onUpdateLocal: (patch: { title?: string; description?: string; ownerUserID?: number | null; category?: string | null }) => void;
  onDeleteLocal: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex overflow-hidden rounded-md border bg-card shadow-sm",
        isDragging && "opacity-60 shadow-lg"
      )}
    >
      <div className={cn("w-1.5 shrink-0", tierClass(index))} />
      <div className="flex min-w-0 flex-1 gap-1.5 p-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastar para reordenar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {item.origin === "taskrow" ? (
          <TaskrowCardBody item={item} />
        ) : (
          <LocalCardBody item={item} users={users} onUpdate={onUpdateLocal} onDelete={onDeleteLocal} />
        )}
      </div>
    </div>
  );
}

function TaskrowCardBody({ item }: { item: RulerItem }) {
  const t = item.taskrowTask!;
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <a
          href={taskrowLink(t)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary"
          title="Abrir no Taskrow"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="truncate text-xs text-muted-foreground">{item.clientName} · {item.ownerName}</p>
    </div>
  );
}

function LocalCardBody({
  item, users, onUpdate, onDelete,
}: {
  item: RulerItem;
  users: TaskrowUser[];
  onUpdate: (patch: { title?: string; description?: string; ownerUserID?: number | null; category?: string | null }) => void;
  onDelete: () => void;
}) {
  const local = item.localTask!;
  const [title, setTitle] = useState(local.title);
  const [description, setDescription] = useState(local.description);

  const owner = users.find((u) => u.UserID === local.ownerUserID);
  const slaPerson = matchSlaPerson(owner?.FullName);
  const categoryOptions = categoriesForPerson(slaPerson);
  const hours = getCategoryHours(local.category, slaPerson);

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-violet-600 border-violet-300">
            Só na régua
          </Badge>
          {hours != null && (
            <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[10px] font-normal text-muted-foreground">
              <Clock className="h-2.5 w-2.5" /> {hours}h
            </Badge>
          )}
        </div>
        <button onClick={onDelete} className="shrink-0 text-muted-foreground hover:text-destructive" title="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== local.title && onUpdate({ title: title.trim() })}
        className="h-7 border-none px-0 text-sm font-medium shadow-none focus-visible:ring-0"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== local.description && onUpdate({ description })}
        placeholder="O que é a tarefa…"
        className="min-h-12 resize-none border-none px-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0"
      />
      <Select
        value={local.ownerUserID ? String(local.ownerUserID) : ""}
        onValueChange={(v) => onUpdate({ ownerUserID: Number(v) })}
      >
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
        <SelectContent>
          {users.filter((u) => !u.Inactive).map((u) => (
            <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={local.category || ""}
        onValueChange={(v) => onUpdate({ category: v })}
        disabled={!slaPerson}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder={slaPerson ? "Categoria (SLA Design)" : "Sem SLA p/ essa pessoa"} />
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((c) => (
            <SelectItem key={c.category} value={c.category}>{c.category} · {c.hours[slaPerson!]}h</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewLocalTaskDialog({
  bucketKey, users, existingItems,
}: {
  bucketKey: string;
  users: TaskrowUser[];
  /** Itens já no balde (sem filtro), pra calcular a carga de SLA já alocada pro responsável escolhido. */
  existingItems: RulerItem[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserID, setOwnerUserID] = useState<number | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const create = useCreateLocalRulerTask();

  const owner = users.find((u) => u.UserID === ownerUserID);
  const slaPerson = matchSlaPerson(owner?.FullName);
  const categoryOptions = categoriesForPerson(slaPerson);
  const newHours = getCategoryHours(category, slaPerson);

  const alreadyAllocated = useMemo(() => {
    if (!ownerUserID) return 0;
    return [...loadByOwner(existingItems).entries()].find(([id]) => id === ownerUserID)?.[1] || 0;
  }, [existingItems, ownerUserID]);

  const projectedTotal = alreadyAllocated + (newHours || 0);
  const overCapacity = newHours != null && projectedTotal > SLA_DAILY_CAPACITY_HOURS;

  const reset = () => { setTitle(""); setDescription(""); setOwnerUserID(undefined); setCategory(undefined); };

  const submit = () => {
    if (!title.trim() || !ownerUserID) return;
    create.mutate(
      { title: title.trim(), description, ownerUserID, category: category || null, dueDate: bucketKey },
      {
        onSuccess: () => {
          toast({ title: "Demanda adicionada à régua" });
          reset();
          setOpen(false);
        },
        onError: (e: any) => toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground">
          <Plus className="h-3.5 w-3.5" /> Nova demanda
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova demanda — só na régua</DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Essa demanda fica só aqui no dashboard — não cria nada no Taskrow. O prazo é o próprio dia da coluna.</p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome da demanda" />
          </div>
          <div className="space-y-1.5">
            <Label>O que é a tarefa</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição…" className="min-h-20" />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select
              value={ownerUserID ? String(ownerUserID) : ""}
              onValueChange={(v) => { setOwnerUserID(Number(v)); setCategory(undefined); }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {users.filter((u) => !u.Inactive).map((u) => (
                  <SelectItem key={u.UserID} value={String(u.UserID)}>{u.FullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria (SLA Design) — opcional</Label>
            <Select value={category || ""} onValueChange={setCategory} disabled={!slaPerson}>
              <SelectTrigger>
                <SelectValue placeholder={slaPerson ? "Selecione a categoria" : "Escolha um responsável do time de design"} />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.category} value={c.category}>{c.category} · {c.hours[slaPerson!]}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {newHours != null && (
            <div className={cn(
              "flex items-start gap-2 rounded-md border p-2.5 text-xs",
              overCapacity ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-muted bg-muted/40 text-muted-foreground"
            )}>
              {overCapacity ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <p>
                Essa tarefa: {newHours}h. {owner?.FullName?.split(" ")[0]} já tem {alreadyAllocated}h alocadas nesse dia — total {projectedTotal}h.
                {overCapacity && ` Passa da carga diária considerada (${SLA_DAILY_CAPACITY_HOURS}h) — risco de encavalar.`}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!title.trim() || !ownerUserID || create.isPending} className="gap-2">
            <Ruler className="h-4 w-4" /> Adicionar à régua
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Painel de consulta: tabela de referência do SLA de Design (categoria x pessoa, em horas). */
function SlaDesignDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5" /> SLA Design
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>SLA de Design — horas estimadas por categoria</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Fonte: planilha de SLA do time de arte. Carga diária considerada cheia: {SLA_DAILY_CAPACITY_HOURS}h.
          "—" significa que a pessoa não atende essa categoria.
        </p>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="min-w-48">Categoria</TableHead>
                {SLA_PEOPLE.map((p) => <TableHead key={p} className="text-center">{p}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {SLA_DESIGN_CATEGORIES.map((c) => (
                <TableRow key={c.category}>
                  <TableCell className="text-xs font-medium">{c.category}</TableCell>
                  {SLA_PEOPLE.map((p) => (
                    <TableCell key={p} className="text-center text-xs tabular-nums">
                      {c.hours[p] != null ? `${c.hours[p]}h` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
