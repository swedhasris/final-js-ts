import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Clock,
  Edit,
  Plus,
  ShieldAlert,
  Trash2,
  X,
  CalendarClock,
  CalendarDays,
  Siren,
  FileBarChart,
  PauseCircle,
  PlayCircle,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";

type SlaTab = "dashboard" | "policies" | "business-hours" | "holiday-calendar" | "escalation-rules" | "reports";

type EscalationLevel = {
  level: number;
  afterHours: number;
  notifyRole: string;
};

type SlaMeta = {
  policyScope: "priority" | "category" | "group";
  groupName: string;
  customBusinessHours: boolean;
  businessHoursName: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: string[];
  pauseOnPending: boolean;
  resumeOnCustomerReply: boolean;
  escalationLevels: EscalationLevel[];
  holidayCalendarName: string;
};

type ApiPolicy = {
  id: number;
  name: string;
  priority: string;
  category: string;
  responseTimeHours: number;
  resolutionTimeHours: number;
  isActive: boolean;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PolicyFormState = {
  name: string;
  priority: string;
  category: string;
  responseTimeHours: number;
  resolutionTimeHours: number;
  isActive: boolean;
  description: string;
  meta: SlaMeta;
};

type PolicyView = ApiPolicy & {
  plainDescription: string;
  meta: SlaMeta;
};

type SlaBreach = {
  id?: number | string;
  slaName?: string;
  recordId?: string;
  ticketNumber?: string;
  assignedUser?: string;
  breachedAt?: string;
  escalated?: boolean;
};

const META_PREFIX = "[SLA_META]";
const TAB_LABELS: Record<SlaTab, string> = {
  dashboard: "SLA Dashboard",
  policies: "SLA Policies",
  "business-hours": "Business Hours",
  "holiday-calendar": "Holiday Calendar",
  "escalation-rules": "Escalation Rules",
  reports: "SLA Reports",
};

const PRIORITIES = ["1 - Critical", "2 - High", "3 - Moderate", "4 - Low"];
const CATEGORIES = ["Inquiry / Help", "Software", "Hardware", "Network", "Database"];
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_META: SlaMeta = {
  policyScope: "priority",
  groupName: "",
  customBusinessHours: false,
  businessHoursName: "Default Support Hours",
  businessHoursStart: "08:00",
  businessHoursEnd: "18:00",
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  pauseOnPending: true,
  resumeOnCustomerReply: true,
  escalationLevels: [
    { level: 1, afterHours: 1, notifyRole: "Admin" },
    { level: 2, afterHours: 2, notifyRole: "Super Admin" },
  ],
  holidayCalendarName: "Default Holiday Calendar",
};

const DEFAULT_FORM: PolicyFormState = {
  name: "",
  priority: PRIORITIES[2],
  category: CATEGORIES[0],
  responseTimeHours: 4,
  resolutionTimeHours: 24,
  isActive: true,
  description: "",
  meta: DEFAULT_META,
};

function cloneDefaultMeta(): SlaMeta {
  return {
    ...DEFAULT_META,
    workingDays: [...DEFAULT_META.workingDays],
    escalationLevels: DEFAULT_META.escalationLevels.map(level => ({ ...level })),
  };
}

function createDefaultForm(): PolicyFormState {
  return {
    ...DEFAULT_FORM,
    meta: cloneDefaultMeta(),
  };
}

function safeParseMeta(description?: string | null): { plainDescription: string; meta: SlaMeta } {
  if (!description) {
    return { plainDescription: "", meta: cloneDefaultMeta() };
  }

  const markerIndex = description.indexOf(META_PREFIX);
  if (markerIndex === -1) {
    return { plainDescription: description.trim(), meta: cloneDefaultMeta() };
  }

  const plainDescription = description.slice(0, markerIndex).trim();
  const rawMeta = description.slice(markerIndex + META_PREFIX.length).trim();

  try {
    const parsed = JSON.parse(rawMeta);
    return {
      plainDescription,
      meta: {
        ...cloneDefaultMeta(),
        ...parsed,
        workingDays: Array.isArray(parsed.workingDays) ? parsed.workingDays : cloneDefaultMeta().workingDays,
        escalationLevels: Array.isArray(parsed.escalationLevels) && parsed.escalationLevels.length > 0
          ? parsed.escalationLevels.map((level: any, index: number) => ({
              level: Number(level.level || index + 1),
              afterHours: Number(level.afterHours || 0),
              notifyRole: String(level.notifyRole || "Admin"),
            }))
          : cloneDefaultMeta().escalationLevels,
      },
    };
  } catch {
    return { plainDescription: description.trim(), meta: cloneDefaultMeta() };
  }
}

function buildDescription(description: string, meta: SlaMeta) {
  const trimmed = description.trim();
  return `${trimmed}${trimmed ? "\n\n" : ""}${META_PREFIX} ${JSON.stringify(meta)}`;
}

function getActiveTab(value: string | null): SlaTab {
  const tabs: SlaTab[] = ["dashboard", "policies", "business-hours", "holiday-calendar", "escalation-rules", "reports"];
  return tabs.includes(value as SlaTab) ? (value as SlaTab) : "dashboard";
}

export function SLAManagement() {
  const { profile } = useAuth();
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getActiveTab(searchParams.get("tab"));
  const isAllowedRole = ["admin", "super_admin", "ultra_super_admin"].includes(profile?.role || "");
  const canManageSla = isAllowedRole && hasPermission("manageSLA");

  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [breaches, setBreaches] = useState<SlaBreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyFormState>(createDefaultForm);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-user-uid": profile?.uid || "",
      "x-user-email": profile?.email || "",
    }),
    [profile?.uid, profile?.email]
  );

  useEffect(() => {
    if (!canManageSla) {
      setLoading(false);
      return;
    }

    const fetchSlaData = async () => {
      setLoading(true);
      setError("");

      try {
        const [policiesRes, breachesRes] = await Promise.all([
          fetch("/api/sla/policies", { headers: authHeaders }),
          fetch("/api/sla/breaches", { headers: authHeaders }),
        ]);

        if (!policiesRes.ok) {
          throw new Error(policiesRes.status === 403 ? "You do not have permission to view SLA policies." : "Failed to load SLA policies.");
        }

        const policiesData: ApiPolicy[] = await policiesRes.json();
        const breachesData: SlaBreach[] = breachesRes.ok ? await breachesRes.json() : [];

        setPolicies(
          policiesData.map(policy => {
            const parsed = safeParseMeta(policy.description);
            return {
              ...policy,
              plainDescription: parsed.plainDescription,
              meta: parsed.meta,
            };
          })
        );
        setBreaches(Array.isArray(breachesData) ? breachesData : []);
      } catch (err: any) {
        setError(err?.message || "Failed to load SLA management data.");
      } finally {
        setLoading(false);
      }
    };

    fetchSlaData();
  }, [authHeaders, canManageSla]);

  const metrics = useMemo(() => {
    const activePolicies = policies.filter(policy => policy.isActive).length;
    const pausedPolicies = policies.filter(policy => policy.meta.pauseOnPending).length;
    const customHoursPolicies = policies.filter(policy => policy.meta.customBusinessHours).length;
    const escalatedBreaches = breaches.filter(breach => breach.escalated).length;

    return { activePolicies, pausedPolicies, customHoursPolicies, escalatedBreaches };
  }, [policies, breaches]);

  const groupedBusinessHours = useMemo(() => {
    const map = new Map<string, PolicyView[]>();
    policies.forEach(policy => {
      const key = policy.meta.customBusinessHours
        ? `${policy.meta.businessHoursName} (${policy.meta.businessHoursStart} - ${policy.meta.businessHoursEnd})`
        : "Default Support Hours (08:00 - 18:00)";
      const existing = map.get(key) || [];
      existing.push(policy);
      map.set(key, existing);
    });
    return Array.from(map.entries());
  }, [policies]);

  const holidayCalendars = useMemo(() => {
    const names = new Set<string>();
    policies.forEach(policy => names.add(policy.meta.holidayCalendarName || "Default Holiday Calendar"));
    return Array.from(names);
  }, [policies]);

  const escalationSummary = useMemo(() => {
    return policies.flatMap(policy =>
      policy.meta.escalationLevels.map(level => ({
        policyId: policy.id,
        policyName: policy.name,
        scope: policy.meta.policyScope,
        level: level.level,
        afterHours: level.afterHours,
        notifyRole: level.notifyRole,
      }))
    );
  }, [policies]);

  const setTab = (tab: SlaTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next);
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setSelectedPolicyId(null);
    setForm(createDefaultForm());
  };

  const openCreateModal = () => {
    setSelectedPolicyId(null);
    setForm(createDefaultForm());
    setIsModalOpen(true);
  };

  const openEditModal = (policy: PolicyView) => {
    setSelectedPolicyId(policy.id);
    setForm({
      name: policy.name,
      priority: policy.priority,
      category: policy.category || CATEGORIES[0],
      responseTimeHours: policy.responseTimeHours,
      resolutionTimeHours: policy.resolutionTimeHours,
      isActive: policy.isActive,
      description: policy.plainDescription,
      meta: {
        ...cloneDefaultMeta(),
        ...policy.meta,
        workingDays: [...policy.meta.workingDays],
        escalationLevels: policy.meta.escalationLevels.map(level => ({ ...level })),
      },
    });
    setIsModalOpen(true);
  };

  const refreshPolicies = async () => {
    const res = await fetch("/api/sla/policies", { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to refresh SLA policies.");
    const data: ApiPolicy[] = await res.json();
    setPolicies(
      data.map(policy => {
        const parsed = safeParseMeta(policy.description);
        return {
          ...policy,
          plainDescription: parsed.plainDescription,
          meta: parsed.meta,
        };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const payload: ApiPolicy = {
      id: selectedPolicyId || 0,
      name: form.name.trim(),
      priority: form.priority,
      category: form.category,
      responseTimeHours: Number(form.responseTimeHours),
      resolutionTimeHours: Number(form.resolutionTimeHours),
      isActive: form.isActive,
      description: buildDescription(form.description, form.meta),
    };

    try {
      const res = await fetch(selectedPolicyId ? `/api/sla/policies/${selectedPolicyId}` : "/api/sla/policies", {
        method: selectedPolicyId ? "PUT" : "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save SLA policy.");
      }

      await refreshPolicies();
      resetModal();
      setTab("policies");
    } catch (err: any) {
      setError(err?.message || "Failed to save SLA policy.");
    }
  };

  const handleDelete = async (policyId: number) => {
    if (!window.confirm("Are you sure you want to delete this SLA policy?")) {
      return;
    }

    try {
      const res = await fetch(`/api/sla/policies/${policyId}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete SLA policy.");
      }

      await refreshPolicies();
    } catch (err: any) {
      setError(err?.message || "Failed to delete SLA policy.");
    }
  };

  if (!canManageSla) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SLA Management</h1>
          <p className="text-muted-foreground">Administrator access is required to access SLA management.</p>
        </div>
        <div className="sn-card p-6 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <p className="text-sm text-muted-foreground">
            Direct access is blocked for Sub Admin, Agent, and User roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SLA Management</h1>
          <p className="text-muted-foreground">Manage SLA policies, calendars, business hours, escalation rules, and reporting from one place.</p>
        </div>
        <Button onClick={openCreateModal} className="bg-sn-green text-sn-dark font-bold">
          <Plus className="w-4 h-4 mr-2" />
          Create SLA Policy
        </Button>
      </div>

      {error && (
        <div className="sn-card p-4 flex items-center gap-3 border border-red-200 text-red-700">
          <ShieldAlert className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="sn-card p-2 flex flex-wrap gap-2">
        {Object.entries(TAB_LABELS).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab as SlaTab)}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === tab ? "bg-sn-green text-sn-dark" : "bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="sn-card p-8 text-sm text-muted-foreground">Loading SLA management data...</div>
      ) : (
        <>
          {activeTab === "dashboard" && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard title="Active Policies" value={metrics.activePolicies} icon={Clock} />
              <MetricCard title="Pause/Resume Enabled" value={metrics.pausedPolicies} icon={PauseCircle} />
              <MetricCard title="Custom Business Hours" value={metrics.customHoursPolicies} icon={CalendarClock} />
              <MetricCard title="Escalated Breaches" value={metrics.escalatedBreaches} icon={Siren} />
            </div>
          )}

          {activeTab === "policies" && (
            <div className="sn-card p-0 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="data-table-header p-4">Policy</th>
                    <th className="data-table-header p-4">Scope</th>
                    <th className="data-table-header p-4">Response SLA</th>
                    <th className="data-table-header p-4">Resolution SLA</th>
                    <th className="data-table-header p-4">Business Hours</th>
                    <th className="data-table-header p-4">Escalation Levels</th>
                    <th className="data-table-header p-4">Status</th>
                    <th className="data-table-header p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map(policy => (
                    <tr key={policy.id} className="data-table-row">
                      <td className="p-4">
                        <div className="font-medium">{policy.name}</div>
                        <div className="text-xs text-muted-foreground">{policy.category || "All Categories"}</div>
                      </td>
                      <td className="p-4 text-sm capitalize">
                        {policy.meta.policyScope === "group" ? `${policy.meta.policyScope}: ${policy.meta.groupName || "Unassigned"}` : `${policy.meta.policyScope}: ${policy.priority}`}
                      </td>
                      <td className="p-4 text-sm">{policy.responseTimeHours}h</td>
                      <td className="p-4 text-sm">{policy.resolutionTimeHours}h</td>
                      <td className="p-4 text-sm">
                        {policy.meta.customBusinessHours
                          ? `${policy.meta.businessHoursName} (${policy.meta.businessHoursStart} - ${policy.meta.businessHoursEnd})`
                          : "Default Support Hours"}
                      </td>
                      <td className="p-4 text-sm">{policy.meta.escalationLevels.length}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${policy.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {policy.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-4 flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(policy)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(policy.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {policies.length === 0 && (
                    <tr>
                      <td className="p-6 text-sm text-muted-foreground" colSpan={8}>No SLA policies found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "business-hours" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {groupedBusinessHours.map(([label, items]) => (
                <div key={label} className="sn-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-blue-500" />
                    <h3 className="font-bold">{label}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Applies to {items.length} polic{items.length === 1 ? "y" : "ies"}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {items.map(item => (
                      <span key={item.id} className="px-2 py-1 rounded bg-muted text-xs font-medium">
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {groupedBusinessHours.length === 0 && (
                <div className="sn-card p-5 text-sm text-muted-foreground">No business hour assignments found.</div>
              )}
            </div>
          )}

          {activeTab === "holiday-calendar" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {holidayCalendars.map(name => (
                <div key={name} className="sn-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    <h3 className="font-bold">{name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This calendar is referenced by {policies.filter(policy => (policy.meta.holidayCalendarName || "Default Holiday Calendar") === name).length} SLA policies.
                  </p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "escalation-rules" && (
            <div className="sn-card p-0 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="data-table-header p-4">Policy</th>
                    <th className="data-table-header p-4">Scope</th>
                    <th className="data-table-header p-4">Level</th>
                    <th className="data-table-header p-4">Trigger After</th>
                    <th className="data-table-header p-4">Notify Role</th>
                  </tr>
                </thead>
                <tbody>
                  {escalationSummary.map(rule => (
                    <tr key={`${rule.policyId}-${rule.level}`} className="data-table-row">
                      <td className="p-4 font-medium">{rule.policyName}</td>
                      <td className="p-4 text-sm capitalize">{rule.scope}</td>
                      <td className="p-4 text-sm">Level {rule.level}</td>
                      <td className="p-4 text-sm">{rule.afterHours}h</td>
                      <td className="p-4 text-sm">{rule.notifyRole}</td>
                    </tr>
                  ))}
                  {escalationSummary.length === 0 && (
                    <tr>
                      <td className="p-6 text-sm text-muted-foreground" colSpan={5}>No escalation rules configured.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="sn-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <FileBarChart className="w-4 h-4 text-blue-500" />
                  <h3 className="font-bold">SLA Compliance Snapshot</h3>
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Policies: {policies.length} | Active Breaches: {breaches.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Priority-based Policies: {policies.filter(policy => policy.meta.policyScope === "priority").length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Category-based Policies: {policies.filter(policy => policy.meta.policyScope === "category").length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Group-based Policies: {policies.filter(policy => policy.meta.policyScope === "group").length}
                </div>
              </div>

              <div className="sn-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-500" />
                  <h3 className="font-bold">Recent Breaches</h3>
                </div>
                {breaches.slice(0, 5).map((breach, index) => (
                  <div key={`${breach.id || index}`} className="text-sm text-muted-foreground border-b border-border pb-2 last:border-b-0">
                    {(breach.ticketNumber || breach.recordId || "Ticket")} - {breach.slaName || "SLA"} {breach.escalated ? "(Escalated)" : ""}
                  </div>
                ))}
                {breaches.length === 0 && <div className="text-sm text-muted-foreground">No SLA breaches recorded.</div>}
              </div>
            </div>
          )}
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
              <h2 className="text-xl font-bold">{selectedPolicyId ? "Edit SLA Policy" : "Create SLA Policy"}</h2>
              <Button variant="ghost" size="icon" onClick={resetModal}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Policy Name">
                  <input
                    required
                    type="text"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Critical Network Response SLA"
                  />
                </Field>
                <Field label="Policy Scope">
                  <select
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.policyScope}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, policyScope: e.target.value as SlaMeta["policyScope"] } }))}
                  >
                    <option value="priority">Priority-based SLA</option>
                    <option value="category">Category-based SLA</option>
                    <option value="group">Group-based SLA</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Priority">
                  <select
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.priority}
                    onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    {PRIORITIES.map(priority => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.category}
                    onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Assignment Group">
                  <input
                    type="text"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.groupName}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, groupName: e.target.value } }))}
                    placeholder="e.g., Network Operations"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Response SLA (Hours)">
                  <input
                    required
                    type="number"
                    min={0}
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.responseTimeHours}
                    onChange={e => setForm(prev => ({ ...prev, responseTimeHours: Number(e.target.value) }))}
                  />
                </Field>
                <Field label="Resolution SLA (Hours)">
                  <input
                    required
                    type="number"
                    min={0}
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.resolutionTimeHours}
                    onChange={e => setForm(prev => ({ ...prev, resolutionTimeHours: Number(e.target.value) }))}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Business Hours Profile">
                  <input
                    type="text"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.businessHoursName}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, businessHoursName: e.target.value } }))}
                    placeholder="Default Support Hours"
                  />
                </Field>
                <Field label="Holiday Calendar">
                  <input
                    type="text"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.holidayCalendarName}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, holidayCalendarName: e.target.value } }))}
                    placeholder="Default Holiday Calendar"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Business Start">
                  <input
                    type="time"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.businessHoursStart}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, businessHoursStart: e.target.value } }))}
                  />
                </Field>
                <Field label="Business End">
                  <input
                    type="time"
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.meta.businessHoursEnd}
                    onChange={e => setForm(prev => ({ ...prev, meta: { ...prev.meta, businessHoursEnd: e.target.value } }))}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                    value={form.isActive ? "active" : "inactive"}
                    onChange={e => setForm(prev => ({ ...prev, isActive: e.target.value === "active" }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map(day => {
                    const selected = form.meta.workingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setForm(prev => ({
                            ...prev,
                            meta: {
                              ...prev.meta,
                              workingDays: selected
                                ? prev.meta.workingDays.filter(item => item !== day)
                                : [...prev.meta.workingDays, day],
                            },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer ${
                          selected ? "bg-sn-green text-sn-dark border-sn-green" : "bg-white border-border text-muted-foreground"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-md border border-border">
                <ToggleRow
                  label="Custom business hours"
                  checked={form.meta.customBusinessHours}
                  onChange={checked => setForm(prev => ({ ...prev, meta: { ...prev.meta, customBusinessHours: checked } }))}
                />
                <ToggleRow
                  label="SLA pause on pending"
                  checked={form.meta.pauseOnPending}
                  onChange={checked => setForm(prev => ({ ...prev, meta: { ...prev.meta, pauseOnPending: checked } }))}
                />
                <ToggleRow
                  label="SLA resume on customer reply"
                  checked={form.meta.resumeOnCustomerReply}
                  onChange={checked => setForm(prev => ({ ...prev, meta: { ...prev.meta, resumeOnCustomerReply: checked } }))}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">Escalation Levels</h3>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm(prev => ({
                        ...prev,
                        meta: {
                          ...prev.meta,
                          escalationLevels: [
                            ...prev.meta.escalationLevels,
                            { level: prev.meta.escalationLevels.length + 1, afterHours: 1, notifyRole: "Admin" },
                          ],
                        },
                      }))
                    }
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Level
                  </Button>
                </div>

                {form.meta.escalationLevels.map((level, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <Field label="Level">
                      <input
                        type="number"
                        min={1}
                        className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                        value={level.level}
                        onChange={e =>
                          setForm(prev => ({
                            ...prev,
                            meta: {
                              ...prev.meta,
                              escalationLevels: prev.meta.escalationLevels.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, level: Number(e.target.value) } : item
                              ),
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Trigger After (Hours)">
                      <input
                        type="number"
                        min={0}
                        className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                        value={level.afterHours}
                        onChange={e =>
                          setForm(prev => ({
                            ...prev,
                            meta: {
                              ...prev.meta,
                              escalationLevels: prev.meta.escalationLevels.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, afterHours: Number(e.target.value) } : item
                              ),
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Notify Role">
                      <input
                        type="text"
                        className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                        value={level.notifyRole}
                        onChange={e =>
                          setForm(prev => ({
                            ...prev,
                            meta: {
                              ...prev.meta,
                              escalationLevels: prev.meta.escalationLevels.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, notifyRole: e.target.value } : item
                              ),
                            },
                          }))
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setForm(prev => ({
                          ...prev,
                          meta: {
                            ...prev.meta,
                            escalationLevels: prev.meta.escalationLevels.filter((_, itemIndex) => itemIndex !== index),
                          },
                        }))
                      }
                      disabled={form.meta.escalationLevels.length === 1}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <Field label="Description">
                <textarea
                  rows={4}
                  className="w-full p-2 border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-sn-green"
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional operational notes for this SLA policy."
                />
              </Field>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={resetModal}>Cancel</Button>
                <Button type="submit" className="bg-sn-green text-sn-dark font-bold">
                  {selectedPolicyId ? "Update Policy" : "Create Policy"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
    <div className="sn-card p-5 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">{title}</div>
        <div className="text-3xl font-bold mt-2">{value}</div>
      </div>
      <Icon className="w-6 h-6 text-blue-500" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer ${
          checked ? "bg-sn-green text-sn-dark border-sn-green" : "bg-white text-muted-foreground border-border"
        }`}
      >
        {checked ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
        {checked ? "Enabled" : "Disabled"}
      </button>
    </div>
  );
}
