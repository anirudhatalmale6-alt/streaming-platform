import { createClient, RedisClientType } from 'redis';

let client: RedisClientType;
let subscriber: RedisClientType;

export async function initRedis(): Promise<void> {
  client = createClient({
    url: process.env.REDIS_URL
  });

  subscriber = client.duplicate();

  client.on('error', (err) => console.error('Redis Client Error:', err));
  subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));

  await client.connect();
  await subscriber.connect();

  console.log('✅ Connected to Redis');
}

export function getRedis(): RedisClientType {
  return client;
}

export function getSubscriber(): RedisClientType {
  return subscriber;
}

// Cache helpers
export async function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const stringValue = JSON.stringify(value);
  if (ttlSeconds) {
    await client.setEx(key, ttlSeconds, stringValue);
  } else {
    await client.set(key, stringValue);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await client.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function cacheDelete(key: string): Promise<void> {
  await client.del(key);
}

// Pub/Sub helpers
export async function publish(channel: string, message: any): Promise<void> {
  await client.publish(channel, JSON.stringify(message));
}

export async function subscribe(
  channel: string,
  callback: (message: any) => void
): Promise<void> {
  await subscriber.subscribe(channel, (message) => {
    callback(JSON.parse(message));
  });
}

// Stream state management
export async function setStreamState(streamKey: string, state: any): Promise<void> {
  await cacheSet(`stream:state:${streamKey}`, state);
}

export async function getStreamState(streamKey: string): Promise<any> {
  return cacheGet(`stream:state:${streamKey}`);
}

export async function incrementViewers(streamKey: string): Promise<number> {
  return client.incr(`stream:viewers:${streamKey}`);
}

export async function decrementViewers(streamKey: string): Promise<number> {
  const count = await client.decr(`stream:viewers:${streamKey}`);
  if (count < 0) {
    await client.set(`stream:viewers:${streamKey}`, '0');
    return 0;
  }
  return count;
}

export async function getViewerCount(streamKey: string): Promise<number> {
  const count = await client.get(`stream:viewers:${streamKey}`);
  return count ? parseInt(count, 10) : 0;
}
