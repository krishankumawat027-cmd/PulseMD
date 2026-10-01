import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export default function ChartCard({ title, data = [], dataKey = 'appointments' }) {
  return (
    <section className="card min-h-[260px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="badge">Analytics</p>
          <h2 className="mt-2 text-xl font-black">{title}</h2>
        </div>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pulseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f8f83" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0f8f83" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Area type="monotone" dataKey={dataKey} stroke="#0f8f83" fill="url(#pulseFill)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
