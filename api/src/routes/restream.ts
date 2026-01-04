import { Router, Response } from 'express';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { publish } from '../services/redis';

const router = Router();

// Get restream destinations for a stream
router.get('/stream/:streamId', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT rd.*, sa.platform, sa.platform_username
       FROM restream_destinations rd
       JOIN social_accounts sa ON rd.social_account_id = sa.id
       JOIN streams s ON rd.stream_id = s.id
       WHERE rd.stream_id = $1 AND s.user_id = $2`,
      [req.params.streamId, req.user!.id]
    );

    res.json({ destinations: result.rows });
  } catch (error) {
    console.error('Error getting restream destinations:', error);
    throw new AppError('Failed to get restream destinations', 500);
  }
});

// Add restream destination to stream
router.post('/stream/:streamId', async (req: AuthRequest, res: Response) => {
  try {
    const { socialAccountId } = req.body;

    if (!socialAccountId) {
      throw new AppError('Social account ID is required', 400);
    }

    // Verify stream ownership
    const streamResult = await query(
      'SELECT id FROM streams WHERE id = $1 AND user_id = $2',
      [req.params.streamId, req.user!.id]
    );

    if (streamResult.rows.length === 0) {
      throw new AppError('Stream not found', 404);
    }

    // Verify social account ownership
    const accountResult = await query(
      'SELECT id, platform FROM social_accounts WHERE id = $1 AND user_id = $2',
      [socialAccountId, req.user!.id]
    );

    if (accountResult.rows.length === 0) {
      throw new AppError('Social account not found', 404);
    }

    // Check if already added
    const existingResult = await query(
      'SELECT id FROM restream_destinations WHERE stream_id = $1 AND social_account_id = $2',
      [req.params.streamId, socialAccountId]
    );

    if (existingResult.rows.length > 0) {
      throw new AppError('Destination already added', 400);
    }

    // Add destination
    const result = await query(
      `INSERT INTO restream_destinations (stream_id, social_account_id)
       VALUES ($1, $2)
       RETURNING *`,
      [req.params.streamId, socialAccountId]
    );

    res.status(201).json({ destination: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error adding restream destination:', error);
    throw new AppError('Failed to add restream destination', 500);
  }
});

// Remove restream destination
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Verify ownership via stream
    const result = await query(
      `DELETE FROM restream_destinations rd
       USING streams s
       WHERE rd.id = $1 AND rd.stream_id = s.id AND s.user_id = $2
       RETURNING rd.id`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Destination not found', 404);
    }

    res.json({ message: 'Destination removed' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error removing destination:', error);
    throw new AppError('Failed to remove destination', 500);
  }
});

// Manually start restreaming to a destination
router.post('/:id/start', async (req: AuthRequest, res: Response) => {
  try {
    const destResult = await query(
      `SELECT rd.*, s.stream_key, sa.platform
       FROM restream_destinations rd
       JOIN streams s ON rd.stream_id = s.id
       JOIN social_accounts sa ON rd.social_account_id = sa.id
       WHERE rd.id = $1 AND s.user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (destResult.rows.length === 0) {
      throw new AppError('Destination not found', 404);
    }

    const dest = destResult.rows[0];

    // Update status
    await query(
      "UPDATE restream_destinations SET status = 'pending', updated_at = NOW() WHERE id = $1",
      [dest.id]
    );

    // Trigger restream
    await publish('restream:start', {
      destinationId: dest.id,
      streamKey: dest.stream_key,
      socialAccountId: dest.social_account_id,
      platform: dest.platform
    });

    res.json({ message: 'Restream starting' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error starting restream:', error);
    throw new AppError('Failed to start restream', 500);
  }
});

// Stop restreaming to a destination
router.post('/:id/stop', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE restream_destinations rd
       SET status = 'stopped', ended_at = NOW(), updated_at = NOW()
       FROM streams s
       WHERE rd.id = $1 AND rd.stream_id = s.id AND s.user_id = $2
       RETURNING rd.id`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Destination not found', 404);
    }

    // Trigger stop
    await publish('restream:stop', {
      destinationId: req.params.id
    });

    res.json({ message: 'Restream stopped' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error stopping restream:', error);
    throw new AppError('Failed to stop restream', 500);
  }
});

// Get all active restreams for user
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT rd.*, s.title as stream_title, s.stream_key, sa.platform, sa.platform_username
       FROM restream_destinations rd
       JOIN streams s ON rd.stream_id = s.id
       JOIN social_accounts sa ON rd.social_account_id = sa.id
       WHERE s.user_id = $1 AND rd.status = 'active'
       ORDER BY rd.started_at DESC`,
      [req.user!.id]
    );

    res.json({ restreams: result.rows });
  } catch (error) {
    console.error('Error getting active restreams:', error);
    throw new AppError('Failed to get active restreams', 500);
  }
});

export default router;
