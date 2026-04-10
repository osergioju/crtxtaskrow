import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const bgColors = [
  "bg-primary/80",
  "bg-status-backlog/80",
  "bg-status-em-dia/80",
  "bg-status-retrabalho/80",
  "bg-destructive/80",
  "bg-status-urgente/80",
  "bg-primary/50",
  "bg-status-em-dia/50",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

interface UserAvatarProps {
  name: string;
  size?: 32 | 40 | 48;
  className?: string;
}

export function UserAvatar({ name, size = 40, className }: UserAvatarProps) {
  const colorIdx = hashStr(name) % bgColors.length;
  const dim = size === 32 ? "h-8 w-8 text-xs" : size === 48 ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";

  return (
    <Avatar className={cn(dim, className)}>
      <AvatarFallback className={cn(bgColors[colorIdx], "text-primary-foreground font-semibold", dim)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
