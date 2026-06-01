const { Pool } = require('pg');
require('dotenv').config();
const embeddingService = require('../functionality/services/embedding-service');

const BATCH_SIZE = 100;

function formatVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) {
    return null;
  }

  const sanitized = vector.map((value) => (Number.isFinite(value) ? value : 0));
  return `[${sanitized.join(',')}]`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run the backfill.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  let processed = 0;
  let updated = 0;

  try {
    while (true) {
      const { rows } = await pool.query(
        `
        SELECT id, chunk_text
        FROM chunks
        WHERE embedding_vector IS NULL
        ORDER BY id ASC
        LIMIT $1
        `,
        [BATCH_SIZE]
      );

      if (!rows.length) {
        break;
      }

      for (const row of rows) {
        processed += 1;
        const text = (row.chunk_text || '').trim();
        if (!text) {
          continue;
        }

        let embedding = null;
        try {
          embedding = await embeddingService.embedText(text);
        } catch (error) {
          console.warn(`Embedding failed for chunk ${row.id}: ${error.message}`);
          continue;
        }

        const vectorValue = formatVector(embedding);
        if (!vectorValue) {
          continue;
        }

        await pool.query(
          'UPDATE chunks SET embedding_vector = $1::vector WHERE id = $2',
          [vectorValue, row.id]
        );
        updated += 1;
      }

      console.log(`Processed ${processed} chunks, updated ${updated} embeddings...`);
    }

    console.log(`Backfill complete. Processed ${processed}, updated ${updated}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error.message);
  process.exit(1);
});
