import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Bell, Calendar, FileText, Home, LogOut, Menu, MessageCircle, Settings, ShieldCheck, Stethoscope, UserRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const navByRole = {
  admin: [
    ['Dashboard', '/admin', Home],
    ['Doctors', '/admin/doctors', Stethoscope],
    ['Patients', '/admin/patients', UserRound],
    ['Appointments', '/admin/appointments', Calendar],
    ['Emergency', '/admin/emergency', ShieldCheck],
    ['Reports', '/admin/reports', FileText],
    ['Settings', '/admin/settings', Settings]
  ],
  doctor: [
    ['Dashboard', '/doctor', Home],
    ['Appointments', '/doctor/appointments', Calendar],
    ['Chat', '/doctor/chat', MessageCircle],
    ['Reports', '/doctor/reports', FileText],
    ['Profile', '/doctor/profile', UserRound]
  ],
  patient: [
    ['Home', '/patient', Home],
    ['Doctors', '/patient/doctors', Stethoscope],
    ['Appointments', '/patient/appointments', Calendar],
    ['Chat', '/patient/chat', MessageCircle],
    ['Profile', '/patient/profile', UserRound]
  ]
};

function Sidebar({ open, setOpen }) {
  const { user, logout, language, setLanguage } = useAuth();
  const navigate = useNavigate();
  const links = navByRole[user?.role] || navByRole.patient;
  return (
    <>
      <button className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" hidden={!open} onClick={() => setOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[86vw] flex-col border-r border-slate-200 bg-white p-4 shadow-soft transition lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-clinic-green text-xs font-black text-white">Pulse<br />MD</span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-black">PulseMD</strong>
              <small className="block truncate text-xs text-slate-500">Virtual Clinic</small>
            </span>
          </Link>
          <button className="btn-soft h-10 w-10 p-0 lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="grid gap-1">
          {links.map(([label, href, Icon]) => (
            <NavLink key={href} to={href} onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-bold ${isActive ? 'bg-emerald-50 text-clinic-green' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 pt-4">
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
          <button className="btn-soft" onClick={() => { logout(); navigate('/login'); }}><LogOut size={17} /> Logout</button>
        </div>
      </aside>
    </>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Sidebar open={open} setOpen={setOpen} />
      <main className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur lg:px-6">
          <button className="btn-soft h-10 w-10 p-0 lg:hidden" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <div>
            <p className="text-xs font-bold uppercase text-clinic-green">PulseMD - Virtual Clinic</p>
            <h1 className="text-lg font-black sm:text-2xl">Healthcare that comes to you</h1>
          </div>
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-slate-500" />
            <span className="hidden text-sm font-bold sm:inline">{user?.name}</span>
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-6">
          <Outlet />
        </div>
        <nav className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-5 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-soft backdrop-blur lg:hidden">
          {(navByRole[user?.role] || navByRole.patient).slice(0, 5).map(([label, href, Icon]) => (
            <NavLink key={href} to={href} className={({ isActive }) => `grid min-h-12 place-items-center rounded-lg text-[11px] font-bold ${isActive ? 'bg-emerald-50 text-clinic-green' : 'text-slate-500'}`}>
              <Icon size={17} />
              <span className="max-w-full truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}
