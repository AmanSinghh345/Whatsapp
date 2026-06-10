# Media Attachment Feature

## Status

Implemented.

This feature lets authenticated users upload media to Cloudinary, confirm the uploaded asset with the backend, and send it as an attachment message.

## Scope Implemented

- Cloudinary signed upload parameter endpoint
- Upload confirmation endpoint that persists Cloudinary metadata
- Staged media records that can be attached to a message later
- Attachment validation before sending a message
- Frontend Cloudinary upload helper
- File picker in the message composer
- Image, video, and generic file rendering in message bubbles

## Backend Endpoints

```text
POST /api/media/upload-signature
POST /api/media/confirm
GET /api/media/:assetId
```

`POST /api/media/upload-signature` requires:

```ts
{
  folder: string;
  resourceType: "image" | "video" | "raw";
}
```

`POST /api/media/confirm` requires:

```ts
{
  url: string;
  cloudinaryPublicId: string;
  resourceType: "image" | "video" | "raw";
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}
```

Attachment messages continue to use:

```text
POST /api/messages
```

with:

```ts
{
  chatId: string;
  clientMessageId: string;
  contentType: "attachment";
  attachmentIds: string[];
  text?: string;
}
```

## Data Model

`MessageAttachment.messageId` is now nullable so assets can be staged after upload confirmation and connected when the message is sent.

## Environment Variables

Backend:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

## Key Files

- `apps/api/src/modules/media/media.controller.ts`
- `apps/api/src/modules/media/media.service.ts`
- `apps/api/src/modules/media/media.module.ts`
- `apps/api/prisma/schema.prisma`
- `apps/web/src/features/chat/api/media.api.ts`
- `apps/web/src/features/chat/components/MessageInput.tsx`
- `apps/web/src/features/chat/components/MessageBubble.tsx`

## Verification

Typechecks passed:

```bash
npm run typecheck -w @chat/api
npm run typecheck -w @chat/web
```
