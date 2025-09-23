# rest-express

## Container Deployment Notes

This repository ships with a multi-stage Dockerfile that installs dependencies, runs the build, and starts the compiled server via `npm start`. The container listens on the port provided by the `PORT` environment variable (default `5000`).

### Building and Running Locally

```bash
docker build -t rest-express .
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/db" \
  -e SESSION_SECRET="replace-me" \
  -e PUBLIC_OBJECT_SEARCH_PATHS="/bucket/public" \
  -e PRIVATE_OBJECT_DIR="/bucket/private" \
  rest-express
```

### Required Environment Variables

These variables must be provided by any container platform so the application can start successfully:

- `DATABASE_URL` – PostgreSQL connection string used by the Neon/Drizzle database client.
- `SESSION_SECRET` – secret key for Express session cookies.
- Storage configuration:
  - `PUBLIC_OBJECT_SEARCH_PATHS` – comma-separated GCS bucket paths that host publicly served assets.
  - `PRIVATE_OBJECT_DIR` – bucket path prefix used for private object uploads and signed URLs.
- (Optional) `TWOFACTOR_API_KEY` – required if integrating with the external 2Factor OTP provider.

Set `PORT` if your platform requires a specific port binding; otherwise the container defaults to `5000`.
