import { Separator } from "@/components/ui/separator";

import { ReactNode } from "react";

interface PageHeaderProps {
  breadcrumb: string[];
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function PageHeader({ breadcrumb, title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            {breadcrumb.join(" · ")}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children ?? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-em-dia opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-em-dia" />
            </span>
            Atualizado agora
          </div>
        )}
      </div>
      <Separator className="mt-4" />
    </div>
  );
}
