import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { linearApi } from '../services/api';
import { Plus, Tv, Play, Square, Trash2, List } from 'lucide-react';

export default function LinearChannels() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loopPlaylist, setLoopPlaylist] = useState(true);

  const queryClient = useQueryClient();

  const { data: channelsData, isLoading } = useQuery({
    queryKey: ['linear-channels'],
    queryFn: () => linearApi.list(),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => linearApi.create({ name, description, loopPlaylist }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linear-channels'] });
      setShowCreate(false);
      setName('');
      setDescription('');
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => linearApi.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channels'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => linearApi.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channels'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => linearApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['linear-channels'] }),
  });

  const channels = channelsData?.data?.channels || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Linear Channels</h1>
          <p className="text-gray-400 mt-1">24/7 continuous playout from your VOD library</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Channel
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-lg m-4">
            <h2 className="text-xl font-semibold mb-4">Create Linear Channel</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Channel Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="My 24/7 Channel"
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="What's on this channel?"
                />
              </div>

              <label className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={loopPlaylist}
                  onChange={(e) => setLoopPlaylist(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="font-medium">Loop Playlist</p>
                  <p className="text-sm text-gray-400">
                    Automatically restart from the beginning when playlist ends
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!name || createMutation.isPending}
                className="btn btn-primary"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channels Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : channels.length === 0 ? (
        <div className="card text-center py-12">
          <Tv className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No channels yet</h3>
          <p className="text-gray-400 mb-4">Create a linear channel for 24/7 playout</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            Create Channel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {channels.map((channel: any) => (
            <div key={channel.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Link
                    to={`/linear/${channel.id}`}
                    className="text-lg font-medium hover:text-primary-400"
                  >
                    {channel.name}
                  </Link>
                  <span
                    className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
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
              </div>

              {channel.description && (
                <p className="text-gray-400 text-sm mb-4">{channel.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                <span className="flex items-center gap-1">
                  <List className="w-4 h-4" />
                  {channel.playlist_count} items
                </span>
                {channel.loop_playlist && (
                  <span className="text-primary-400">Loop enabled</span>
                )}
              </div>

              <div className="flex gap-2">
                {channel.status === 'running' ? (
                  <button
                    onClick={() => stopMutation.mutate(channel.id)}
                    disabled={stopMutation.isPending}
                    className="btn btn-danger flex-1 flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => startMutation.mutate(channel.id)}
                    disabled={startMutation.isPending || channel.playlist_count === 0}
                    className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </button>
                )}
                <Link
                  to={`/linear/${channel.id}`}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <List className="w-4 h-4" />
                  Edit
                </Link>
                <button
                  onClick={() => {
                    if (confirm('Delete this channel?')) {
                      deleteMutation.mutate(channel.id);
                    }
                  }}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
