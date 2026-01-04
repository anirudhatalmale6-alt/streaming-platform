import { Router, Response } from 'express';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get stream analytics
router.get('/stream/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { period = '24h' } = req.query;

    // Verify stream ownership
    const streamResult = await query(
      'SELECT id, title, status, actual_start, actual_end, peak_viewers FROM streams WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (streamResult.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    const stream = streamResult.rows[0];

    // Calculate time range
    let interval: string;
    switch (period) {
      case '1h':
        interval = '1 hour';
        break;
      case '24h':
        interval = '24 hours';
        break;
      case '7d':
        interval = '7 days';
        break;
      case '30d':
        interval = '30 days';
        break;
      default:
        interval = '24 hours';
    }

    // Get viewer analytics over time
    const viewerData = await query(
      `SELECT
         date_trunc('minute', timestamp) as time,
         AVG(viewer_count) as avg_viewers,
         MAX(viewer_count) as max_viewers,
         AVG(bandwidth_kbps) as avg_bandwidth
       FROM stream_analytics
       WHERE stream_id = $1 AND timestamp > NOW() - INTERVAL '${interval}'
       GROUP BY date_trunc('minute', timestamp)
       ORDER BY time`,
      [req.params.id]
    );

    // Get viewer session stats
    const sessionStats = await query(
      `SELECT
         COUNT(*) as total_sessions,
         AVG(watch_duration_seconds) as avg_watch_duration,
         COUNT(DISTINCT ip_address) as unique_viewers
       FROM viewer_sessions
       WHERE stream_id = $1`,
      [req.params.id]
    );

    // Get geographic distribution
    const geoData = await query(
      `SELECT
         country,
         COUNT(*) as viewer_count
       FROM viewer_sessions
       WHERE stream_id = $1 AND country IS NOT NULL
       GROUP BY country
       ORDER BY viewer_count DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({
      stream: {
        id: stream.id,
        title: stream.title,
        status: stream.status,
        peakViewers: stream.peak_viewers,
        duration: stream.actual_start && stream.actual_end
          ? Math.round((new Date(stream.actual_end).getTime() - new Date(stream.actual_start).getTime()) / 1000)
          : null
      },
      viewerTimeline: viewerData.rows,
      sessionStats: sessionStats.rows[0],
      geoDistribution: geoData.rows
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error getting stream analytics:', error);
    throw new AppError('Failed to get analytics', 500);
  }
});

// Get overall dashboard stats
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const { period = '30d' } = req.query;

    let interval: string;
    switch (period) {
      case '7d':
        interval = '7 days';
        break;
      case '30d':
        interval = '30 days';
        break;
      case '90d':
        interval = '90 days';
        break;
      default:
        interval = '30 days';
    }

    // Total streams
    const totalStreams = await query(
      `SELECT COUNT(*) as count FROM streams WHERE user_id = $1`,
      [req.user!.id]
    );

    // Streams in period
    const periodStreams = await query(
      `SELECT COUNT(*) as count FROM streams
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`,
      [req.user!.id]
    );

    // Total watch time
    const watchTime = await query(
      `SELECT COALESCE(SUM(watch_duration_seconds), 0) as total
       FROM viewer_sessions vs
       JOIN streams s ON vs.stream_id = s.id
       WHERE s.user_id = $1`,
      [req.user!.id]
    );

    // Total unique viewers
    const uniqueViewers = await query(
      `SELECT COUNT(DISTINCT vs.ip_address) as count
       FROM viewer_sessions vs
       JOIN streams s ON vs.stream_id = s.id
       WHERE s.user_id = $1`,
      [req.user!.id]
    );

    // Peak concurrent viewers
    const peakViewers = await query(
      `SELECT COALESCE(MAX(peak_viewers), 0) as peak
       FROM streams WHERE user_id = $1`,
      [req.user!.id]
    );

    // Active linear channels
    const activeChannels = await query(
      `SELECT COUNT(*) as count FROM linear_channels
       WHERE user_id = $1 AND status = 'running'`,
      [req.user!.id]
    );

    // VOD library stats
    const vodStats = await query(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(file_size_bytes), 0) as total_size,
         COALESCE(SUM(duration_seconds), 0) as total_duration
       FROM vod_files WHERE user_id = $1 AND status = 'ready'`,
      [req.user!.id]
    );

    // Recent streams
    const recentStreams = await query(
      `SELECT id, title, status, peak_viewers, actual_start, actual_end, created_at
       FROM streams WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [req.user!.id]
    );

    res.json({
      summary: {
        totalStreams: parseInt(totalStreams.rows[0].count),
        streamsInPeriod: parseInt(periodStreams.rows[0].count),
        totalWatchTimeSeconds: parseInt(watchTime.rows[0].total),
        uniqueViewers: parseInt(uniqueViewers.rows[0].count),
        peakConcurrentViewers: parseInt(peakViewers.rows[0].peak),
        activeLinearChannels: parseInt(activeChannels.rows[0].count)
      },
      vodLibrary: {
        totalFiles: parseInt(vodStats.rows[0].total),
        totalSizeBytes: parseInt(vodStats.rows[0].total_size),
        totalDurationSeconds: parseInt(vodStats.rows[0].total_duration)
      },
      recentStreams: recentStreams.rows
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    throw new AppError('Failed to get dashboard stats', 500);
  }
});

// Record analytics data point (internal use)
router.post('/stream/:id/record', async (req: AuthRequest, res: Response) => {
  try {
    const { viewerCount, bandwidthKbps, bufferHealth, bitrateKbps } = req.body;

    await query(
      `INSERT INTO stream_analytics (stream_id, viewer_count, bandwidth_kbps, buffer_health, bitrate_kbps)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.params.id,
        viewerCount || 0,
        bandwidthKbps || 0,
        bufferHealth || 0,
        bitrateKbps || 0
      ]
    );

    res.json({ message: 'Analytics recorded' });
  } catch (error) {
    console.error('Error recording analytics:', error);
    throw new AppError('Failed to record analytics', 500);
  }
});

export default router;
