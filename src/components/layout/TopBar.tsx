import { useMemo, useState } from "react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Menu, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useDashboardStore } from "@/store/dashboardStore";
import { Sidebar } from "./Sidebar";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { cn } from "@/lib/utils";

const presets = [
  { label: "Últimos 7 dias", from: () => subDays(new Date(), 7), to: () => new Date() },
  { label: "Últimos 15 dias", from: () => subDays(new Date(), 15), to: () => new Date() },
  { label: "Últimos 30 dias", from: () => subDays(new Date(), 30), to: () => new Date() },
  { label: "Últimos 60 dias", from: () => subDays(new Date(), 60), to: () => new Date() },
  { label: "Últimos 90 dias", from: () => subDays(new Date(), 90), to: () => new Date() },
  { label: "Este mês", from: () => startOfMonth(new Date()), to: () => endOfMonth(new Date()) },
  { label: "Mês passado", from: () => startOfMonth(subMonths(new Date(), 1)), to: () => endOfMonth(subMonths(new Date(), 1)) },
  { label: "Esta semana", from: () => startOfWeek(new Date(), { weekStartsOn: 1 }), to: () => endOfWeek(new Date(), { weekStartsOn: 1 }) },
];

export function TopBar() {
  const { dateFrom, dateTo, setDateRange } = useDashboardStore();
  const [fromDate, setFromDate] = useState<Date>(new Date(dateFrom + "T12:00:00"));
  const [toDate, setToDate] = useState<Date>(new Date(dateTo + "T12:00:00"));
  const [presetsOpen, setPresetsOpen] = useState(false);

  const handleFromSelect = (d: Date | undefined) => {
    if (!d) return;
    setFromDate(d);
    setDateRange(format(d, "yyyy-MM-dd"), dateTo);
  };

  const handleToSelect = (d: Date | undefined) => {
    if (!d) return;
    setToDate(d);
    setDateRange(dateFrom, format(d, "yyyy-MM-dd"));
  };

  const applyPreset = (preset: typeof presets[0]) => {
    const from = preset.from();
    const to = preset.to();
    setFromDate(from);
    setToDate(to);
    setDateRange(format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"));
    setPresetsOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8 lg:hidden">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <Sidebar />
          </SheetContent>
        </Sheet>
        <div>
          <h2 className="text-sm font-bold text-foreground">Dashboard</h2>
          <p className="text-xs text-muted-foreground">Bem-vindo de volta</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <GlobalSearch />

        {/* Date presets dropdown */}
        <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="hidden h-8 gap-1 text-xs sm:flex">
              <ChevronDown className="h-3.5 w-3.5" />
              Período
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="w-full rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <span className="hidden text-xs text-muted-foreground sm:inline">DE</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(fromDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={handleFromSelect}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <span className="hidden text-xs text-muted-foreground sm:inline">ATÉ</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(toDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={toDate}
              onSelect={handleToSelect}
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
