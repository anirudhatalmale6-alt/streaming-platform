import { Router, Request, Response } from 'express';
import { query } from '../services/database';
import { publish, setStreamState, incrementViewers, decrementViewers, getViewerCount } from '../services/redis';

const router = Router();

// SRS hook: on_connect
router.post('/srs/connect', async (req: Request, res: Response) => {
  console.log('SRS connect:', req.body);
  res.status(200).json({ code: 0 });
});

// SRS hook: on_close
router.post('/srs/close', async (req: Request, res: Response) => {
  console.log('SRS close:', req.body);
  res.status(200).json({ code: 0 });
});

// SRS hook: on_publish (stream starts)
router.post('/srs/publish', async (req: Request, res: Response) => {
  try {
    const { stream, app, tcUrl } = req.body;
    const streamKey = stream;

    console.log(`Stream publishing: ${app}/${stream}`);

    // Find stream by key
    const result = await query(
      `UPDATE streams
       SET status = 'live', actual_start = NOW(), updated_at = NOW()
       WHERE stream_key = $1
       RETURNING id, user_id, title`,
      [streamKey]
    );

    if (result.rows.length > 0) {
      const streamData = result.rows[0];

      // Set stream state in Redis
      await setStreamState(streamKey, {
        id: streamData.id,
        status: 'live',
        startTime: new Date().toISOString()
      });

      // Trigger restream service
      await publish('stream:start', {
        streamId: streamData.id,
        streamKey,
        userId: streamData.user_id
      });

      console.log(`Stream ${streamData.id} is now live`);
    }

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Publish hook error:', error);
    res.status(200).json({ code: 0 }); // Don't reject the stream
  }
});

// SRS hook: on_unpublish (stream ends)
router.post('/srs/unpublish', async (req: Request, res: Response) => {
  try {
    const { stream, app } = req.body;
    const streamKey = stream;

    console.log(`Stream unpublishing: ${app}/${stream}`);

    // Update stream status
    const result = await query(
      `UPDATE streams
       SET status = 'ended', actual_end = NOW(), updated_at = NOW()
       WHERE stream_key = $1 AND status = 'live'
       RETURNING id`,
      [streamKey]
    );

    if (result.rows.length > 0) {
      // Stop restreaming
      await publish('stream:stop', {
        streamId: result.rows[0].id,
        streamKey
      });

      // Clear stream state
      await setStreamState(streamKey, null);

      console.log(`Stream ${result.rows[0].id} has ended`);
    }

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Unpublish hook error:', error);
    res.status(200).json({ code: 0 });
  }
});

// SRS hook: on_play (viewer starts watching)
router.post('/srs/play', async (req: Request, res: Response) => {
  try {
    const { stream, client_id, ip } = req.body;
    const streamKey = stream;

    // Increment viewer count
    const count = await incrementViewers(streamKey);

    // Update peak viewers if needed
    await query(
      `UPDATE streams
       SET viewer_count = $1,
           peak_viewers = GREATEST(peak_viewers, $1)
       WHERE stream_key = $2`,
      [count, streamKey]
    );

    // Record viewer session
    await query(
      `INSERT INTO viewer_sessions (stream_id, session_id, ip_address)
       SELECT id, $1, $2::inet
       FROM streams WHERE stream_key = $3`,
      [client_id, ip, streamKey]
    );

    console.log(`Viewer joined stream ${streamKey}, count: ${count}`);

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Play hook error:', error);
    res.status(200).json({ code: 0 });
  }
});

// SRS hook: on_stop (viewer stops watching)
router.post('/srs/stop', async (req: Request, res: Response) => {
  try {
    const { stream, client_id } = req.body;
    const streamKey = stream;

    // Decrement viewer count
    const count = await decrementViewers(streamKey);

    // Update viewer count in database
    await query(
      'UPDATE streams SET viewer_count = $1 WHERE stream_key = $2',
      [count, streamKey]
    );

    // Update viewer session
    await query(
      `UPDATE viewer_sessions
       SET ended_at = NOW(),
           watch_duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::integer
       WHERE session_id = $1 AND ended_at IS NULL`,
      [client_id]
    );

    console.log(`Viewer left stream ${streamKey}, count: ${count}`);

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Stop hook error:', error);
    res.status(200).json({ code: 0 });
  }
});

// SRS hook: linear channel publish
router.post('/srs/linear/publish', async (req: Request, res: Response) => {
  try {
    const { stream } = req.body;
    const streamKey = stream;

    console.log(`Linear channel publishing: ${streamKey}`);

    await query(
      "UPDATE linear_channels SET status = 'running', updated_at = NOW() WHERE stream_key = $1",
      [streamKey]
    );

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Linear publish hook error:', error);
    res.status(200).json({ code: 0 });
  }
});

// SRS hook: linear channel unpublish
router.post('/srs/linear/unpublish', async (req: Request, res: Response) => {
  try {
    const { stream } = req.body;
    const streamKey = stream;

    console.log(`Linear channel unpublishing: ${streamKey}`);

    await query(
      "UPDATE linear_channels SET status = 'stopped', updated_at = NOW() WHERE stream_key = $1",
      [streamKey]
    );

    res.status(200).json({ code: 0 });
  } catch (error) {
    console.error('Linear unpublish hook error:', error);
    res.status(200).json({ code: 0 });
  }
});

export default router;
