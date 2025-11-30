# Doc Checker Server

## Configuration
Set `DATABASE_URL` (e.g., `postgres://user:password@localhost:5432/docdb`) before running the service; the example values live in `.env.example`.

## Database migrations
Run the SQL migrations against your target database:

```bash
psql -d docdb -f server/migrations.sql
```

## Development server
Start the API from the server folder:

```bash
cd server && npm run dev
```
