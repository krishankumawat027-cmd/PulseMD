import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Calendar, IndianRupee, Stethoscope, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, useAuth } from '../context/AuthContext.jsx';
import StatCard from '../components/StatCard.jsx';
import ChartCard from '../components/ChartCard.jsx';
import { quickSlots } from '../data/demo.js';

function useAnalytics() {
  const [data, setData] = useState({ cards: {}, charts: { monthly: [] } });
  useEffect(() => {
    api.get('/analytics').then((res) => setData(res.data)).catch(() => {});
  }, []);
  return data;
}

export function AdminDashboard() {
  const analytics = useAnalytics();
  const cards = analytics.cards || {};
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Users" value={cards.users || 0} icon={Users} />
        <StatCard label="Appointments" value={cards.appointments || 0} icon={Calendar} tone="blue" />
        <StatCard label="Revenue" value={`Rs. ${cards.revenue || 0}`} icon={IndianRupee} />
        <StatCard label="Doctors" value={cards.doctors || 0} icon={Stethoscope} tone="blue" />
        <StatCard label="AI usage" value={cards.aiUsage || 0} icon={Activity} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Appointments trend" data={analytics.charts?.monthly || []} />
        <ChartCard title="Revenue trend" data={analytics.charts?.monthly || []} dataKey="revenue" />
      </section>
    </div>
  );
}

export function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [earnings, setEarnings] = useState({ total: 0, payments: [] });
  useEffect(() => {
    api.get('/doctors/appointments').then((res) => setAppointments(res.data)).catch(() => {});
    api.get('/doctors/earnings').then((res) => setEarnings(res.data)).catch(() => {});
  }, []);
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today appointments" value={appointments.length} icon={Calendar} />
        <StatCard label="Earnings" value={`Rs. ${earnings.total}`} icon={IndianRupee} />
        <StatCard label="Reports" value="12" icon={Activity} tone="blue" />
        <StatCard label="Rating" value="4.8" icon={Stethoscope} />
      </section>
      <section className="card">
        <h2 className="text-xl font-black">Incoming appointments</h2>
        <div className="mt-4 grid gap-3">
          {appointments.length ? appointments.slice(0, 5).map((item) => <AppointmentCard key={item._id} item={item} />) : <Empty text="No appointments yet." />}
        </div>
      </section>
    </div>
  );
}

export function PatientDashboard() {
  const { user, t } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [result, setResult] = useState(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    api.get('/doctors').then((res) => setDoctors(res.data)).catch(() => {});
    api.get('/appointments').then((res) => setAppointments(res.data)).catch(() => {});
  }, []);

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast.error('Voice input not supported. Please type.');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event) => setSymptoms(event.results[0][0].transcript);
    recognition.start();
  }

  async function analyze() {
    if (!symptoms.trim()) return toast.error('Enter symptoms first.');
    const { data } = await api.post('/ai/analyze', { symptomsText: symptoms });
    setResult(data);
  }

  async function emergency() {
    const { data } = await api.post('/emergency/alert', { message: 'One-click emergency alert' });
    toast.success(`Emergency alert sent. Ambulance: ${data.ambulance.number}`);
  }

  return (
    <div className="grid gap-4">
      <section className="card bg-gradient-to-br from-white to-emerald-50">
        <p className="badge">Patient workspace</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Welcome {user?.name?.split(' ')[0] || 'Patient'}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('Healthcare that comes to you', 'Swasthya seva aapke paas')}</p>
        <button onClick={emergency} className="btn mt-4 bg-rose-600 hover:bg-rose-700"><AlertTriangle size={18} /> Emergency Help</button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Appointments" value={appointments.length} icon={Calendar} />
        <StatCard label="Doctors" value={doctors.length} icon={Stethoscope} tone="blue" />
        <StatCard label="Reports" value="Upload ready" icon={Activity} />
        <StatCard label="AI checks" value="Voice + text" icon={Activity} tone="blue" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="card">
          <h2 className="text-xl font-black">AI Symptom Checker</h2>
          <textarea className="input mt-3 min-h-28" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Example: I have fever and headache for two days" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button className="btn-soft" onClick={startVoice}>{listening ? 'Listening...' : 'Start Voice'}</button>
            <button className="btn" onClick={analyze}>Analyze</button>
            <button className="btn-soft" onClick={() => { setSymptoms(''); setResult(null); }}>Clear</button>
          </div>
          {result && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm"><strong>{result.urgency} urgency</strong><p>{result.summary}</p><p>{result.advice}</p></div>}
        </div>
        <div className="card">
          <h2 className="text-xl font-black">Quick slots</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {quickSlots.map((slot) => <button key={slot} className="btn-soft">{slot}</button>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function AppointmentCard({ item }) {
  return (
    <article className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{item.patient?.name || item.doctor?.name || 'Consultation'}</strong>
        <span className="badge">{item.status}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{new Date(item.scheduledAt).toLocaleString()}</p>
    </article>
  );
}

function Empty({ text }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{text}</div>;
}
