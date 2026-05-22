import { Badge } from "@/components/ui/badge";
import { ZONE_CONFIG } from "@/lib/capacityEngine";
import type { CapacityZone } from "@/types/capacity";
import { cn } from "@/lib/utils";

interface CapacityZonePillProps {
  zone: CapacityZone;
  score?: number;
  size?: "xs" | "sm" | "md";
  showDot?: boolean;
}

export function CapacityZonePill({ zone, score, size = "sm", showDot = true }: CapacityZonePillProps) {
  const cfg = ZONE_CONFIG[zone];
  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-semibold",
        cfg.badgeClass,
        size === "xs" && "text-[0.58rem] px-1.5 py-0 h-4",
        size === "sm" && "text-xs px-2 py-0.5",
        size === "md" && "text-sm px-3 py-1",
      )}
    >
      {showDot && (
        <span className={cn("mr-1.5 inline-flex h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      )}
      {cfg.label}
      {score !== undefined && <span className="ml-1 opacity-70">{score}%</span>}
    </Badge>
  );
}
