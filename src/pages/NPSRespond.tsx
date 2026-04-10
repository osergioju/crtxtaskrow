import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNpsTokenInfo, useSubmitNps } from "@/hooks/useNPS";
import { NPS_QUESTIONS } from "@/types/nps";
import { cn } from "@/lib/utils";

// ─── Score Selector ───────────────────────────────────────────────────────────

function ScoreSelector({
  value,
  onChange,
  isMainNPS,
}: {
  value: number | null;
  onChange: (v: number) => void;
  isMainNPS?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, i) => {
          const selected = value === i;
          const colorSelected =
            i >= 9 ? "bg-emerald-500 border-emerald-500 text-white shadow-emerald-200"
            : i >= 7 ? "bg-amber-500 border-amber-500 text-white shadow-amber-200"
            : "bg-red-500 border-red-500 text-white shadow-red-200";
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i)}
              className={cn(
                "h-10 w-10 rounded-xl border-2 text-sm font-bold transition-all",
                selected
                  ? `${colorSelected} shadow-md scale-110`
                  : "border-border bg-background text-foreground hover:border-primary hover:scale-105"
              )}
            >
              {i}
            </button>
          );
        })}
      </div>
      {isMainNPS && (
        <div className="flex justify-between text-[0.65rem] text-muted-foreground px-1">
          <span>Muito improvável</span>
          <span>Muito provável</span>
        </div>
      )}
    </div>
  );
}

// ─── NPS Respond Page ─────────────────────────────────────────────────────────

export default function NPSRespond() {
  const { token } = useParams<{ token: string }>();
  const { data: tokenInfo, isLoading: loadingToken, error: tokenError } = useNpsTokenInfo(token ?? "");
  const submit = useSubmitNps(token ?? "");

  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState("");

  function setScore(qId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
    setValidationError("");
  }

  function handleSubmit() {
    // Validate all questions answered
    const missing = NPS_QUESTIONS.find((q) => answers[q.id] == null);
    if (missing) {
      setValidationError(`Por favor, responda todas as perguntas antes de enviar.`);
      return;
    }

    const payload: Record<string, number | string> = {};
    NPS_QUESTIONS.forEach((q) => { payload[q.id] = answers[q.id] as number; });
    if (comment.trim()) payload.comment = comment.trim();

    submit.mutate(payload, {
      onSuccess: () => setSubmitted(true),
    });
  }

  // ── States ──

  if (loadingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenError || !tokenInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-lg font-bold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de pesquisa não é válido ou expirou. Entre em contato com a agência.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">Obrigado!</h1>
          <p className="text-muted-foreground">
            Sua avaliação foi enviada com sucesso. Sua opinião é muito importante para nós!
          </p>
          <p className="text-sm text-muted-foreground font-medium">— Equipe CRT Comunicação</p>
        </div>
      </div>
    );
  }

  // ── Form ──

  const answered = NPS_QUESTIONS.filter((q) => answers[q.id] != null).length;
  const progress = Math.round((answered / NPS_QUESTIONS.length) * 100);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">CRT Comunicação</p>
            <h1 className="text-sm font-bold leading-tight">Pesquisa de Satisfação</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{answered}/{NPS_QUESTIONS.length} respondidas</p>
            <div className="mt-1 h-1.5 w-24 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-6 space-y-4">
        {/* Client greeting */}
        <div className="rounded-xl bg-card border p-4 text-center space-y-1 shadow-sm">
          <p className="text-xs text-muted-foreground">Avaliação para</p>
          <p className="font-bold text-lg">{tokenInfo.clientName}</p>
          <p className="text-xs text-muted-foreground">
            Sua opinião nos ajuda a melhorar. Responda com honestidade — leva menos de 2 minutos.
          </p>
        </div>

        {/* Questions */}
        {NPS_QUESTIONS.map((q, idx) => (
          <div key={q.id} className="rounded-xl bg-card border p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.65rem] font-bold text-primary">
                {idx + 1}
              </span>
              <p className="text-sm font-medium leading-snug">{q.label}</p>
            </div>
            <ScoreSelector
              value={answers[q.id] ?? null}
              onChange={(v) => setScore(q.id, v)}
              isMainNPS={q.isMainNPS}
            />
          </div>
        ))}

        {/* Comment */}
        <div className="rounded-xl bg-card border p-4 shadow-sm space-y-3">
          <p className="text-sm font-medium">Comentário geral <span className="text-muted-foreground font-normal">(opcional)</span></p>
          <Textarea
            placeholder="Conte-nos o que podemos melhorar ou o que você gosta no nosso trabalho..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="resize-none text-sm min-h-[80px]"
            maxLength={500}
          />
          {comment.length > 0 && (
            <p className="text-[0.65rem] text-right text-muted-foreground">{comment.length}/500</p>
          )}
        </div>

        {/* Validation error */}
        {validationError && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {validationError}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={handleSubmit}
          disabled={submit.isPending}
        >
          {submit.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</>
          ) : (
            "Enviar Avaliação"
          )}
        </Button>

        {submit.isError && (
          <p className="text-center text-xs text-destructive">
            Erro ao enviar: {submit.error.message}
          </p>
        )}

        <p className="text-center text-[0.65rem] text-muted-foreground pb-4">
          Suas respostas são confidenciais e usadas apenas para melhorar nossos serviços.
        </p>
      </div>
    </div>
  );
}
