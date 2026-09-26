import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BatchItem } from "@/types";

export interface BatchDraft {
  id: string;
  name: string;
  items: BatchItem[];
  savedAt: string;
}

interface BatchDraftsState {
  heldBatch: BatchItem[];
  drafts: BatchDraft[];
  holdBatch: (items: BatchItem[]) => void;
  clearHeld: () => void;
  saveDraft: (items: BatchItem[], name?: string) => void;
  deleteDraft: (id: string) => void;
}

export const useBatchDraftsStore = create<BatchDraftsState>()(
  persist(
    (set) => ({
      heldBatch: [],
      drafts: [],

      holdBatch: (items) => set({ heldBatch: items }),
      clearHeld: () => set({ heldBatch: [] }),

      saveDraft: (items, name) =>
        set((state) => ({
          drafts: [
            ...state.drafts,
            {
              id: Math.random().toString(36).substr(2, 9),
              name: name || `Draft ${new Date().toLocaleString()}`,
              items,
              savedAt: new Date().toISOString(),
            },
          ],
        })),

      deleteDraft: (id) =>
        set((state) => ({ drafts: state.drafts.filter((d) => d.id !== id) })),
    }),
    { name: "zuripos-batch-drafts" }
  )
);
