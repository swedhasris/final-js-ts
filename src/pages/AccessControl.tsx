import React, { useEffect, useState } from "react";
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, setDoc, query, orderBy, where } from "firebase/firestore";
// Firebase Auth removed — user creation uses the REST API
import { auth, db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Role, ROLE_HIERARCHY, ROLE_LABELS, ROLE_COLORS, assignableRoles, canManage } from "../lib/roles";
import {
  ShieldAlert, ShieldCheck, ShieldOff, KeyRound,
  Search, Crown, Shield, UserCog, Mail, ChevronDown,
  Users, ChevronRight, ChevronUp, UserPlus, X, Eye, EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CREATE_NEW_INCIDENT_FEATURE_OPTIONS, DEFAULT_COMPANY_FEATURE_PERMISSION } from "../lib/createIncidentFeatures";

/* ── All system modules/features ─────────────────────────── */
const MODULES = [
  { key: "tickets",             label: "Tickets / Incidents",    icon: "🎫", group: "Service Desk" },
  { key: "conversations",       label: "Conversations",          icon: "💬", group: "Service Desk" },
  { key: "catalog",             label: "Service Catalog",        icon: "🛒", group: "Service Desk" },
  { key: "kb",                  label: "Knowledge Base",         icon: "📚", group: "Service Desk" },
  { key: "approvals",           label: "My Approvals",           icon: "✅", group: "Service Desk" },
  { key: "history",             label: "System Activity",        icon: "📋", group: "Service Desk" },
  { key: "timesheet",           label: "Timesheet",              icon: "⏱️", group: "Timesheet" },
  { key: "timesheet_reports",   label: "Timesheet Reports",      icon: "📊", group: "Timesheet" },
  { key: "approved_timesheet",  label: "Approved Timesheet",     icon: "📝", group: "Timesheet" },
  { key: "timesheet_approvals", label: "Timesheet Approvals",    icon: "🗂️", group: "Timesheet" },
  { key: "problem",             label: "Problem Management",     icon: "🔴", group: "ITSM" },
  { key: "change",              label: "Change Management",      icon: "🔄", group: "ITSM" },
  { key: "reports",             label: "Reports & Analytics",    icon: "📈", group: "Reports" },
  { key: "sla",                 label: "SLA Policies",           icon: "⏰", group: "Admin" },
  { key: "users",               label: "User Management",        icon: "👥", group: "Admin" },
  { key: "settings",            label: "System Settings",        icon: "⚙️", group: "Admin" },
  { key: "access_control",      label: "Access Control",         icon: "🔑", group: "Admin" },
];

const MODULE_GROUPS = [...new Set(MODULES.map(m => m.group))];

const ROLE_ICONS: Record<string, any> = {
  ultra_super_admin: Crown,
  super_admin: Crown,
  admin: Shield,
  sub_admin: Shield,
  agent: UserCog,
  user: UserCog,
};

/** iOS-style toggle */
function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed",
        enabled ? "bg-sn-green" : "bg-gray-300"
      )}>
      <span className={cn(
        "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
        enabled ? "translate-x-6" : "translate-x-1"
      )} />
    </button>
  );
}

export function AccessControl() {
  const { profile } = useAuth();
  const myRole = profile?.role || 'user';
  const [users, setUsers]           = useState<any[]>([]);
  const [companies, setCompanies]   = useState<any[]>([]);
  const [companyPermissions, setCompanyPermissions] = useState<Record<string, any>>({});
  const [search, setSearch]         = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [updating, setUpdating]     = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<"access" | "modules" | "company_features">("access");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [featureSyncing, setFeatureSyncing] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [newUser, setNewUser]       = useState({
    name: "", email: "", password: "", role: "user" as Role,
  });

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap =>
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, "companies"), orderBy("name")), (snap) => {
      const nextCompanies = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCompanies(nextCompanies);
      setSelectedCompanyId((current) => current || nextCompanies[0]?.id || "");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncFeatures = async () => {
      setFeatureSyncing(true);
      try {
        await Promise.all(
          CREATE_NEW_INCIDENT_FEATURE_OPTIONS.map((feature) =>
            setDoc(
              doc(db, "feature_master", feature.id),
              {
                ...feature,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            )
          )
        );
      } catch (error) {
        console.error("Failed to sync feature master", error);
      } finally {
        if (!cancelled) {
          setFeatureSyncing(false);
        }
      }
    };

    syncFeatures();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyPermissions({});
      setPermissionsLoading(false);
      setPermissionsError("");
      return;
    }

    setPermissionsLoading(true);
    setPermissionsError("");

    const permissionsQuery = query(
      collection(db, "company_feature_permissions"),
      where("companyId", "==", selectedCompanyId)
    );

    const unsubscribe = onSnapshot(
      permissionsQuery,
      (snap) => {
        const nextPermissions = snap.docs.reduce((acc, permissionDoc) => {
          const data = permissionDoc.data() as any;
          acc[data.featureId] = {
            id: permissionDoc.id,
            ...DEFAULT_COMPANY_FEATURE_PERMISSION,
            ...data,
          };
          return acc;
        }, {} as Record<string, any>);

        setCompanyPermissions(nextPermissions);
        setPermissionsLoading(false);
      },
      (error) => {
        console.error("Failed to load company feature permissions", error);
        setPermissionsError("Unable to load company feature permissions right now.");
        setPermissionsLoading(false);
      }
    );

    return unsubscribe;
  }, [selectedCompanyId]);

  if (ROLE_HIERARCHY[myRole] < ROLE_HIERARCHY["admin"]) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <ShieldAlert className="w-16 h-16 text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">Access Restricted</h2>
        <p className="text-muted-foreground">Administrator access or above required.</p>
      </div>
    );
  }

  const myAssignable = assignableRoles(myRole);

  // Refresh current user profile from API
  const refreshProfile = async () => {
    if (!profile?.uid) return;
    try {
      const res = await fetch(`/api/users/${profile.uid}`, {
        headers: {
          "x-user-uid": profile.uid,
          "x-user-email": profile.email || "",
        },
      });
      if (res.ok) {
        const freshData = await res.json();
        // Update the users list with fresh data
        setUsers(users.map(u => u.id === profile.uid ? freshData : u));
        
        // Update localStorage
        localStorage.setItem("demo_user", JSON.stringify(freshData));
        
        // Dispatch storage event for other tabs
        window.dispatchEvent(new StorageEvent("storage", {
          key: "demo_user",
          newValue: JSON.stringify(freshData),
          oldValue: localStorage.getItem("demo_user"),
        }));
      }
    } catch (err) {
      console.error("[AccessControl] Failed to refresh profile:", err);
    }
  };

  /* ── Toggle full account access ── */
  const toggleAccess = async (u: any) => {
    const uRole = (u.role || "user") as Role;
    if (!canManage(myRole, uRole)) { alert("You cannot modify this user's access."); return; }
    const willDisable = u.disabled !== true;
    if (willDisable && !confirm(`Remove ALL access for "${u.name || u.email}"?`)) return;
    setUpdating(u.id + "_access");
    await updateDoc(doc(db, "users", u.id), {
      disabled: willDisable,
      accessUpdatedBy: profile?.uid,
      accessUpdatedAt: serverTimestamp(),
    });
    
    // Refresh the current user's profile if we're modifying our own access
    if (u.id === profile?.uid) {
      await refreshProfile();
    }
    
    setUpdating(null);
  };

  /* ── Toggle individual module access ── */
  const toggleModule = async (userId: string, moduleKey: string, currentValue: boolean) => {
    setUpdating(userId + "_" + moduleKey);
    const user = users.find(u => u.id === userId);
    const uRole = (user?.role || "user") as Role;
    if (!canManage(myRole, uRole)) { alert("No permission."); setUpdating(null); return; }
    const restrictedModules = user?.restrictedModules || [];
    let updated: string[];
    if (currentValue) {
      // currently allowed → restrict it
      updated = [...restrictedModules, moduleKey];
    } else {
      // currently restricted → allow it
      updated = restrictedModules.filter((m: string) => m !== moduleKey);
    }
    await updateDoc(doc(db, "users", userId), {
      restrictedModules: updated,
      moduleUpdatedBy: profile?.uid,
      moduleUpdatedAt: serverTimestamp(),
    });
    
    // Refresh the current user's profile if we're modifying our own permissions
    if (userId === profile?.uid) {
      await refreshProfile();
    }
    
    setUpdating(null);
  };

  /* ── Change role ── */
  const changeRole = async (userId: string, newRole: Role, currentRole: Role) => {
    if (!canManage(myRole, newRole) || !canManage(myRole, currentRole)) {
      alert("You cannot assign roles at or above your own level."); return;
    }
    setUpdating(userId + "_role");
    await updateDoc(doc(db, "users", userId), {
      role: newRole, roleUpdatedBy: profile?.uid, roleUpdatedAt: serverTimestamp(),
    });
    
    // Refresh the current user's profile if we're modifying our own role
    if (userId === profile?.uid) {
      await refreshProfile();
    }
    
    setUpdating(null);
  };

  /* ── Create new user via REST API ── */
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      setCreateError("All fields are required."); return;
    }
    if (newUser.password.length < 6) {
      setCreateError("Password must be at least 6 characters."); return;
    }
    if (!canManage(myRole, newUser.role)) {
      setCreateError("You cannot create users with a role at or above your own level."); return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const uid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Check if email already exists
      const checkRes = await fetch("/api/users");
      if (checkRes.ok) {
        const existingUsers = await checkRes.json();
        const emailExists = existingUsers.some((u: any) =>
          u.email?.toLowerCase() === newUser.email.toLowerCase().trim()
        );
        if (emailExists) {
          setCreateError("This email is already registered.");
          setCreating(false);
          return;
        }
      }

      // Create user via REST API
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          name: newUser.name.trim(),
          email: newUser.email.toLowerCase().trim(),
          role: newUser.role,
          password: newUser.password,
          disabled: false,
          createdBy: profile?.uid,
          is_active: true,
          is_demo: false,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create user.");
      }

      setShowCreate(false);
      setNewUser({ name: "", email: "", password: "", role: "user" });
      
      // Refresh the users list after creating a new user
      await refreshProfile();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create user.");
    }
    setCreating(false);
  };

  /* ── Filter ── */
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const activeCount   = users.filter(u => u.disabled !== true).length;
  const disabledCount = users.filter(u => u.disabled === true).length;
  const canManageCompanyFeatures = ROLE_HIERARCHY[myRole] >= ROLE_HIERARCHY["super_admin"];
  const visibleFeaturePermissions = CREATE_NEW_INCIDENT_FEATURE_OPTIONS.filter((feature) =>
    !permissionSearch || feature.name.toLowerCase().includes(permissionSearch.toLowerCase())
  );

  const getPermissionForFeature = (featureId: string) => ({
    ...DEFAULT_COMPANY_FEATURE_PERMISSION,
    ...(companyPermissions[featureId] || {}),
  });

  const updateCompanyFeaturePermission = async (
    featureId: string,
    updates: Partial<typeof DEFAULT_COMPANY_FEATURE_PERMISSION>
  ) => {
    if (!selectedCompanyId || !canManageCompanyFeatures) {
      return;
    }

    setUpdating(`company_${selectedCompanyId}_${featureId}`);
    try {
      await setDoc(
        doc(db, "company_feature_permissions", `${selectedCompanyId}_${featureId}`),
        {
          companyId: selectedCompanyId,
          featureId,
          ...getPermissionForFeature(featureId),
          ...updates,
          updatedBy: profile?.uid || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sn-dark rounded-xl flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-sn-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-sn-dark">Access Control</h1>
            <p className="text-sm text-muted-foreground">
              Control system access and feature permissions per user ·
              <span className={cn("ml-1 px-2 py-0.5 rounded text-xs font-bold", ROLE_COLORS[myRole])}>
                {ROLE_LABELS[myRole]}
              </span>
            </p>
          </div>
        </div>
        {/* Add Login button — admin and above */}
        <button onClick={() => { setShowCreate(true); setCreateError(""); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-sn-green text-sn-dark rounded-xl font-bold text-sm hover:opacity-90 transition-opacity shadow-sm">
          <UserPlus className="w-4 h-4" />
          Add Login
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-sn-dark opacity-70" />
          <div><div className="text-2xl font-bold text-sn-dark">{users.length}</div><div className="text-xs text-muted-foreground">Total Users</div></div>
        </div>
        <div className="bg-card border border-green-200 dark:border-green-900 rounded-xl p-4 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-green-600 opacity-70" />
          <div><div className="text-2xl font-bold text-green-600">{activeCount}</div><div className="text-xs text-muted-foreground">Active</div></div>
        </div>
        <div className="bg-card border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center gap-3">
          <ShieldOff className="w-8 h-8 text-red-600 opacity-70" />
          <div><div className="text-2xl font-bold text-red-600">{disabledCount}</div><div className="text-xs text-muted-foreground">Disabled</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {[
          { key: "access",  label: "Account Access",   desc: "Grant or remove login access" },
          { key: "modules", label: "Feature Access",   desc: "Control per-module permissions" },
          { key: "company_features", label: "Company Dropdown Access", desc: "Control Create New Incident features per company" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={cn("flex flex-col px-6 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors",
              activeTab === tab.key ? "border-sn-green text-sn-dark" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {tab.label}
            <span className="text-[10px] font-normal text-muted-foreground">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm w-52 outline-none focus:ring-2 focus:ring-sn-green" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="p-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sn-green">
          <option value="all">All Roles</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map(r => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} users</span>
      </div>

      {/* ── TAB 1: Account Access ── */}
      {activeTab === "access" && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/10 flex items-center justify-between">
            <span className="text-sm font-bold">Account Access Control</span>
            <span className="text-xs text-muted-foreground">Toggle to grant or remove login access</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/20 border-b border-border text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                <th className="p-4">User</th>
                <th className="p-4">Role</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Access Toggle</th>
                <th className="p-4">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No users found.</td></tr>
              ) : filtered.map(u => {
                const uRole      = (u.role || "user") as Role;
                const Icon       = ROLE_ICONS[uRole] || UserCog;
                const isMe       = u.uid === profile?.uid || u.id === profile?.uid;
                const canEdit    = !isMe && canManage(myRole, uRole);
                const isDisabled = u.disabled === true;
                const isUpdatingAccess = updating === u.id + "_access";
                const isUpdatingRole   = updating === u.id + "_role";

                return (
                  <tr key={u.id} className={cn("transition-colors",
                    isDisabled ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-muted/5")}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                          isDisabled ? "bg-gray-200 text-gray-500" : ROLE_COLORS[uRole])}>
                          {(u.name || u.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className={cn("font-semibold text-sm", isDisabled && "line-through text-muted-foreground")}>
                            {u.name || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />{u.email}
                          </div>
                          {isMe && <div className="text-[10px] text-sn-green font-bold">You</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 w-fit", ROLE_COLORS[uRole])}>
                        <Icon className="w-3 h-3" />{ROLE_LABELS[uRole] || uRole}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {isDisabled ? (
                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold bg-red-50 px-2 py-1 rounded-full border border-red-200">
                          <ShieldOff className="w-3 h-3" /> Disabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-700 text-xs font-bold bg-green-50 px-2 py-1 rounded-full border border-green-200">
                          <ShieldCheck className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1">
                        {isMe ? (
                          <span className="text-xs text-muted-foreground italic">Your account</span>
                        ) : !canEdit ? (
                          <span className="text-xs text-muted-foreground italic">No permission</span>
                        ) : (
                          <>
                            <Toggle enabled={!isDisabled} onChange={() => toggleAccess(u)} disabled={isUpdatingAccess} />
                            <span className={cn("text-[10px] font-bold", isDisabled ? "text-red-500" : "text-green-600")}>
                              {isUpdatingAccess ? "Saving..." : isDisabled ? "OFF" : "ON"}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {canEdit ? (
                        <div className="relative">
                          <select value={uRole} disabled={isUpdatingRole}
                            onChange={e => changeRole(u.id, e.target.value as Role, uRole)}
                            className="pl-2 pr-7 py-1.5 border border-border rounded text-xs outline-none focus:ring-1 focus:ring-sn-green appearance-none bg-white cursor-pointer">
                            {myAssignable.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                        </div>
                      ) : <span className="text-xs text-muted-foreground italic">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 2: Feature/Module Access ── */}
      {activeTab === "modules" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded-lg text-sm flex items-start gap-2">
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Click a user to expand and toggle individual feature access. <strong>Green = allowed, Gray = restricted.</strong></span>
          </div>

          {filtered.map(u => {
            const uRole      = (u.role || "user") as Role;
            const Icon       = ROLE_ICONS[uRole] || UserCog;
            const isMe       = u.uid === profile?.uid || u.id === profile?.uid;
            const canEdit    = !isMe && canManage(myRole, uRole);
            const isDisabled = u.disabled === true;
            const isExpanded = expandedUser === u.id;
            const restricted: string[] = u.restrictedModules || [];

            return (
              <div key={u.id} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                {/* User row — click to expand */}
                <button className="w-full flex items-center gap-4 p-4 hover:bg-muted/5 transition-colors text-left"
                  onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                    isDisabled ? "bg-gray-200 text-gray-500" : ROLE_COLORS[uRole])}>
                    {(u.name || u.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-semibold text-sm", isDisabled && "line-through text-muted-foreground")}>
                        {u.name || "—"}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1", ROLE_COLORS[uRole])}>
                        <Icon className="w-3 h-3" />{ROLE_LABELS[uRole]}
                      </span>
                      {isDisabled && (
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Account Disabled</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{restricted.length > 0 ? `${restricted.length} restricted` : "Full access"}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded module grid */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/5">
                    {!canEdit ? (
                      <p className="text-sm text-muted-foreground italic text-center py-4">
                        You don't have permission to modify this user's feature access.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {MODULE_GROUPS.map(group => (
                          <div key={group}>
                            <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-2">
                              <div className="h-px flex-grow bg-border" />
                              {group}
                              <div className="h-px flex-grow bg-border" />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {MODULES.filter(m => m.group === group).map(mod => {
                                const isAllowed  = !restricted.includes(mod.key);
                                const isUpdatingMod = updating === u.id + "_" + mod.key;
                                return (
                                  <div key={mod.key}
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-lg border transition-colors",
                                      isAllowed ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                                    )}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-base">{mod.icon}</span>
                                      <span className={cn("text-xs font-medium truncate", !isAllowed && "text-muted-foreground")}>
                                        {mod.label}
                                      </span>
                                    </div>
                                    <Toggle
                                      enabled={isAllowed}
                                      onChange={() => toggleModule(u.id, mod.key, isAllowed)}
                                      disabled={isUpdatingMod}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                          <button onClick={async () => {
                            await updateDoc(doc(db, "users", u.id), { restrictedModules: MODULES.map(m => m.key) });
                          }} className="px-3 py-1.5 text-xs font-bold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                            Restrict All
                          </button>
                          <button onClick={async () => {
                            await updateDoc(doc(db, "users", u.id), { restrictedModules: [] });
                          }} className="px-3 py-1.5 text-xs font-bold border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors">
                            Allow All
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Login Modal ── */}
      {activeTab === "company_features" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl shadow-sm">
            <div className="p-4 border-b border-border flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-sm font-bold text-sn-dark">Create New Incident Feature Access</h2>
                <p className="text-xs text-muted-foreground">
                  Control Create New Incident fields, sections, and buttons by company without changing the existing workflow.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Company Name</label>
                  <select
                    value={selectedCompanyId}
                    onChange={e => setSelectedCompanyId(e.target.value)}
                    className="min-w-[220px] p-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sn-green"
                  >
                    {companies.length === 0 ? (
                      <option value="">No companies found</option>
                    ) : (
                      companies.map(company => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Feature Search</label>
                  <input
                    type="text"
                    value={permissionSearch}
                    onChange={e => setPermissionSearch(e.target.value)}
                    placeholder="Search fields, buttons, sections..."
                    className="min-w-[220px] p-2 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sn-green"
                  />
                </div>
              </div>
            </div>

            {!canManageCompanyFeatures && (
              <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Super Admin access or above is required to manage company dropdown access.
              </div>
            )}

            {featureSyncing && (
              <div className="m-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Syncing the Create New Incident feature catalog...
              </div>
            )}

            {permissionsError && (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {permissionsError}
              </div>
            )}

            {!selectedCompanyId && !permissionsLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Select a company to manage feature permissions.
              </div>
            )}

            {selectedCompanyId && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/20 border-y border-border text-[10px] font-bold uppercase text-muted-foreground tracking-wide">
                      <th className="p-4">Company Name</th>
                      <th className="p-4">Feature Name</th>
                      <th className="p-4 text-center">View</th>
                      <th className="p-4 text-center">Use</th>
                      <th className="p-4 text-center">Edit</th>
                      <th className="p-4 text-center">Mandatory</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {permissionsLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                          Loading company feature permissions...
                        </td>
                      </tr>
                    ) : visibleFeaturePermissions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                          No Create New Incident features match this search.
                        </td>
                      </tr>
                    ) : (
                      visibleFeaturePermissions.map(feature => {
                        const permission = getPermissionForFeature(feature.id);
                        const companyName = companies.find(company => company.id === selectedCompanyId)?.name || "Selected Company";
                        const rowUpdating = updating === `company_${selectedCompanyId}_${feature.id}`;

                        return (
                          <tr key={feature.id} className="hover:bg-muted/5 transition-colors">
                            <td className="p-4 text-sm font-medium text-sn-dark">{companyName}</td>
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-sn-dark">{feature.name}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{feature.type}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex justify-center">
                                <Toggle
                                  enabled={permission.canView}
                                  disabled={!canManageCompanyFeatures || rowUpdating}
                                  onChange={() => updateCompanyFeaturePermission(feature.id, { canView: !permission.canView })}
                                />
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex justify-center">
                                <Toggle
                                  enabled={permission.canUse}
                                  disabled={!canManageCompanyFeatures || rowUpdating}
                                  onChange={() => updateCompanyFeaturePermission(feature.id, { canUse: !permission.canUse })}
                                />
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex justify-center">
                                <Toggle
                                  enabled={permission.canEdit}
                                  disabled={!canManageCompanyFeatures || rowUpdating}
                                  onChange={() => updateCompanyFeaturePermission(feature.id, { canEdit: !permission.canEdit })}
                                />
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex justify-center">
                                <Toggle
                                  enabled={permission.isMandatory}
                                  disabled={!canManageCompanyFeatures || rowUpdating}
                                  onChange={() => updateCompanyFeaturePermission(feature.id, { isMandatory: !permission.isMandatory })}
                                />
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-3">
                                <Toggle
                                  enabled={permission.status !== "disabled"}
                                  disabled={!canManageCompanyFeatures || rowUpdating}
                                  onChange={() => updateCompanyFeaturePermission(feature.id, {
                                    status: permission.status === "disabled" ? "enabled" : "disabled"
                                  })}
                                />
                                <span className={cn(
                                  "text-[10px] font-bold uppercase tracking-wide",
                                  permission.status === "disabled" ? "text-red-600" : "text-green-700"
                                )}>
                                  {rowUpdating ? "Saving..." : permission.status === "disabled" ? "Disabled" : "Enabled"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border bg-sn-dark text-white">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-sn-green" />
                <div>
                  <div className="font-bold">Add New Login</div>
                  <div className="text-xs text-white/60">Create a new user account</div>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-white/10 rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{createError}</div>
              )}
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input type="text" required value={newUser.name} onChange={e => setNewUser(u => ({...u, name: e.target.value}))}
                  placeholder="John Doe" className="w-full p-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-sn-green outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Email Address <span className="text-red-500">*</span></label>
                <input type="email" required value={newUser.email} onChange={e => setNewUser(u => ({...u, email: e.target.value}))}
                  placeholder="name@company.com" className="w-full p-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-sn-green outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} required value={newUser.password}
                    onChange={e => setNewUser(u => ({...u, password: e.target.value}))}
                    placeholder="Min. 6 characters" className="w-full p-3 pr-10 border border-border rounded-lg text-sm focus:ring-2 focus:ring-sn-green outline-none" />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Role <span className="text-red-500">*</span></label>
                <select value={newUser.role} onChange={e => setNewUser(u => ({...u, role: e.target.value as Role}))}
                  className="w-full p-3 border border-border rounded-lg text-sm focus:ring-2 focus:ring-sn-green outline-none">
                  {assignableRoles(myRole).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">You can only assign roles below your level ({ROLE_LABELS[myRole]})</p>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex items-center gap-2 px-5 py-2 bg-sn-green text-sn-dark rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
                  <UserPlus className="w-4 h-4" />
                  {creating ? "Creating..." : "Create Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
