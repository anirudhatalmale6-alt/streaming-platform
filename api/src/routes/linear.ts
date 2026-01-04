import { Router, Response } from 'express';
import crypto from 'crypto';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { publish } from '../services/redis';

const router = Router();

function generateStreamKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

// List linear channels
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT lc.*,
              COUNT(pi.id) as playlist_count
       FROM linear_channels lc
       LEFT JOIN playlist_items pi ON lc.id = pi.channel_id
       WHERE lc.user_id = $1
       GROUP BY lc.id
       ORDER BY lc.created_at DESC`,
      [req.user!.id]
    );

    res.json({ channels: result.rows });
  } catch (error) {
    console.error('Error listing channels:', error);
    throw new AppError('Failed to list channels', 500);
  }
});

// Get single channel with playlist
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const channelResult = await query(
      'SELECT * FROM linear_channels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (channelResult.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    const playlistResult = await query(
      `SELECT pi.*, vf.title, vf.duration_seconds, vf.thumbnail_url
       FROM playlist_items pi
       JOIN vod_files vf ON pi.vod_id = vf.id
       WHERE pi.channel_id = $1
       ORDER BY pi.position`,
      [req.params.id]
    );

    res.json({
      channel: channelResult.rows[0],
      playlist: playlistResult.rows
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error getting channel:', error);
    throw new AppError('Failed to get channel', 500);
  }
});

// Create linear channel
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, loopPlaylist } = req.body;

    if (!name) {
      throw new AppError('Channel name is required', 400);
    }

    const streamKey = generateStreamKey();

    const result = await query(
      `INSERT INTO linear_channels (user_id, name, description, stream_key, loop_playlist)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user!.id,
        name,
        description || null,
        streamKey,
        loopPlaylist !== false
      ]
    );

    res.status(201).json({
      channel: result.rows[0],
      outputUrl: `rtmp://${process.env.RTMP_HOST || 'localhost'}:1935/linear/${streamKey}`
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error creating channel:', error);
    throw new AppError('Failed to create channel', 500);
  }
});

// Update channel
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, loopPlaylist } = req.body;

    const result = await query(
      `UPDATE linear_channels
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           loop_playlist = COALESCE($3, loop_playlist),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, loopPlaylist, req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    res.json({ channel: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating channel:', error);
    throw new AppError('Failed to update channel', 500);
  }
});

// Delete channel
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Stop channel first if running
    await publish('playout:stop', { channelId: req.params.id });

    const result = await query(
      'DELETE FROM linear_channels WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting channel:', error);
    throw new AppError('Failed to delete channel', 500);
  }
});

// Add item to playlist
router.post('/:id/playlist', async (req: AuthRequest, res: Response) => {
  try {
    const { vodId, position, scheduledStart } = req.body;

    if (!vodId) {
      throw new AppError('VOD ID is required', 400);
    }

    // Verify VOD exists and belongs to user
    const vodResult = await query(
      'SELECT id FROM vod_files WHERE id = $1 AND user_id = $2 AND status = $3',
      [vodId, req.user!.id, 'ready']
    );

    if (vodResult.rows.length === 0) {
      throw new AppError('VOD not found or not ready', 404);
    }

    // Get next position if not specified
    let itemPosition = position;
    if (itemPosition === undefined) {
      const maxResult = await query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM playlist_items WHERE channel_id = $1',
        [req.params.id]
      );
      itemPosition = maxResult.rows[0].next_position;
    }

    const result = await query(
      `INSERT INTO playlist_items (channel_id, vod_id, position, scheduled_start)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, vodId, itemPosition, scheduledStart || null]
    );

    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error adding playlist item:', error);
    throw new AppError('Failed to add to playlist', 500);
  }
});

// Remove item from playlist
router.delete('/:id/playlist/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    // Verify channel ownership
    const channelResult = await query(
      'SELECT id FROM linear_channels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (channelResult.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    const result = await query(
      'DELETE FROM playlist_items WHERE id = $1 AND channel_id = $2 RETURNING id',
      [req.params.itemId, req.params.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Playlist item not found', 404);
    }

    res.json({ message: 'Item removed from playlist' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error removing playlist item:', error);
    throw new AppError('Failed to remove from playlist', 500);
  }
});

// Reorder playlist
router.put('/:id/playlist/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body; // Array of { id, position }

    if (!Array.isArray(items)) {
      throw new AppError('Items array is required', 400);
    }

    // Verify channel ownership
    const channelResult = await query(
      'SELECT id FROM linear_channels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (channelResult.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    // Update positions
    for (const item of items) {
      await query(
        'UPDATE playlist_items SET position = $1 WHERE id = $2 AND channel_id = $3',
        [item.position, item.id, req.params.id]
      );
    }

    res.json({ message: 'Playlist reordered' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error reordering playlist:', error);
    throw new AppError('Failed to reorder playlist', 500);
  }
});

// Start playout
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const channelResult = await query(
      'SELECT * FROM linear_channels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (channelResult.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    const channel = channelResult.rows[0];

    // Check if playlist has items
    const playlistResult = await query(
      'SELECT COUNT(*) FROM playlist_items WHERE channel_id = $1',
      [channel.id]
    );

    if (parseInt(playlistResult.rows[0].count) === 0) {
      throw new AppError('Playlist is empty', 400);
    }

    // Update status
    await query(
      "UPDATE linear_channels SET status = 'running', updated_at = NOW() WHERE id = $1",
      [channel.id]
    );

    // Publish start event
    await publish('playout:start', {
      channelId: channel.id,
      streamKey: channel.stream_key,
      loop: channel.loop_playlist
    });

    res.json({ message: 'Playout started', channel: { ...channel, status: 'running' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error starting playout:', error);
    throw new AppError('Failed to start playout', 500);
  }
});

// Stop playout
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE linear_channels
       SET status = 'stopped', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    await publish('playout:stop', { channelId: req.params.id });

    res.json({ message: 'Playout stopped', channel: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error stopping playout:', error);
    throw new AppError('Failed to stop playout', 500);
  }
});

// Skip to next item
router.post('/:id/skip', async (req: AuthRequest, res: Response) => {
  try {
    const channelResult = await query(
      'SELECT * FROM linear_channels WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (channelResult.rows.length === 0) {
      throw new AppError('Channel not found', 404);
    }

    await publish('playout:skip', { channelId: req.params.id });

    res.json({ message: 'Skipping to next item' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error skipping:', error);
    throw new AppError('Failed to skip', 500);
  }
});

export default router;
