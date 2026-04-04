-- Run this in Supabase SQL Editor if you already ran schema.sql
-- Drops the FK constraint on doctors.user_id that causes 400 errors during signup
-- (race condition between auth trigger and doctor profile insert)

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_user_id_fkey;
