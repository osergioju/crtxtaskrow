import { Badge } from "@/components/ui/badge";
import { EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import type { ExtranetStep } from "@/types/extranet";
import { cn } from "@/lib/utils";

interface ExtranetStepBadgeProps {
  step: ExtranetStep;
  size?: "xs" | "sm";
  showEmoji?: boolean;
}

export function ExtranetStepBadge({ step, size = "sm", showEmoji = false }: ExtranetStepBadgeProps) {
  const config = EXTRANET_COLUMN_CONFIG[step];
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border",
        config.badgeClass,
        size === "xs" ? "text-[0.6rem] px-1.5 py-0 h-4" : "text-xs px-2 py-0.5"
      )}
    >
      {showEmoji && <span className="mr-1">{config.emoji}</span>}
      {config.label}
    </Badge>
  );
}
