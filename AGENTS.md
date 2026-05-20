# AGENTS.md

## Monorepo structure

- `server/` — Express 5 + Prisma 4 + Redis + Socket.io backend (CommonJS)
- `app/` — Expo/React Native frontend
- Root `package.json` has convenience scripts prefixed by `backend:` or `frontend:`; always run these from repo root, not from inside `server/` or `app/` unless debugging.

## Feature-based architecture (strict)

- All new code **must** follow the feature-based layout: `src/features/{auth,chat,friends,map,profile,upload}/`
- Each feature owns its own **routes**, **controller**, **service**, **types**, and **validation** files (mirroring `auth/` and `upload/` as the reference patterns).
- Shared/common logic goes in `src/shared/` (middleware, types, lib).
- Interfaces that cross feature boundaries **must** be defined in `src/shared/types/`, not inside individual feature folders. Feature-local-only types can stay in the feature, but anything consumed by another feature or by shared/middleware belongs in shared types.

## Key commands

```bash
npm run install:all          # install both packages
npm run backend:dev           # start server dev (tsx watch)
npm run backend:prisma        # prisma generate (run after schema changes)
npm run db:up                 # start Postgres + Redis via Docker
npm run db:down               # stop Docker containers
npm run frontend:web          # start Expo web
npm run frontend:android      # start Expo Android
npm run frontend:ios          # start Expo iOS
```

Testing:

```bash
npm --prefix server run test           # server tests (Jest + ts-jest)
npm --prefix app run test              # app tests (Jest + jest-expo)
npm --prefix app install --legacy-peer-deps   # app requires legacy-peer-deps
```

## Setup gotchas

- PostgreSQL runs on **port 5433** (not default 5432) — see `docker-compose.yml`.
- Redis runs on default port 6379.
- Copy `server/.env.example` → `server/.env` and `app/.env.example` → `app/.env` before dev.
- `DATABASE_URL` is required by both Prisma CLI and the running server — it's set in `.env`.
- After any Prisma schema change: `npm run backend:prisma` then restart the dev server.
- In CI/test environments, use `prisma db push` (not `prisma migrate`) — see `.github/workflows/sonarcloud.yml`.
- The server starts even without DB connectivity (local dev resilience), but DB features won't work.

## Server architecture

- Entry: `server/src/index.ts` (creates HTTP server, attaches WebSocket, starts Express).
- App wiring: `server/src/app.ts` (middleware + route mounting).
- Routes mount at `/api/{feature}` (currently `/api/auth`, `/api/upload`).
- WebSocket: `server/src/websocket/socket.ts`.
- Prisma client is a **singleton** (`server/src/shared/lib/prisma.ts`) — never create additional PrismaClient instances.
- Redis client: `server/src/shared/lib/redis.ts` — must call `redis.connect()` before use (done in `index.ts`).
- Auth middleware: `server/src/shared/middleware/jwtAuth.ts` — adds `user` to `AuthenticatedRequest` (type from `shared/types/auth.ts`).
- **Storage pattern**: Define `StorageAdapter` interface in `src/shared/types/storage.interface.ts`, implement in feature (`features/upload/storage/`), expose via factory `createStorageAdapter()`.

## App architecture

- Entry: `app/App.tsx` → `src/navigation/AppNavigator.tsx`.
- Screens live in `app/src/screens/`.
- Feature services (e.g. `app/src/features/auth/auth.service.ts`) handle API calls via Axios.

## Testing

- Server tests live in `server/src/tests/` (not co-located with features).
- App tests can be anywhere in `app/` matching `**/*.test.{ts,tsx}`.
- Integration tests requiring DB use the PostgreSQL service container in CI; locally, run `npm run db:up` first.
- Coverage output goes to `server/coverage/` and `app/coverage/` respectively.

## Type safety

- `server/tsconfig.json` is `strict: true` — never use `any` unless unavoidable and documented.
- Zod is used for request validation (see `auth.validation.ts`).