import { useCallback, useEffect, useState } from "react";
import type {
  AuthProvider,
  AuthUser,
  CurrentAuthUser,
  MemberRole,
} from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isOwner: boolean;
  role: MemberRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider?: AuthProvider) => void;
  logout: () => void;
}

function getBasePath() {
  return window.location.pathname || "/";
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [role, setRole] = useState<MemberRole>("member");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/user", { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CurrentAuthUser>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsOwner(data.isOwner === true);
          setRole(data.role ?? "member");
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsOwner(false);
          setRole("member");
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((provider: AuthProvider = "replit") => {
    window.location.href = `/api/login?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent(getBasePath())}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = `/api/logout?returnTo=${encodeURIComponent(getBasePath())}`;
  }, []);

  return { user, isOwner, role, isLoading, isAuthenticated: Boolean(user), login, logout };
}