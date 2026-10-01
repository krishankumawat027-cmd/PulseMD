export default function StatCard({ label, value, icon: Icon, tone = 'green' }) {
  const color = tone === 'blue' ? 'bg-sky-50 text-sky-700' : tone === 'red' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-clinic-green';
  return (
    <article className="card flex items-center gap-3">
      {Icon && <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${color}`}><Icon size={19} /></span>}
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <strong className="block truncate text-2xl font-black text-slate-900">{value}</strong>
      </div>
    </article>
  );
}
