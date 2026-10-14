import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ApiKeyAlert } from "./ApiKeyAlert";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r bg-card lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 overflow-auto p-4 lg:p-6">
          <ApiKeyAlert />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
