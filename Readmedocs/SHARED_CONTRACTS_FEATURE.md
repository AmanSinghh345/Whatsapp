# Shared Contracts Feature

## Status

Implemented.

The shared package provides TypeScript DTOs, socket event names, socket payloads, and common types used by both the NestJS API and Next.js frontend.

## Scope Implemented

- Shared id and date types
- Auth DTOs
- User DTOs
- Chat DTOs
- Message DTOs
- Media DTOs
- Call DTOs
- Socket event constants
- Socket payload maps
- Package barrel exports

## Package Location

```text
packages/shared
```

Main export:

```text
packages/shared/src/index.ts
```

The app imports it as:

```ts
import type { UserDto } from "@chat/shared";
```

## DTO Areas

Files:

```text
packages/shared/src/dto/auth.dto.ts
packages/shared/src/dto/users.dto.ts
packages/shared/src/dto/chats.dto.ts
packages/shared/src/dto/messages.dto.ts
packages/shared/src/dto/media.dto.ts
packages/shared/src/dto/calls.dto.ts
```

## Socket Contracts

Files:

```text
packages/shared/src/socket/events.ts
packages/shared/src/socket/payloads.ts
```

`SocketEvents` is the central event-name object. This avoids hardcoding event strings across backend and frontend where practical.

Implemented event groups:

- messages
- typing
- presence
- notifications contract placeholder
- calls contract placeholder

## Common Types

File:

```text
packages/shared/src/types/index.ts
```

Provides:

```ts
type Id = string;
type ISODateString = string;
```

## Design Rule

Shared contracts should stay simple and boring:

- DTOs describe transport shape.
- Business logic stays in app modules.
- Frontend state shape can adapt DTOs locally when needed.

## Key Files

- `packages/shared/src/index.ts`
- `packages/shared/src/dto/index.ts`
- `packages/shared/src/socket/index.ts`
- `packages/shared/src/socket/events.ts`
- `packages/shared/src/socket/payloads.ts`
- `packages/shared/src/types/index.ts`
