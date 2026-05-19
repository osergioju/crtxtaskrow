import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/AppShell";
import Overview from "./pages/Overview";
import ClientsView from "./pages/ClientsView";
import ClientDetail from "./pages/ClientDetail";
import CollaboratorView from "./pages/CollaboratorView";
import CollaboratorDetail from "./pages/CollaboratorDetail";
import AreasView from "./pages/AreasView";
import ProjectsView from "./pages/ProjectsView";
import TasksView from "./pages/TasksView";
import SLAView from "./pages/SLAView";
import NPSSatisfaction from "./pages/NPSSatisfaction";
import NPSClientResults from "./pages/NPSClientResults";
import NPSRespond from "./pages/NPSRespond";
import AnalyticsView from "./pages/AnalyticsView";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function InternalApp() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/clientes" element={<ClientsView />} />
        <Route path="/clientes/:nick" element={<ClientDetail />} />
        <Route path="/colaboradores" element={<CollaboratorView />} />
        <Route path="/colaboradores/:id" element={<CollaboratorDetail />} />
        <Route path="/areas" element={<AreasView />} />
        <Route path="/projetos" element={<ProjectsView />} />
        <Route path="/tarefas" element={<TasksView />} />
        <Route path="/sla" element={<SLAView />} />
        <Route path="/nps" element={<NPSSatisfaction />} />
        <Route path="/nps/resultados/:clientId" element={<NPSClientResults />} />
        <Route path="/analytics" element={<AnalyticsView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Rota pública — sem AppShell (sidebar/topbar) */}
          <Route path="/nps/respond/:token" element={<NPSRespond />} />

          {/* Rotas internas — com AppShell */}
          <Route path="*" element={<InternalApp />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
