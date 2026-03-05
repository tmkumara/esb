import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import RoutesPage from './pages/RoutesPage';
import RouteBuilderPage from './pages/RouteBuilderPage';
import ValidationPage from './pages/ValidationPage';
import MonitoringPage from './pages/MonitoringPage';
import { ToastProvider } from './hooks/useToast';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="builder" element={<RouteBuilderPage />} />
            <Route path="validation" element={<ValidationPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
