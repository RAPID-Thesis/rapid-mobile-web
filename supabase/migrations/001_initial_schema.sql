-- =============================================================================
-- RAPID MVP — Full Supabase Schema
-- Based on PRD-RAPID-MVP.md data model
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'engineer', 'drrmo', 'inspector');
CREATE TYPE assessment_phase AS ENUM ('pre-earthquake', 'post-earthquake');
CREATE TYPE assessment_status AS ENUM ('pending-sync', 'pending-review', 'reviewed', 'report-generated');
CREATE TYPE building_use AS ENUM ('residential', 'commercial', 'institutional', 'industrial', 'mixed');
CREATE TYPE soil_class AS ENUM ('A', 'B', 'C', 'D', 'E', 'F');
CREATE TYPE image_angle AS ENUM ('front', 'left', 'right', 'closeup');
CREATE TYPE action_plan_source AS ENUM ('gemini', 'template-fallback');

-- =============================================================================
-- PROFILES (extends Supabase auth.users)
-- =============================================================================

CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'inspector',
    lgu_code    TEXT NOT NULL DEFAULT '',
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_lgu_code ON profiles(lgu_code);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, lgu_code)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        CASE
            WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
                 AND NEW.raw_user_meta_data->>'role' <> ''
            THEN (NEW.raw_user_meta_data->>'role')::user_role
            ELSE 'inspector'::user_role
        END,
        COALESCE(NEW.raw_user_meta_data->>'lgu_code', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- BUILDINGS
-- =============================================================================

CREATE TABLE buildings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_code       TEXT UNIQUE NOT NULL,
    address             TEXT NOT NULL,
    barangay            TEXT NOT NULL,
    municipality        TEXT NOT NULL,
    longitude           DOUBLE PRECISION NOT NULL DEFAULT 0,
    latitude            DOUBLE PRECISION NOT NULL DEFAULT 0,
    location            GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
                            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
                        ) STORED,
    building_use        building_use NOT NULL DEFAULT 'residential',
    number_of_stories   INTEGER NOT NULL DEFAULT 1,
    year_built          INTEGER,
    structural_system   TEXT,
    foundation_type     TEXT,
    soil_classification soil_class,
    distance_to_fault_km DOUBLE PRECISION,
    previous_retrofit   BOOLEAN NOT NULL DEFAULT false,
    created_by          UUID REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_buildings_barangay ON buildings(barangay);
CREATE INDEX idx_buildings_municipality ON buildings(municipality);
CREATE INDEX idx_buildings_building_use ON buildings(building_use);
CREATE INDEX idx_buildings_location ON buildings USING GIST(location);

CREATE TRIGGER buildings_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ASSESSMENTS
-- =============================================================================

CREATE TABLE assessments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    inspector_id    UUID NOT NULL REFERENCES profiles(id),
    phase           assessment_phase NOT NULL,

    -- Structural data captured during inspection
    structural_data JSONB NOT NULL DEFAULT '{}',

    -- AI classification results (populated after ML inference)
    ai_image_label          TEXT,
    ai_image_confidence     DOUBLE PRECISION,
    ai_image_probabilities  JSONB,
    ai_tabular_label        TEXT,
    ai_tabular_confidence   DOUBLE PRECISION,
    ai_feature_importance   JSONB,
    ai_fused_label          TEXT,
    ai_fused_confidence     DOUBLE PRECISION,
    ai_fusion_weights       JSONB DEFAULT '{"image": 0.5, "tabular": 0.5}',

    -- Action plan
    action_recommendations  TEXT[],
    action_generated_by     action_plan_source,
    action_generated_at     TIMESTAMPTZ,

    -- Engineer review
    reviewed_by                 UUID REFERENCES profiles(id),
    override_classification     TEXT,
    review_justification        TEXT,
    reviewed_at                 TIMESTAMPTZ,

    -- Priority & status
    priority_score  DOUBLE PRECISION NOT NULL DEFAULT 0,
    status          assessment_status NOT NULL DEFAULT 'pending-sync',

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessments_building ON assessments(building_id);
CREATE INDEX idx_assessments_inspector ON assessments(inspector_id);
CREATE INDEX idx_assessments_phase ON assessments(phase);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_priority ON assessments(priority_score DESC);
CREATE INDEX idx_assessments_created ON assessments(created_at DESC);

CREATE TRIGGER assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ASSESSMENT IMAGES
-- =============================================================================

CREATE TABLE assessment_images (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    storage_path    TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    angle           image_angle,
    captured_at     TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessment_images_assessment ON assessment_images(assessment_id);

-- =============================================================================
-- AUDIT LOG (tracks engineer overrides and admin actions)
-- =============================================================================

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES profiles(id),
    action      TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    record_id   UUID NOT NULL,
    old_values  JSONB,
    new_values  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_record ON audit_log(record_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "Users can view all profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Admins can update any profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can insert profiles"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- BUILDINGS policies
CREATE POLICY "Authenticated users can view buildings"
    ON buildings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Inspectors and above can create buildings"
    ON buildings FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Engineers and admins can update buildings"
    ON buildings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'engineer')
        )
    );

-- ASSESSMENTS policies
CREATE POLICY "Authenticated users can view assessments"
    ON assessments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Inspectors can create assessments"
    ON assessments FOR INSERT
    TO authenticated
    WITH CHECK (inspector_id = auth.uid());

CREATE POLICY "Inspectors can update own pending assessments"
    ON assessments FOR UPDATE
    TO authenticated
    USING (inspector_id = auth.uid() AND status = 'pending-sync');

CREATE POLICY "Engineers and admins can update any assessment"
    ON assessments FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('admin', 'engineer')
        )
    );

-- ASSESSMENT IMAGES policies
CREATE POLICY "Authenticated users can view images"
    ON assessment_images FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Inspectors can upload images"
    ON assessment_images FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM assessments
            WHERE assessments.id = assessment_id AND assessments.inspector_id = auth.uid()
        )
    );

-- AUDIT LOG policies
CREATE POLICY "Admins can view audit log"
    ON audit_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "System can insert audit entries"
    ON audit_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- =============================================================================
-- STORAGE BUCKET for assessment images
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('assessment-images', 'assessment-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'assessment-images');

CREATE POLICY "Authenticated users can view images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'assessment-images');

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW buildings_geojson AS
SELECT
    b.id,
    b.building_code,
    b.address,
    b.barangay,
    b.municipality,
    b.building_use::TEXT,
    b.number_of_stories,
    b.year_built,
    b.longitude,
    b.latitude,
    json_build_object(
        'type', 'Feature',
        'geometry', json_build_object(
            'type', 'Point',
            'coordinates', json_build_array(b.longitude, b.latitude)
        ),
        'properties', json_build_object(
            'id', b.id,
            'buildingCode', b.building_code,
            'address', b.address,
            'barangay', b.barangay,
            'municipality', b.municipality,
            'buildingUse', b.building_use,
            'numberOfStories', b.number_of_stories,
            'yearBuilt', b.year_built
        )
    ) AS geojson_feature
FROM buildings b;

CREATE OR REPLACE VIEW assessment_summary AS
SELECT
    a.id,
    a.phase::TEXT,
    a.status::TEXT,
    a.priority_score,
    a.ai_fused_label,
    a.ai_fused_confidence,
    a.created_at,
    b.building_code,
    b.address,
    b.barangay,
    b.municipality,
    b.longitude,
    b.latitude,
    b.building_use::TEXT,
    p.full_name AS inspector_name,
    r.full_name AS reviewer_name,
    (SELECT count(*) FROM assessment_images ai WHERE ai.assessment_id = a.id) AS image_count
FROM assessments a
JOIN buildings b ON b.id = a.building_id
JOIN profiles p ON p.id = a.inspector_id
LEFT JOIN profiles r ON r.id = a.reviewed_by;
