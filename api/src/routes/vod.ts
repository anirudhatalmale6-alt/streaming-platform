import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { publish } from '../services/redis';

const router = Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/storage/vod/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: mp4, mov, avi, mkv, webm, flv'));
    }
  }
});

// List VOD files
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryStr = `SELECT * FROM vod_files WHERE user_id = $1`;
    const params: any[] = [req.user!.id];

    if (status) {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), offset);

    const result = await query(queryStr, params);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM vod_files WHERE user_id = $1',
      [req.user!.id]
    );

    res.json({
      files: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error listing VOD files:', error);
    throw new AppError('Failed to list VOD files', 500);
  }
});

// Get single VOD file
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM vod_files WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('VOD file not found', 404);
    }

    res.json({ file: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error getting VOD file:', error);
    throw new AppError('Failed to get VOD file', 500);
  }
});

// Upload VOD file
router.post('/upload', upload.single('video'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('No video file provided', 400);
    }

    const { title, description } = req.body;

    if (!title) {
      throw new AppError('Title is required', 400);
    }

    // Create VOD record
    const result = await query(
      `INSERT INTO vod_files (user_id, title, description, filename, file_path, status)
       VALUES ($1, $2, $3, $4, $5, 'processing')
       RETURNING *`,
      [
        req.user!.id,
        title,
        description || null,
        req.file.originalname,
        req.file.path
      ]
    );

    const vodFile = result.rows[0];

    // Queue transcoding job
    await publish('vod:transcode', {
      vodId: vodFile.id,
      filePath: req.file.path,
      userId: req.user!.id
    });

    res.status(201).json({
      file: vodFile,
      message: 'Video uploaded and queued for processing'
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error uploading VOD:', error);
    throw new AppError('Failed to upload video', 500);
  }
});

// Update VOD metadata
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = req.body;

    const result = await query(
      `UPDATE vod_files
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [title, description, req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('VOD file not found', 404);
    }

    res.json({ file: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating VOD:', error);
    throw new AppError('Failed to update VOD', 500);
  }
});

// Delete VOD file
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Get file info first
    const fileResult = await query(
      'SELECT file_path, hls_path FROM vod_files WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (fileResult.rows.length === 0) {
      throw new AppError('VOD file not found', 404);
    }

    const fileInfo = fileResult.rows[0];

    // Delete from database
    await query('DELETE FROM vod_files WHERE id = $1', [req.params.id]);

    // Delete files from storage
    if (fileInfo.file_path && fs.existsSync(fileInfo.file_path)) {
      fs.unlinkSync(fileInfo.file_path);
    }

    // Delete HLS directory if exists
    if (fileInfo.hls_path) {
      const hlsDir = path.dirname(fileInfo.hls_path);
      if (fs.existsSync(hlsDir)) {
        fs.rmSync(hlsDir, { recursive: true, force: true });
      }
    }

    res.json({ message: 'VOD file deleted' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting VOD:', error);
    throw new AppError('Failed to delete VOD', 500);
  }
});

// Get playback URL
router.get('/:id/playback', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, hls_path, status FROM vod_files WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('VOD file not found', 404);
    }

    const file = result.rows[0];

    if (file.status !== 'ready') {
      throw new AppError('Video is still processing', 400);
    }

    if (!file.hls_path) {
      throw new AppError('Playback not available', 400);
    }

    res.json({
      hlsUrl: `${process.env.HLS_URL}/${path.basename(file.hls_path)}`
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error getting playback URL:', error);
    throw new AppError('Failed to get playback URL', 500);
  }
});

export default router;
