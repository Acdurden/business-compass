-- Soft-delete/hide support for sections (questions & answer_options already have `active`).
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
