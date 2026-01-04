import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Redis client
let redis: RedisClientType;
let subscriber: RedisClientType;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL
});

// Active playout processes
const activePlayouts: Map<string, {
  process: ChildProcess;
  currentItem: number;
  playlist: PlaylistItem[];
  loop: boolean;
}> = new Map();

interface PlaylistItem {
  id: string;
  vodId: string;
  filePath: string;
  duration: number;
  position: number;
}

interface PlayoutStartEvent {
  channelId: string;
  streamKey: string;
  loop: boolean;
}

// Get playlist for channel
async function getPlaylist(channelId: string): Promise<PlaylistItem[]> {
  const result = await pool.query(
    `SELECT pi.id, pi.vod_id, pi.position, vf.file_path, vf.duration_seconds
     FROM playlist_items pi
     JOIN vod_files vf ON pi.vod_id = vf.id
     WHERE pi.channel_id = $1 AND vf.status = 'ready'
     ORDER BY pi.position`,
    [channelId]
  );

  return result.rows.map(row => ({
    id: row.id,
    vodId: row.vod_id,
    filePath: row.file_path,
    duration: row.duration_seconds,
    position: row.position
  }));
}

// Play a single item and return when complete
function playItem(
  item: PlaylistItem,
  rtmpUrl: string,
  channelId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${channelId}] Playing: ${item.filePath}`);

    // Use the HLS master playlist
    const hlsDir = `/storage/vod/hls/${item.vodId}`;
    const inputPath = path.join(hlsDir, 'master.m3u8');

    const args = [
      '-re', // Read at native frame rate
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '4500k',
      '-maxrate', '4500k',
      '-bufsize', '9000k',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpUrl
    ];

    const process = spawn('ffmpeg', args);

    process.stderr?.on('data', (data) => {
      // Log progress but not all FFmpeg output
      const line = data.toString();
      if (line.includes('time=') || line.includes('error') || line.includes('Error')) {
        console.log(`[${channelId}] ${line.trim()}`);
      }
    });

    process.on('error', (error) => {
      console.error(`[${channelId}] FFmpeg error:`, error);
      reject(error);
    });

    process.on('close', (code) => {
      if (code === 0 || code === 255) {
        // 255 is OK - it means we killed it intentionally
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    // Store process reference for skip functionality
    const playoutInfo = activePlayouts.get(channelId);
    if (playoutInfo) {
      playoutInfo.process = process;
    }
  });
}

// Main playout loop
async function startPlayout(event: PlayoutStartEvent) {
  const { channelId, streamKey, loop } = event;

  console.log(`Starting playout for channel ${channelId}`);

  // Get playlist
  const playlist = await getPlaylist(channelId);

  if (playlist.length === 0) {
    console.error(`[${channelId}] Empty playlist`);
    await pool.query(
      "UPDATE linear_channels SET status = 'stopped' WHERE id = $1",
      [channelId]
    );
    return;
  }

  const rtmpUrl = `${process.env.SRS_RTMP_URL || 'rtmp://srs:1935/linear'}/${streamKey}`;

  // Initialize playout state
  activePlayouts.set(channelId, {
    process: null as any,
    currentItem: 0,
    playlist,
    loop
  });

  // Play loop
  let running = true;
  let currentIndex = 0;

  while (running && activePlayouts.has(channelId)) {
    const playoutInfo = activePlayouts.get(channelId);
    if (!playoutInfo) break;

    const item = playoutInfo.playlist[currentIndex];
    if (!item) {
      if (loop) {
        currentIndex = 0;
        continue;
      } else {
        break;
      }
    }

    // Update current position in database
    await pool.query(
      'UPDATE linear_channels SET current_item_index = $1, updated_at = NOW() WHERE id = $2',
      [currentIndex, channelId]
    );

    try {
      await playItem(item, rtmpUrl, channelId);
      currentIndex++;
      playoutInfo.currentItem = currentIndex;

      // Check if we should loop
      if (currentIndex >= playoutInfo.playlist.length) {
        if (loop) {
          currentIndex = 0;
          // Refresh playlist in case it was modified
          playoutInfo.playlist = await getPlaylist(channelId);
        } else {
          running = false;
        }
      }
    } catch (error) {
      console.error(`[${channelId}] Playback error:`, error);

      // Skip to next item on error
      currentIndex++;
      if (currentIndex >= playoutInfo.playlist.length) {
        if (loop) {
          currentIndex = 0;
        } else {
          running = false;
        }
      }
    }
  }

  // Cleanup
  activePlayouts.delete(channelId);
  await pool.query(
    "UPDATE linear_channels SET status = 'stopped', updated_at = NOW() WHERE id = $1",
    [channelId]
  );

  console.log(`[${channelId}] Playout ended`);
}

// Stop playout
async function stopPlayout(event: { channelId: string }) {
  const { channelId } = event;
  console.log(`Stopping playout for channel ${channelId}`);

  const playoutInfo = activePlayouts.get(channelId);
  if (playoutInfo?.process) {
    playoutInfo.process.kill('SIGTERM');
  }

  activePlayouts.delete(channelId);
}

// Skip to next item
async function skipItem(event: { channelId: string }) {
  const { channelId } = event;
  console.log(`Skipping current item for channel ${channelId}`);

  const playoutInfo = activePlayouts.get(channelId);
  if (playoutInfo?.process) {
    playoutInfo.process.kill('SIGTERM');
    // The main loop will automatically advance to next item
  }
}

// Main initialization
async function main() {
  console.log('📺 Starting Playout Service...');

  // Initialize Redis
  redis = createClient({ url: process.env.REDIS_URL });
  subscriber = redis.duplicate();

  await redis.connect();
  await subscriber.connect();

  console.log('✅ Connected to Redis');

  // Test database connection
  await pool.query('SELECT NOW()');
  console.log('✅ Connected to PostgreSQL');

  // Subscribe to playout events
  await subscriber.subscribe('playout:start', (message) => {
    const event = JSON.parse(message);
    startPlayout(event).catch(console.error);
  });

  await subscriber.subscribe('playout:stop', (message) => {
    const event = JSON.parse(message);
    stopPlayout(event).catch(console.error);
  });

  await subscriber.subscribe('playout:skip', (message) => {
    const event = JSON.parse(message);
    skipItem(event).catch(console.error);
  });

  console.log('✅ Subscribed to playout events');
  console.log('🚀 Playout Service is running');

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');

    // Stop all active playouts
    for (const [channelId, playoutInfo] of activePlayouts) {
      console.log(`Stopping playout ${channelId}`);
      playoutInfo.process?.kill('SIGTERM');
    }

    await redis.quit();
    await subscriber.quit();
    await pool.end();

    process.exit(0);
  });
}

main().catch(console.error);
