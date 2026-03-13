const { Pool } = require('pg');
require('dotenv').config();

async function checkDB() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query('SELECT id, filename, doc_hash, uploaded_at, metadata FROM documents ORDER BY id DESC LIMIT 10');
    console.log('\n📊 Documents in Database:');
    console.log('========================\n');
    
    if (result.rows.length === 0) {
      console.log('❌ No documents found in database');
    } else {
      result.rows.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log(`Filename: ${doc.filename}`);
        console.log(`Hash: ${doc.doc_hash}`);
        console.log(`Uploaded: ${doc.uploaded_at}`);
        if (doc.metadata) {
          const meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
          console.log(`Original Name: ${meta.original_name || 'N/A'}`);
          console.log(`Status: ${meta.status || 'N/A'}`);
        }
        console.log('------------------------');
      });
    }
    
    // Check chunks too
    const chunkResult = await pool.query('SELECT COUNT(*) as count FROM document_chunks');
    console.log(`\n📝 Total chunks in database: ${chunkResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDB();
