import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./context";
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from "../lib/api";

// status: "loading" while the silent refresh runs on page load, then "authenticated" or "anonymous".
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");

  const applySession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    let cancelled = false;
    refreshSession()
      .then((data) => !cancelled && applySession(data))
      .catch(() => !cancelled && clearSession());
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",

      startRegister: (body) => api("/api/auth/register", { method: "POST", body, auth: false }),
      verifyRegister: async (body) => applySession(await api("/api/auth/register/verify", { method: "POST", body, auth: false })),

      // Returns { otpRequired, challengeId, email } or signs in directly when no code is needed.
      login: async (body) => {
        const data = await api("/api/auth/login", { method: "POST", body, auth: false });
        if (!data.otpRequired) applySession(data);
        return data;
      },
      verifyLogin: async (body) => applySession(await api("/api/auth/login/verify", { method: "POST", body, auth: false })),
      resendCode: (challengeId) => api("/api/auth/otp/resend", { method: "POST", body: { challengeId }, auth: false }),

      forgotPassword: (email) => api("/api/auth/password/forgot", { method: "POST", body: { email }, auth: false }),
      resetPassword: (body) => api("/api/auth/password/reset", { method: "POST", body, auth: false }),

      logout: async () => {
        try {
          await api("/api/auth/logout", { method: "POST", auth: false });
        } finally {
          clearSession();
        }
      },
      logoutEverywhere: async () => {
        await api("/api/me/logout-all", { method: "POST" });
        clearSession();
      },
      changePassword: async (body) => applySession(await api("/api/me/password", { method: "POST", body })),
      updateProfile: async (body) => {
        const data = await api("/api/me", { method: "PATCH", body });
        setUser(data.user);
        return data.user;
      },
    }),
    [user, status, applySession, clearSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
