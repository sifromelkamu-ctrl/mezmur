-- CreateEnum
CREATE TYPE "ContactMessageSender" AS ENUM ('user', 'admin');

-- CreateTable
CREATE TABLE "contact_message_replies" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sender" "ContactMessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_message_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_message_replies_messageId_idx" ON "contact_message_replies"("messageId");

-- AddForeignKey
ALTER TABLE "contact_message_replies" ADD CONSTRAINT "contact_message_replies_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "contact_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry forward any existing single admin reply (adminReply/repliedAt) into
-- the new conversation table before dropping those columns, so upgrading to
-- the thread model doesn't silently lose a reply that was already sent.
INSERT INTO "contact_message_replies" ("id", "messageId", "sender", "body", "createdAt")
SELECT gen_random_uuid()::text, "id", 'admin', "adminReply", COALESCE("repliedAt", "createdAt")
FROM "contact_messages"
WHERE "adminReply" IS NOT NULL;

-- AlterTable
ALTER TABLE "contact_messages" DROP COLUMN "adminReply";
ALTER TABLE "contact_messages" DROP COLUMN "repliedAt";
