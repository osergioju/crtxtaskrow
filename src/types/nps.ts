export interface NpsCycle {
  id: string;
  clientId: string;
  label: string;      // e.g. "Q2/2026"
  startedAt: string;
  closedAt: string | null;
}

export interface NpsToken {
  clientId: string;
  clientName: string;
  token: string;
  label: string;      // e.g. "Q2/2026" — campaign label
  createdAt: string;
}

export interface NpsResponse {
  id: string;
  clientId: string;
  clientName: string;
  token: string;
  cycleId: string | null;
  cycleLabel: string | null;
  answers: Record<string, number | string>;
  createdAt: string;
}

export interface NpsQuestion {
  id: string;
  label: string;
  isMainNPS?: boolean;
}

export const NPS_QUESTIONS: NpsQuestion[] = [
  { id: "q1", label: "De 0 a 10, o quanto você recomendaria nossa agência a um amigo ou colega?", isMainNPS: true },
  { id: "q2", label: "Como você avalia a qualidade do nosso atendimento?" },
  { id: "q3", label: "Como você avalia a agilidade nas entregas?" },
  { id: "q4", label: "Como você avalia a qualidade criativa dos materiais produzidos?" },
  { id: "q5", label: "Como você avalia a comunicação da nossa equipe com você?" },
  { id: "q6", label: "Como você avalia o cumprimento dos prazos?" },
  { id: "q7", label: "Como você avalia a organização e gestão dos projetos?" },
  { id: "q8", label: "Como você avalia a proatividade da equipe?" },
  { id: "q9", label: "Como você avalia o custo-benefício dos nossos serviços?" },
  { id: "q10", label: "No geral, como você avalia nossa parceria?" },
];

export function calcNPS(responses: NpsResponse[]) {
  const scores = responses
    .map((r) => Number(r.answers["q1"]))
    .filter((n) => !isNaN(n));

  if (scores.length === 0) return { nps: 0, promoters: 0, neutrals: 0, detractors: 0, total: 0 };

  const promoters = scores.filter((s) => s >= 9).length;
  const neutrals = scores.filter((s) => s >= 7 && s <= 8).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const total = scores.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);

  return { nps, promoters, neutrals, detractors, total };
}

export function calcAverages(responses: NpsResponse[]) {
  return NPS_QUESTIONS.map((q) => {
    const vals = responses
      .map((r) => Number(r.answers[q.id]))
      .filter((n) => !isNaN(n));
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...q, avg, count: vals.length };
  });
}
