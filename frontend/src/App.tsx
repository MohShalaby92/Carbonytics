import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './hooks/useTheme';
import { AuthProvider } from './hooks/useAuth';
import { PersonaProvider } from './hooks/usePersona';
import { Navbar } from './components/layout/Navbar';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { OnboardingGate } from './components/onboarding/OnboardingGate';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

// Code-split the heavy authenticated pages (dashboard pulls in recharts).
const DashboardPage = lazy(() =>
  import('./pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CalculationPage = lazy(() =>
  import('./pages/calculations/CalculationPage').then((m) => ({ default: m.CalculationPage }))
);
const ImportExportPage = lazy(() =>
  import('./pages/ImportExportPage').then((m) => ({ default: m.ImportExportPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const CompliancePage = lazy(() =>
  import('./pages/compliance/CompliancePage').then((m) => ({ default: m.CompliancePage }))
);
const GlossaryPage = lazy(() =>
  import('./pages/GlossaryPage').then((m) => ({ default: m.GlossaryPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

const PageFallback = () => (
  <div className="flex items-center justify-center py-32">
    <LoadingSpinner />
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PersonaProvider>
          <Router>
            <div className="min-h-screen bg-bg text-fg">
              {/* First Tab stop: jump past the navbar straight to the page. */}
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[60] focus:rounded-xl focus:bg-surface focus:border focus:border-line focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-fg focus:shadow-lift focus-ring"
              >
                Skip to content
              </a>
              <Navbar />
              <OnboardingGate />
              <main id="main" tabIndex={-1} className="focus:outline-none">
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/calculations" element={<ProtectedRoute><CalculationPage /></ProtectedRoute>} />
                    <Route path="/import-export" element={<ProtectedRoute><ImportExportPage /></ProtectedRoute>} />
                    <Route path="/compliance" element={<ProtectedRoute><CompliancePage /></ProtectedRoute>} />
                    <Route path="/glossary" element={<ProtectedRoute><GlossaryPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/profile" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </main>
            </div>
          </Router>
          </PersonaProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
