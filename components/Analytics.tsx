
import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { PulmonaryDomain } from '../types';

interface AnalyticsProps {
  performance: Record<string, { correct: number; total: number }>;
}

const Analytics: React.FC<AnalyticsProps> = ({ performance }) => {
  // Fixed: Cast Object.entries to ensure 'stats' is correctly typed instead of 'unknown'
  const data = (Object.entries(performance) as [string, { correct: number; total: number }][]).map(([domain, stats]) => ({
    domain: domain.split(' ').slice(0, 2).join(' '), // Shorten name
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    fullDomain: domain,
    total: stats.total,
    correct: stats.correct
  }));

  const weaknesses = [...data]
    .filter(d => d.total > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-2xl font-bold">Weakness Analysis</h2>
        <p className="text-gray-500">AI-driven identification of your high-yield gaps.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-lg font-bold mb-6">Proficiency Radar</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="domain" tick={{ fill: '#64748b', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                <Radar
                  name="Proficiency"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-lg font-bold mb-6">Detailed Accuracy</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis dataKey="domain" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(val) => [`${val}%`, 'Accuracy']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="accuracy" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section>
        <h3 className="text-lg font-bold mb-4">Critical Revision Areas</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {weaknesses.length > 0 ? weaknesses.map((w) => (
            <div key={w.fullDomain} className="bg-red-50 border border-red-100 p-5 rounded-xl">
              <h4 className="text-red-800 font-bold text-sm mb-1">{w.fullDomain}</h4>
              <p className="text-red-700 text-2xl font-bold">{w.accuracy}% <span className="text-sm font-normal">Accuracy</span></p>
              <p className="text-xs text-red-600 mt-2">{w.correct}/{w.total} correct</p>
            </div>
          )) : (
            <div className="col-span-3 text-center py-12 bg-gray-50 border rounded-xl">
              <p className="text-gray-500">Solve more questions to unlock weakness insights.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Analytics;
