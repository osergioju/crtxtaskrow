import type { TaskrowUser } from "@/types/taskrow";

/**
 * Overrides locais para campos de usuários que estão incorretos no Taskrow.
 * Chave = UserID. Qualquer campo de TaskrowUser pode ser sobrescrito aqui.
 */
const USER_OVERRIDES: Record<number, Partial<TaskrowUser>> = {
  42280: { FunctionGroupName: "Criação" }, // Bruno — cadastrado como Diretoria no Taskrow
};

export function applyUserOverrides(users: TaskrowUser[]): TaskrowUser[] {
  return users.map((u) => {
    const override = USER_OVERRIDES[u.UserID];
    return override ? { ...u, ...override } : u;
  });
}
