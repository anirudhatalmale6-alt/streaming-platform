import { createClient, RedisClientType } from 'redis';
import { Pool } from 'pg';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Redis client
let redis: RedisClientType;
let subscriber: RedisClientType;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL
});

// Transcoding profiles
const PROFILES = [
  { name: '1080p', width: 1920, height: 1080, bitrate: '6000k', audioBitrate: '192k' },
  { name: '720p', width: 1280, height: 720, bitrate: '3000k', audioBitrate: '128k' },
  { name: '480p', width: 854, height: 480, bitrate: '1500k', audioBitrate: '128k' },
  { name: '360p', width: 640, height: 360, bitrate: '800k', audioBitrate: '96k' }
];

interface TranscodeEvent {
  vodId: string;
  filePath: string;
  userId: string;
}

// Get video info
function getVideoInfo(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

// Generate thumbnail
function generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['10%'],
        filename: 'thumbnail.jpg',
        folder: path.dirname(outputPath),
        size: '1280x720'
      })
      .on('end', () => resolve())
      .on('error', reject);
  });
}

// Transcode to HLS with adaptive bitrate
function transcodeToHLS(inputPath: string, outputDir: string, vodId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Build FFmpeg command for multi-bitrate HLS
    const command = ffmpeg(inputPath);

    // Add output for each profile
    let complexFilter = '';
    let maps: string[] = [];

    PROFILES.forEach((profile, index) => {
      complexFilter += `[0:v]scale=${profile.width}:${profile.height}[v${index}];`;
      maps.push(`-map [v${index}] -map 0:a`);
    });

    // Generate HLS with multiple variants
    command
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-preset fast',
        '-g 48',
        '-keyint_min 48',
        '-sc_threshold 0',
        '-hls_time 4',
        '-hls_playlist_type vod',
        '-hls_flags independent_segments',
        '-master_pl_name master.m3u8',
        '-var_stream_map', PROFILES.map((_, i) => `v:${i},a:${i}`).join(' ')
      ]);

    // Add each variant
    PROFILES.forEach((profile, index) => {
      command
        .output(path.join(outputDir, `${profile.name}.m3u8`))
        .outputOptions([
          `-filter:v:${index} scale=${profile.width}:${profile.height}`,
          `-b:v:${index} ${profile.bitrate}`,
          `-b:a:${index} ${profile.audioBitrate}`
        ]);
    });

    // Simpler approach - transcode each quality separately then create master
    const transcodeProfile = (profile: typeof PROFILES[0], idx: number): Promise<void> => {
      return new Promise((resolveProfile, rejectProfile) => {
        const outputPath = path.join(outputDir, `${profile.name}.m3u8`);

        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            `-vf scale=${profile.width}:${profile.height}`,
            `-b:v ${profile.bitrate}`,
            `-b:a ${profile.audioBitrate}`,
            '-preset fast',
            '-g 48',
            '-keyint_min 48',
            '-sc_threshold 0',
            '-hls_time 4',
            '-hls_playlist_type vod',
            `-hls_segment_filename ${path.join(outputDir, `${profile.name}_%03d.ts`)}`
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            console.log(`[${vodId}] ${profile.name}: ${progress.percent?.toFixed(1)}%`);
          })
          .on('end', () => {
            console.log(`[${vodId}] ${profile.name} complete`);
            resolveProfile();
          })
          .on('error', rejectProfile)
          .run();
      });
    };

    // Transcode all profiles sequentially
    (async () => {
      for (let i = 0; i < PROFILES.length; i++) {
        await transcodeProfile(PROFILES[i], i);
      }

      // Generate master playlist
      const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=6500000,RESOLUTION=1920x1080
1080p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1280x720
720p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1700000,RESOLUTION=854x480
480p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360
360p.m3u8
`;

      fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterPlaylist);
      resolve();
    })().catch(reject);
  });
}

// Handle transcode event
async function handleTranscode(event: TranscodeEvent) {
  const { vodId, filePath, userId } = event;
  console.log(`Starting transcode for VOD ${vodId}`);

  try {
    // Update status to processing
    await pool.query(
      "UPDATE vod_files SET status = 'processing' WHERE id = $1",
      [vodId]
    );

    // Get video info
    const info = await getVideoInfo(filePath);
    const videoStream = info.streams.find(s => s.codec_type === 'video');
    const duration = info.format.duration || 0;
    const fileSize = info.format.size || 0;

    // Update video metadata
    await pool.query(
      `UPDATE vod_files SET
        duration_seconds = $1,
        file_size_bytes = $2,
        resolution = $3,
        codec = $4
       WHERE id = $5`,
      [
        Math.round(duration),
        fileSize,
        videoStream ? `${videoStream.width}x${videoStream.height}` : null,
        videoStream?.codec_name || null,
        vodId
      ]
    );

    // Create output directory
    const outputDir = `/storage/vod/hls/${vodId}`;

    // Generate thumbnail
    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
    await generateThumbnail(filePath, thumbnailPath);

    // Transcode to HLS
    await transcodeToHLS(filePath, outputDir, vodId);

    // Update status to ready
    const hlsPath = path.join(outputDir, 'master.m3u8');
    await pool.query(
      `UPDATE vod_files SET
        status = 'ready',
        hls_path = $1,
        thumbnail_url = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [hlsPath, `/vod/${vodId}/thumbnail.jpg`, vodId]
    );

    console.log(`✅ Transcode complete for VOD ${vodId}`);

    // Publish completion event
    await redis.publish('vod:ready', JSON.stringify({ vodId, userId }));
  } catch (error) {
    console.error(`❌ Transcode failed for VOD ${vodId}:`, error);

    await pool.query(
      "UPDATE vod_files SET status = 'failed', updated_at = NOW() WHERE id = $1",
      [vodId]
    );
  }
}

// Main initialization
async function main() {
  console.log('🎬 Starting Transcoder Service...');

  // Initialize Redis
  redis = createClient({ url: process.env.REDIS_URL });
  subscriber = redis.duplicate();

  await redis.connect();
  await subscriber.connect();

  console.log('✅ Connected to Redis');

  // Test database connection
  await pool.query('SELECT NOW()');
  console.log('✅ Connected to PostgreSQL');

  // Ensure storage directories exist
  const dirs = ['/storage/vod/uploads', '/storage/vod/hls'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Subscribe to transcode events
  await subscriber.subscribe('vod:transcode', (message) => {
    const event = JSON.parse(message);
    handleTranscode(event).catch(console.error);
  });

  console.log('✅ Subscribed to transcode events');
  console.log('🚀 Transcoder Service is running');

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await redis.quit();
    await subscriber.quit();
    await pool.end();
    process.exit(0);
  });
}

main().catch(console.error);
