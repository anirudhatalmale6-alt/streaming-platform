import { Pool, PoolClient } from 'pg';

let pool: Pool;

export async function initDatabase(): Promise<void> {
  pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

  // Test connection
  const client = await pool.connect();
  console.log('✅ Connected to PostgreSQL');
  client.release();
}

export function getPool(): Pool {
  return pool;
}

export async function query(text: string, params?: any[]): Promise<any> {
  return pool.query(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Transaction helper
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
