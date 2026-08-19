-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('none', 'trialing', 'active', 'past_due', 'canceled');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "profiles" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "profiles" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "profiles" ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3);

-- Backfill existing rows from their actual signup date rather than "now"
UPDATE "profiles" SET "trialEndsAt" = "createdAt" + interval '30 days' WHERE "trialEndsAt" IS NULL;

-- Enforce NOT NULL now that every row has a value, then set the default for
-- future inserts (a fresh 30-day window from signup).
ALTER TABLE "profiles" ALTER COLUMN "trialEndsAt" SET NOT NULL;
ALTER TABLE "profiles" ALTER COLUMN "trialEndsAt" SET DEFAULT (now() + interval '30 days');

-- CreateIndex
CREATE UNIQUE INDEX "profiles_stripeCustomerId_key" ON "profiles"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_stripeSubscriptionId_key" ON "profiles"("stripeSubscriptionId");
