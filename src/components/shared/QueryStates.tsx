import { AlertTriangle, RefreshCw, WifiOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QueryErrorStateProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

export function QueryErrorState({ error, onRetry, className }: QueryErrorStateProps) {
  const message = error?.message || "";
  const isCors = message.includes("Failed to fetch") || message.includes("NetworkError");
  const isAuth = message.includes("401") || message.includes("403") || message.includes("PitstopRequired");
  const isTimeout = message.includes("timeout") || message.includes("504");

  let icon = <AlertTriangle className="h-6 w-6 text-destructive" />;
  let title = "Erro ao carregar dados";
  let description = message || "Ocorreu um erro inesperado.";

  if (isCors) {
    icon = <WifiOff className="h-6 w-6 text-destructive" />;
    title = "Erro de conexão";
    description = "Não foi possível conectar à API do Taskrow. Verifique sua conexão de internet.";
  } else if (isAuth) {
    icon = <KeyRound className="h-6 w-6 text-amber-500" />;
    title = "API Key inválida";
    description = "A chave de API não foi aceita. Verifique suas configurações.";
  } else if (isTimeout) {
    icon = <WifiOff className="h-6 w-6 text-amber-500" />;
    title = "Tempo esgotado";
    description = "A requisição demorou muito. Tente novamente.";
  }

  return (
    <div className={cn("flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-6", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        {icon}
      </div>
      <div className="text-center">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

export function EmptyState({ icon, title = "Nenhum dado encontrado", description = "Não há registros para o período selecionado.", className }: EmptyStateProps) {
  return (
    <div className={cn("flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6", className)}>
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div>}
      <div className="text-center">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
