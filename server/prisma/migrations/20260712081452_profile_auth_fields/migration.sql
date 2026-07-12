-- Extends `profiles` for the full email+phone auth system: a profile can now
-- originate from either an email or a phone signup, so email must become
-- optional (phone-only accounts have no email) and phone joins it as a
-- second, equally-optional, equally-unique identifier.
ALTER TABLE "profiles" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "profiles"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Case-insensitive uniqueness without needing the citext extension: a
-- functional unique index on lower(username). Application code must always
-- compare/query usernames via lower() to actually get the protection.
CREATE UNIQUE INDEX "profiles_username_lower_key" ON "profiles" (lower("username"));
CREATE UNIQUE INDEX "profiles_phone_key" ON "profiles" ("phone");

-- Backfill: existing rows (created before `username` existed) get a
-- deterministic placeholder derived from their email/id so the column can
-- stay effectively required for the app's own purposes going forward
-- without breaking pre-existing accounts. Users can change it in Settings.
UPDATE "profiles"
SET "username" = 'user_' || substr(replace("id"::text, '-', ''), 1, 12)
WHERE "username" IS NULL;

-- Auto-create a profile row whenever Supabase Auth creates a new user.
-- Extended to read the extra signup fields (username, country, preferred
-- language) out of the auth user's metadata — the client passes these as
-- `options.data` on `supabase.auth.signUp(...)`, for both the email and
-- phone flows, so this trigger is the single place a profile is ever
-- created regardless of which auth method was used.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, username, country, "preferredLanguage")
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 12)),
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en')
  );
  RETURN NEW;
END;
$$;
