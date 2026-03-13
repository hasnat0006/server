# Doc Checker Server

## Configuration
Set `DATABASE_URL` (e.g., `postgres://user:password@localhost:5432/docdb`) before running the service; the example values live in `.env.example`.

## Database migrations
Run the SQL migrations against your target database:

```bash
psql -d docdb -f migrations/001_create_documents_chunks.sql
psql -d docdb -f migrations/002_create_documents_chunks.sql
```

## Development server
Start the API from `xai_module`:

```bash
cd xai_module && npm run dev
```

## Tests

```bash
cd xai_module
python simple_test.py
python test_integration.py
```

Detailed guide: `docs/guides/XAI_IMPLEMENTATION_GUIDE.md`
