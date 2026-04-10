import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  danger?: boolean;
  className?: string;
}

export function ProgressBar({ value, danger, className }: ProgressBarProps) {
  return (
    <Progress
      value={Math.min(value, 100)}
      className={cn("h-2", className)}
      style={
        {
          "--progress-color": danger ? "hsl(var(--destructive))" : "hsl(var(--primary))",
        } as React.CSSProperties
      }
    />
  );
}
