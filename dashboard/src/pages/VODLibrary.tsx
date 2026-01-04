import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { vodApi } from '../services/api';
import {
  Upload,
  Film,
  Trash2,
  Play,
  Clock,
  HardDrive,
  Loader2
} from 'lucide-react';

export default function VODLibrary() {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const queryClient = useQueryClient();

  const { data: vodData, isLoading } = useQuery({
    queryKey: ['vod'],
    queryFn: () => vodApi.list(),
    refetchInterval: 10000,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');

      const formData = new FormData();
      formData.append('video', selectedFile);
      formData.append('title', uploadTitle);
      formData.append('description', uploadDescription);

      return vodApi.upload(formData, setUploadProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vod'] });
      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle('');
      setUploadDescription('');
      setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vodApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vod'] }),
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setUploadTitle(acceptedFiles[0].name.replace(/\.[^/.]+$/, ''));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'],
    },
    maxFiles: 1,
  });

  const files = vodData?.data?.files || [];

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">VOD Library</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Video
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card w-full max-w-lg m-4">
            <h2 className="text-xl font-semibold mb-4">Upload Video</h2>

            {!selectedFile ? (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-300 mb-2">
                  Drag & drop a video file here, or click to select
                </p>
                <p className="text-gray-500 text-sm">
                  Supported: MP4, MOV, AVI, MKV, WebM, FLV
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-gray-700/50 rounded-lg flex items-center gap-4">
                  <Film className="w-8 h-8 text-primary-500" />
                  <div className="flex-1">
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-400">
                      {formatBytes(selectedFile.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="label">Title</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Description (optional)</label>
                  <textarea
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    className="input"
                    rows={3}
                  />
                </div>

                {uploadMutation.isPending && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowUpload(false);
                  setSelectedFile(null);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!selectedFile || !uploadTitle || uploadMutation.isPending}
                className="btn btn-primary"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOD Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : files.length === 0 ? (
        <div className="card text-center py-12">
          <Film className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No videos yet</h3>
          <p className="text-gray-400 mb-4">Upload your first video to get started</p>
          <button onClick={() => setShowUpload(true)} className="btn btn-primary">
            Upload Video
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {files.map((file: any) => (
            <div key={file.id} className="card p-0 overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video bg-gray-900 relative">
                {file.thumbnail_url ? (
                  <img
                    src={file.thumbnail_url}
                    alt={file.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-12 h-12 text-gray-700" />
                  </div>
                )}

                {/* Status Badge */}
                {file.status !== 'ready' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    {file.status === 'processing' ? (
                      <div className="flex items-center gap-2 text-yellow-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <span className="text-red-400">Failed</span>
                    )}
                  </div>
                )}

                {/* Duration */}
                {file.duration_seconds && (
                  <span className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded text-xs">
                    {formatDuration(file.duration_seconds)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-medium mb-2 truncate">{file.title}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  {file.file_size_bytes && (
                    <span className="flex items-center gap-1">
                      <HardDrive className="w-4 h-4" />
                      {formatBytes(file.file_size_bytes)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(file.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  {file.status === 'ready' && (
                    <button className="btn btn-secondary flex-1 flex items-center justify-center gap-2">
                      <Play className="w-4 h-4" />
                      Play
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Delete this video?')) {
                        deleteMutation.mutate(file.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
