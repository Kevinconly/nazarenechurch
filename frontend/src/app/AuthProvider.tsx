import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthUser } from "../lib/authApi";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  csrfToken: string;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshCsrf: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState("");
  const refreshCsrf = useCallback(async () => {
    const response = await authApi.csrf();
    setCsrfToken(response.csrfToken);
  }, []);

  useEffect(() => {
    let active = true;
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    Promise.all([authApi.me().catch(() => null), authApi.csrf()])
      .then(([me, csrf]) => {
        if (!active) return;
        setUser(me?.user ?? null);
        setCsrfToken(csrf.csrfToken);
      })
      .catch(() => {
        if (active) setError("Authentication service is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener("auth:unauthorized", onUnauthorized);
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError("");
      const token = csrfToken || (await authApi.csrf()).csrfToken;
      const result = await authApi.signIn(email, password, token);
      setUser(result.user);
      setCsrfToken(result.csrfToken);
    },
    [csrfToken],
  );

  const signOut = useCallback(async () => {
    setError("");
    try {
      await authApi.signOut(csrfToken);
    } catch (failure) {
      try {
        await authApi.me();
        throw failure;
      } catch (checkFailure) {
        if (checkFailure === failure) throw failure;
        setUser(null);
        setCsrfToken("");
        return;
      }
    }
    setUser(null);
    setCsrfToken("");
  }, [csrfToken]);

  const value = useMemo(
    () => ({ user, loading, csrfToken, error, signIn, signOut, refreshCsrf }),
    [user, loading, csrfToken, error, signIn, signOut, refreshCsrf],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
