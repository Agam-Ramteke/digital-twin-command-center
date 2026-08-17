import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import OverviewPage from './pages/OverviewPage';
import ProductionPage from './pages/ProductionPage';
import MachinesPage from './pages/MachinesPage';
import MachineDetailPage from './pages/MachineDetailPage';
import DigitalTwinPage from './pages/DigitalTwinPage';
import MaintenancePage from './pages/MaintenancePage';
import AnalyticsPage from './pages/AnalyticsPage';
import EventsPage from './pages/EventsPage';
import SystemPage from './pages/SystemPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/production" element={<ProductionPage />} />
          <Route path="/machines" element={<MachinesPage />} />
          <Route path="/machines/:machineId" element={<MachineDetailPage />} />
          <Route path="/twin" element={<DigitalTwinPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/system" element={<SystemPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
