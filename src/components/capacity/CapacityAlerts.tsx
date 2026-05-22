import { AlertTriangle, AlertOctagon, Info, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CapacityAlert } from "@/types/capacity";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertOctagon,
    classes: "border-destructive/25 bg-destructive/5 text-destructive",
    iconClass: "text-destructive",
    labelClass: "text-destructive",
    label: "Crítico",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-amber-200 bg-amber-50 text-amber-800",
    iconClass: "text-amber-600",
    labelClass: "text-amber-700",
    label: "Atenção",
  },
  info: {
    icon: Info,
    classes: "border-sky-200 bg-sky-50 text-sky-800",
    iconClass: "text-sky-600",
    labelClass: "text-sky-700",
    label: "Info",
  },
};

interface AlertCardProps {
  alert: CapacityAlert;
  onDismiss?: () => void;
}

function AlertCard({ alert, onDismiss }: AlertCardProps) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const Icon = cfg.icon;

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 transition-all", cfg.classes)}>
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{alert.title}</p>
        <p className="mt-0.5 text-[0.7rem] opacity-80">{alert.description}</p>
        {alert.period && (
          <p className="mt-1 text-[0.6rem] font-mono opacity-60">{alert.period}</p>
        )}
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

interface CapacityAlertsProps {
  alerts: CapacityAlert[];
  isLoading?: boolean;
  maxVisible?: number;
}

export function CapacityAlerts({ alerts, isLoading, maxVisible = 8 }: CapacityAlertsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BellRing className="h-8 w-8 text-emerald-500 mb-3" />
        <p className="text-sm font-semibold text-emerald-600">Tudo sob controle!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nenhum alerta operacional no momento.
        </p>
      </div>
    );
  }

  const critical = alerts.filter(a => a.severity === "critical");
  const warning = alerts.filter(a => a.severity === "warning");
  const info = alerts.filter(a => a.severity === "info");
  const ordered = [...critical, ...warning, ...info].slice(0, maxVisible);

  return (
    <div className="space-y-2">
      {critical.length > 0 && (
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-destructive">
          {critical.length} Crítico{critical.length > 1 ? "s" : ""}
        </p>
      )}
      {ordered.map(a => (
        <AlertCard key={a.id} alert={a} />
      ))}
      {alerts.length > maxVisible && (
        <p className="text-xs text-center text-muted-foreground py-1">
          +{alerts.length - maxVisible} alertas adicionais
        </p>
      )}
    </div>
  );
}
