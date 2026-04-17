-- Hassan School Management DB Schema (PostgreSQL)
-- Run this script against your hassan_school_db database via pgAdmin Query Tool.

-- Enable UUID generation (one-time per database)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE user_role AS ENUM ('admin', 'teacher');
CREATE TYPE user_status AS ENUM ('Active', 'Inactive');
CREATE TYPE gender AS ENUM ('Male', 'Female');
CREATE TYPE student_status AS ENUM ('Active', 'Left');
CREATE TYPE mother_tongue AS ENUM ('Urdu', 'Punjabi', 'Pashto', 'Sindhi', 'Other');
CREATE TYPE previous_result AS ENUM ('N/A', 'Excellent', 'Good', 'Average', 'Poor');
CREATE TYPE discount_type AS ENUM ('No Discount', '25%', '50%', '75%', '100%');
CREATE TYPE student_section AS ENUM ('A', 'B', 'C');
CREATE TYPE fee_status AS ENUM ('Paid', 'Partial', 'Unpaid', 'Advance');
CREATE TYPE payment_method AS ENUM ('Cash', 'Bank Transfer', 'Online', 'Cheque');
CREATE TYPE staff_status AS ENUM ('Active', 'Inactive');
CREATE TYPE salary_status AS ENUM ('Paid', 'Payable');

-- Classes (for mapping class name -> default monthly fee)
CREATE TABLE classes (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    monthly_fee     NUMERIC(10,2) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Users (accounts: admin / teacher)
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           VARCHAR(150) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    role                user_role NOT NULL,
    status              user_status NOT NULL DEFAULT 'Active',
    phone               VARCHAR(30),
    created_on          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login          TIMESTAMPTZ,
    notes               TEXT
);

-- Classes assigned to a teacher
CREATE TABLE teacher_assigned_classes (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section     student_section,
    UNIQUE (user_id, class_id, section)
);

-- Students
CREATE TABLE students (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_no            VARCHAR(50) NOT NULL UNIQUE,
    full_name               VARCHAR(150) NOT NULL,
    father_name             VARCHAR(150) NOT NULL,
    date_of_birth           DATE NOT NULL,
    gender                  gender NOT NULL,
    religion                VARCHAR(50) NOT NULL DEFAULT 'Islam',
    nationality             VARCHAR(100) NOT NULL DEFAULT 'Pakistani',
    place_of_birth          VARCHAR(150),
    mother_tongue           mother_tongue,
    student_phone           VARCHAR(30),
    father_phone            VARCHAR(30) NOT NULL,
    mother_name             VARCHAR(150),
    mother_phone            VARCHAR(30),
    emergency_contact_name  VARCHAR(150),
    emergency_contact_phone VARCHAR(30),
    home_address            TEXT NOT NULL,
    district                VARCHAR(100),
    tehsil                  VARCHAR(100),
    admission_date          DATE NOT NULL,
    class_id                INTEGER NOT NULL REFERENCES classes(id),
    section                 student_section,
    roll_number             INTEGER,
    previous_school         VARCHAR(200),
    previous_class          VARCHAR(100),
    previous_result         previous_result,
    monthly_fee             NUMERIC(10,2) NOT NULL,
    discount                discount_type NOT NULL DEFAULT 'No Discount',
    discounted_fee          NUMERIC(10,2) NOT NULL,
    discount_reason         TEXT,
    b_form_number           VARCHAR(50),
    father_cnic             VARCHAR(20),
    previous_tc_number      VARCHAR(50),
    medical_condition       TEXT,
    notes                   TEXT,
    status                  student_status NOT NULL DEFAULT 'Active',
    leaving_date            DATE,
    leaving_reason          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE students
ADD CONSTRAINT discount_reason_required
CHECK (discount = 'No Discount' OR discount_reason IS NOT NULL);

CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_status ON students(status);

-- Fee records
CREATE TABLE fee_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month               SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year                SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    monthly_fee         NUMERIC(10,2) NOT NULL,
    prev_balance        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_due           NUMERIC(10,2) NOT NULL,
    paid_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
    balance_remaining   NUMERIC(10,2) NOT NULL,
    status              fee_status NOT NULL,
    payment_date        DATE,
    payment_method      payment_method,
    receipt_number      VARCHAR(50) UNIQUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fee_records
ADD CONSTRAINT unique_fee_record_per_period
UNIQUE (student_id, month, year);

CREATE INDEX idx_fee_records_student ON fee_records(student_id);
CREATE INDEX idx_fee_records_period ON fee_records(year, month);

-- Staff members
CREATE TABLE staff_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name       VARCHAR(150) NOT NULL,
    father_name     VARCHAR(150) NOT NULL,
    role            VARCHAR(100) NOT NULL,
    gender          gender,
    monthly_salary  NUMERIC(10,2) NOT NULL,
    join_date       DATE NOT NULL,
    phone           VARCHAR(30),
    cnic            VARCHAR(20),
    date_of_birth   DATE,
    qualification   VARCHAR(150),
    address         TEXT,
    notes           TEXT,
    status          staff_status NOT NULL DEFAULT 'Active',
    inactive_date   DATE,
    inactive_reason TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_status ON staff_members(status);

-- Salary records
CREATE TABLE salary_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year            SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    amount          NUMERIC(10,2) NOT NULL,
    payment_date    DATE,
    payment_method  payment_method,
    receipt_number  VARCHAR(50) UNIQUE,
    status          salary_status NOT NULL DEFAULT 'Paid',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE salary_records
ADD CONSTRAINT unique_salary_per_period
UNIQUE (staff_id, month, year);

CREATE INDEX idx_salary_staff ON salary_records(staff_id);
CREATE INDEX idx_salary_period ON salary_records(year, month);

-- Expenses
CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE NOT NULL,
    category        VARCHAR(100) NOT NULL,
    description     TEXT NOT NULL,
    amount          NUMERIC(10,2) NOT NULL,
    payment_method  payment_method,
    paid_to         VARCHAR(150),
    receipt_ref     VARCHAR(100),
    recorded_by     UUID REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
