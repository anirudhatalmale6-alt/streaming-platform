import { useQuery } from '@tanstack/react-query';
import { analyticsApi, streamsApi } from '../services/api';
import { Link } from 'react-router-dom';
import {
  Radio,
  Users,
  Clock,
  Film,
  TrendingUp,
  Play,
  Eye
} from 'lucide-react';

export default function Dashboard() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => analyticsApi.dashboard('30d'),
  });

  const { data: streamsData } = useQuery({
    queryKey: ['streams'],
    queryFn: () => streamsApi.list(),
  });

  const stats = dashboardData?.data;
  const liveStreams = streamsData?.data?.streams?.filter(
    (s: any) => s.status === 'live'
  ) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-500/20 rounded-lg">
              <Radio className="w-6 h-6 text-primary-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Streams</p>
              <p className="text-2xl font-bold">{stats?.summary?.totalStreams || 0}</p>
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
              <p className="text-sm text-gray-400">Watch Time</p>
              <p className="text-2xl font-bold">
                {Math.round((stats?.summary?.totalWatchTimeSeconds || 0) / 3600)}h
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500/20 rounded-lg">
              <Film className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-gray-400">VOD Library</p>
              <p className="text-2xl font-bold">{stats?.vodLibrary?.totalFiles || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Now Section */}
      {liveStreams.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Live Now
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveStreams.map((stream: any) => (
              <Link
                key={stream.id}
                to={`/streams/${stream.id}`}
                className="card hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{stream.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        {stream.viewer_count} viewers
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full">
                    LIVE
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Streams */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Streams</h2>
          <Link to="/streams" className="text-primary-400 hover:text-primary-300 text-sm">
            View all
          </Link>
        </div>

        {stats?.recentStreams?.length > 0 ? (
          <div className="space-y-3">
            {stats.recentStreams.map((stream: any) => (
              <Link
                key={stream.id}
                to={`/streams/${stream.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      stream.status === 'live'
                        ? 'bg-red-500'
                        : stream.status === 'ended'
                        ? 'bg-gray-500'
                        : 'bg-yellow-500'
                    }`}
                  />
                  <span>{stream.title}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    {stream.peak_viewers} peak
                  </span>
                  <span>{new Date(stream.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">No streams yet</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-8 flex gap-4">
        <Link to="/streams" className="btn btn-primary flex items-center gap-2">
          <Play className="w-4 h-4" />
          Start Streaming
        </Link>
        <Link to="/vod" className="btn btn-secondary flex items-center gap-2">
          <Film className="w-4 h-4" />
          Upload Video
        </Link>
      </div>
    </div>
  );
}
