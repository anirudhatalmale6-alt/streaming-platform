# Streaming Platform

A full-featured streaming solution with RTMP/WebRTC/HLS ingest, VOD support, 24/7 linear playout, and automatic restreaming to social platforms.

## Features

- **Multi-Protocol Ingest**: RTMP, WebRTC, and HLS input support
- **Adaptive Bitrate Streaming**: Automatic transcoding to multiple quality levels
- **Auto-Restream**: Connect Facebook, YouTube, Twitch - going live automatically publishes everywhere
- **VOD Library**: Upload, transcode, and manage video on demand content
- **24/7 Linear Channels**: Create continuous playout from your VOD library
- **Real-time Analytics**: Track viewers, watch time, and engagement
- **Cloud-Native**: Docker and Kubernetes ready

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Dashboard                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      REST API (Node.js)                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  SRS Server   │   │   Transcoder  │   │   Restream    │
│ (RTMP/HLS)    │   │   (FFmpeg)    │   │   Service     │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + Redis                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Using Docker Compose

1. Clone the repository:
```bash
git clone <repo-url>
cd streaming-platform
```

2. Create environment file:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Start all services:
```bash
docker-compose up -d
```

4. Access the dashboard at http://localhost

### Using Kubernetes

1. Apply the manifests:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/
```

2. Update ingress with your domain:
```bash
kubectl edit ingress streaming-ingress -n streaming-platform
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| POSTGRES_PASSWORD | PostgreSQL password | - |
| JWT_SECRET | JWT signing secret | - |
| FACEBOOK_APP_ID | Facebook OAuth App ID | - |
| FACEBOOK_APP_SECRET | Facebook OAuth App Secret | - |
| YOUTUBE_CLIENT_ID | Google OAuth Client ID | - |
| YOUTUBE_CLIENT_SECRET | Google OAuth Client Secret | - |
| TWITCH_CLIENT_ID | Twitch OAuth Client ID | - |
| TWITCH_CLIENT_SECRET | Twitch OAuth Client Secret | - |

### Social Platform Setup

#### Facebook
1. Create app at https://developers.facebook.com
2. Add Facebook Login product
3. Set redirect URI to: `https://your-domain.com/api/social/callback/facebook`
4. Request permissions: `pages_manage_posts`, `pages_read_engagement`, `publish_video`

#### YouTube
1. Create project at https://console.cloud.google.com
2. Enable YouTube Data API v3
3. Create OAuth credentials
4. Set redirect URI to: `https://your-domain.com/api/social/callback/youtube`

#### Twitch
1. Create app at https://dev.twitch.tv
2. Set redirect URI to: `https://your-domain.com/api/social/callback/twitch`

## Usage

### Starting a Stream

1. Create a new stream in the dashboard
2. Copy the RTMP URL and Stream Key
3. Configure your streaming software (OBS, etc.):
   - Server: `rtmp://your-server:1935/live`
   - Stream Key: `<your-stream-key>`
4. Start streaming!

### Auto-Restream Setup

1. Go to Social Accounts
2. Connect your Facebook, YouTube, or Twitch account
3. When creating a stream, select which platforms to restream to
4. Going live will automatically publish to all selected platforms

### VOD Upload

1. Go to VOD Library
2. Drag & drop or select a video file
3. Wait for transcoding to complete
4. Video is now available in adaptive HLS format

### 24/7 Linear Channel

1. Go to Linear Channels
2. Create a new channel
3. Add videos from your VOD library to the playlist
4. Click Start to begin continuous playout

## API Documentation

See [API.md](./API.md) for full API documentation.

## Development

### Local Development

```bash
# Start databases
docker-compose up -d postgres redis srs

# Run API in development
cd api && npm install && npm run dev

# Run Dashboard in development
cd dashboard && npm install && npm run dev
```

### Building Docker Images

```bash
docker-compose build
```

## License

MIT
