import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { streamsApi, restreamApi, socialApi } from '../services/api';
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Square,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Clock,
  Share2,
  Plus,
  Trash2
} from 'lucide-react';

export default function StreamDetail() {
  const { id } = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAddDest, setShowAddDest] = useState(false);
  const queryClient = useQueryClient();

  const { data: streamData, isLoading } = useQuery({
    queryKey: ['stream', id],
    queryFn: () => streamsApi.get(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const { data: destData } = useQuery({
    queryKey: ['restream-destinations', id],
    queryFn: () => restreamApi.getDestinations(id!),
    enabled: !!id,
  });

  const { data: socialData } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: () => socialApi.list(),
  });

  const startMutation = useMutation({
    mutationFn: () => streamsApi.start(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stream', id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => streamsApi.stop(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stream', id] }),
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: () => streamsApi.regenerateKey(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stream', id] }),
  });

  const addDestMutation = useMutation({
    mutationFn: (accountId: string) => restreamApi.addDestination(id!, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restream-destinations', id] });
      setShowAddDest(false);
    },
  });

  const removeDestMutation = useMutation({
    mutationFn: (destId: string) => restreamApi.removeDestination(destId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restream-destinations', id] }),
  });

  const stream = streamData?.data?.stream;
  const destinations = destData?.data?.destinations || [];
  const socialAccounts = socialData?.data?.accounts || [];

  // Setup HLS player
  useEffect(() => {
    if (!videoRef.current || !stream || stream.status !== 'live') return;

    const hlsUrl = `${import.meta.env.VITE_HLS_URL || ''}/hls/live/${stream.stream_key}.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      return () => hls.destroy();
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl;
    }
  }, [stream]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading || !stream) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const rtmpUrl = `rtmp://${window.location.hostname}:1935/live`;
  const availableAccounts = socialAccounts.filter(
    (a: any) => !destinations.find((d: any) => d.social_account_id === a.id)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{stream.title}</h1>
          {stream.description && (
            <p className="text-gray-400 mt-1">{stream.description}</p>
          )}
        </div>
        <span
          className={`px-3 py-1 text-sm rounded-full ${
            stream.status === 'live'
              ? 'bg-red-500/20 text-red-400'
              : stream.status === 'ended'
              ? 'bg-gray-500/20 text-gray-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}
        >
          {stream.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <div className="card p-0 overflow-hidden">
            <div className="aspect-video bg-black flex items-center justify-center">
              {stream.status === 'live' ? (
                <video
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  autoPlay
                  muted
                />
              ) : (
                <div className="text-gray-500 text-center">
                  <Play className="w-16 h-16 mx-auto mb-2 opacity-50" />
                  <p>Stream is offline</p>
                </div>
              )}
            </div>
          </div>

          {/* Stream Info */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Stream Settings</h2>

            <div className="space-y-4">
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <label className="label">RTMP URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm">{rtmpUrl}</code>
                  <button
                    onClick={() => handleCopy(rtmpUrl, 'rtmp')}
                    className="p-2 hover:bg-gray-600 rounded-lg"
                  >
                    {copied === 'rtmp' ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-700/50 rounded-lg">
                <label className="label">Stream Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono">{stream.stream_key}</code>
                  <button
                    onClick={() => handleCopy(stream.stream_key, 'key')}
                    className="p-2 hover:bg-gray-600 rounded-lg"
                  >
                    {copied === 'key' ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Regenerate stream key? You will need to update your streaming software.')) {
                        regenerateKeyMutation.mutate();
                      }
                    }}
                    className="p-2 hover:bg-gray-600 rounded-lg"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4">
                {stream.status === 'live' ? (
                  <button
                    onClick={() => stopMutation.mutate()}
                    disabled={stopMutation.isPending}
                    className="btn btn-danger flex items-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Stop Stream
                  </button>
                ) : (
                  <button
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start Stream
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="card">
            <h3 className="font-semibold mb-4">Statistics</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Current Viewers
                </span>
                <span className="font-medium">{stream.viewer_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Peak Viewers
                </span>
                <span className="font-medium">{stream.peak_viewers}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Created
                </span>
                <span className="font-medium">
                  {new Date(stream.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Restream Destinations */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Share2 className="w-4 h-4" /> Restream To
              </h3>
              {availableAccounts.length > 0 && (
                <button
                  onClick={() => setShowAddDest(true)}
                  className="p-1 hover:bg-gray-700 rounded"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {destinations.length > 0 ? (
              <div className="space-y-2">
                {destinations.map((dest: any) => (
                  <div
                    key={dest.id}
                    className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                  >
                    <div>
                      <span className="capitalize font-medium">{dest.platform}</span>
                      <span
                        className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                          dest.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : dest.status === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {dest.status}
                      </span>
                    </div>
                    <button
                      onClick={() => removeDestMutation.mutate(dest.id)}
                      className="p-1 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">
                No restream destinations configured
              </p>
            )}

            {/* Add Destination Modal */}
            {showAddDest && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="card w-full max-w-md m-4">
                  <h3 className="text-lg font-semibold mb-4">Add Restream Destination</h3>
                  <div className="space-y-2">
                    {availableAccounts.map((account: any) => (
                      <button
                        key={account.id}
                        onClick={() => addDestMutation.mutate(account.id)}
                        className="w-full flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700"
                      >
                        <span className="capitalize font-medium">{account.platform}</span>
                        <span className="text-gray-400">@{account.platform_username}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddDest(false)}
                    className="mt-4 w-full btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
