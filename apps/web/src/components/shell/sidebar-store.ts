import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  toggle(): void;
}

/** Collapsed/expanded sidebar, remembered per browser. */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'bfp-sidebar', storage: createJSONStorage(() => window.localStorage) },
  ),
);
