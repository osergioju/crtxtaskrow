import { useState } from "react";
import { CheckCircle2, XCircle, MessageSquare, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { taskrowLink } from "@/lib/taskrowLink";
import { ExtranetStepBadge } from "./ExtranetStepBadge";
import type { TaskrowTask } from "@/types/taskrow";
import { cn } from "@/lib/utils";

type ApprovalAction = "approved" | "changes" | null;

interface ApprovalRowProps {
  task: TaskrowTask;
}

function ApprovalRow({ task }: ApprovalRowProps) {
  const [action, setAction] = useState<ApprovalAction>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const link = taskrowLink(task);
  const dueDate = task.dueDate ? parseISO(task.dueDate) : null;

  function handleSubmit(a: ApprovalAction) {
    if (a === "changes" && !comment.trim()) {
      toast.error("Descreva a alteração necessária antes de enviar.");
      return;
    }
    setAction(a);
    setSubmitted(true);
    toast.success(
      a === "approved"
        ? `✅ Tarefa #${task.taskNumber} aprovada com sucesso`
        : `🔄 Solicitação de alteração registrada para #${task.taskNumber}`,
      { description: comment || undefined }
    );
  }

  if (submitted) {
    return (
      <div className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
        action === "approved"
          ? "border-emerald-200 bg-emerald-50"
          : "border-orange-200 bg-orange-50"
      )}>
        {action === "approved" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-orange-600 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.taskTitle}</p>
          <p className="text-xs text-muted-foreground">#{task.taskNumber}</p>
        </div>
        <Badge
          variant="outline"
          className={action === "approved"
            ? "text-emerald-700 border-emerald-200 bg-emerald-50"
            : "text-orange-700 border-orange-200 bg-orange-50"
          }
        >
          {action === "approved" ? "Aprovado" : "Alteração solicitada"}
        </Badge>
      </div>
    );
  }

  return (
    <Card className="border-violet-200 bg-violet-50/30 p-4 space-y-3">
      {/* Task header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1">{task.taskTitle}</p>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              title="Abrir no Taskrow"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
            <span>#{task.taskNumber}</span>
            <span>·</span>
            <span className="truncate">{task.jobDisplayTitle || task.jobTitle}</span>
            {dueDate && (
              <>
                <span>·</span>
                <span>Prazo: {format(dueDate, "dd 'de' MMM", { locale: ptBR })}</span>
              </>
            )}
            {task.ownerUserLogin && (
              <>
                <span>·</span>
                <span>Resp: {task.ownerUserLogin}</span>
              </>
            )}
          </div>
        </div>
        <ExtranetStepBadge step="Aprovação" size="xs" />
      </div>

      <Separator className="border-violet-200" />

      {/* Comment toggle */}
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowComment(s => !s)}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {showComment ? "Ocultar comentário" : "Adicionar comentário"}
        {showComment ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showComment && (
        <Textarea
          placeholder="Descreva o feedback ou solicitação de alteração..."
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="text-sm min-h-[80px] resize-none bg-white/80 border-violet-200 focus-visible:ring-violet-300"
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8"
          onClick={() => handleSubmit("approved")}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50 gap-1.5 h-8"
          onClick={() => {
            setShowComment(true);
            if (comment.trim()) handleSubmit("changes");
            else toast.info("Descreva a alteração necessária no campo acima.");
          }}
        >
          <XCircle className="h-3.5 w-3.5" />
          Solicitar Alteração
        </Button>
      </div>
    </Card>
  );
}

interface ExtranetApprovalCenterProps {
  tasks: TaskrowTask[];
  isLoading?: boolean;
}

export function ExtranetApprovalCenter({ tasks, isLoading }: ExtranetApprovalCenterProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-4xl mb-3">🎉</span>
        <p className="text-sm font-semibold text-emerald-600">Nenhuma aprovação pendente!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Todas as tarefas estão em dia. Volte mais tarde.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
        </span>
        <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">
          {tasks.length} tarefa{tasks.length !== 1 ? "s" : ""} aguardam aprovação
        </p>
      </div>
      {tasks.map(task => (
        <ApprovalRow key={task.taskID} task={task} />
      ))}
    </div>
  );
}
