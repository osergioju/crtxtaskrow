import { useQuery } from "@tanstack/react-query";

export type UserRole = "diretoria" | "equipe";

interface UserAreaOverride {
  userID: number;
  area?: string;
  role?: UserRole;
}

/**
 * Papel (Diretoria/Equipe) de cada usuário, cadastrado em Configurações
 * Gerais. Endpoint público — usado para separar "Gestão" de "Operação" no
 * painel principal, entre outras telas.
 */
export function useUserRoles() {
  return useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/user-areas");
      if (!res.ok) return [] as UserAreaOverride[];
      const data = await res.json();
      return (Array.isArray(data.userAreas) ? data.userAreas : []) as UserAreaOverride[];
    },
    staleTime: 1000 * 60 * 5,
    select: (rows) => new Map(rows.filter((r) => r.role).map((r) => [r.userID, r.role as UserRole])),
  });
}
