import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { linearApi, vodApi } from '../services/api';
import {
  Play,
  Square,
  SkipForward,
  Plus,
  Trash2,
  GripVertical,
  Film,
  Clock
} from 'lucide-react';

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>();
  const [showAddVod, setShowAddVod] = useState(false);
  const queryClient = useQueryClient();

  const { data: channelData, isLoading } = useQuery({
    queryKey: ['linear-channel', id],
    queryFn: () => linearApi.get(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const { data: vodData } = useQuery({
    queryKey: ['vod-ready'],
    queryFn: () => vodApi.list({ status: 'ready' }),
  });

  const startMutation = useMutation({
    mutationFn: () => linearApi.start(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channel', id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => linearApi.stop(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channel', id] }),
  });

  const skipMutation = useMutation({
    mutationFn: () => linearApi.skip(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channel', id] }),
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: (vodId: string) => linearApi.addToPlaylist(id!, vodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linear-channel', id] });
      setShowAddVod(false);
    },
  });

  const removeFromPlaylistMutation = useMutation({
    mutationFn: (itemId: string) => linearApi.removeFromPlaylist(id!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channel', id] }),
  });

  const channel = channelData?.data?.channel;
  const playlist = channelData?.data?.playlist || [];
  const availableVods = vodData?.data?.files?.filter(
    (v: any) => !playlist.find((p: any) => p.vod_id === v.id)
  ) || [];

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading || !channel) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          {channel.description && (
            <p className="text-gray-400 mt-1">{channel.description}</p>
          )}
        </div>
        <span
          className={`px-3 py-1 text-sm rounded-full ${
            channel.status === 'running'
              ? 'bg-green-500/20 text-green-400'
              : channel.status === 'paused'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {channel.status}
        </span>
      </div>

      {/* Controls */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Playout Control</h2>
        <div className="flex gap-4">
          {channel.status === 'running' ? (
            <>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="btn btn-danger flex items-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
              <button
                onClick={() => skipMutation.mutate()}
                disabled={skipMutation.isPending}
                className="btn btn-secondary flex items-center gap-2"
              >
                <SkipForward className="w-4 h-4" />
                Skip to Next
              </button>
            </>
          ) : (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || playlist.length === 0}
              className="btn btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Playout
            </button>
          )}
        </div>

        {channel.status === 'running' && (
          <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
            <p className="text-sm text-gray-400">Currently playing:</p>
            <p className="font-medium">
              {playlist[channel.current_item_index]?.title || 'Unknown'}
            </p>
          </div>
        )}
      </div>

      {/* Playlist */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Playlist</h2>
          <button
            onClick={() => setShowAddVod(true)}
            disabled={availableVods.length === 0}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Video
          </button>
        </div>

        {playlist.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Film className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No videos in playlist</p>
            <p className="text-sm mt-1">Add videos from your VOD library</p>
          </div>
        ) : (
          <div className="space-y-2">
            {playlist.map((item: any, index: number) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 p-4 rounded-lg ${
                  channel.status === 'running' && channel.current_item_index === index
                    ? 'bg-primary-500/20 border border-primary-500/50'
                    : 'bg-gray-700/50'
                }`}
              >
                <GripVertical className="w-5 h-5 text-gray-500 cursor-grab" />

                <span className="w-8 text-center text-gray-400">{index + 1}</span>

                <div className="w-20 h-12 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-6 h-6 text-gray-600" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.title}</p>
                  <p className="text-sm text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(item.duration_seconds || 0)}
                  </p>
                </div>

                {channel.status === 'running' && channel.current_item_index === index && (
                  <span className="px-2 py-1 bg-primary-500/20 text-primary-400 text-xs rounded-full">
                    Playing
                  </span>
                )}

                <button
                  onClick={() => removeFromPlaylistMutation.mutate(item.id)}
                  disabled={channel.status === 'running'}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Total Duration */}
        {playlist.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between text-sm text-gray-400">
            <span>{playlist.length} videos</span>
            <span>
              Total: {formatDuration(playlist.reduce((acc: number, item: any) => acc + (item.duration_seconds || 0), 0))}
            </span>
          </div>
        )}
      </div>

      {/* Add VOD Modal */}
      {showAddVod && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-2xl m-4 max-h-[80vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-semibold mb-4">Add Video to Playlist</h2>

            <div className="flex-1 overflow-auto space-y-2">
              {availableVods.map((vod: any) => (
                <button
                  key={vod.id}
                  onClick={() => addToPlaylistMutation.mutate(vod.id)}
                  disabled={addToPlaylistMutation.isPending}
                  className="w-full flex items-center gap-4 p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="w-24 h-14 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                    {vod.thumbnail_url ? (
                      <img
                        src={vod.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium">{vod.title}</p>
                    <p className="text-sm text-gray-400">
                      {formatDuration(vod.duration_seconds || 0)}
                    </p>
                  </div>
                  <Plus className="w-5 h-5 text-primary-400" />
                </button>
              ))}

              {availableVods.length === 0 && (
                <p className="text-center text-gray-400 py-8">
                  All videos are already in the playlist
                </p>
              )}
            </div>

            <button
              onClick={() => setShowAddVod(false)}
              className="mt-4 w-full btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
