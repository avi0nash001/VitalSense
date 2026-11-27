import React from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { LandingPage } from './pages/LandingPage';
import { LoginPage, SignupPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { TimelinePage } from './pages/TimelinePage';
import { BaselinePage } from './pages/BaselinePage';
import { InsightsPage } from './pages/InsightsPage';
import { AlertsPage } from './pages/AlertsPage';
import { DataLabPage } from './pages/DataLabPage';
import { SettingsPage } from './pages/SettingsPage';
import { CaregiverPortalPage } from './pages/CaregiverPortalPage';
import { LiveVitalsPage } from './pages/LiveVitalsPage';
import { WellbeingPage } from './pages/WellbeingPage';
import { CaregiverNetworkPage } from './pages/CaregiverNetworkPage';
import { ThemeGalleryPage } from './pages/ThemeGalleryPage';
import { SmartAlertsPage } from './pages/SmartAlertsPage';
import { VoiceAssistantPage } from './pages/VoiceAssistantPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: ('member' | 'caregiver')[];
}) {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--vs-bg)] text-sm text-[var(--vs-text-secondary)]">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={user.role === 'caregiver' ? '/caregiver' : '/app/dashboard'}
        replace
      />
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />

                {/* Protected Workspace Routes */}
                <Route
                  element={
                    <ProtectedRoute>
                      <WorkspaceLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route
                    path="/app/dashboard"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <DashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/app/live-vitals"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <LiveVitalsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/app/timeline" element={<TimelinePage />} />
                  <Route
                    path="/app/baseline"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <BaselinePage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/app/wellbeing" element={<WellbeingPage />} />
                  <Route path="/app/insights" element={<InsightsPage />} />
                  <Route path="/app/alerts" element={<AlertsPage />} />
                  <Route
                    path="/app/caregiver-network"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <CaregiverNetworkPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/app/data-lab"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <DataLabPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/app/themes"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <ThemeGalleryPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/app/settings"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <SettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/app/smart-alerts"
                    element={
                      <ProtectedRoute allowedRoles={['member']}>
                        <SmartAlertsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/app/voice" element={<VoiceAssistantPage />} />
                  <Route path="/caregiver" element={<CaregiverPortalPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
