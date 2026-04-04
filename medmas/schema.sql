-- MedMAS Supabase Schema
-- Run this SQL in your Supabase SQL editor

-- Core user table
CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone      TEXT UNIQUE NOT NULL,
    lang_code  TEXT DEFAULT 'en',
    district   TEXT,
    state      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health interaction logs
CREATE TABLE health_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    log_type   TEXT CHECK (log_type IN ('symptom','lab','mental','lifestyle','doctor','reminder','asha')),
    payload    JSONB,
    triage     TEXT CHECK (triage IN ('urgent','moderate','routine')),
    score      INT CHECK (score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat session history
CREATE TABLE chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    title           TEXT NOT NULL DEFAULT 'New Chat',
    tab             TEXT NOT NULL DEFAULT 'chat' CHECK (tab IN ('chat', 'asha')),
    session_context JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL DEFAULT '',
    meta       JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ASHA worker patient queue
CREATE TABLE asha_patients (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asha_worker_id UUID REFERENCES users(id),
    name           TEXT NOT NULL,
    age            INT,
    gender         TEXT CHECK (gender IN ('male','female','other')),
    village        TEXT,
    district       TEXT,
    priority       INT DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),
    status         TEXT DEFAULT 'active' CHECK (status IN ('active','referred','resolved')),
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ASHA field assessments
CREATE TABLE asha_assessments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id     UUID REFERENCES asha_patients(id) ON DELETE CASCADE,
    asha_worker_id UUID REFERENCES users(id),
    triage_decision TEXT,
    refer_to       TEXT,
    documentation  JSONB,
    danger_signs   JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Doctor Consultation System ──────────────────────────────────────────

-- Doctors table (profile + verification)
-- Note: user_id stores the Supabase auth user id but has no FK to public.users
-- to avoid race conditions between auth trigger and profile creation.
CREATE TABLE doctors (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID UNIQUE,
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    phone          TEXT NOT NULL,
    specialty      TEXT NOT NULL DEFAULT 'General',
    license_number TEXT DEFAULT '',
    district       TEXT DEFAULT '',
    bio            TEXT DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Consent: user grants doctor access to their data
CREATE TABLE consents (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id    UUID,
    doctor_id  UUID REFERENCES doctors(id),
    scope      TEXT[] DEFAULT ARRAY['chat'],
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    active     BOOLEAN DEFAULT TRUE
);

-- Cases: structured view of a patient consultation
CREATE TABLE cases (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id        UUID REFERENCES doctors(id),
    session_id       UUID REFERENCES chat_sessions(id),
    status           TEXT NOT NULL DEFAULT 'requested'
                     CHECK (status IN ('requested','assigned','accepted','in_progress','completed','closed')),
    symptoms_summary TEXT DEFAULT '',
    ai_suggestion    TEXT DEFAULT '',
    triage_level     TEXT DEFAULT 'routine',
    specialty_needed TEXT DEFAULT 'General',
    district         TEXT DEFAULT '',
    notes            TEXT DEFAULT '',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Doctor-patient async messages
CREATE TABLE doctor_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('doctor','patient')),
    sender_id   UUID NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Structured prescriptions
CREATE TABLE prescriptions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id        UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    doctor_id      UUID NOT NULL REFERENCES doctors(id),
    patient_id     UUID NOT NULL REFERENCES users(id),
    diagnosis      TEXT DEFAULT '',
    medications    JSONB NOT NULL DEFAULT '[]'::jsonb,
    instructions   TEXT DEFAULT '',
    follow_up_date DATE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_health_logs_user_id  ON health_logs(user_id);
CREATE INDEX idx_health_logs_type     ON health_logs(log_type);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_asha_patients_worker ON asha_patients(asha_worker_id);
CREATE INDEX idx_asha_assess_patient  ON asha_assessments(patient_id);
CREATE INDEX idx_doctors_user_id     ON doctors(user_id);
CREATE INDEX idx_doctors_specialty   ON doctors(specialty);
CREATE INDEX idx_doctors_district    ON doctors(district);
CREATE INDEX idx_doctors_status      ON doctors(status);
CREATE INDEX idx_consents_user_id    ON consents(user_id);
CREATE INDEX idx_consents_case_id    ON consents(case_id);
CREATE INDEX idx_cases_user_id       ON cases(user_id);
CREATE INDEX idx_cases_doctor_id     ON cases(doctor_id);
CREATE INDEX idx_cases_status        ON cases(status);
CREATE INDEX idx_doctor_messages_case ON doctor_messages(case_id);
CREATE INDEX idx_prescriptions_case  ON prescriptions(case_id);

-- Keep public.users aligned with Supabase Auth users.
-- This makes auth.users.id and public.users.id the same identity for app-level foreign keys.
create or replace function public.handle_auth_user_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, phone, district, lang_code, state)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'phone', 'missing-phone-' || new.id::text),
    new.raw_user_meta_data ->> 'district',
    coalesce(new.raw_user_meta_data ->> 'lang_code', 'en'),
    new.raw_user_meta_data ->> 'state'
  )
  on conflict (id) do update
  set
    phone = excluded.phone,
    district = excluded.district,
    lang_code = excluded.lang_code,
    state = excluded.state;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update on auth.users
for each row execute function public.handle_auth_user_sync();

-- Backfill existing auth users into public.users.
insert into public.users (id, phone, district, lang_code, state)
select
  au.id,
  coalesce(au.raw_user_meta_data ->> 'phone', 'missing-phone-' || au.id::text),
  au.raw_user_meta_data ->> 'district',
  coalesce(au.raw_user_meta_data ->> 'lang_code', 'en'),
  au.raw_user_meta_data ->> 'state'
from auth.users au
on conflict (id) do update
set
  phone = excluded.phone,
  district = excluded.district,
  lang_code = excluded.lang_code,
  state = excluded.state;
