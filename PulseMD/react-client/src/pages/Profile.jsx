import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [contact, setContact] = useState({ name: '', phone: '', relation: '' });
  async function saveEmergency() {
    await api.patch('/patients/me', { emergencyContact: contact });
    toast.success('Emergency contact saved');
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="card">
        <span className="badge">{user?.role}</span>
        <h1 className="mt-3 text-2xl font-black">{user?.name}</h1>
        <p className="text-sm text-slate-500">{user?.email}</p>
      </section>
      <section className="card">
        <h2 className="text-xl font-black">Emergency contact</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input className="input" placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          <input className="input" placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <input className="input" placeholder="Relation" value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} />
        </div>
        <button className="btn mt-3" onClick={saveEmergency}>Save emergency contact</button>
      </section>
    </div>
  );
}
