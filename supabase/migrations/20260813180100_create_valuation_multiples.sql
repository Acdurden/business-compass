-- Clean, editable source of truth for the valuation multiplier anchors the scoring
-- engine interpolates between. band_index 0..N aligns to the score-band floors
-- (0 = score 0; last = max score). Seeded to the values previously hardcoded in
-- src/lib/valscore_calc.js so behavior is identical until an admin edits them.
CREATE TABLE IF NOT EXISTS public.valuation_multiples (
  band_index      integer PRIMARY KEY,
  nfi_multiple    numeric NOT NULL,
  ebitda_multiple numeric NOT NULL
);
GRANT SELECT ON public.valuation_multiples TO anon, authenticated;
GRANT ALL ON public.valuation_multiples TO service_role;
ALTER TABLE public.valuation_multiples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read valuation_multiples" ON public.valuation_multiples;
CREATE POLICY "Anyone can read valuation_multiples"
  ON public.valuation_multiples FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.valuation_multiples (band_index, nfi_multiple, ebitda_multiple) VALUES
  (0, 0, 0), (1, 0.5, 2), (2, 1.0, 2.5), (3, 1.5, 3), (4, 2.0, 3.8)
ON CONFLICT (band_index) DO NOTHING;
