import { useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Users, Building2, Layers, Activity, ListTodo, FolderKanban, Star, BrainCircuit, Settings, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/store/dashboardStore";
import { ApiKeyDialog } from "./ApiKeyDialog";

const navItems = [
  { label: "Visão Geral", path: "/", icon: BarChart3 },
  { label: "Por Cliente", path: "/clientes", icon: Building2 },
  { label: "Por Colaborador", path: "/colaboradores", icon: Users },
  { label: "Por Área", path: "/areas", icon: Layers },
  { label: "Análise de SLA", path: "/sla", icon: Activity },
  { label: "Tarefas", path: "/tarefas", icon: ListTodo },
  { label: "Projetos", path: "/projetos", icon: FolderKanban },
  { label: "Pesquisa de Satisfação", path: "/nps", icon: Star },
  { label: "Análise Preditiva", path: "/analytics", icon: BrainCircuit },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const apiKey = useDashboardStore((s) => s.apiKey);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-14 items-center px-4">
        <h1 className="text-lg font-extrabold text-primary">CRT Dashboard</h1>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = location.pathname === item.path || (item.path !== "/" && location.pathname.startsWith(item.path));
            return (
              <Button
                key={item.path}
                variant="ghost"
                className={cn(
                  "justify-start gap-3 text-sm font-medium",
                  active && "bg-primary/10 text-primary"
                )}
                onClick={() => navigate(item.path)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />

      {/* Connection indicator */}
      <div className="px-3 py-2">
        <div className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium",
          apiKey ? "text-emerald-700 bg-emerald-50" : "text-destructive bg-destructive/10"
        )}>
          {apiKey ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Conectado ao Taskrow
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              Desconectado
            </>
          )}
        </div>
      </div>

      <Separator />
      <div className="p-2">
        <ApiKeyDialog
          trigger={
            <Button variant="ghost" className="w-full justify-start gap-3 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              Configurações
            </Button>
          }
        />
      </div>
    </div>
  );
}
