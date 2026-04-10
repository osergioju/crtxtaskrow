import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  color?: "indigo" | "red" | "green" | "amber" | "orange" | "dark";
  size?: "lg" | "sm";
  bgColored?: boolean;
  onClick?: () => void;
}

const colorMap: Record<string, { text: string; bg: string }> = {
  indigo: { text: "text-primary", bg: "bg-primary/5" },
  red: { text: "text-destructive", bg: "bg-destructive/5" },
  green: { text: "text-status-em-dia", bg: "bg-status-em-dia/5" },
  amber: { text: "text-status-backlog", bg: "bg-status-backlog/5" },
  orange: { text: "text-status-retrabalho", bg: "bg-status-retrabalho/5" },
  dark: { text: "text-foreground", bg: "bg-card" },
};

export function KPICard({ label, value, color = "indigo", size = "lg", bgColored = true, onClick }: KPICardProps) {
  const colors = colorMap[color] || colorMap.indigo;

  return (
    <Card
      className={cn(
        "border transition-all hover:shadow-md",
        size === "lg" ? "p-6 rounded-2xl" : "p-4 rounded-xl",
        bgColored ? colors.bg : "bg-card",
        onClick && "cursor-pointer hover:ring-2 hover:ring-primary/20 active:scale-[0.98]"
      )}
      onClick={onClick}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "font-bold leading-tight",
          colors.text,
          size === "lg" ? "text-[2.5rem]" : "text-[1.75rem]"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
