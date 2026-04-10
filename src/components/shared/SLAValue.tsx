import { cn } from "@/lib/utils";

export function SLAValue({ days }: { days: number }) {
  const color = days === 0
    ? "text-muted-foreground"
    : days < 7
      ? "text-status-em-dia"
      : days <= 14
        ? "text-status-backlog"
        : "text-destructive";

  return (
    <span className={cn("font-semibold font-mono text-sm", color)}>
      {days === 0 ? "—" : `${days}d`}
    </span>
  );
}
