import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../services/api';
import {
  Plus,
  Trash2,
  ExternalLink,
  Facebook,
  Youtube,
  Twitch,
  Link2,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

const platformIcons: Record<string, any> = {
  facebook: Facebook,
  youtube: Youtube,
  twitch: Twitch,
  custom: Link2,
};

const platformColors: Record<string, string> = {
  facebook: 'bg-blue-600',
  youtube: 'bg-red-600',
  twitch: 'bg-purple-600',
  custom: 'bg-gray-600',
};

export default function SocialAccounts() {
  const [showConnect, setShowConnect] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customRtmpUrl, setCustomRtmpUrl] = useState('');
  const [customStreamKey, setCustomStreamKey] = useState('');

  const queryClient = useQueryClient();

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: () => socialApi.list(),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => socialApi.disconnect(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social-accounts'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => socialApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social-accounts'] }),
  });

  const addCustomMutation = useMutation({
    mutationFn: () =>
      socialApi.addCustom({
        name: customName,
        rtmpUrl: customRtmpUrl,
        streamKey: customStreamKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
      setShowCustom(false);
      setCustomName('');
      setCustomRtmpUrl('');
      setCustomStreamKey('');
    },
  });

  const handleConnect = async (platform: string) => {
    const response = await socialApi.getConnectUrl(platform);
    window.location.href = response.data.authUrl;
  };

  const accounts = accountsData?.data?.accounts || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Social Accounts</h1>
          <p className="text-gray-400 mt-1">
            Connect your social accounts for automatic restreaming
          </p>
        </div>
        <button
          onClick={() => setShowConnect(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Connect Account
        </button>
      </div>

      {/* Connect Modal */}
      {showConnect && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md m-4">
            <h2 className="text-xl font-semibold mb-4">Connect Account</h2>

            <div className="space-y-3">
              <button
                onClick={() => handleConnect('facebook')}
                className="w-full flex items-center gap-4 p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg transition-colors"
              >
                <Facebook className="w-6 h-6 text-blue-400" />
                <span className="font-medium">Facebook</span>
                <ExternalLink className="w-4 h-4 ml-auto opacity-50" />
              </button>

              <button
                onClick={() => handleConnect('youtube')}
                className="w-full flex items-center gap-4 p-4 bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 rounded-lg transition-colors"
              >
                <Youtube className="w-6 h-6 text-red-400" />
                <span className="font-medium">YouTube</span>
                <ExternalLink className="w-4 h-4 ml-auto opacity-50" />
              </button>

              <button
                onClick={() => handleConnect('twitch')}
                className="w-full flex items-center gap-4 p-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 rounded-lg transition-colors"
              >
                <Twitch className="w-6 h-6 text-purple-400" />
                <span className="font-medium">Twitch</span>
                <ExternalLink className="w-4 h-4 ml-auto opacity-50" />
              </button>

              <div className="border-t border-gray-700 pt-3 mt-3">
                <button
                  onClick={() => {
                    setShowConnect(false);
                    setShowCustom(true);
                  }}
                  className="w-full flex items-center gap-4 p-4 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors"
                >
                  <Link2 className="w-6 h-6 text-gray-400" />
                  <span className="font-medium">Custom RTMP</span>
                  <Plus className="w-4 h-4 ml-auto opacity-50" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowConnect(false)}
              className="mt-4 w-full btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Custom RTMP Modal */}
      {showCustom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-md m-4">
            <h2 className="text-xl font-semibold mb-4">Add Custom RTMP Destination</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="input"
                  placeholder="My Custom Destination"
                />
              </div>

              <div>
                <label className="label">RTMP URL</label>
                <input
                  type="text"
                  value={customRtmpUrl}
                  onChange={(e) => setCustomRtmpUrl(e.target.value)}
                  className="input"
                  placeholder="rtmp://example.com/live"
                />
              </div>

              <div>
                <label className="label">Stream Key</label>
                <input
                  type="text"
                  value={customStreamKey}
                  onChange={(e) => setCustomStreamKey(e.target.value)}
                  className="input"
                  placeholder="your-stream-key"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCustom(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => addCustomMutation.mutate()}
                disabled={
                  !customName || !customRtmpUrl || !customStreamKey || addCustomMutation.isPending
                }
                className="btn btn-primary"
              >
                {addCustomMutation.isPending ? 'Adding...' : 'Add Destination'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-12">
          <Link2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No accounts connected</h3>
          <p className="text-gray-400 mb-4">
            Connect your social accounts to enable automatic restreaming
          </p>
          <button onClick={() => setShowConnect(true)} className="btn btn-primary">
            Connect Account
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((account: any) => {
            const Icon = platformIcons[account.platform] || Link2;
            const colorClass = platformColors[account.platform] || 'bg-gray-600';

            return (
              <div key={account.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 ${colorClass} rounded-lg`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{account.platform}</p>
                      <p className="text-sm text-gray-400">@{account.platform_username}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between">
                  <button
                    onClick={() => toggleMutation.mutate(account.id)}
                    className={`flex items-center gap-2 text-sm ${
                      account.is_active ? 'text-green-400' : 'text-gray-400'
                    }`}
                  >
                    {account.is_active ? (
                      <>
                        <ToggleRight className="w-6 h-6" />
                        Active
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-6 h-6" />
                        Inactive
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('Disconnect this account?')) {
                        disconnectMutation.mutate(account.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
