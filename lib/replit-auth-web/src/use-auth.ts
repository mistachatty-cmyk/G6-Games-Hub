import { useCallback, useEffect, useState } from "react";
import type { AuthUser, CurrentAuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isOwner: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function getBasePath() {
  return window.location.pathname || "/";
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);
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
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsOwner(false);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    window.location.href = `/api/login?returnTo=${encodeURIComponent(getBasePath())}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = `/api/logout?returnTo=${encodeURIComponent(getBasePath())}`;
  }, []);

  return { user, isOwner, isLoading, isAuthenticated: Boolean(user), login, logout };
}