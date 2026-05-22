import { Search, X, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXTRANET_STEPS, EXTRANET_COLUMN_CONFIG } from "@/lib/extranet";
import type { ExtranetFiltersState, ExtranetStep } from "@/types/extranet";

interface ExtranetFiltersProps {
  filters: ExtranetFiltersState;
  onChange: (f: Partial<ExtranetFiltersState>) => void;
  totalResults: number;
}

export function ExtranetFilters({ filters, onChange, totalResults }: ExtranetFiltersProps) {
  const hasActive = filters.search.trim() || filters.step !== "all";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar tarefa, job..."
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          className="pl-9 h-9 text-sm"
        />
        {filters.search && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onChange({ search: "" })}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select
        value={filters.step}
        onValueChange={v => onChange({ step: v as ExtranetStep | "all" })}
      >
        <SelectTrigger className="h-9 w-[190px] text-sm gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as etapas</SelectItem>
          {EXTRANET_STEPS.map(s => {
            const c = EXTRANET_COLUMN_CONFIG[s];
            return (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <span>{c.emoji}</span>
                  <span>{c.label}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          {totalResults} tarefa{totalResults !== 1 ? "s" : ""}
        </span>
        {hasActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onChange({ search: "", step: "all" })}
          >
            <X className="h-3 w-3 mr-1" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
