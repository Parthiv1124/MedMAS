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

-- Indexes for performance
CREATE INDEX idx_health_logs_user_id  ON health_logs(user_id);
CREATE INDEX idx_health_logs_type     ON health_logs(log_type);
CREATE INDEX idx_asha_patients_worker ON asha_patients(asha_worker_id);
CREATE INDEX idx_asha_assess_patient  ON asha_assessments(patient_id);
