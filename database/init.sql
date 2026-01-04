-- Streaming Platform Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Streams table
CREATE TABLE streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    stream_key VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'offline', -- offline, live, ended
    type VARCHAR(50) DEFAULT 'live', -- live, scheduled, linear
    scheduled_start TIMESTAMP WITH TIME ZONE,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    thumbnail_url VARCHAR(500),
    viewer_count INTEGER DEFAULT 0,
    peak_viewers INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Social accounts for restreaming
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL, -- facebook, youtube, twitch, custom
    platform_user_id VARCHAR(255),
    platform_username VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    page_id VARCHAR(255), -- For Facebook pages
    channel_id VARCHAR(255), -- For YouTube channels
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, platform, platform_user_id)
);

-- Restream destinations per stream
CREATE TABLE restream_destinations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
    social_account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, active, failed, stopped
    platform_stream_id VARCHAR(255), -- The stream ID on the platform
    rtmp_url VARCHAR(500),
    stream_key_encrypted TEXT,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VOD library
CREATE TABLE vod_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    resolution VARCHAR(50),
    codec VARCHAR(50),
    thumbnail_url VARCHAR(500),
    hls_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'processing', -- processing, ready, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linear channels (24/7 playout)
CREATE TABLE linear_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    stream_key VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'stopped', -- stopped, running, paused
    loop_playlist BOOLEAN DEFAULT true,
    current_item_index INTEGER DEFAULT 0,
    current_position_seconds FLOAT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linear channel playlist items
CREATE TABLE playlist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID REFERENCES linear_channels(id) ON DELETE CASCADE,
    vod_id UUID REFERENCES vod_files(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    scheduled_start TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(channel_id, position)
);

-- Stream analytics
CREATE TABLE stream_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    viewer_count INTEGER DEFAULT 0,
    bandwidth_kbps INTEGER DEFAULT 0,
    buffer_health FLOAT DEFAULT 0,
    bitrate_kbps INTEGER DEFAULT 0
);

-- Viewer sessions
CREATE TABLE viewer_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stream_id UUID REFERENCES streams(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    country VARCHAR(2),
    city VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    watch_duration_seconds INTEGER DEFAULT 0
);

-- System settings
CREATE TABLE settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_streams_user_id ON streams(user_id);
CREATE INDEX idx_streams_status ON streams(status);
CREATE INDEX idx_streams_stream_key ON streams(stream_key);
CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX idx_restream_destinations_stream_id ON restream_destinations(stream_id);
CREATE INDEX idx_vod_files_user_id ON vod_files(user_id);
CREATE INDEX idx_linear_channels_user_id ON linear_channels(user_id);
CREATE INDEX idx_playlist_items_channel_id ON playlist_items(channel_id);
CREATE INDEX idx_stream_analytics_stream_id ON stream_analytics(stream_id);
CREATE INDEX idx_stream_analytics_timestamp ON stream_analytics(timestamp);
CREATE INDEX idx_viewer_sessions_stream_id ON viewer_sessions(stream_id);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, name, role) VALUES (
    'admin@streaming.local',
    '$2b$10$rQZ5Q5Q5Q5Q5Q5Q5Q5Q5QOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq',
    'Administrator',
    'admin'
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('transcoding', '{"profiles": [{"name": "1080p", "width": 1920, "height": 1080, "bitrate": 6000}, {"name": "720p", "width": 1280, "height": 720, "bitrate": 3000}, {"name": "480p", "width": 854, "height": 480, "bitrate": 1500}, {"name": "360p", "width": 640, "height": 360, "bitrate": 800}]}'),
    ('restream', '{"auto_start": true, "retry_attempts": 3, "retry_delay_seconds": 5}'),
    ('playout', '{"default_loop": true, "crossfade_seconds": 2}');
