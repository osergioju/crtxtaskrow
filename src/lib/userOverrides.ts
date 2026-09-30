import type { TaskrowUser } from "@/types/taskrow";

interface UserAreaOverride {
  userID: number;
  area: string;
}

/**
 * Overrides de área por usuário — cadastrados em Configurações Gerais
 * (substitui o FunctionGroupName do Taskrow quando presente). Endpoint
 * público: a área de cada usuário é usada em várias telas do dashboard.
 */
export async function applyUserOverrides(users: TaskrowUser[]): Promise<TaskrowUser[]> {
  let overrides: UserAreaOverride[] = [];
  try {
    const res = await fetch("/api/admin/user-areas");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.userAreas)) overrides = data.userAreas;
    }
  } catch {
    // servidor indisponível — segue com os dados crus do Taskrow
  }
  const areaByUserId = new Map(overrides.map((o) => [o.userID, o.area]));
  return users.map((u) => {
    const area = areaByUserId.get(u.UserID);
    return area ? { ...u, FunctionGroupName: area } : u;
  });
}
