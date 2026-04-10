import type { TaskrowTask } from "@/types/taskrow";

export function taskrowLink(t: TaskrowTask): string {
  console.log(t);
  return `https://crtcomunicacao.taskrow.com/#home/tasks/${t.clientNickName}/${t.jobNumber}/${t.taskNumber}`;
}
