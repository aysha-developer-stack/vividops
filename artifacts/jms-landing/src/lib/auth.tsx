import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useLogin as useLoginMutation,
  useLogout as useLogoutMutation,
  useResetPassword as useResetPasswordMutation,
  getGetMeQueryKey,
  getMe,
  type User,
  ApiError,
} from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";

// ---------------------------------------------------------------------------
// Module-level cache so non-React callers (DashboardLayout sync getters) keep
// working without rewiring every page.
// ---------------------------------------------------------------------------
let cachedUser: User | null = null;

function setCachedUser(u: User | null) {
  cachedUser = u;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const logoutMutation = useLogout();
  
  const meQuery = useQuery({
    queryKey: getGetMeQueryKey(),
    queryFn: async () => {
      try {
        const user = await getMe();
        // Valid server session — mark this tab as active. Do not logout here;
        // clearing sessionStorage alone must not destroy a valid cookie session.
        if (user) {
          sessionStorage.setItem("vops_tab_active", "true");
        }
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    setCachedUser(meQuery.data ?? null);
    
    // If we are definitely NOT authenticated, clear the tab flag
    if (meQuery.isSuccess && !meQuery.data) {
      sessionStorage.removeItem("vops_tab_active");
    }
  }, [meQuery.data, meQuery.isSuccess]);

  const value: AuthContextValue = {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    isAuthenticated: !!meQuery.data,
    refresh: () => qc.invalidateQueries({ queryKey: getGetMeQueryKey() }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Mutation re-exports (handy + cache invalidation glue)
// ---------------------------------------------------------------------------
export function useLogin() {
  const qc = useQueryClient();
  return useLoginMutation({
    mutation: {
      onSuccess: (data) => {
        // Mark this tab as having an active session
        sessionStorage.setItem("vops_tab_active", "true");
        qc.setQueryData(getGetMeQueryKey(), data.user);
        setCachedUser(data.user);
      },
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useLogoutMutation({
    mutation: {
      onSuccess: () => {
        sessionStorage.removeItem("vops_tab_active");
        qc.setQueryData(getGetMeQueryKey(), null);
        setCachedUser(null);
        qc.clear();
      },
    },
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useResetPasswordMutation({
    mutation: {
      onSuccess: (data) => {
        sessionStorage.setItem("vops_tab_active", "true");
        qc.setQueryData(getGetMeQueryKey(), data);
        setCachedUser(data);
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Backward-compat sync helpers (used by DashboardLayout). Read from cache.
// clearSession fires logout in the background.
// ---------------------------------------------------------------------------
export function getName(): string {
  return cachedUser?.name ?? "Guest";
}
export function getEmail(): string {
  return cachedUser?.email ?? "";
}
export function getRole(): Role {
  return (cachedUser?.role as Role | undefined) ?? "user";
}
export function clearSession() {
  // Fire-and-forget logout.
  fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(
    () => undefined,
  );
  sessionStorage.removeItem("vops_tab_active");
  setCachedUser(null);
}
// Kept only so legacy imports don't break — real flow goes through useLogin.
export function setSession(_email: string, _name?: string, _role?: Role) {
  // no-op
}
