import { Router, Response } from 'express';
import axios from 'axios';
import { query } from '../services/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import CryptoJS from 'crypto-js';

const router = Router();

// Encryption helpers for tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_encryption_key_32chars!';

function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// List connected social accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT id, platform, platform_username, page_id, channel_id, is_active, created_at
       FROM social_accounts
       WHERE user_id = $1
       ORDER BY platform, created_at`,
      [req.user!.id]
    );

    res.json({ accounts: result.rows });
  } catch (error) {
    console.error('Error listing social accounts:', error);
    throw new AppError('Failed to list social accounts', 500);
  }
});

// Get OAuth URL for platform
router.get('/connect/:platform', async (req: AuthRequest, res: Response) => {
  try {
    const { platform } = req.params;
    const redirectUri = `${process.env.API_URL}/api/social/callback/${platform}`;
    const state = Buffer.from(JSON.stringify({
      userId: req.user!.id,
      timestamp: Date.now()
    })).toString('base64');

    let authUrl: string;

    switch (platform) {
      case 'facebook':
        authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
          `client_id=${process.env.FACEBOOK_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&scope=pages_manage_posts,pages_read_engagement,publish_video` +
          `&state=${state}`;
        break;

      case 'youtube':
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${process.env.YOUTUBE_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&scope=https://www.googleapis.com/auth/youtube.force-ssl` +
          `&response_type=code` +
          `&access_type=offline` +
          `&prompt=consent` +
          `&state=${state}`;
        break;

      case 'twitch':
        authUrl = `https://id.twitch.tv/oauth2/authorize?` +
          `client_id=${process.env.TWITCH_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&scope=channel:manage:broadcast+channel:read:stream_key` +
          `&response_type=code` +
          `&state=${state}`;
        break;

      default:
        throw new AppError('Unsupported platform', 400);
    }

    res.json({ authUrl });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error generating OAuth URL:', error);
    throw new AppError('Failed to generate OAuth URL', 500);
  }
});

// OAuth callback handler
router.get('/callback/:platform', async (req: AuthRequest, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.query;

    if (!code || !state) {
      throw new AppError('Missing code or state', 400);
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const userId = stateData.userId;

    const redirectUri = `${process.env.API_URL}/api/social/callback/${platform}`;
    let tokenData: any;
    let profileData: any;

    switch (platform) {
      case 'facebook':
        // Exchange code for token
        const fbTokenResponse = await axios.get(
          `https://graph.facebook.com/v18.0/oauth/access_token`,
          {
            params: {
              client_id: process.env.FACEBOOK_APP_ID,
              client_secret: process.env.FACEBOOK_APP_SECRET,
              redirect_uri: redirectUri,
              code
            }
          }
        );
        tokenData = fbTokenResponse.data;

        // Get user profile and pages
        const fbProfileResponse = await axios.get(
          `https://graph.facebook.com/me?fields=id,name&access_token=${tokenData.access_token}`
        );
        profileData = fbProfileResponse.data;

        // Get pages for live streaming
        const pagesResponse = await axios.get(
          `https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}`
        );

        // Store account (use first page if available)
        const page = pagesResponse.data.data?.[0];
        await query(
          `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, page_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           ON CONFLICT (user_id, platform, platform_user_id)
           DO UPDATE SET access_token = $5, platform_username = $4, page_id = $6, updated_at = NOW()`,
          [
            userId,
            'facebook',
            profileData.id,
            profileData.name,
            encrypt(page?.access_token || tokenData.access_token),
            page?.id || null
          ]
        );
        break;

      case 'youtube':
        // Exchange code for token
        const ytTokenResponse = await axios.post(
          'https://oauth2.googleapis.com/token',
          {
            client_id: process.env.YOUTUBE_CLIENT_ID,
            client_secret: process.env.YOUTUBE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
          }
        );
        tokenData = ytTokenResponse.data;

        // Get channel info
        const ytChannelResponse = await axios.get(
          'https://www.googleapis.com/youtube/v3/channels',
          {
            params: { part: 'snippet', mine: true },
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
          }
        );
        const channel = ytChannelResponse.data.items?.[0];

        await query(
          `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, refresh_token, token_expires_at, channel_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
           ON CONFLICT (user_id, platform, platform_user_id)
           DO UPDATE SET access_token = $5, refresh_token = $6, token_expires_at = $7, platform_username = $4, updated_at = NOW()`,
          [
            userId,
            'youtube',
            channel?.id || 'unknown',
            channel?.snippet?.title || 'YouTube Channel',
            encrypt(tokenData.access_token),
            encrypt(tokenData.refresh_token || ''),
            new Date(Date.now() + tokenData.expires_in * 1000),
            channel?.id || null
          ]
        );
        break;

      case 'twitch':
        // Exchange code for token
        const twitchTokenResponse = await axios.post(
          'https://id.twitch.tv/oauth2/token',
          null,
          {
            params: {
              client_id: process.env.TWITCH_CLIENT_ID,
              client_secret: process.env.TWITCH_CLIENT_SECRET,
              code,
              grant_type: 'authorization_code',
              redirect_uri: redirectUri
            }
          }
        );
        tokenData = twitchTokenResponse.data;

        // Get user info
        const twitchUserResponse = await axios.get(
          'https://api.twitch.tv/helix/users',
          {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Client-Id': process.env.TWITCH_CLIENT_ID
            }
          }
        );
        const twitchUser = twitchUserResponse.data.data?.[0];

        await query(
          `INSERT INTO social_accounts (user_id, platform, platform_user_id, platform_username, access_token, refresh_token, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           ON CONFLICT (user_id, platform, platform_user_id)
           DO UPDATE SET access_token = $5, refresh_token = $6, platform_username = $4, updated_at = NOW()`,
          [
            userId,
            'twitch',
            twitchUser?.id || 'unknown',
            twitchUser?.display_name || 'Twitch User',
            encrypt(tokenData.access_token),
            encrypt(tokenData.refresh_token || '')
          ]
        );
        break;
    }

    // Redirect to dashboard
    res.redirect(`${process.env.DASHBOARD_URL}/settings/social?connected=${platform}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.DASHBOARD_URL}/settings/social?error=connection_failed`);
  }
});

// Disconnect social account
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'DELETE FROM social_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Account not found', 404);
    }

    res.json({ message: 'Account disconnected' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error disconnecting account:', error);
    throw new AppError('Failed to disconnect account', 500);
  }
});

// Toggle account active status
router.patch('/:id/toggle', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE social_accounts
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Account not found', 404);
    }

    res.json({ account: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error toggling account:', error);
    throw new AppError('Failed to toggle account', 500);
  }
});

// Add custom RTMP destination
router.post('/custom', async (req: AuthRequest, res: Response) => {
  try {
    const { name, rtmpUrl, streamKey } = req.body;

    if (!name || !rtmpUrl || !streamKey) {
      throw new AppError('Name, RTMP URL, and stream key are required', 400);
    }

    const result = await query(
      `INSERT INTO social_accounts (user_id, platform, platform_username, access_token, is_active)
       VALUES ($1, 'custom', $2, $3, true)
       RETURNING id, platform, platform_username, is_active, created_at`,
      [
        req.user!.id,
        name,
        encrypt(JSON.stringify({ rtmpUrl, streamKey }))
      ]
    );

    res.status(201).json({ account: result.rows[0] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error adding custom destination:', error);
    throw new AppError('Failed to add custom destination', 500);
  }
});

export default router;
