# API Documentation

Base URL: `https://your-domain.com/api`

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

### POST /auth/register
Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "token": "jwt-token"
}
```

### POST /auth/login
Authenticate and receive a token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

---

## Streams

### GET /streams
List all streams for the authenticated user.

**Response:**
```json
{
  "streams": [
    {
      "id": "uuid",
      "title": "My Stream",
      "description": "...",
      "stream_key": "abc123...",
      "status": "live",
      "viewer_count": 42,
      "peak_viewers": 100,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /streams
Create a new stream.

**Request Body:**
```json
{
  "title": "My Stream",
  "description": "Optional description",
  "socialAccounts": ["account-uuid-1", "account-uuid-2"]
}
```

**Response:**
```json
{
  "stream": { ... },
  "ingestUrl": "rtmp://server:1935/live",
  "streamKey": "abc123..."
}
```

### GET /streams/:id
Get stream details.

### PUT /streams/:id
Update stream metadata.

### DELETE /streams/:id
Delete a stream.

### POST /streams/:id/start
Start the stream and begin restreaming to configured destinations.

### POST /streams/:id/stop
Stop the stream and all restreams.

### POST /streams/:id/regenerate-key
Generate a new stream key.

---

## Social Accounts

### GET /social
List connected social accounts.

**Response:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "platform": "youtube",
      "platform_username": "My Channel",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### GET /social/connect/:platform
Get OAuth URL for connecting an account.

**Platforms:** `facebook`, `youtube`, `twitch`

**Response:**
```json
{
  "authUrl": "https://..."
}
```

### DELETE /social/:id
Disconnect a social account.

### PATCH /social/:id/toggle
Toggle account active status.

### POST /social/custom
Add a custom RTMP destination.

**Request Body:**
```json
{
  "name": "My Server",
  "rtmpUrl": "rtmp://custom-server.com/live",
  "streamKey": "my-key"
}
```

---

## VOD Library

### GET /vod
List VOD files.

**Query Parameters:**
- `status`: Filter by status (processing, ready, failed)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

### GET /vod/:id
Get VOD file details.

### POST /vod/upload
Upload a video file.

**Request:** Multipart form data
- `video`: Video file
- `title`: Video title
- `description`: Optional description

### PUT /vod/:id
Update VOD metadata.

### DELETE /vod/:id
Delete VOD file.

### GET /vod/:id/playback
Get HLS playback URL.

**Response:**
```json
{
  "hlsUrl": "https://server/vod/uuid/master.m3u8"
}
```

---

## Linear Channels

### GET /linear
List linear channels.

### GET /linear/:id
Get channel with playlist.

**Response:**
```json
{
  "channel": {
    "id": "uuid",
    "name": "My 24/7 Channel",
    "status": "running",
    "loop_playlist": true,
    "current_item_index": 2
  },
  "playlist": [
    {
      "id": "uuid",
      "vod_id": "uuid",
      "title": "Video 1",
      "duration_seconds": 3600,
      "position": 0
    }
  ]
}
```

### POST /linear
Create a linear channel.

**Request Body:**
```json
{
  "name": "My Channel",
  "description": "Optional description",
  "loopPlaylist": true
}
```

### PUT /linear/:id
Update channel settings.

### DELETE /linear/:id
Delete channel.

### POST /linear/:id/playlist
Add item to playlist.

**Request Body:**
```json
{
  "vodId": "uuid",
  "position": 0
}
```

### DELETE /linear/:id/playlist/:itemId
Remove item from playlist.

### PUT /linear/:id/playlist/reorder
Reorder playlist items.

**Request Body:**
```json
{
  "items": [
    { "id": "uuid", "position": 0 },
    { "id": "uuid", "position": 1 }
  ]
}
```

### POST /linear/:id/start
Start playout.

### POST /linear/:id/stop
Stop playout.

### POST /linear/:id/skip
Skip to next item.

---

## Restream

### GET /restream/stream/:streamId
Get restream destinations for a stream.

### POST /restream/stream/:streamId
Add restream destination.

**Request Body:**
```json
{
  "socialAccountId": "uuid"
}
```

### DELETE /restream/:id
Remove restream destination.

### POST /restream/:id/start
Manually start restream to destination.

### POST /restream/:id/stop
Stop restream to destination.

### GET /restream/active
Get all active restreams.

---

## Analytics

### GET /analytics/dashboard
Get dashboard statistics.

**Query Parameters:**
- `period`: Time period (7d, 30d, 90d)

**Response:**
```json
{
  "summary": {
    "totalStreams": 10,
    "streamsInPeriod": 3,
    "totalWatchTimeSeconds": 36000,
    "uniqueViewers": 500,
    "peakConcurrentViewers": 100,
    "activeLinearChannels": 1
  },
  "vodLibrary": {
    "totalFiles": 25,
    "totalSizeBytes": 10737418240,
    "totalDurationSeconds": 18000
  },
  "recentStreams": [...]
}
```

### GET /analytics/stream/:id
Get analytics for a specific stream.

**Query Parameters:**
- `period`: Time period (1h, 24h, 7d, 30d)

---

## Webhooks (SRS Callbacks)

These endpoints are called automatically by SRS media server.

### POST /hooks/srs/connect
### POST /hooks/srs/close
### POST /hooks/srs/publish
### POST /hooks/srs/unpublish
### POST /hooks/srs/play
### POST /hooks/srs/stop
