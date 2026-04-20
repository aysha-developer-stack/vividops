import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import SuperAdminDashboard from "@/pages/admin/SuperAdminDashboard";
import UserManagement from "@/pages/admin/UserManagement";
import JobManagement from "@/pages/admin/JobManagement";
import Reports from "@/pages/admin/Reports";
import Communication from "@/pages/admin/Communication";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      <Route path="/super-admin/users" component={UserManagement} />
      <Route path="/super-admin/jobs" component={JobManagement} />
      <Route path="/super-admin/reports" component={Reports} />
      <Route path="/super-admin/communication" component={Communication} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
