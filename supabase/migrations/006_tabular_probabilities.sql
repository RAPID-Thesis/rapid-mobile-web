-- 006: store the Random Forest's full class distribution.
--
-- The image branch has had `ai_image_probabilities` since 001, so the assessment
-- detail page could chart how ResNet50 split its confidence across the three
-- classes. The tabular branch only ever got a label and a single confidence
-- number, so the same panel had nothing to draw and the Random Forest -- the
-- branch carrying the *larger* fusion weight, 0.55 against 0.45 -- was invisible
-- next to the model it outvotes.
--
-- The data was already being produced and thrown away at the door. The device
-- computes it (mobile/services/ml/onnxRunner.ts returns a probability per class)
-- and already ships it: `DevicePrediction.tabular_probabilities` has been part of
-- the sync schema all along, and apply_device_prediction() simply had no column
-- to write it to. Server-side `predict_tabular()` likewise returns
-- "probabilities" that were dropped on the floor.
--
-- Nullable on purpose: rows synced before this column existed keep a label and a
-- confidence but no distribution, and the UI falls back to showing just those
-- rather than inventing a split it cannot know.

ALTER TABLE assessments
    ADD COLUMN IF NOT EXISTS ai_tabular_probabilities JSONB;

COMMENT ON COLUMN assessments.ai_tabular_probabilities IS
    'Random Forest probability per class, mirroring ai_image_probabilities. Null for rows synced before migration 006.';
