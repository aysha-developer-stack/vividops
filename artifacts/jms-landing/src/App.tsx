import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import SuperAdminDashboard from "@/pages/admin/SuperAdminDashboard";
import UserManagement from "@/pages/admin/UserManagement";
import JobManagement from "@/pages/admin/JobManagement";
import Reports from "@/pages/admin/Reports";
import Communication from "@/pages/admin/Communication";
import Timer from "@/pages/admin/Timer";
import Training from "@/pages/admin/Training";
import Settings from "@/pages/admin/Settings";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import SupervisorMonitoring from "@/pages/admin/SupervisorMonitoring";
import SupervisorDashboard from "@/pages/admin/SupervisorDashboard";
import UserMonitoring from "@/pages/admin/UserMonitoring";
import UserDashboard from "@/pages/admin/UserDashboard";
import MyJobs from "@/pages/admin/MyJobs";
import JobDetail from "@/pages/admin/JobDetail";
import Notifications from "@/pages/admin/Notifications";
import SystemMonitoring from "@/pages/admin/SystemMonitoring";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      <Route path="/super-admin/users"><UserManagement /></Route>
      <Route path="/super-admin/jobs"><JobManagement /></Route>
      <Route path="/super-admin/jobs/:id"><JobDetail role="super-admin" /></Route>
      <Route path="/super-admin/monitoring"><SystemMonitoring /></Route>
      <Route path="/super-admin/reports"><Reports /></Route>
      <Route path="/super-admin/communication"><Communication /></Route>
      <Route path="/super-admin/timer"><Timer /></Route>
      <Route path="/super-admin/training"><Training /></Route>
      <Route path="/super-admin/settings"><Settings /></Route>
      <Route path="/super-admin/notifications"><Notifications role="super-admin" /></Route>

      {/* Admin */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users"><UserManagement role="admin" /></Route>
      <Route path="/admin/jobs"><JobManagement role="admin" /></Route>
      <Route path="/admin/jobs/:id"><JobDetail role="admin" /></Route>
      <Route path="/admin/supervisors" component={SupervisorMonitoring} />
      <Route path="/admin/reports"><Reports role="admin" /></Route>
      <Route path="/admin/communication"><Communication role="admin" /></Route>
      <Route path="/admin/training"><Training role="admin" /></Route>
      <Route path="/admin/settings"><Settings role="admin" /></Route>
      <Route path="/admin/notifications"><Notifications role="admin" /></Route>

      {/* Supervisor */}
      <Route path="/supervisor" component={SupervisorDashboard} />
      <Route path="/supervisor/jobs"><JobManagement role="supervisor" /></Route>
      <Route path="/supervisor/jobs/:id"><JobDetail role="supervisor" /></Route>
      <Route path="/supervisor/users" component={UserMonitoring} />
      <Route path="/supervisor/communication"><Communication role="supervisor" /></Route>
      <Route path="/supervisor/reports"><Reports role="supervisor" /></Route>
      <Route path="/supervisor/training"><Training role="supervisor" /></Route>
      <Route path="/supervisor/settings"><Settings role="supervisor" /></Route>
      <Route path="/supervisor/notifications"><Notifications role="supervisor" /></Route>

      {/* User */}
      <Route path="/user" component={UserDashboard} />
      <Route path="/user/jobs" component={MyJobs} />
      <Route path="/user/jobs/:id"><JobDetail role="user" /></Route>
      <Route path="/user/timer"><Timer role="user" /></Route>
      <Route path="/user/training"><Training role="user" /></Route>
      <Route path="/user/communication"><Communication role="user" /></Route>
      <Route path="/user/reports"><Reports role="user" /></Route>
      <Route path="/user/settings"><Settings role="user" /></Route>
      <Route path="/user/notifications"><Notifications role="user" /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
