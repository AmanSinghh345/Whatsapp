CREATE TABLE "ChatInvite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chatId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatInvite_token_key" ON "ChatInvite"("token");
CREATE INDEX "ChatInvite_chatId_revokedAt_createdAt_idx" ON "ChatInvite"("chatId", "revokedAt", "createdAt" DESC);
CREATE INDEX "ChatInvite_createdById_createdAt_idx" ON "ChatInvite"("createdById", "createdAt" DESC);

ALTER TABLE "ChatInvite"
ADD CONSTRAINT "ChatInvite_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Chat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatInvite"
ADD CONSTRAINT "ChatInvite_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
