import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
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
    group: 'DIGITAL TWIN',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    group: 'OPERATIONS',
    items: [
      { to: '/production', label: 'Production', icon: Factory },
      { to: '/machines', label: 'Machines', icon: Cpu },
    ],
  },
  {
    group: 'INTELLIGENCE',
    items: [
      { to: '/twin', label: 'Digital Twin', icon: GitFork },
      { to: '/maintenance', label: 'Predictive Maintenance', icon: Wrench },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { to: '/events', label: 'Events', icon: ScrollText },
      { to: '/system', label: 'System', icon: Settings },
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
                <item.icon />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        v0.1.0 — Prototype
      </div>
    </nav>
  );
}
