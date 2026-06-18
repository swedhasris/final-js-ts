import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { TicketsProvider } from "./contexts/TicketsContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ActivityTrackerProvider } from "./contexts/ActivityTrackerContext";
import { Sidebar } from "./components/Sidebar";
import { AppNavbar } from "./components/AppNavbar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AIChatbot } from "./components/AIChatbot";
import { TechnosprintPet } from "./components/TechnosprintPet";
import { AITrackerPet } from "./components/AITrackerPet";
import { seedInitialData } from "./lib/seed";
import { useEffect } from "react";
import { ROLE_HIERARCHY, Role } from "./lib/roles";
import { DynamicTypography } from "./components/DynamicTypography";
import "./styles/codex-pet.css";
import { TabWorkspaceProvider, WorkspaceLayout } from "./components/WorkspaceLayout";
import { usePermissions } from "./contexts/PermissionContext";

// Lazy loaded components
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const Tickets = lazy(() => import("./pages/Tickets").then(m => ({ default: m.Tickets })));
const Timesheet = lazy(() => import("./pages/Timesheet").then(m => ({ default: m.Timesheet })));
const TimesheetWeekly = lazy(() => import("./pages/TimesheetWeekly").then(m => ({ default: m.TimesheetWeekly })));
const TimesheetReports = lazy(() => import("./pages/TimesheetReports").then(m => ({ default: m.TimesheetReports })));

const TicketDetail = lazy(() => import("./pages/TicketDetail").then(m => ({ default: m.TicketDetail })));
const GlobalHistory = lazy(() => import("./pages/GlobalHistory").then(m => ({ default: m.GlobalHistory })));
const SLAManagement = lazy(() => import("./pages/SLAManagement").then(m => ({ default: m.SLAManagement })));
const Approvals = lazy(() => import("./pages/Approvals").then(m => ({ default: m.Approvals })));
const Users = lazy(() => import("./pages/Users").then(m => ({ default: m.Users })));
const Reports = lazy(() => import("./pages/Reports").then(m => ({ default: m.Reports })));
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })));
const EmailIntegrations = lazy(() => import("./pages/EmailIntegrations").then(m => ({ default: m.EmailIntegrations })));
const MyDashboard = lazy(() => import("./pages/MyDashboard").then(m => ({ default: m.MyDashboard })));
const Register = lazy(() => import("./pages/Register").then(m => ({ default: m.Register })));
const CMDB = lazy(() => import("./pages/CMDB").then(m => ({ default: m.CMDB })));
const Conversations = lazy(() => import("./pages/Conversations").then(m => ({ default: m.Conversations })));
const ProblemManagement = lazy(() => import("./pages/ProblemManagement").then(m => ({ default: m.ProblemManagement })));
const ChangeManagement = lazy(() => import("./pages/ChangeManagement").then(m => ({ default: m.ChangeManagement })));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase").then(m => ({ default: m.KnowledgeBase })));
const ServicePortal = lazy(() => import("./pages/ServicePortal").then(m => ({ default: m.ServicePortal })));
const ServiceCatalog = lazy(() => import("./pages/ServiceCatalog").then(m => ({ default: m.ServiceCatalog })));
const Login = lazy(() => import("./pages/Login").then(m => ({ default: m.Login })));
const Calendar = lazy(() => import("./pages/Calendar").then(m => ({ default: m.Calendar })));
const AccessControl = lazy(() => import("./pages/AccessControl").then(m => ({ default: m.AccessControl })));
const Leaderboard = lazy(() => import("./pages/Leaderboard").then(m => ({ default: m.Leaderboard })));
const ApprovedTickets = lazy(() => import("./pages/ApprovedTickets").then(m => ({ default: m.ApprovedTickets })));
const Companies = lazy(() => import("./pages/Companies").then(m => ({ default: m.Companies })));
const TimesheetApprovals = lazy(() => import("./pages/TimesheetApprovals").then(m => ({ default: m.TimesheetApprovals })));
const Groups = lazy(() => import("./pages/Groups").then(m => ({ default: m.Groups })));
const ClearUsers = lazy(() => import("./pages/ClearUsers").then(m => ({ default: m.ClearUsers })));
const BrandingSettings = lazy(() => import("./pages/BrandingSettings").then(m => ({ default: m.BrandingSettings })));
const ActivityTracker = lazy(() => import("./pages/ActivityTracker").then(m => ({ default: m.ActivityTracker })));
const DataAnalytics = lazy(() => import("./pages/DataAnalytics").then(m => ({ default: m.DataAnalytics })));
const IncidentCategoryManagement = lazy(() => import("./pages/IncidentCategoryManagement").then(m => ({ default: m.IncidentCategoryManagement })));
const GlobalSearch = lazy(() => import("./pages/GlobalSearch").then(m => ({ default: m.GlobalSearch })));
const MeetingManagement = lazy(() => import("./pages/MeetingManagement").then(m => ({ default: m.MeetingManagement })));
const CreateMeeting = lazy(() => import("./pages/CreateMeeting").then(m => ({ default: m.CreateMeeting })));
const TSMeetingLobby = lazy(() => import("./pages/TSMeetingLobby").then(m => ({ default: m.TSMeetingLobby })));
const TSMeetingRoom = lazy(() => import("./pages/TSMeetingRoom").then(m => ({ default: m.TSMeetingRoom })));
const ForecastingPlanning = lazy(() => import("./pages/ForecastingPlanning").then(m => ({ default: m.ForecastingPlanning })));
const CallLogs = lazy(() => import("./pages/calls/CallLogs").then(m => ({ default: m.CallLogs })));
const CreateCall = lazy(() => import("./pages/calls/CreateCall").then(m => ({ default: m.CreateCall })));
const CallDetail = lazy(() => import("./pages/calls/CallDetail").then(m => ({ default: m.CallDetail })));
const AIAssistant = lazy(() => import("./pages/ai/AIAssistant").then(m => ({ default: m.AIAssistant })));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sn-dark">
      <div className="w-12 h-12 border-4 border-sn-green border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Custom hook for route-level permission checking
function useRoutePermission(allowedRoles?: Role[], allowedModules?: string[]) {
  const { profile } = useAuth();
  const { canAccess } = usePermissions();
  const location = useLocation();

  const pathname = location.pathname;
  const moduleKey = pathname.split('/')[1];

  // Check role-based permissions
  if (allowedRoles && profile?.role) {
    if (!allowedRoles.includes(profile.role)) {
      return false;
    }
  }

  // Check module-based permissions
  if (allowedModules && moduleKey) {
    if (!canAccess(moduleKey)) {
      return false;
    }
  }

  return true;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/login" />;

  // Check if user has access to the current route
  const isAgent = profile?.role === "agent" || profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "ultra_super_admin";

  return (
    <TicketsProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-grow flex flex-col overflow-hidden">
          <AppNavbar />
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
        <AIChatbot />
      </div>
    </TicketsProvider>
  );
}

interface ProtectedRouteWithPermissionsProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
  allowedModules?: string[];
  requireAdmin?: boolean;
}

function ProtectedRouteWithPermissions({ 
  children, 
  allowedRoles, 
  allowedModules,
  requireAdmin
}: ProtectedRouteWithPermissionsProps) {
  const { user, profile, loading } = useAuth();
  const hasPermission = useRoutePermission(allowedRoles, allowedModules);

  if (loading) return <LoadingScreen />;

  if (!user) return <Navigate to="/login" />;

  // Check role-based permissions
  if (requireAdmin && profile?.role !== "admin" && profile?.role !== "super_admin" && profile?.role !== "ultra_super_admin") {
    return <Navigate to="/" />;
  }

  // Check module-based permissions
  if (!hasPermission) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}

function HomeRedirect() {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Navigate to="/my-dashboard" />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppBody />
    </AuthProvider>
  );
}

function AppBody() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      seedInitialData();
    }
  }, [user]);

  return (
    <ThemeProvider>
      <DynamicTypography />
      <BrandingProvider>
        <ActivityTrackerProvider>
          <Router>
            <TabWorkspaceProvider>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  {/* Protected routes wrapped in WorkspaceLayout */}
                  <Route element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
                    <Route path="/" element={<HomeRedirect />} />
                    <Route path="/my-dashboard" element={<MyDashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/tickets" element={<Tickets />} />
                    <Route path="/tickets/:id" element={<TicketDetail />} />
                    <Route path="/history" element={<GlobalHistory />} />
                    <Route path="/sla" element={<ProtectedRouteWithPermissions allowedRoles={["admin", "super_admin", "ultra_super_admin"]} allowedModules={["sla"]}><SLAManagement /></ProtectedRouteWithPermissions>} />
                    <Route path="/approvals" element={<Approvals />} />
                     <Route path="/users" element={<ProtectedRouteWithPermissions allowedRoles={["admin", "super_admin", "ultra_super_admin"]}><Users /></ProtectedRouteWithPermissions>} />
                     <Route path="/incident-categories" element={<ProtectedRouteWithPermissions allowedRoles={["admin", "super_admin", "ultra_super_admin"]}><IncidentCategoryManagement /></ProtectedRouteWithPermissions>} />
                    <Route path="/timesheet" element={<Timesheet />} />
                    <Route path="/timesheet/:weekStart" element={<Timesheet />} />
                    <Route path="/timesheet/weekly" element={<TimesheetWeekly />} />
                    <Route path="/timesheet/reports" element={<TimesheetReports />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/forecasting-planning" element={<ForecastingPlanning />} />
                    <Route path="/catalog" element={<ServiceCatalog />} />
                    <Route path="/cmdb" element={<CMDB />} />
                    <Route path="/conversations" element={<Conversations />} />
                    <Route path="/problem" element={<ProblemManagement />} />
                    <Route path="/change" element={<ChangeManagement />} />
                    <Route path="/kb" element={<KnowledgeBase />} />
                    <Route path="/service-portal" element={<ServicePortal />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/access-control" element={<AccessControl />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/approved-tickets" element={<ApprovedTickets />} />
                    <Route path="/companies" element={<Companies />} />
                    <Route path="/companies/new" element={<Companies />} />
                    <Route path="/companies/:id" element={<Companies />} />
                    <Route path="/companies/:id/edit" element={<Companies />} />
                    <Route path="/timesheet-approvals" element={<TimesheetApprovals />} />
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/clear-users" element={<ClearUsers />} />
                    <Route path="/email-integrations" element={<EmailIntegrations />} />
                     <Route path="/branding" element={<ProtectedRouteWithPermissions allowedRoles={["super_admin", "ultra_super_admin"]}><BrandingSettings /></ProtectedRouteWithPermissions>} />
                     <Route path="/settings" element={<ProtectedRouteWithPermissions allowedRoles={["admin", "super_admin", "ultra_super_admin"]}><Settings /></ProtectedRouteWithPermissions>} />
                     <Route path="/activity-tracker" element={<ProtectedRouteWithPermissions allowedRoles={["agent", "admin", "super_admin", "ultra_super_admin"]}><ActivityTracker /></ProtectedRouteWithPermissions>} />
                     <Route path="/data-analytics" element={<ProtectedRouteWithPermissions allowedRoles={["admin", "super_admin", "ultra_super_admin"]}><DataAnalytics /></ProtectedRouteWithPermissions>} />
                     <Route path="/global-search" element={<ProtectedRouteWithPermissions allowedRoles={["user"]}><GlobalSearch /></ProtectedRouteWithPermissions>} />
                     <Route path="/meetings" element={<ProtectedRouteWithPermissions allowedRoles={["user"]}><MeetingManagement /></ProtectedRouteWithPermissions>} />
                     <Route path="/create-meeting" element={<ProtectedRouteWithPermissions allowedRoles={["user"]}><CreateMeeting /></ProtectedRouteWithPermissions>} />
                     <Route path="/ts-meeting/:tsmId/lobby" element={<ProtectedRouteWithPermissions allowedRoles={["user"]}><TSMeetingLobby /></ProtectedRouteWithPermissions>} />
                     <Route path="/ts-meeting/:tsmId/room" element={<ProtectedRouteWithPermissions allowedRoles={["user"]}><TSMeetingRoom /></ProtectedRouteWithPermissions>} />
                     <Route path="/calls" element={<ProtectedRouteWithPermissions allowedRoles={["agent", "admin", "super_admin", "ultra_super_admin"]}><CallLogs /></ProtectedRouteWithPermissions>} />
                     <Route path="/calls/new" element={<ProtectedRouteWithPermissions allowedRoles={["agent", "admin", "super_admin", "ultra_super_admin"]}><CreateCall /></ProtectedRouteWithPermissions>} />
                     <Route path="/calls/:id" element={<ProtectedRouteWithPermissions allowedRoles={["agent", "admin", "super_admin", "ultra_super_admin"]}><CallDetail /></ProtectedRouteWithPermissions>} />
                     <Route path="/ai-assistant" element={<ProtectedRouteWithPermissions allowedRoles={["agent", "admin", "super_admin", "ultra_super_admin"]}><AIAssistant /></ProtectedRouteWithPermissions>} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Suspense>
            </TabWorkspaceProvider>
            <TechnosprintPet />
            <AITrackerPet />
          </Router>
        </ActivityTrackerProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}

