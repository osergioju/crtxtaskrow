import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const bgColors = [
  "bg-primary",
  "bg-status-backlog",
  "bg-status-em-dia",
  "bg-status-retrabalho",
  "bg-destructive",
  "bg-status-urgente",
  "bg-primary/70",
  "bg-status-em-dia/70",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
}

interface ClientAvatarProps {
  name: string;
  size?: 32 | 40;
  className?: string;
}

export function ClientAvatar({ name, size = 40, className }: ClientAvatarProps) {
  const colorIdx = hashName(name) % bgColors.length;
  const dim = size === 32 ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  return (
    <Avatar className={cn(dim, className)}>
      <AvatarFallback className={cn(bgColors[colorIdx], "text-primary-foreground font-semibold", dim)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
