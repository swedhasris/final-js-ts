import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, getDocs, where, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { ROLE_HIERARCHY, Role } from "../lib/roles";
import {
  ShieldAlert, Zap, Plus, Trash2, Settings2, Layers, List, Tag, Users,
  ChevronRight, Layout, Bell, Shield, Activity, Database, Search, Filter,
  ArrowRight, Info, Lock, Globe, Cpu, Radio, Sparkles, Box, HardDrive,
  Edit3, Eye, Clock, UserPlus, UserMinus, AlertCircle, CheckCircle2, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CategoryItem, SubcategoryItem, ServiceProviderItem, GroupItem, GroupMemberItem,
  AuditLog, Status, useServiceCatalog
} from "../lib/serviceCatalog";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { TypographySettings } from "../components/TypographySettings";

const MOCK_TRAFFIC_DATA = [
  { time: "00:00", requests: 400 },
  { time: "04:00", requests: 300 },
  { time: "08:00", requests: 900 },
  { time: "12:00", requests: 1200 },
  { time: "16:00", requests: 1500 },
  { time: "20:00", requests: 800 },
  { time: "23:59", requests: 500 },
];

export function Settings() {
  const { user, profile } = useAuth();
  const role = profile?.role || 'user';
  const { categories, subcategories, serviceProviders, groups, members, refresh: refreshCatalog } = useServiceCatalog();

  const [activeTab, setActiveTab] = useState<"master" | "automation" | "security" | "audit" | "system" | "typography">("master");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [backendDown, setBackendDown] = useState(false);

  // Check backend health on mount and every 15s
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/settings_categories', { method: 'GET' });
        setBackendDown(!res.ok && res.status !== 200 && res.status !== 304 ? true : false);
        if (res.ok) setBackendDown(false);
      } catch {
        setBackendDown(true);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Selection states for hierarchy
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [selectedSrvId, setSelectedSrvId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Modal / Form states
  const [editingItem, setEditingItem] = useState<{ type: string, data: any } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [systemSettings, setSystemSettings] = useState<any>({ ccEmails: "" });

  const isAdmin = ROLE_HIERARCHY[role] >= ROLE_HIERARCHY["admin"];

  useEffect(() => {
    if (isAdmin) {
      // Fetch users for member management
      getDocs(collection(db, "users")).then(snap => {
        setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      // Fetch audit logs
      onSnapshot(query(collection(db, "settings_audit_logs"), orderBy("timestamp", "desc")), snap => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
      });
      // Fetch workflows
      onSnapshot(query(collection(db, "settings_workflows"), orderBy("createdAt", "desc")), snap => {
        setWorkflows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      // Fetch system settings
      onSnapshot(doc(db, "settings_global", "general"), snap => {
        if (snap.exists()) setSystemSettings(snap.data());
      });
    }
  }, [isAdmin]);

  const handleFileUpload = async (workflowId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      // Simulation of file upload (storing metadata in Firestore)
      await updateDoc(doc(db, "settings_workflows", workflowId), {
        attachment: {
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });
      setMessage({ text: "Workflow file uploaded successfully!", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  const createAuditLog = async (moduleId: string, moduleName: string, action: AuditLog['action'], oldVal: any, newVal: any) => {
    await addDoc(collection(db, "settings_audit_logs"), {
      moduleId,
      moduleName,
      action,
      oldValue: oldVal || null,
      newValue: newVal || null,
      performedBy: user?.email || "Unknown",
      performedByRole: role,
      timestamp: serverTimestamp()
    });
  };

  const handleMutation = async (type: string, action: 'create' | 'update' | 'delete', data?: any) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      // Map type → REST endpoint
      const endpointMap: Record<string, string> = {
        'Category':         'settings_categories',
        'Subcategory':      'settings_subcategories',
        'Service Provider': 'settings_service_providers',
        'Group':            'settings_groups',
        'Group Member':     'settings_group_members',
      };
      const endpoint = endpointMap[type];
      if (!endpoint) throw new Error(`Unknown type: ${type}`);

      const id = data?.id;

      if (action === 'delete') {
        if (!confirm("Are you sure you want to delete this item?")) { setLoading(false); return; }
        const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Delete failed');
        }
      } else if (action === 'create') {
        const payload: any = {
          ...data,
          status: 'active',
          createdBy: user?.email || 'admin',
        };
        // Ensure proper field names for each type
        if (type === 'Subcategory') {
          payload.categoryId = data.categoryId || selectedCatId;
          if (!payload.categoryId) throw new Error('Please select a Category first.');
        }
        if (type === 'Service Provider') {
          payload.subcategoryId = data.subcategoryId || selectedSubId;
          if (!payload.subcategoryId) throw new Error('Please select a Sub-Category first.');
        }
        if (type === 'Group Member') {
          payload.groupId = data.groupId || selectedGroupId;
          if (!payload.groupId) throw new Error('Please select a Group first.');
        }
        const res = await fetch(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${type} creation failed (HTTP ${res.status})`);
        }
      } else if (action === 'update') {
        const res = await fetch(`/api/${endpoint}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data.new),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${type} update failed (HTTP ${res.status})`);
        }
      }

      setMessage({ text: `${type} saved successfully!`, type: 'success' });
      setIsModalOpen(false);
      setEditingItem(null);
      // Refresh immediately so the list updates without waiting for the 30s poll
      await refreshCatalog();
    } catch (err: any) {
      const isNetworkDown = err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch'));
      setMessage({
        text: isNetworkDown
          ? '⚠️ Cannot reach the server. Please start MySQL and the Spring Boot backend (port 3000), then try again.'
          : err.message,
        type: 'error',
      });
    }
    setLoading(false);
    setTimeout(() => setMessage(null), 10000);
  };

  // Filtered views — each level depends on its parent selection
  const activeCategories = useMemo(() => categories.filter(c => c.status === 'active'), [categories]);
  const activeSubcategories = useMemo(() =>
    subcategories.filter(s => s.status === 'active' && (!selectedCatId || s.categoryId === selectedCatId)),
    [subcategories, selectedCatId]);
  const activeProviders = useMemo(() =>
    serviceProviders.filter(p => p.status === 'active' && (!selectedSubId || p.subcategoryId === selectedSubId)),
    [serviceProviders, selectedSubId]);
  const activeGroups = useMemo(() => groups.filter(g => g.status === 'active'), [groups]);
  const activeMembers = useMemo(() =>
    members.filter(m => m.status === 'active' && (!selectedGroupId || m.groupId === selectedGroupId)),
    [members, selectedGroupId]);

  const handleSeedData = async () => {
    if (!isAdmin || !confirm("This will populate demo hierarchy data. Continue?")) return;
    setLoading(true);
    try {
      // 1. Category
      const catRef = await addDoc(collection(db, "settings_categories"), { name: "IT Support", status: "active", createdAt: serverTimestamp() });
      // 2. Subcategory
      const subRef = await addDoc(collection(db, "settings_subcategories"), { name: "Software Issue", categoryId: catRef.id, status: "active", createdAt: serverTimestamp() });
      // 3. Provider
      const provRef = await addDoc(collection(db, "settings_service_providers"), { name: "Adobe Systems", subcategoryId: subRef.id, sla: "4h", status: "active", createdAt: serverTimestamp() });
      // 4. Group
      const groupRef = await addDoc(collection(db, "settings_groups"), { name: "Design Software Team", serviceProviderId: provRef.id, status: "active", createdAt: serverTimestamp() });
      // 5. Member
      if (allUsers.length > 0) {
        await addDoc(collection(db, "settings_group_members"), {
          userId: allUsers[0].id,
          userName: allUsers[0].name || allUsers[0].email,
          groupId: groupRef.id,
          roleInGroup: "agent",
          status: "active",
          createdAt: serverTimestamp()
        });
      }
      setMessage({ text: "Demo data seeded successfully!", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto min-h-[90vh] flex flex-col gap-6 pb-20">

      {/* ── Backend Down Banner ── */}
      {backendDown && (
        <div className="flex items-center gap-3 px-5 py-3 bg-red-600 text-white rounded-xl text-sm font-bold shadow-lg">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>
            ⚠️ Backend server is unreachable (port 3000). To save categories, subcategories and providers you must:
            &nbsp;1) Start MySQL — open Services as Administrator and start <strong>MySQL80</strong>.
            &nbsp;2) Start Spring Boot — run <code className="bg-white/20 px-1 rounded">mvnw.cmd spring-boot:run</code> inside <code className="bg-white/20 px-1 rounded">microservices/core-service-springboot</code>.
          </span>
        </div>
      )}

      {/* ── Dynamic Header ── */}
      <div className="relative p-12 bg-sn-sidebar rounded-[40px] border border-white/5 shadow-2xl overflow-hidden group flex flex-col items-center text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-sn-green/5 to-transparent pointer-events-none" />
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-sn-green/10 rounded-full blur-[100px] group-hover:scale-125 transition-transform duration-1000" />
        <div className="relative z-10 space-y-6 max-w-2xl w-full">
          <div className="space-y-2 flex flex-col items-center">
            <div className="flex items-center justify-between w-full mb-4">
              <div className="flex items-center gap-2 text-sn-green">
                <div className="w-6 h-6 rounded-lg bg-sn-green/10 flex items-center justify-center">
                  <Settings2 size={14} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em]">Master Infrastructure</span>
              </div>
              {isAdmin && (
                <Button
                  onClick={handleSeedData}
                  variant="outline"
                  size="sm"
                  className="h-8 border-sn-green/20 text-sn-green hover:bg-sn-green/10 text-[10px] font-black uppercase tracking-widest px-4 rounded-xl"
                >
                  <Sparkles size={12} className="mr-2" /> Seed Demo Data
                </Button>
              )}
            </div>
            <h1 className="text-6xl font-black text-foreground tracking-tighter">Platform Architect</h1>
            <p className="text-text-dim font-medium text-lg mx-auto">Centralized command for global service hierarchies and RBAC.</p>
          </div>

          <div className="flex bg-black/40 p-1.5 rounded-[22px] border border-white/5 backdrop-blur-xl inline-flex">
            {[
              { id: "master", label: "Hierarchy", icon: Layers },
              { id: "automation", label: "Workflows", icon: Zap },
              { id: "security", label: "Security", icon: Shield },
              { id: "system", label: "System", icon: Cpu },
              { id: "typography", label: "Typography", icon: Edit3 },
              { id: "audit", label: "Audit", icon: History },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={cn(
                  "flex items-center gap-2.5 px-6 py-3 rounded-[18px] text-sm font-black transition-all duration-500",
                  activeTab === t.id ? "bg-sn-green text-sn-dark shadow-[0_0_20px_rgba(129,181,50,0.3)]" : "text-text-dim hover:text-foreground"
                )}
              >
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex-1"
        >
          {activeTab === "master" && (
            <div className="space-y-8">
              {/* Row 1: High Level Definition (3 Columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
                <MasterColumn
                  title="Categories"
                  icon={Globe}
                  items={activeCategories}
                  selectedId={selectedCatId}
                  onSelect={(id) => { setSelectedCatId(id); setSelectedSubId(null); setSelectedSrvId(null); setSelectedGroupId(null); }}
                  onAdd={() => { setEditingItem({ type: 'Category', data: {} }); setIsModalOpen(true); }}
                  onEdit={(item) => { setEditingItem({ type: 'Category', data: item }); setIsModalOpen(true); }}
                  onDelete={(item) => handleMutation('Category', 'delete', item)}
                  isAdmin={isAdmin}
                />
                <MasterColumn
                  title="Sub-Categories"
                  icon={Radio}
                  items={activeSubcategories}
                  selectedId={selectedSubId}
                  disabled={!selectedCatId}
                  onSelect={(id) => { setSelectedSubId(id); setSelectedSrvId(null); setSelectedGroupId(null); }}
                  onAdd={() => {
                    if (!selectedCatId) { setMessage({ text: 'Please select a Category first.', type: 'error' }); setTimeout(() => setMessage(null), 3000); return; }
                    setEditingItem({ type: 'Subcategory', data: { categoryId: selectedCatId } }); setIsModalOpen(true);
                  }}
                  onEdit={(item) => { setEditingItem({ type: 'Subcategory', data: item }); setIsModalOpen(true); }}
                  onDelete={(item) => handleMutation('Subcategory', 'delete', item)}
                  isAdmin={isAdmin}
                  parentLabel={selectedCatId ? activeCategories.find(c => c.id === selectedCatId)?.name : undefined}
                />
                <MasterColumn
                  title="Providers"
                  icon={Box}
                  items={activeProviders}
                  selectedId={selectedSrvId}
                  disabled={!selectedSubId}
                  onSelect={(id) => { setSelectedSrvId(id); setSelectedGroupId(null); }}
                  onAdd={() => {
                    if (!selectedSubId) { setMessage({ text: 'Please select a Sub-Category first.', type: 'error' }); setTimeout(() => setMessage(null), 3000); return; }
                    setEditingItem({ type: 'Service Provider', data: { subcategoryId: selectedSubId } }); setIsModalOpen(true);
                  }}
                  onEdit={(item) => { setEditingItem({ type: 'Service Provider', data: item }); setIsModalOpen(true); }}
                  onDelete={(item) => handleMutation('Service Provider', 'delete', item)}
                  isAdmin={isAdmin}
                  parentLabel={selectedSubId ? activeSubcategories.find(s => s.id === selectedSubId)?.name : undefined}
                />
              </div>

              {/* Row 2: Operational Structures (2 Columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px] max-w-5xl mx-auto">
                <MasterColumn
                  title="Groups"
                  icon={Users}
                  items={activeGroups}
                  selectedId={selectedGroupId}
                  disabled={false}
                  onSelect={(id) => setSelectedGroupId(id)}
                  onAdd={() => { setEditingItem({ type: 'Group', data: {} }); setIsModalOpen(true); }}
                  onEdit={(item) => { setEditingItem({ type: 'Group', data: item }); setIsModalOpen(true); }}
                  onDelete={(item) => handleMutation('Group', 'delete', item)}
                  isAdmin={isAdmin}
                />
                <MasterColumn
                  title="Group Members"
                  icon={UserPlus}
                  items={activeMembers.map(m => ({ ...m, name: m.userName }))}
                  selectedId={null}
                  disabled={!selectedGroupId}
                  onSelect={() => { }}
                  onAdd={() => {
                    if (!selectedGroupId) { setMessage({ text: 'Please select a Group first.', type: 'error' }); setTimeout(() => setMessage(null), 3000); return; }
                    setEditingItem({ type: 'Group Member', data: { groupId: selectedGroupId } }); setIsModalOpen(true);
                  }}
                  onEdit={(item) => { setEditingItem({ type: 'Group Member', data: item }); setIsModalOpen(true); }}
                  onDelete={(item) => handleMutation('Group Member', 'delete', item)}
                  isAdmin={isAdmin}
                  parentLabel={selectedGroupId ? activeGroups.find(g => g.id === selectedGroupId)?.name : undefined}
                />
              </div>
            </div>
          )}

          {activeTab === "audit" && (
            <div className="bg-white dark:bg-sn-sidebar rounded-[40px] border border-border dark:border-white/5 overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-border dark:border-white/5 flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-3">
                  <History className="text-sn-green" />
                  <h2 className="text-2xl font-black">System Audit Trail</h2>
                </div>
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-sn-dark rounded-xl text-white text-[10px] font-black uppercase tracking-widest">{auditLogs.length} Records</div>
                </div>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timestamp</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Admin</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Module</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-8 py-5 text-xs font-bold text-muted-foreground">
                          {log.timestamp?.toDate ? format(log.timestamp.toDate(), "MMM d, HH:mm:ss") : "Just now"}
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-sn-green/20 flex items-center justify-center text-[10px] font-black text-sn-green">
                              {log.performedBy[0].toUpperCase()}
                            </div>
                            <div className="text-xs font-black">{log.performedBy}</div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-sn-dark text-white rounded-lg text-[9px] font-black uppercase">{log.moduleName}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase",
                            log.action === 'create' ? "bg-green-500/10 text-green-500" :
                              log.action === 'update' ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-xs font-medium text-muted-foreground">
                          {log.action === 'create' ? `Added "${log.newValue?.name || log.newValue?.userName}"` :
                            log.action === 'update' ? `Modified property of ID ${log.moduleId.slice(0, 6)}` :
                              `Deactivated ID ${log.moduleId.slice(0, 6)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "automation" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.map((wf) => (
                  <div key={wf.id} className="bg-white dark:bg-sn-sidebar p-6 rounded-[32px] border border-border dark:border-white/5 shadow-xl hover:border-sn-green/30 transition-all group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-sn-green/10 rounded-2xl text-sn-green">
                        <Zap size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingItem({ type: 'Workflow', data: wf }); setIsModalOpen(true); }}
                          className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-sn-green"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleMutation('Workflow', 'delete', wf)}
                          className="p-2 hover:bg-red-500/10 rounded-xl transition-colors text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-lg font-black mb-1">{wf.name}</h3>
                    <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{wf.description || "No description provided."}</p>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <span>Trigger</span>
                        <span className="text-sn-green">{wf.trigger || "On Ticket Create"}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <span>Status</span>
                        <span className={wf.status === 'active' ? "text-green-500" : "text-red-500"}>{wf.status}</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-border dark:border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer p-2 bg-sn-dark text-sn-green rounded-xl hover:scale-105 transition-all inline-flex items-center gap-2">
                          <HardDrive size={14} />
                          <span className="text-[9px] font-black uppercase tracking-widest">Upload Script</span>
                          <input type="file" className="hidden" onChange={(e) => handleFileUpload(wf.id, e)} />
                        </label>
                      </div>
                      {wf.attachment && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                          <Box size={10} /> {wf.attachment.name.slice(0, 10)}...
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => { setEditingItem({ type: 'Workflow', data: {} }); setIsModalOpen(true); }}
                  className="bg-dashed border-2 border-dashed border-border dark:border-white/10 rounded-[32px] p-6 flex flex-col items-center justify-center gap-4 hover:border-sn-green/50 hover:bg-sn-green/5 transition-all text-muted-foreground hover:text-sn-green min-h-[250px]"
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Plus size={24} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Add New Workflow</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="bg-white dark:bg-sn-sidebar rounded-[40px] border border-border dark:border-white/5 p-12 shadow-2xl">
              <div className="max-w-xl mx-auto text-center space-y-6">
                <div className="w-20 h-20 bg-sn-green/10 rounded-[30px] flex items-center justify-center mx-auto text-sn-green">
                  <Cpu size={40} />
                </div>
                <h2 className="text-4xl font-black">Global System Settings</h2>
                <p className="text-muted-foreground font-medium">Configure platform-wide parameters, notification routing, and integration endpoints.</p>
                
                <div className="pt-8 space-y-6 text-left">
                  <div className="space-y-4 p-8 bg-muted/30 rounded-[40px] border border-border">
                    <div className="flex items-center gap-3 mb-2">
                      <Bell className="text-sn-green" size={20} />
                      <h3 className="text-xl font-black text-sn-dark dark:text-white">Email Notification CC</h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium mb-4">Add email addresses that should be CC'd on all system-generated notifications (comma separated).</p>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">CC Email Recipients</label>
                      <input 
                        type="text"
                        value={systemSettings.ccEmails || ""}
                        onChange={(e) => setSystemSettings({ ...systemSettings, ccEmails: e.target.value })}
                        placeholder="admin@company.com, support-archive@company.com"
                        className="w-full bg-white dark:bg-black/20 border border-border dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sn-green/30 transition-all"
                      />
                    </div>
                    
                    <Button 
                      onClick={async () => {
                        setLoading(true);
                        try {
                          await setDoc(doc(db, "settings_global", "general"), {
                            ...systemSettings,
                            updatedAt: serverTimestamp(),
                            updatedBy: user?.email
                          }, { merge: true });
                          setMessage({ text: "System settings saved successfully!", type: "success" });
                        } catch (err: any) {
                          setMessage({ text: err.message, type: "error" });
                        }
                        setLoading(false);
                        setTimeout(() => setMessage(null), 5000);
                      }}
                      disabled={loading}
                      className="w-full bg-sn-green text-sn-dark h-14 rounded-2xl font-black uppercase tracking-widest text-xs mt-4 shadow-lg shadow-sn-green/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
                    >
                      {loading ? "Saving..." : "Save System Configuration"}
                    </Button>
                  </div>

                  <div className="p-6 bg-red-500/5 rounded-[32px] border border-red-500/10 flex items-center justify-between">
                    <div className="text-left">
                      <div className="text-sm font-black text-red-500">Maintenance Mode</div>
                      <div className="text-[10px] font-bold text-red-400 uppercase mt-1">Restrict platform access to administrators only</div>
                    </div>
                    <div className="w-12 h-6 bg-red-500/20 rounded-full relative cursor-pointer group">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-red-500/40 rounded-full shadow-sm group-hover:bg-red-500 transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "typography" && (
            <TypographySettings />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Notification Toast ── */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className={cn(
              "fixed bottom-8 right-8 px-8 py-4 rounded-[20px] shadow-2xl flex items-center gap-3 z-50 backdrop-blur-xl border font-black text-sm",
              message.type === 'success' ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
            )}
          >
            {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Advanced Form Modal ── */}
      {isModalOpen && editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-sn-dark/80 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg bg-white dark:bg-sn-sidebar rounded-[40px] border border-border dark:border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="p-8 border-b border-border dark:border-white/5 bg-muted/20">
              <h3 className="text-2xl font-black">{editingItem.data.id ? 'Edit' : 'Create'} {editingItem.type}</h3>
              <p className="text-muted-foreground text-sm font-medium mt-1">Configure global master data parameters.</p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data: any = {};
              formData.forEach((val, key) => data[key] = val);

              if (editingItem.type === 'Group Member') {
                const user = allUsers.find(u => u.id === data.userId);
                data.userName = user?.name || user?.email || "Unknown";
                data.userEmail = user?.email || "";
              }

              if (editingItem.data.id) {
                handleMutation(editingItem.type, 'update', { id: editingItem.data.id, old: editingItem.data, new: data });
              } else {
                handleMutation(editingItem.type, 'create', { ...editingItem.data, ...data });
              }
            }} className="p-8 space-y-6">

              {editingItem.type === 'Category' && (
                <>
                  <Input label="Category Name" name="name" defaultValue={editingItem.data.name} required />
                  <Textarea label="Description" name="description" defaultValue={editingItem.data.description} />
                </>
              )}

              {editingItem.type === 'Subcategory' && (
                <>
                  <Select label="Category" name="categoryId" defaultValue={editingItem.data.categoryId || selectedCatId || ""} required>
                    <option value="">-- Select Category --</option>
                    {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Input label="Sub-Category Name" name="name" defaultValue={editingItem.data.name} required />
                  <Textarea label="Description" name="description" defaultValue={editingItem.data.description} />
                </>
              )}

              {editingItem.type === 'Service Provider' && (
                <>
                  <Select label="Sub-Category" name="subcategoryId" defaultValue={editingItem.data.subcategoryId || selectedSubId || ""} required>
                    <option value="">-- Select Sub-Category --</option>
                    {activeSubcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Input label="Provider Name" name="name" defaultValue={editingItem.data.name} required />
                  <Input label="SLA Commitment" name="sla" defaultValue={editingItem.data.sla} placeholder="e.g. 4h, 12h, 1d" required />
                  <Textarea label="Capability Details" name="description" defaultValue={editingItem.data.description} />
                </>
              )}

              {editingItem.type === 'Group' && (
                <>
                  <Input label="Group Name" name="name" defaultValue={editingItem.data.name} required />
                  <Input label="Shift Timing" name="shiftTiming" defaultValue={editingItem.data.shiftTiming} placeholder="e.g. 09:00 - 18:00" />
                  <Select label="Escalation Level" name="escalationLevel" defaultValue={editingItem.data.escalationLevel}>
                    <option value="L1">Level 1 - Frontline</option>
                    <option value="L2">Level 2 - Specialist</option>
                    <option value="L3">Level 3 - Expert</option>
                    <option value="Executive">Executive Escalation</option>
                  </Select>
                </>
              )}

              {editingItem.type === 'Group Member' && (
                <>
                  <Select label="Group" name="groupId" defaultValue={editingItem.data.groupId || selectedGroupId || ""} required>
                    <option value="">-- Select Group --</option>
                    {activeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                  <Select label="Select User" name="userId" defaultValue={editingItem.data.userId} required>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  </Select>
                  <Select label="Group Role" name="roleInGroup" defaultValue={editingItem.data.roleInGroup} required>
                    <option value="agent">Standard Agent</option>
                    <option value="lead">Group Lead</option>
                    <option value="manager">Service Manager</option>
                  </Select>
                </>
              )}

              {editingItem.type === 'Workflow' && (
                <>
                  <Input label="Workflow Name" name="name" defaultValue={editingItem.data.name} required />
                  <Select label="Trigger Condition" name="trigger" defaultValue={editingItem.data.trigger} required>
                    <option value="On Ticket Create">On Ticket Create</option>
                    <option value="On Priority Critical">On Priority Critical</option>
                    <option value="On Resolution Breach">On Resolution Breach</option>
                    <option value="On Customer Update">On Customer Update</option>
                  </Select>
                  <Textarea label="Logic Description" name="description" defaultValue={editingItem.data.description} />
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Workflow Icon / Graphic</label>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                const base64 = reader.result as string;
                                // We'll put this into a hidden input so FormData picks it up
                                const hiddenInput = document.getElementById('workflow-image-data') as HTMLInputElement;
                                if (hiddenInput) hiddenInput.value = base64;
                                // Also update preview
                                const preview = document.getElementById('workflow-preview') as HTMLImageElement;
                                if (preview) {
                                  preview.src = base64;
                                  preview.classList.remove('hidden');
                                }
                                const placeholder = document.getElementById('workflow-placeholder');
                                if (placeholder) placeholder.classList.add('hidden');
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="w-full text-[10px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-sn-green file:text-sn-dark hover:file:bg-sn-green/80 cursor-pointer"
                        />
                      </div>
                      <div className="w-16 h-16 rounded-2xl border border-border flex items-center justify-center bg-muted/20 overflow-hidden shrink-0">
                        <img 
                          id="workflow-preview" 
                          src={editingItem.data.image || ""} 
                          className={cn("w-full h-full object-contain", !editingItem.data.image && "hidden")} 
                          alt="Workflow Icon"
                        />
                        <Zap id="workflow-placeholder" className={cn("text-muted-foreground/30", editingItem.data.image && "hidden")} size={24} />
                      </div>
                    </div>
                    <input type="hidden" id="workflow-image-data" name="image" defaultValue={editingItem.data.image || ""} />
                  </div>
                </>
              )}

              <div className="flex items-center gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-2xl py-6 font-black uppercase tracking-widest text-[10px]">Cancel</Button>
                <Button type="submit" disabled={loading} className="flex-1 bg-sn-green text-sn-dark rounded-2xl py-6 font-black uppercase tracking-widest text-[10px]">
                  {loading ? 'Processing...' : 'Confirm Changes'}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}

function MasterColumn({ title, icon: Icon, items, selectedId, onSelect, onAdd, onEdit, onDelete, disabled, isAdmin }: any) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item: any) =>
      (item.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.userName || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  return (
    <div className={cn(
      "flex flex-col bg-white/50 dark:bg-sn-sidebar/40 backdrop-blur-xl border border-border/50 dark:border-white/5 rounded-[40px] overflow-hidden shadow-sm transition-all duration-700",
      disabled ? "opacity-20 grayscale scale-[0.98] pointer-events-none" : "hover:shadow-2xl hover:border-sn-green/30"
    )}>
      <div className="p-6 border-b border-border/50 dark:border-white/5 bg-muted/20 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-black text-[11px] uppercase tracking-[0.2em] flex items-center gap-2">
            <Icon size={14} className="text-sn-green" /> {title}
          </span>
          <span className="text-[10px] font-black bg-sn-dark text-white px-3 py-1 rounded-full">{filteredItems.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={`Filter ${title.toLowerCase()}...`}
            className="w-full bg-white dark:bg-black/20 border border-border dark:border-white/5 rounded-xl pl-8 pr-4 py-2 text-[10px] font-bold outline-none focus:ring-1 focus:ring-sn-green/30 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {filteredItems.map((item: any) => (
          <motion.div
            layout
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              "w-full flex items-center justify-between p-4 rounded-2xl group transition-all duration-500 border relative overflow-hidden cursor-pointer",
              selectedId === item.id
                ? "bg-sn-green/10 border-sn-green/30 shadow-inner"
                : "hover:bg-muted/50 border-transparent"
            )}
          >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-border/50 bg-card flex items-center justify-center overflow-hidden shrink-0">
                  {item.image ? (
                    <img src={item.image} className="w-full h-full object-contain" alt="" />
                  ) : (
                    <Icon size={18} className="text-muted-foreground/30" />
                  )}
                </div>
                <div className="text-left">
                  <div className={cn("text-sm font-black transition-colors", selectedId === item.id ? "text-sn-green" : "text-sn-dark dark:text-gray-200")}>
                    {item.name}
                  </div>
                  {item.providerName && <div className="text-[9px] font-bold text-muted-foreground uppercase">{item.providerName}</div>}
                  {item.sla && <div className="text-[9px] font-black text-sn-green uppercase">{item.sla} SLA</div>}
                </div>
              </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isAdmin && (
                <>
                  <button onClick={() => onEdit(item)} className="p-2 text-sn-green hover:bg-sn-green/10 rounded-lg transition-all"><Edit3 size={14} /></button>
                  <button onClick={() => onDelete(item)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={14} /></button>
                </>
              )}
              <button className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-all"><ChevronRight size={14} /></button>
            </div>
          </motion.div>
        ))}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/30">
            <Icon size={32} strokeWidth={1} />
            <span className="text-[10px] font-black uppercase tracking-widest mt-2">
              {disabled ? `Select a parent to view ${title.toLowerCase()}` : `No ${title.toLowerCase()} found`}
            </span>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="p-5 border-t border-border/50 dark:border-white/5 bg-muted/10">
          <Button onClick={onAdd} className="w-full bg-sn-dark text-sn-green h-12 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all">
            <Plus size={16} /> New {title === "Categories" ? "Category" : title === "Sub-Categories" ? "Sub-Category" : title.endsWith('s') ? title.slice(0, -1) : title}
          </Button>
        </div>
      )}
    </div>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{label}</label>
      <input {...props} className="w-full bg-muted/50 dark:bg-black/20 border border-border dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sn-green/30 transition-all" />
    </div>
  );
}

function Textarea({ label, ...props }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{label}</label>
      <textarea {...props} className="w-full bg-muted/50 dark:bg-black/20 border border-border dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sn-green/30 transition-all min-h-[100px]" />
    </div>
  );
}

function Select({ label, children, ...props }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{label}</label>
      <select {...props} className="w-full bg-muted/50 dark:bg-black/20 border border-border dark:border-white/5 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sn-green/30 transition-all appearance-none cursor-pointer">
        {children}
      </select>
    </div>
  );
}
