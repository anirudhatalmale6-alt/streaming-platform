import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_encryption_key_32chars!';

// Active FFmpeg processes
const activeProcesses: Map<string, ChildProcess> = new Map();

// Redis client
let redis: RedisClientType;
let subscriber: RedisClientType;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL
});

function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

interface StreamStartEvent {
  streamId: string;
  streamKey: string;
  userId: string;
}

interface RestreamStartEvent {
  destinationId: string;
  streamKey: string;
  socialAccountId: string;
  platform: string;
}

// Get RTMP URL for platform
async function getPlatformRtmpUrl(platform: string, socialAccountId: string): Promise<{ rtmpUrl: string; streamKey: string } | null> {
  const result = await pool.query(
    'SELECT access_token, refresh_token, platform_user_id, channel_id, page_id FROM social_accounts WHERE id = $1',
    [socialAccountId]
  );

  if (result.rows.length === 0) return null;

  const account = result.rows[0];
  const accessToken = decrypt(account.access_token);

  switch (platform) {
    case 'facebook': {
      try {
        // Create live video on Facebook
        const pageId = account.page_id || 'me';
        const response = await axios.post(
          `https://graph.facebook.com/v18.0/${pageId}/live_videos`,
          {
            title: 'Live Stream',
            status: 'LIVE_NOW'
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        return {
          rtmpUrl: response.data.stream_url || `rtmps://live-api-s.facebook.com:443/rtmp/`,
          streamKey: response.data.stream_key || response.data.secure_stream_url?.split('/')?.pop() || ''
        };
      } catch (error) {
        console.error('Facebook API error:', error);
        return null;
      }
    }

    case 'youtube': {
      try {
        // Check for existing live broadcast or create one
        const broadcastResponse = await axios.post(
          'https://www.googleapis.com/youtube/v3/liveBroadcasts',
          {
            snippet: {
              title: 'Live Stream',
              scheduledStartTime: new Date().toISOString()
            },
            status: {
              privacyStatus: 'public'
            },
            contentDetails: {
              enableAutoStart: true,
              enableAutoStop: true
            }
          },
          {
            params: { part: 'snippet,status,contentDetails' },
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        // Create stream
        const streamResponse = await axios.post(
          'https://www.googleapis.com/youtube/v3/liveStreams',
          {
            snippet: {
              title: 'Stream'
            },
            cdn: {
              frameRate: '30fps',
              ingestionType: 'rtmp',
              resolution: '1080p'
            }
          },
          {
            params: { part: 'snippet,cdn' },
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        // Bind broadcast to stream
        await axios.post(
          'https://www.googleapis.com/youtube/v3/liveBroadcasts/bind',
          null,
          {
            params: {
              id: broadcastResponse.data.id,
              part: 'id,contentDetails',
              streamId: streamResponse.data.id
            },
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        const ingestion = streamResponse.data.cdn?.ingestionInfo;
        return {
          rtmpUrl: ingestion?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: ingestion?.streamName || ''
        };
      } catch (error) {
        console.error('YouTube API error:', error);
        return null;
      }
    }

    case 'twitch': {
      try {
        // Get stream key from Twitch
        const response = await axios.get(
          'https://api.twitch.tv/helix/streams/key',
          {
            params: { broadcaster_id: account.platform_user_id },
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Client-Id': process.env.TWITCH_CLIENT_ID
            }
          }
        );

        return {
          rtmpUrl: 'rtmp://live.twitch.tv/app',
          streamKey: response.data.data?.[0]?.stream_key || ''
        };
      } catch (error) {
        console.error('Twitch API error:', error);
        return null;
      }
    }

    case 'custom': {
      try {
        const customData = JSON.parse(accessToken);
        return {
          rtmpUrl: customData.rtmpUrl,
          streamKey: customData.streamKey
        };
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

// Start FFmpeg restream process
function startRestream(
  sourceUrl: string,
  destinationUrl: string,
  destinationId: string
): ChildProcess {
  const args = [
    '-i', sourceUrl,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',
    destinationUrl
  ];

  console.log(`Starting restream to ${destinationId}`);

  const process = spawn('ffmpeg', args);

  process.stdout?.on('data', (data) => {
    console.log(`[${destinationId}] stdout: ${data}`);
  });

  process.stderr?.on('data', (data) => {
    console.log(`[${destinationId}] ${data}`);
  });

  process.on('error', (error) => {
    console.error(`[${destinationId}] Process error:`, error);
  });

  process.on('close', (code) => {
    console.log(`[${destinationId}] Process exited with code ${code}`);
    activeProcesses.delete(destinationId);

    // Update status in database
    pool.query(
      `UPDATE restream_destinations SET status = $1, ended_at = NOW() WHERE id = $2`,
      [code === 0 ? 'stopped' : 'failed', destinationId]
    );
  });

  return process;
}

// Handle stream start - initiate all restreams
async function handleStreamStart(event: StreamStartEvent) {
  console.log(`Stream started: ${event.streamId}`);

  // Get all active restream destinations for this stream
  const result = await pool.query(
    `SELECT rd.id, rd.social_account_id, sa.platform, sa.is_active
     FROM restream_destinations rd
     JOIN social_accounts sa ON rd.social_account_id = sa.id
     WHERE rd.stream_id = $1 AND sa.is_active = true`,
    [event.streamId]
  );

  const sourceUrl = `rtmp://srs:1935/live/${event.streamKey}`;

  for (const dest of result.rows) {
    try {
      // Get platform RTMP credentials
      const rtmpInfo = await getPlatformRtmpUrl(dest.platform, dest.social_account_id);

      if (!rtmpInfo) {
        console.error(`Failed to get RTMP info for ${dest.platform}`);
        await pool.query(
          `UPDATE restream_destinations SET status = 'failed', error_message = $1 WHERE id = $2`,
          ['Failed to get platform RTMP credentials', dest.id]
        );
        continue;
      }

      const destinationUrl = `${rtmpInfo.rtmpUrl}/${rtmpInfo.streamKey}`;

      // Start FFmpeg process
      const process = startRestream(sourceUrl, destinationUrl, dest.id);
      activeProcesses.set(dest.id, process);

      // Update status
      await pool.query(
        `UPDATE restream_destinations SET status = 'active', started_at = NOW(), rtmp_url = $1 WHERE id = $2`,
        [rtmpInfo.rtmpUrl, dest.id]
      );
    } catch (error) {
      console.error(`Error starting restream for ${dest.id}:`, error);
      await pool.query(
        `UPDATE restream_destinations SET status = 'failed', error_message = $1 WHERE id = $2`,
        [String(error), dest.id]
      );
    }
  }
}

// Handle stream stop - stop all restreams
async function handleStreamStop(event: { streamId: string; streamKey: string }) {
  console.log(`Stream stopped: ${event.streamId}`);

  // Get all active destinations
  const result = await pool.query(
    `SELECT id FROM restream_destinations WHERE stream_id = $1 AND status = 'active'`,
    [event.streamId]
  );

  for (const dest of result.rows) {
    const process = activeProcesses.get(dest.id);
    if (process) {
      process.kill('SIGTERM');
      activeProcesses.delete(dest.id);
    }
  }

  // Update all destinations
  await pool.query(
    `UPDATE restream_destinations SET status = 'stopped', ended_at = NOW() WHERE stream_id = $1 AND status = 'active'`,
    [event.streamId]
  );
}

// Handle manual restream start
async function handleRestreamStart(event: RestreamStartEvent) {
  console.log(`Manual restream start: ${event.destinationId}`);

  const sourceUrl = `rtmp://srs:1935/live/${event.streamKey}`;
  const rtmpInfo = await getPlatformRtmpUrl(event.platform, event.socialAccountId);

  if (!rtmpInfo) {
    await pool.query(
      `UPDATE restream_destinations SET status = 'failed', error_message = 'Failed to get RTMP credentials' WHERE id = $1`,
      [event.destinationId]
    );
    return;
  }

  const destinationUrl = `${rtmpInfo.rtmpUrl}/${rtmpInfo.streamKey}`;
  const process = startRestream(sourceUrl, destinationUrl, event.destinationId);
  activeProcesses.set(event.destinationId, process);

  await pool.query(
    `UPDATE restream_destinations SET status = 'active', started_at = NOW() WHERE id = $1`,
    [event.destinationId]
  );
}

// Handle restream stop
async function handleRestreamStop(event: { destinationId: string }) {
  console.log(`Restream stop: ${event.destinationId}`);

  const process = activeProcesses.get(event.destinationId);
  if (process) {
    process.kill('SIGTERM');
    activeProcesses.delete(event.destinationId);
  }
}

// Main initialization
async function main() {
  console.log('🔄 Starting Restream Service...');

  // Initialize Redis
  redis = createClient({ url: process.env.REDIS_URL });
  subscriber = redis.duplicate();

  await redis.connect();
  await subscriber.connect();

  console.log('✅ Connected to Redis');

  // Test database connection
  await pool.query('SELECT NOW()');
  console.log('✅ Connected to PostgreSQL');

  // Subscribe to events
  await subscriber.subscribe('stream:start', (message) => {
    const event = JSON.parse(message);
    handleStreamStart(event).catch(console.error);
  });

  await subscriber.subscribe('stream:stop', (message) => {
    const event = JSON.parse(message);
    handleStreamStop(event).catch(console.error);
  });

  await subscriber.subscribe('restream:start', (message) => {
    const event = JSON.parse(message);
    handleRestreamStart(event).catch(console.error);
  });

  await subscriber.subscribe('restream:stop', (message) => {
    const event = JSON.parse(message);
    handleRestreamStop(event).catch(console.error);
  });

  console.log('✅ Subscribed to stream events');
  console.log('🚀 Restream Service is running');

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');

    // Kill all active processes
    for (const [id, proc] of activeProcesses) {
      console.log(`Stopping restream ${id}`);
      proc.kill('SIGTERM');
    }

    await redis.quit();
    await subscriber.quit();
    await pool.end();

    process.exit(0);
  });
}

main().catch(console.error);
