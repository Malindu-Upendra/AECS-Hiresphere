import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/search', label: 'Find Interviewers', candidateOnly: true },
  { to: '/bookings', label: 'My Bookings' },
  { to: '/practicals', label: 'Practicals' },
  { to: '/messages', label: 'Messages' },
  { to: '/profile', label: 'Profile' },
];

export default function Layout() {
  const { logout, profile } = useAuth();
  const isInterviewer = profile?.role === 'interviewer';

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-indigo-900 text-white flex flex-col">
        <div className="p-5 text-xl font-bold border-b border-indigo-700">HireSphere</div>
        <nav className="flex-1 py-4">
          {navItems.filter(item => !(item.candidateOnly && isInterviewer)).map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `block px-5 py-3 text-sm transition-colors ${isActive ? 'bg-indigo-700 font-semibold' : 'hover:bg-indigo-800'}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="m-4 py-2 px-4 bg-indigo-700 hover:bg-indigo-600 rounded text-sm"
        >
          Sign Out
        </button>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
