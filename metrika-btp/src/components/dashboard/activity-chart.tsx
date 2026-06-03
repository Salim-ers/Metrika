"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ActivityChart({ data }: { data: { mois: string; documents: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E1A532" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#E1A532" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="mois" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7a90" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6b7a90" }} width={36} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e3e8f0", fontSize: 12 }}
          labelStyle={{ color: "#14233F", fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="documents" stroke="#E1A532" strokeWidth={2.5} fill="url(#gold)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
