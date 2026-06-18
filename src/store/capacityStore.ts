import { create } from "zustand";
import { DEFAULT_CAPACITY_PER_USER } from "@/lib/capacityEngine";
import type { SimulationEntry } from "@/types/capacity";

interface CapacityStore {
  // Configuration
  capacityPerUser: number;
  setCapacityPerUser: (v: number) => void;

  // Simulation mode
  simulationActive: boolean;
  toggleSimulation: () => void;
  simEntries: SimulationEntry[];
  addSimEntry: (entry: Omit<SimulationEntry, "id">) => void;
  removeSimEntry: (id: string) => void;
  clearSim: () => void;

  // View state
  selectedPeriodKey: string | null;
  setSelectedPeriodKey: (key: string | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  /** Selected area (FunctionGroupName) or null for "Todas" */
  selectedArea: string | null;
  setSelectedArea: (area: string | null) => void;
}

let simIdCounter = 0;

export const useCapacityStore = create<CapacityStore>((set) => ({
  capacityPerUser: DEFAULT_CAPACITY_PER_USER,
  setCapacityPerUser: (v) => set({ capacityPerUser: Math.max(5, Math.min(200, v)) }),

  simulationActive: false,
  toggleSimulation: () => set(s => ({ simulationActive: !s.simulationActive })),

  simEntries: [],
  addSimEntry: (entry) => set(s => ({
    simEntries: [...s.simEntries, { ...entry, id: `sim-${++simIdCounter}` }],
  })),
  removeSimEntry: (id) => set(s => ({
    simEntries: s.simEntries.filter(e => e.id !== id),
  })),
  clearSim: () => set({ simEntries: [], simulationActive: false }),

  selectedPeriodKey: null,
  setSelectedPeriodKey: (key) => set({ selectedPeriodKey: key }),

  activeTab: "heatmap",
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedArea: null,
  setSelectedArea: (area) => set({ selectedArea: area, selectedPeriodKey: null }),
}));
