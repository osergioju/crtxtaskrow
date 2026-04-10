import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDashboardStore } from "@/store/dashboardStore";
import { toast } from "@/hooks/use-toast";

export function ApiKeyDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { apiKey, setApiKey } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(apiKey);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    setOpen(false);
    toast({ title: "API Key salva", description: "Conexão com o Taskrow configurada." });
  };

  const handleRemove = () => {
    setApiKey("");
    setValue("");
    setOpen(false);
    toast({ title: "API Key removida", description: "A conexão com o Taskrow foi desconectada." });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(apiKey); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <KeyRound className="h-4 w-4" />
            Configurar API
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar API Key do Taskrow</DialogTitle>
          <DialogDescription>
            Cole a chave de API para conectar ao Taskrow. Ela será armazenada localmente no navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="apikey">API Key (__identifier)</Label>
          <Input
            id="apikey"
            type="password"
            placeholder="Cole sua API Key aqui..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <DialogFooter className="gap-2">
          {apiKey && (
            <Button variant="destructive" size="sm" onClick={handleRemove}>
              Remover
            </Button>
          )}
          <Button onClick={handleSave} disabled={!value.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
