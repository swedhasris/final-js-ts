/**
 * src/contexts/AuthContext.tsx
 *
 * Pure localStorage + Spring Boot REST API authentication.
 * Firebase Auth has been fully removed.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { ROLE_HIERARCHY, ROLE_LABELS, Role } from "../lib/roles";
import { PermissionProvider } from "./PermissionContext";

interface AuthContextType {
  user: any | null;
  profile: any | null;
  loading: boolean;
  demoLogin: (role: Role) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  demoLogin: async () => {},
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync auth state to localStorage so standalone pages (timesheet) can read it
  useEffect(() => {
    if (user && profile) {
      localStorage.setItem(
        "timesheet_user",
        JSON.stringify({
          uid: user.uid,
          name: profile.name || user.displayName || user.email?.split("@")[0] || "User",
          email: user.email,
          role: profile.role || "user",
        })
      );
    } else if (!user) {
      localStorage.removeItem("timesheet_user");
    }
  }, [user, profile]);

  useEffect(() => {
    let settled = false;

    const resolveLoading = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
        clearTimeout(safetyTimeout);
      }
    };

    // Safety timeout — prevent blank screen if something goes wrong
    const safetyTimeout = setTimeout(() => {
      console.warn("[AuthContext] Safety timeout — forcing loading=false");
      resolveLoading();
    }, 5000);

    // Check existing localStorage session
    const sessionStr = localStorage.getItem("demo_user");
    if (sessionStr) {
      try {
        const sessionUser = JSON.parse(sessionStr);
        setUser({
          uid: sessionUser.uid,
          email: sessionUser.email,
          displayName: sessionUser.name,
        });
        setProfile(sessionUser);
        resolveLoading();

        // Optionally refresh user profile from the API in background
        if (sessionUser.uid) {
          fetch(`/api/users/${sessionUser.uid}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((freshData) => {
              if (freshData && freshData.uid) {
                const merged = {
                  uid: freshData.uid || sessionUser.uid,
                  name: freshData.name || sessionUser.name,
                  email: freshData.email || sessionUser.email,
                  role: freshData.role || sessionUser.role || "user",
                  phone: freshData.phone || "",
                };
                setProfile(merged);
                localStorage.setItem("demo_user", JSON.stringify(merged));
              }
            })
            .catch(() => {});
        }

        return () => {
          clearTimeout(safetyTimeout);
        };
      } catch {
        localStorage.removeItem("demo_user");
      }
    }

    // No session — resolve immediately and let router redirect to /login
    resolveLoading();
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, []);

  const demoLogin = async (role: Role) => {
    // Roles other than ultra_super_admin use Password123!
    const emailMap: Record<string, string> = {
      user: "user@technosprint.net",
      agent: "agent@technosprint.net",
      admin: "admin@technosprint.net",
      super_admin: "ulter@technosprint.net",
      ultra_super_admin: "arun.g@technosprint.net",
      sub_admin: "admin@technosprint.net",
    };
    const passwordMap: Record<string, string> = {
      ultra_super_admin: "Poland@01",
    };
    const email = emailMap[role] || `demo-${role}@connectit.local`;
    const password = passwordMap[role] || "Password123!";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const userData = await res.json();
        const sessionUser = {
          uid: userData.uid,
          name: userData.name,
          email: userData.email,
          role: userData.role || role,
          phone: userData.phone || "",
        };
        localStorage.setItem("demo_user", JSON.stringify(sessionUser));
        setUser({ uid: sessionUser.uid, email: sessionUser.email, displayName: sessionUser.name });
        setProfile(sessionUser);
        return;
      }
    } catch (err) {
      console.warn("[AuthContext] demoLogin API failed:", err);
    }

    // Local fallback — create a mock session
    const mockUid = "demo_" + role + "_" + Date.now();
    const mockUser = {
      uid: mockUid,
      name: ROLE_LABELS[role],
      email: `demo-${role}@connectit.local`,
      role: role,
      isDemo: true,
    };
    localStorage.setItem("demo_user", JSON.stringify(mockUser));
    setUser({ uid: mockUid, email: mockUser.email, displayName: mockUser.name });
    setProfile(mockUser);
  };

  const signOut = async () => {
    localStorage.removeItem("demo_user");
    localStorage.removeItem("timesheet_user");
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, demoLogin, signOut }}>
      <PermissionProvider>
        {children}
      </PermissionProvider>
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
