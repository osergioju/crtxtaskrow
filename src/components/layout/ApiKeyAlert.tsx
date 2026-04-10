import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboardStore";

export function ApiKeyAlert() {
  const apiKey = useDashboardStore((s) => s.apiKey);

  if (apiKey) return null;

  return (
    <Alert variant="default" className="border-amber-300 bg-amber-50 mb-4">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800">API Key não configurada</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-amber-700 text-sm">
          Configure sua API Key para conectar ao Taskrow e visualizar os dados.
        </span>
        <ApiKeyDialog
          trigger={
            <Button size="sm" variant="outline" className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100">
              Configurar
            </Button>
          }
        />
      </AlertDescription>
    </Alert>
  );
}
