import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/api';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import {
  Users,
  Clock,
  TrendingUp,
  Radio,
  Film,
  HardDrive
} from 'lucide-react';

export default function Analytics() {
  const [period, setPeriod] = useState('30d');

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['analytics', period],
    queryFn: () => analyticsApi.dashboard(period),
  });

  const stats = dashboardData?.data;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="input w-auto"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-500/20 rounded-lg">
              <Radio className="w-6 h-6 text-primary-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Streams</p>
              <p className="text-2xl font-bold">{stats?.summary?.totalStreams || 0}</p>
              <p className="text-xs text-gray-500">
                {stats?.summary?.streamsInPeriod || 0} in period
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/20 rounded-lg">
              <Users className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Unique Viewers</p>
              <p className="text-2xl font-bold">{stats?.summary?.uniqueViewers || 0}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Clock className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Watch Time</p>
              <p className="text-2xl font-bold">
                {formatDuration(stats?.summary?.totalWatchTimeSeconds || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500/20 rounded-lg">
              <TrendingUp className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Peak Concurrent</p>
              <p className="text-2xl font-bold">
                {stats?.summary?.peakConcurrentViewers || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* VOD Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Film className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">VOD Files</p>
              <p className="text-2xl font-bold">{stats?.vodLibrary?.totalFiles || 0}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-500/20 rounded-lg">
              <HardDrive className="w-6 h-6 text-cyan-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Storage Used</p>
              <p className="text-2xl font-bold">
                {formatBytes(stats?.vodLibrary?.totalSizeBytes || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-pink-500/20 rounded-lg">
              <Clock className="w-6 h-6 text-pink-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">VOD Duration</p>
              <p className="text-2xl font-bold">
                {formatDuration(stats?.vodLibrary?.totalDurationSeconds || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Streams Chart */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Recent Streams Performance</h2>

        {stats?.recentStreams?.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={stats.recentStreams.map((stream: any) => ({
                name: stream.title.substring(0, 15) + (stream.title.length > 15 ? '...' : ''),
                viewers: stream.peak_viewers
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Bar dataKey="viewers" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No stream data available
          </div>
        )}
      </div>

      {/* Recent Streams Table */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Streams</h2>

        {stats?.recentStreams?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
                  <th className="pb-3">Title</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Peak Viewers</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentStreams.map((stream: any) => (
                  <tr key={stream.id} className="border-b border-gray-700/50">
                    <td className="py-4">{stream.title}</td>
                    <td className="py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          stream.status === 'live'
                            ? 'bg-red-500/20 text-red-400'
                            : stream.status === 'ended'
                            ? 'bg-gray-500/20 text-gray-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}
                      >
                        {stream.status}
                      </span>
                    </td>
                    <td className="py-4">{stream.peak_viewers}</td>
                    <td className="py-4 text-gray-400">
                      {new Date(stream.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No streams yet</p>
        )}
      </div>
    </div>
  );
}
