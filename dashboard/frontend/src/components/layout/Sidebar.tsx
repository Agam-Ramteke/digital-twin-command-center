import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Box,
  Factory,
  Cpu,
  GitFork,
  Wrench,
  BarChart3,
  ScrollText,
  Settings,
} from 'lucide-react';

const NAV = [
  {
    group: 'COMMAND CENTER',
    items: [
      { to: '/', label: 'Fleet Overview', icon: LayoutDashboard },
      { to: '/3d', label: '3D Virtual Factory', icon: Box },
      { to: '/twin', label: 'Digital Twin Studio', icon: GitFork },
    ],
  },
  {
    group: 'OPERATIONS',
    items: [
      { to: '/production', label: 'Production & DAG', icon: Factory },
      { to: '/machines', label: 'Machine Fleet', icon: Cpu },
    ],
  },
  {
    group: 'DIAGNOSTICS',
    items: [
      { to: '/maintenance', label: 'Predictive Maintenance', icon: Wrench },
      { to: '/analytics', label: 'Fleet Analytics', icon: BarChart3 },
    ],
  },
  {
    group: 'PLATFORM',
    items: [
      { to: '/events', label: 'Events Stream', icon: ScrollText },
      { to: '/system', label: 'System & Infra', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <h1>Digital Twin</h1>
        <div className="brand-sub">Command Center</div>
      </div>

      <div className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.group} className="sidebar-group">
            <div className="sidebar-group-label">{group.group}</div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' active' : ''}`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        v0.4.0 — Active Digital Twin
      </div>
    </nav>
  );
}
