import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

import { initDatabase } from './services/database';
import { initRedis } from './services/redis';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';

// Routes
import authRoutes from './routes/auth';
import streamRoutes from './routes/streams';
import socialRoutes from './routes/social';
import vodRoutes from './routes/vod';
import linearRoutes from './routes/linear';
import analyticsRoutes from './routes/analytics';
import hooksRoutes from './routes/hooks';
import restreamRoutes from './routes/restream';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available to routes
app.set('io', io);

// Public routes
app.use('/api/auth', authRoutes);
app.use('/hooks', hooksRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes
app.use('/api/streams', authMiddleware, streamRoutes);
app.use('/api/social', authMiddleware, socialRoutes);
app.use('/api/vod', authMiddleware, vodRoutes);
app.use('/api/linear', authMiddleware, linearRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/restream', authMiddleware, restreamRoutes);

// Error handler
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe:stream', (streamId: string) => {
    socket.join(`stream:${streamId}`);
    console.log(`Socket ${socket.id} subscribed to stream ${streamId}`);
  });

  socket.on('unsubscribe:stream', (streamId: string) => {
    socket.leave(`stream:${streamId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Initialize services and start server
async function start() {
  try {
    await initDatabase();
    await initRedis();

    const port = process.env.PORT || 3000;
    httpServer.listen(port, () => {
      console.log(`🚀 Streaming Platform API running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { io };
