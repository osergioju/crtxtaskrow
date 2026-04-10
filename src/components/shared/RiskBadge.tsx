import { Badge } from "@/components/ui/badge";
import { getRiskLevel } from "@/lib/riskScore";
import { cn } from "@/lib/utils";

const riskStyles = {
  critico: "bg-destructive/10 text-destructive border-destructive/20",
  atencao: "bg-status-backlog/10 text-status-backlog border-status-backlog/20",
  ok: "bg-status-em-dia/10 text-status-em-dia border-status-em-dia/20",
};

const riskLabels = { critico: "Crítico", atencao: "Atenção", ok: "OK" };

export function RiskBadge({ score }: { score: number }) {
  const level = getRiskLevel(score);
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", riskStyles[level])}>
      {riskLabels[level]}
    </Badge>
  );
}
