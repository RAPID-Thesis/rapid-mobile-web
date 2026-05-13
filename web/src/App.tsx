import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import PageSpinner from './components/PageSpinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AssessmentsPage = lazy(() => import('./pages/AssessmentsPage'));
const AssessmentDetailPage = lazy(() => import('./pages/AssessmentDetailPage'));
const HeatmapPage = lazy(() => import('./pages/HeatmapPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSpinner label="Loading…" />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <Lazy>
                <LoginPage />
              </Lazy>
            }
          />
          <Route
            path="/register"
            element={
              <Lazy>
                <RegisterPage />
              </Lazy>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <Lazy>
                <ForgotPasswordPage />
              </Lazy>
            }
          />
          <Route
            path="/reset-password"
            element={
              <Lazy>
                <ResetPasswordPage />
              </Lazy>
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route
                path="/"
                element={
                  <Lazy>
                    <DashboardPage />
                  </Lazy>
                }
              />
              <Route
                path="/assessments"
                element={
                  <Lazy>
                    <AssessmentsPage />
                  </Lazy>
                }
              />
              <Route
                path="/assessments/:id"
                element={
                  <Lazy>
                    <AssessmentDetailPage />
                  </Lazy>
                }
              />
              <Route
                path="/heatmap"
                element={
                  <Lazy>
                    <HeatmapPage />
                  </Lazy>
                }
              />
              <Route
                path="/reports"
                element={
                  <Lazy>
                    <ReportsPage />
                  </Lazy>
                }
              />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route element={<AppLayout />}>
              <Route
                path="/users"
                element={
                  <Lazy>
                    <UsersPage />
                  </Lazy>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <Lazy>
                    <AdminSettingsPage />
                  </Lazy>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
