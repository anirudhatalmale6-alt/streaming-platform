import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { publish } from '../services/redis';

const router = Router();

// Generate unique stream key
function generateStreamKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

// List user's streams
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, title, description, stream_key, status, type,
              scheduled_start, scheduled_end, actual_start, actual_end,
              thumbnail_url, viewer_count, peak_viewers, created_at
       FROM streams
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.id]
    );

    res.json({ streams: result.rows });
  } catch (error) {
    console.error('Error listing streams:', error);
    throw new AppError('Failed to list streams', 500);
  }
});

// Get single stream
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT s.*,
              json_agg(
                json_build_object(
                  'id', rd.id,
                  'platform', sa.platform,
                  'status', rd.status,
                  'platform_username', sa.platform_username
                )
              ) FILTER (WHERE rd.id IS NOT NULL) as restream_destinations
       FROM streams s
       LEFT JOIN restream_destinations rd ON s.id = rd.stream_id
       LEFT JOIN social_accounts sa ON rd.social_account_id = sa.id
       WHERE s.id = $1 AND s.user_id = $2
       GROUP BY s.id`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    res.json({ stream: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error getting stream:', error);
    throw new AppError('Failed to get stream', 500);
  }
});

// Create new stream
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, type, scheduledStart, scheduledEnd, socialAccounts } = req.body;

    if (!title) {
      throw new AppError('Title is required', 400);
    }

    const streamKey = generateStreamKey();

    const result = await query(
      `INSERT INTO streams (user_id, title, description, stream_key, type, scheduled_start, scheduled_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user!.id,
        title,
        description || null,
        streamKey,
        type || 'live',
        scheduledStart || null,
        scheduledEnd || null
      ]
    );

    const stream = result.rows[0];

    // Add restream destinations if social accounts provided
    if (socialAccounts && Array.isArray(socialAccounts)) {
      for (const accountId of socialAccounts) {
        await query(
          `INSERT INTO restream_destinations (stream_id, social_account_id)
           VALUES ($1, $2)`,
          [stream.id, accountId]
        );
      }
    }

    res.status(201).json({
      stream,
      ingestUrl: `rtmp://${process.env.RTMP_HOST || 'localhost'}:1935/live`,
      streamKey
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error creating stream:', error);
    throw new AppError('Failed to create stream', 500);
  }
});

// Update stream
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, scheduledStart, scheduledEnd } = req.body;

    const result = await query(
      `UPDATE streams
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           scheduled_start = COALESCE($3, scheduled_start),
           scheduled_end = COALESCE($4, scheduled_end),
           updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [title, description, scheduledStart, scheduledEnd, req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    res.json({ stream: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating stream:', error);
    throw new AppError('Failed to update stream', 500);
  }
});

// Delete stream
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'DELETE FROM streams WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    res.json({ message: 'Stream deleted' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting stream:', error);
    throw new AppError('Failed to delete stream', 500);
  }
});

// Start stream (trigger restreaming)
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership
    const streamResult = await query(
      'SELECT * FROM streams WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (streamResult.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    const stream = streamResult.rows[0];

    // Update stream status
    await query(
      `UPDATE streams SET status = 'live', actual_start = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [stream.id]
    );

    // Publish event to start restreaming
    await publish('stream:start', {
      streamId: stream.id,
      streamKey: stream.stream_key,
      userId: req.user!.id
    });

    // Emit socket event
    const io = req.app.get('io');
    io.emit('stream:started', { streamId: stream.id });

    res.json({ message: 'Stream started', stream: { ...stream, status: 'live' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error starting stream:', error);
    throw new AppError('Failed to start stream', 500);
  }
});

// Stop stream
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE streams
       SET status = 'ended', actual_end = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    // Publish event to stop restreaming
    await publish('stream:stop', {
      streamId: result.rows[0].id,
      streamKey: result.rows[0].stream_key
    });

    // Emit socket event
    const io = req.app.get('io');
    io.emit('stream:stopped', { streamId: result.rows[0].id });

    res.json({ message: 'Stream stopped', stream: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error stopping stream:', error);
    throw new AppError('Failed to stop stream', 500);
  }
});

// Regenerate stream key
router.post('/:id/regenerate-key', async (req: AuthRequest, res: Response) => {
  try {
    const newKey = generateStreamKey();

    const result = await query(
      `UPDATE streams SET stream_key = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [newKey, req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    res.json({ stream: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error regenerating key:', error);
    throw new AppError('Failed to regenerate stream key', 500);
  }
});

export default router;
