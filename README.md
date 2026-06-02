# Realtime Chat Monorepo

Production-grade real-time chat (WhatsApp/Discord inspired).

## Structure

- `apps/web`: Next.js (App Router) frontend
- `apps/api`: NestJS backend (Socket.IO + REST)
- `packages/shared`: shared DTOs + Socket.IO event typings (TypeScript-only)

## Prereqs

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

## Setup (later)

This repo is currently scaffolded only (no feature implementation yet).

## Auth foundation (backend)

- Endpoint: `GET /api/me` (Bearer Firebase ID token)
- Guard verifies Firebase ID token via Firebase Admin SDK
- User is synced by `firebaseUid` using upsert
- If first login, user row is created automatically

### Environment variables

See `apps/api/.env.example`:

- `PORT`
- `DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## Auth foundation (frontend)

See `apps/web/.env.example`:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

