import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { streamsApi, socialApi } from '../services/api';
import {
  Plus,
  Radio,
  Eye,
  Clock,
  Copy,
  Check,
  Trash2
} from 'lucide-react';

export default function Streams() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: streamsData, isLoading } = useQuery({
    queryKey: ['streams'],
    queryFn: () => streamsApi.list(),
  });

  const { data: socialData } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: () => socialApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string; socialAccounts: string[] }) =>
      streamsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams'] });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setSelectedAccounts([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => streamsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streams'] });
    },
  });

  const streams = streamsData?.data?.streams || [];
  const socialAccounts = socialData?.data?.accounts || [];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Live Streams</h1>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Stream
        </button>
      </div>

      {/* Create Stream Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-lg m-4">
            <h2 className="text-xl font-semibold mb-4">Create New Stream</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  placeholder="My Awesome Stream"
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="What's this stream about?"
                />
              </div>

              {socialAccounts.length > 0 && (
                <div>
                  <label className="label">Restream to (auto-publish when going live)</label>
                  <div className="space-y-2">
                    {socialAccounts.map((account: any) => (
                      <label
                        key={account.id}
                        className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAccounts.includes(account.id)}
                          onChange={() => toggleAccount(account.id)}
                          className="w-4 h-4 rounded border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="capitalize">{account.platform}</span>
                        <span className="text-gray-400">@{account.platform_username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate({ title, description, socialAccounts: selectedAccounts })}
                disabled={!title || createMutation.isPending}
                className="btn btn-primary"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Stream'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Streams List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : streams.length === 0 ? (
        <div className="card text-center py-12">
          <Radio className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No streams yet</h3>
          <p className="text-gray-400 mb-4">Create your first stream to get started</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            Create Stream
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {streams.map((stream: any) => (
            <div key={stream.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/streams/${stream.id}`}
                      className="text-lg font-medium hover:text-primary-400"
                    >
                      {stream.title}
                    </Link>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
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
                  {stream.description && (
                    <p className="text-gray-400 text-sm mt-1">{stream.description}</p>
                  )}

                  <div className="flex items-center gap-6 mt-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {stream.viewer_count} viewers
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(stream.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Stream Key */}
                  <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Stream Key</p>
                        <code className="text-sm font-mono">{stream.stream_key}</code>
                      </div>
                      <button
                        onClick={() => handleCopy(stream.stream_key, stream.id)}
                        className="p-2 hover:bg-gray-600 rounded-lg"
                      >
                        {copied === stream.id ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (confirm('Delete this stream?')) {
                      deleteMutation.mutate(stream.id);
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
