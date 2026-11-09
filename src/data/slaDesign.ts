/**
 * SLA de Design — tempo estimado (em horas) por categoria de peça, por pessoa.
 * Fonte: "0000 CRT_Categorias e SLA Design 2026-V1.xlsx" (aba "Prazos convertidos (horas)").
 * `null` = a pessoa não atende essa categoria.
 */

export const SLA_PEOPLE = ["Dani", "Luiza", "Allan", "Bruno", "Larissa"] as const;
export type SlaPerson = (typeof SLA_PEOPLE)[number];

export interface SlaCategory {
  category: string;
  /** Texto legível da média geral, só pra referência (não usado em cálculo). */
  mediaFormatada: string;
  hours: Record<SlaPerson, number | null>;
}

export const SLA_DESIGN_CATEGORIES: SlaCategory[] = [
  {
    category: "Peças para uso virtual (Thumbnails, Fotos e capas de Perfil)",
    mediaFormatada: "1h 40 min",
    hours: { Dani: 2, Luiza: 2, Allan: 2, Bruno: 1, Larissa: 1 },
  },
  {
    category: "Post/Story redes sociais (Página única)",
    mediaFormatada: "45 min",
    hours: { Dani: 0.75, Luiza: 0.75, Allan: null, Bruno: 0.5, Larissa: 0.75 },
  },
  {
    category: "Post/Story redes sociais (de 2 à 5 páginas)",
    mediaFormatada: "2h",
    hours: { Dani: 4, Luiza: 1.5, Allan: null, Bruno: 1.25, Larissa: 1.5 },
  },
  {
    category: "Post/Story redes sociais (5 à 10 páginas)",
    mediaFormatada: "3h",
    hours: { Dani: 6, Luiza: 2, Allan: null, Bruno: 1.5, Larissa: 2 },
  },
  {
    category: "Identidade Visual de Campanhas",
    mediaFormatada: "5h",
    hours: { Dani: 4, Luiza: 7, Allan: null, Bruno: 5, Larissa: 5 },
  },
  {
    category: "Redesign de identidade",
    mediaFormatada: "2 dias úteis",
    hours: { Dani: 16, Luiza: 16, Allan: null, Bruno: 24, Larissa: 16 },
  },
  {
    category: "Brindes eventos/impressos",
    mediaFormatada: "SUJEITO À ANÁLISE PRÉVIA",
    hours: { Dani: 4, Luiza: null, Allan: null, Bruno: null, Larissa: null },
  },
  {
    category: "Diagramação (de 10 à 25 páginas)",
    mediaFormatada: "1 dia útil",
    hours: { Dani: 8, Luiza: 8, Allan: null, Bruno: 8, Larissa: 8 },
  },
  {
    category: "Diagramação (de 25 à 35 páginas)",
    mediaFormatada: "2 dias úteis",
    hours: { Dani: 16, Luiza: 24, Allan: null, Bruno: 16, Larissa: 24 },
  },
  {
    category: "Diagramação (de 35 à 50 páginas)",
    mediaFormatada: "4 dias úteis",
    hours: { Dani: 32, Luiza: 40, Allan: null, Bruno: 32, Larissa: 40 },
  },
  {
    category: "Diagramação (de 50 à 100 páginas)",
    mediaFormatada: "10 dias úteis",
    hours: { Dani: 96, Luiza: 80, Allan: null, Bruno: 80, Larissa: 80 },
  },
  {
    category: "Apresentações dinâmicas (Animações e demais funcionalidades)",
    mediaFormatada: "SUJEITO À ANÁLISE PRÉVIA",
    hours: { Dani: 16, Luiza: null, Allan: null, Bruno: 24, Larissa: null },
  },
  {
    category: "Vídeo redes sociais (cortes e edição)",
    mediaFormatada: "3h 30 min",
    hours: { Dani: 3, Luiza: null, Allan: 4, Bruno: null, Larissa: null },
  },
  {
    category: "Vídeo redes sociais (motion design)",
    mediaFormatada: "6h 30 min",
    hours: { Dani: 7, Luiza: null, Allan: 6, Bruno: null, Larissa: null },
  },
  {
    category: "Vídeos institucionais (vídeos de maior tempo de duração)",
    mediaFormatada: "1 dia útil",
    hours: { Dani: 14, Luiza: null, Allan: 12, Bruno: null, Larissa: null },
  },
  {
    category: "E-mail marketing (Apenas design)",
    mediaFormatada: "1h 45 min",
    hours: { Dani: 3, Luiza: 1, Allan: null, Bruno: 1, Larissa: 2 },
  },
  {
    category: "Landing Page / Home de sites",
    mediaFormatada: "2 dias úteis",
    hours: { Dani: 8, Luiza: null, Allan: null, Bruno: 16, Larissa: 24 },
  },
  {
    category: "Páginas internas de site",
    mediaFormatada: "5 horas",
    hours: { Dani: 16, Luiza: null, Allan: null, Bruno: 3, Larissa: 3 },
  },
  {
    category: "Ilustrações",
    mediaFormatada: "SUJEITO À ANÁLISE PRÉVIA",
    hours: { Dani: null, Luiza: null, Allan: null, Bruno: null, Larissa: null },
  },
];

/** Carga diária considerada "cheia" pra efeitos de alerta de encavalamento. */
export const SLA_DAILY_CAPACITY_HOURS = 8;

/** Casa o nome completo do Taskrow com a pessoa do SLA pelo primeiro nome/apelido. */
export function matchSlaPerson(fullName: string | null | undefined): SlaPerson | null {
  if (!fullName) return null;
  const lower = fullName.toLowerCase();
  return SLA_PEOPLE.find((p) => lower.includes(p.toLowerCase())) || null;
}

export function getCategoryHours(category: string | null | undefined, person: SlaPerson | null): number | null {
  if (!category || !person) return null;
  const row = SLA_DESIGN_CATEGORIES.find((c) => c.category === category);
  return row ? row.hours[person] : null;
}

/** Categorias que essa pessoa efetivamente atende (hours != null). */
export function categoriesForPerson(person: SlaPerson | null): SlaCategory[] {
  if (!person) return SLA_DESIGN_CATEGORIES;
  return SLA_DESIGN_CATEGORIES.filter((c) => c.hours[person] != null);
}
