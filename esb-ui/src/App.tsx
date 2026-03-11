import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import RoutesPage from './pages/RoutesPage';
import RouteBuilderPage from './pages/RouteBuilderPage';
import ValidationPage from './pages/ValidationPage';
import MonitoringPage from './pages/MonitoringPage';
import AuditPage from './pages/AuditPage';
import { ToastProvider } from './hooks/useToast';

// designer mode shows Builder + Validation; runtime mode shows Monitor-only UI
const isDesigner = import.meta.env.VITE_APP_MODE !== 'runtime';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="routes" element={<RoutesPage />} />
            {isDesigner && <Route path="builder" element={<RouteBuilderPage />} />}
            {isDesigner && <Route path="validation" element={<ValidationPage />} />}
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="audit" element={<AuditPage />} />
            {/* Redirect builder/validation to dashboard in runtime mode */}
            {!isDesigner && <Route path="builder" element={<Navigate to="/dashboard" replace />} />}
            {!isDesigner && <Route path="validation" element={<Navigate to="/dashboard" replace />} />}
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
