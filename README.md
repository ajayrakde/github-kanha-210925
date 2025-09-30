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

## PhonePe Sandbox & Simulator

The PhonePe integration ships with default sandbox and production hosts so new environments work without populating custom URL secrets:

- **Sandbox (UAT)** – `https://api-preprod.phonepe.com/apis/pgsandbox`
- **Production** – `https://api.phonepe.com/apis/hermes`

The unified `PhonePeConfig` merges these defaults with any `PAYAPP_*_PHONEPE_HOST_UAT` / `HOST_PROD` overrides and exposes an optional `activeHost` selector:

- Set `PAYAPP_TEST_PHONEPE_HOST_ACTIVE=uat` (or `prod`/a fully qualified URL) when you want to pin an environment to a specific host without editing database metadata.
- Alternatively store `{ "phonepeHost": "prod" }` (or a URL) inside the `payment_provider_config.metadata` column to toggle hosts at runtime. Metadata wins over environment configuration, and omitting a value falls back to the default host for the current environment.

When exercising the PhonePe sandbox, the gateway simulator recognizes dedicated VPAs:

- `success@ybl` – completes immediately with a `COMPLETED` state.
- `failed@ybl` – triggers a `FAILED` response (`UPI_TXN_FAILED`).
- `pending@ybl` – remains in `PENDING` until a follow-up callback/status check resolves it.
- Dynamic QR journeys return pending QR payloads first and settle to `COMPLETED` when the buyer scans with a success handle.

Example simulator payloads that cover those flows live in [`server/services/__tests__/__fixtures__/phonepe-sandbox/`](server/services/__tests__/__fixtures__/phonepe-sandbox/index.ts).

### Documentation linting

Run `npm run lint:md` to lint Markdown guides (README + `docs/**/*.md`) with Markdownlint so configuration drift is caught during CI or local checks.
