import { Badge } from "@/components/ui/badge";
import { getStatusLabel } from "@/lib/classifyTask";
import type { TaskStatus } from "@/types/taskrow";
import { cn } from "@/lib/utils";

const statusStyles: Record<TaskStatus, string> = {
  andamento: "bg-primary/10 text-primary border-primary/20",
  backlog: "bg-status-backlog/10 text-status-backlog border-status-backlog/20",
  atraso: "bg-destructive/10 text-destructive border-destructive/20",
  em_dia: "bg-status-em-dia/10 text-status-em-dia border-status-em-dia/20",
  retrabalho: "bg-status-retrabalho/10 text-status-retrabalho border-status-retrabalho/20",
  urgente: "bg-foreground text-background border-foreground",
  concluida: "bg-status-concluida/10 text-status-concluida border-status-concluida/20",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", statusStyles[status])}>
      {getStatusLabel(status)}
    </Badge>
  );
}
