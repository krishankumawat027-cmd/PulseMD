import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../context/AuthContext.jsx';

export function DoctorsDirectory() {
  const [doctors, setDoctors] = useState([]);
  const [query, setQuery] = useState('');
  useEffect(() => { api.get('/doctors').then((res) => setDoctors(res.data)); }, []);
  const visible = doctors.filter((d) => [d.user?.name, d.specialty, d.city].join(' ').toLowerCase().includes(query.toLowerCase()));
  async function book(doctor) {
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    await api.post('/appointments', { doctor: doctor.user._id, scheduledAt, reason: 'Online consultation' });
    toast.success('Appointment requested');
  }
  return (
    <div className="grid gap-4">
      <section className="card">
        <h1 className="text-2xl font-black">Find doctors</h1>
        <input className="input mt-3" placeholder="Search cardiology, fever, city..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((doctor) => (
          <article className="card" key={doctor._id}>
            <span className="badge">{doctor.status}</span>
            <h2 className="mt-3 text-xl font-black">Dr. {doctor.user?.name}</h2>
            <p className="text-sm text-slate-500">{doctor.specialty} - {doctor.city}</p>
            <p className="mt-3 text-sm">{doctor.bio || 'Available for online consultation and follow-up care.'}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <strong>Rs. {doctor.fee}</strong>
              <button className="btn" onClick={() => book(doctor)}>Book</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function ListPage({ title, endpoint }) {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get(endpoint).then((res) => setItems(res.data)).catch(() => setItems([])); }, [endpoint]);
  return (
    <div className="grid gap-4">
      <section className="card">
        <h1 className="text-2xl font-black">{title}</h1>
      </section>
      <section className="grid gap-3">
        {items.length ? items.map((item) => (
          <article className="card" key={item._id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{item.title || item.patient?.name || item.doctor?.name || item.user?.name || item.name || 'Record'}</strong>
              <span className="badge">{item.status || item.role || item.type || 'active'}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{item.message || item.reason || item.email || item.fileName || new Date(item.createdAt || Date.now()).toLocaleString()}</p>
          </article>
        )) : <div className="card text-center text-sm text-slate-500">No records yet.</div>}
      </section>
    </div>
  );
}
