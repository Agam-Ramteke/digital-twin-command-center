import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from '../common/ErrorBoundary';
import TopoBackground from '../kokonutui/topo-background';

export default function AppShell() {
  const location = useLocation();
  const is3D = location.pathname === '/3d';

  return (
    <div className="app-shell dark">
      {/* Living Topo Background across the entire Digital Twin Command Center */}
      {!is3D && (
        <div className="app-topo-backdrop" aria-hidden="true">
          <TopoBackground
            className="w-full h-full min-h-screen bg-transparent text-zinc-500 dark:text-zinc-400"
            speed={0.4}
            interval={0.065}
            interactive={true}
            labels={true}
            fadeEdges={false}
          >
            {null}
          </TopoBackground>
        </div>
      )}
      <Sidebar />
      <div className="app-main">
        <Header />
        <div className={`app-content${is3D ? ' app-content-fullbleed' : ''}`}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
