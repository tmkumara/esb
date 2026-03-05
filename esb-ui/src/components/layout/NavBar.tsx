import { NavLink } from 'react-router-dom';
import { Home, Route, Workflow, CheckCircle, Activity } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'HOME', icon: Home },
  { path: '/routes', label: 'ROUTES', icon: Route },
  { path: '/builder', label: 'BUILDER', icon: Workflow },
  { path: '/validation', label: 'VALIDATION', icon: CheckCircle },
  { path: '/monitoring', label: 'MONITORING', icon: Activity },
];

export function NavBar() {
  return (
    <nav className="bg-white border-b border-slate-200 z-20 relative shadow-sm">
      <div className="flex items-center px-6 overflow-x-auto">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 text-xs font-bold tracking-widest border-b-2 transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                isActive
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-400 border-transparent hover:text-blue-500 hover:border-blue-300'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
