import { create } from "zustand";
import { format, subDays } from "date-fns";

const STORAGE_KEY = "crt_taskrow_api_key";

function loadApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_TASKROW_API_KEY || "";
}

interface DashboardStore {
  dateFrom: string;
  dateTo: string;
  setDateRange: (from: string, to: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  dateTo: format(new Date(), "yyyy-MM-dd"),
  setDateRange: (from, to) => set({ dateFrom: from, dateTo: to }),
  apiKey: loadApiKey(),
  setApiKey: (key) => {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ apiKey: key });
  },
}));
