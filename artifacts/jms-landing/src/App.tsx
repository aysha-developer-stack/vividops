import { lazy, Suspense, useEffect, type FC } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ROLES, type Role } from "@/lib/roles";

interface RolePageProps { role?: Role; initialTab?: any; }

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const SuperAdminDashboard = lazy(() => import("@/pages/admin/SuperAdminDashboard"));
const UserManagement = lazy<FC<RolePageProps>>(() => import("@/pages/admin/UserManagement"));
const JobManagement = lazy<FC<RolePageProps>>(() => import("@/pages/admin/JobManagement"));
const Reports = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Reports"));
const Communication = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Communication"));
const Timer = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Timer"));
const Training = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Training"));
const Settings = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Settings"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const SupervisorMonitoring = lazy<FC<RolePageProps>>(() => import("@/pages/admin/SupervisorMonitoring"));
const SupervisorDashboard = lazy(() => import("@/pages/admin/SupervisorDashboard"));
const UserMonitoring = lazy<FC<RolePageProps>>(() => import("@/pages/admin/UserMonitoring"));
const UserDashboard = lazy(() => import("@/pages/admin/UserDashboard"));
const FilesChecklists = lazy(() => import("@/pages/admin/FilesChecklists"));
const SuperAdminFiles = lazy(() => import("./pages/admin/SuperAdminFiles"));
const SuperAdminRolesPermissions = lazy(() => import("./pages/admin/SuperAdminRolesPermissions"));
const MyJobs = lazy(() => import("@/pages/admin/MyJobs"));
const JobDetail = lazy(() => import("@/pages/admin/JobDetail"));
const Notifications = lazy<FC<RolePageProps>>(() => import("@/pages/admin/Notifications"));
const SystemMonitoring = lazy<FC<RolePageProps>>(() => import("@/pages/admin/SystemMonitoring"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const [loc, setLocation] = useLocation();
  const path = loc.startsWith("/") ? loc : `/${loc}`;

  const requiredRole: Role | null =
    path.startsWith("/super-admin")
      ? "super-admin"
      : path.startsWith("/admin")
        ? "admin"
        : path.startsWith("/supervisor")
          ? "supervisor"
          : path.startsWith("/user")
            ? "user"
            : null;

  const target = ROLES[(user?.role as Role | undefined) ?? "user"]?.base ?? "/";
  const portalMismatch =
    !!user && requiredRole !== null && user.role !== requiredRole && path !== "/reset-password";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setLocation("/login");
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!user?.mustResetPassword) return;
    if (user.role !== "user") return;
    if (path === "/reset-password") return;
    setLocation("/reset-password");
  }, [isLoading, isAuthenticated, user, path, setLocation]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!user) return;
    if (path === "/reset-password") return;
    if (!portalMismatch) return;
    if (path !== target) setLocation(target);
  }, [isLoading, isAuthenticated, user, path, setLocation, portalMismatch, target]);

  if (isLoading || !isAuthenticated) return <PageLoader />;
  if (portalMismatch) return <PageLoader />;
  return <>{children}</>;
}

function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/reset-password" component={ResetPassword} />
        
        {/* Super Admin */}
        <Route path="/super-admin/users"><RequireSignedIn><UserManagement role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/users-monitoring"><RequireSignedIn><UserMonitoring role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/supervisors"><RequireSignedIn><SupervisorMonitoring role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/error-reports"><RequireSignedIn><UserMonitoring role="super-admin" initialTab="errors" /></RequireSignedIn></Route>
        <Route path="/super-admin/assignments"><RequireSignedIn><JobManagement role="super-admin" initialTab="assignments" /></RequireSignedIn></Route>
        <Route path="/super-admin/rework-requests"><RequireSignedIn><JobManagement role="super-admin" initialTab="rework" /></RequireSignedIn></Route>
        <Route path="/super-admin/files"><RequireSignedIn><SuperAdminFiles /></RequireSignedIn></Route>
        <Route path="/super-admin/jobs/:id">{(params) => <RequireSignedIn><JobDetail id={params.id} role="super-admin" /></RequireSignedIn>}</Route>
        <Route path="/super-admin/jobs"><RequireSignedIn><JobManagement role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/monitoring"><RequireSignedIn><SystemMonitoring role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/reports"><RequireSignedIn><Reports role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/settings"><RequireSignedIn><Settings role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/training"><RequireSignedIn><Training role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/notifications"><RequireSignedIn><Notifications role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin/communication"><RequireSignedIn><Communication role="super-admin" /></RequireSignedIn></Route>
        <Route path="/super-admin"><RequireSignedIn><SuperAdminDashboard /></RequireSignedIn></Route>
        
        {/* Admin */}
        <Route path="/admin/users"><RequireSignedIn><UserManagement role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/jobs/:id">{(params) => <RequireSignedIn><JobDetail id={params.id} role="admin" /></RequireSignedIn>}</Route>
        <Route path="/admin/jobs"><RequireSignedIn><JobManagement role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/supervisors"><RequireSignedIn><SupervisorMonitoring role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/monitoring"><RequireSignedIn><UserMonitoring role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/reports"><RequireSignedIn><Reports role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/communication"><RequireSignedIn><Communication role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/files"><RequireSignedIn><SuperAdminFiles role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/settings"><RequireSignedIn><Settings role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/training"><RequireSignedIn><Training role="admin" /></RequireSignedIn></Route>
        <Route path="/admin/notifications"><RequireSignedIn><Notifications role="admin" /></RequireSignedIn></Route>
        <Route path="/admin"><RequireSignedIn><AdminDashboard /></RequireSignedIn></Route>
        
        {/* Supervisor */}
        <Route path="/supervisor/error-reports"><RequireSignedIn><UserMonitoring role="supervisor" initialTab="errors" /></RequireSignedIn></Route>
        <Route path="/supervisor/users"><RequireSignedIn><UserMonitoring role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/jobs/:id">{(params) => <RequireSignedIn><JobDetail id={params.id} role="supervisor" /></RequireSignedIn>}</Route>
        <Route path="/supervisor/jobs"><RequireSignedIn><JobManagement role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/monitoring"><RequireSignedIn><SupervisorMonitoring role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/reports"><RequireSignedIn><Reports role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/communication"><RequireSignedIn><Communication role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/settings"><RequireSignedIn><Settings role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/training"><RequireSignedIn><Training role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/notifications"><RequireSignedIn><Notifications role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor/timer"><RequireSignedIn><Timer role="supervisor" /></RequireSignedIn></Route>
        <Route path="/supervisor"><RequireSignedIn><SupervisorDashboard /></RequireSignedIn></Route>
        
        {/* User */}
        <Route path="/user/jobs/:id">{(params) => <RequireSignedIn><JobDetail id={params.id} role="user" /></RequireSignedIn>}</Route>
        <Route path="/user/jobs"><RequireSignedIn><MyJobs /></RequireSignedIn></Route>
        <Route path="/user/my-jobs"><RequireSignedIn><MyJobs /></RequireSignedIn></Route>
        <Route path="/user/timer"><RequireSignedIn><Timer role="user" /></RequireSignedIn></Route>
        <Route path="/user/training"><RequireSignedIn><Training role="user" /></RequireSignedIn></Route>
        <Route path="/user/notifications"><RequireSignedIn><Notifications role="user" /></RequireSignedIn></Route>
        <Route path="/user/communication"><RequireSignedIn><Communication role="user" /></RequireSignedIn></Route>
        <Route path="/user/reports"><RequireSignedIn><Reports role="user" /></RequireSignedIn></Route>
        <Route path="/user/settings"><RequireSignedIn><Settings role="user" /></RequireSignedIn></Route>
        <Route path="/user/files"><RequireSignedIn><FilesChecklists /></RequireSignedIn></Route>
        <Route path="/user"><RequireSignedIn><UserDashboard /></RequireSignedIn></Route>
  
        <Route><NotFound /></Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Router base={base}>
              <AppRouter />
            </Router>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
