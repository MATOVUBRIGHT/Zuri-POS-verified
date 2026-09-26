import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Staff } from "@/types";

const safeRead = <T>(key: string, parser: (value: string) => T, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return parser(raw);
  } catch {
    return fallback;
  }
};

const defaultCurrentPage = safeRead("brec_current_page", (value) => value || "dashboard", "dashboard");
const defaultCurrentStoreId = safeRead("brec_current_store", (value) => value, null);
const defaultActiveStaff = (() => {
  try {
    const storeId = defaultCurrentStoreId;
    const key = storeId ? `brec_active_staff_${storeId}` : 'brec_active_staff';
    return safeRead(key, (value) => JSON.parse(value) as Staff, null as Staff | null);
  } catch {
    return null;
  }
})();
const defaultUserRole = safeRead("brec_user_role", (value) => value || "owner", "owner");
const defaultShowOnboarding =
  typeof window === "undefined" || localStorage.getItem("brec_onboarding_complete") !== "true";

interface AppState {
  currentPage: string;
  pageParams: unknown;
  showOnboarding: boolean;
  currentStoreId: string | null;
  activeStaff: Staff | null;
  userRole: string;
  setCurrentPage: (page: string) => void;
  setPageParams: (params: unknown) => void;
  setShowOnboarding: (value: boolean) => void;
  setCurrentStoreId: (storeId: string | null) => void;
  setActiveStaff: (staff: Staff | null) => void;
  setUserRole: (role: string) => void;
}

export const useAppStateStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: defaultCurrentPage,
      pageParams: null,
      showOnboarding: defaultShowOnboarding,
      currentStoreId: defaultCurrentStoreId,
      activeStaff: defaultActiveStaff,
      userRole: defaultUserRole,

      setCurrentPage: (page) => set({ currentPage: page }),
      setPageParams: (params) => set({ pageParams: params }),
      setShowOnboarding: (value) => set({ showOnboarding: value }),
      setCurrentStoreId: (storeId) => set({ currentStoreId: storeId }),
      setActiveStaff: (staff) => set({ activeStaff: staff }),
      setUserRole: (role) => set({ userRole: role }),
    }),
    {
      name: "zuripos-app-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentPage: state.currentPage,
        pageParams: state.pageParams,
        showOnboarding: state.showOnboarding,
        currentStoreId: state.currentStoreId,
        activeStaff: state.activeStaff,
        userRole: state.userRole,
      }),
    }
  )
);
