import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';

export default function Auth({ mode = 'login' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'patient', specialty: 'General Medicine' });
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const user = mode === 'login' ? await login(form) : await register(form);
      toast.success('Welcome to PulseMD');
      navigate(`/${user.role}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-3">
      <section className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_0.9fr]">
        <form onSubmit={submit} className="card grid gap-4 p-5 sm:p-7">
          <div>
            <span className="badge">PulseMD - Virtual Clinic</span>
            <h1 className="mt-3 text-3xl font-black sm:text-5xl">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="mt-2 text-sm text-slate-500">Healthcare that comes to you. Secure access for patients, doctors, and admins.</p>
          </div>
          {mode === 'register' && <input className="input" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          {mode === 'register' && (
            <>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </select>
              {form.role === 'doctor' && <input className="input" placeholder="Specialty" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />}
            </>
          )}
          <button className="btn" disabled={loading}>{loading ? 'Please wait...' : mode === 'login' ? 'Login securely' : 'Register'}</button>
          <button type="button" className="btn-soft" onClick={() => navigate(mode === 'login' ? '/register' : '/login')}>
            {mode === 'login' ? 'Create account' : 'Already registered? Login'}
          </button>
        </form>
        <aside className="card hidden place-content-center bg-gradient-to-br from-sky-50 to-emerald-50 p-8 lg:grid">
          <div className="mx-auto max-w-sm">
            <div className="mb-6 grid h-24 w-24 place-items-center rounded-3xl bg-clinic-green text-xl font-black text-white">Pulse<br />MD</div>
            <h2 className="text-3xl font-black">One platform for virtual care.</h2>
            <p className="mt-3 text-slate-600">Appointments, AI symptom intake, emergency alerts, reports, prescriptions, and real-time chat.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
