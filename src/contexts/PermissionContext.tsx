import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { ROLE_HIERARCHY, Role, Permissions } from "../lib/roles";

interface PermissionContextType {
  canAccess: (moduleKey: string, action?: string) => boolean;
  hasPermission: (permission: string, role?: Role) => boolean;
  isRestricted: (moduleKey: string) => boolean;
  refreshPermissions: () => Promise<void>;
  loading: boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}

interface PermissionProviderProps {
  children: ReactNode;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const { user, profile, loading: authLoading } = useAuth();
  const [userProfile, setUserProfile] = useState(profile);
  const [loading, setLoading] = useState(authLoading);

  // Fetch fresh user profile from API
  const refreshPermissions = async () => {
    if (!user?.uid) return;
    
    try {
      const res = await fetch(`/api/users/${user.uid}`, {
        headers: {
          "x-user-uid": user.uid,
          "x-user-email": user.email || "",
        },
      });
      if (res.ok) {
        const freshData = await res.json();
        setUserProfile(freshData);
        // Update localStorage for standalone pages
        localStorage.setItem("demo_user", JSON.stringify(freshData));
        
        // Dispatch storage event for other tabs
        window.dispatchEvent(new StorageEvent("storage", {
          key: "demo_user",
          newValue: JSON.stringify(freshData),
          oldValue: localStorage.getItem("demo_user"),
        }));
      }
    } catch (err) {
      console.error("[PermissionContext] Failed to refresh permissions:", err);
    }
  };

  // Listen for storage events (when other tabs update permissions)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "demo_user" && e.newValue) {
        try {
          const freshData = JSON.parse(e.newValue);
          setUserProfile(freshData);
        } catch (err) {
          console.error("[PermissionContext] Failed to parse storage event:", err);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Update local profile when auth context changes
  useEffect(() => {
    if (profile && profile.uid !== userProfile?.uid) {
      setUserProfile(profile);
    }
  }, [profile, userProfile]);

  // Check if a user has access to a specific module
  const canAccess = (moduleKey: string, action?: string): boolean => {
    if (!userProfile || userProfile.disabled) return false;
    
    // Get restricted modules list
    const restrictedModules = userProfile.restrictedModules;
    if (!restrictedModules) return true;
    
    try {
      // Check if module is in restricted list
      const modules = JSON.parse(restrictedModules);
      return !modules.includes(moduleKey);
    } catch (err) {
      console.error("[PermissionContext] Failed to parse restrictedModules:", err);
      return true;
    }
  };

  // Check if a user has a specific permission based on role
  const hasPermission = (permission: string, role?: Role): boolean => {
    const targetRole = role || userProfile?.role || "user";
    
    // Map permission names to the Permissions object
    const permissionMap: Record<string, (role: Role) => boolean> = {
      "viewAllTickets": Permissions.viewAllTickets,
      "manageTickets": Permissions.manageTickets,
      "approveTimesheets": Permissions.approveTimesheets,
      "manageUsers": Permissions.manageUsers,
      "manageDropdowns": Permissions.manageDropdowns,
      "companyWideView": Permissions.companyWideView,
      "manageSLA": Permissions.manageSLA,
      "systemSettings": Permissions.systemSettings,
      "fullControl": Permissions.fullControl,
    };
    
    const permissionFn = permissionMap[permission];
    if (!permissionFn) return false;
    
    return permissionFn(targetRole);
  };

  // Check if a specific module is restricted for the current user
  const isRestricted = (moduleKey: string): boolean => {
    return !canAccess(moduleKey);
  };

  const value: PermissionContextType = {
    canAccess,
    hasPermission,
    isRestricted,
    refreshPermissions,
    loading: loading || authLoading,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}
