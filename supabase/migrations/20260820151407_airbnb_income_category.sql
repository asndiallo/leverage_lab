-- =============================================================================
-- Leverage Lab — 0009: Airbnb / short-term rental income category
-- Additive migration (see 0008: editing already-applied migrations is no
-- longer safe). transaction_categories is a lookup table, not an enum, so a
-- new income source is a plain insert — no type migration needed.
-- =============================================================================

insert into transaction_categories (code, category_group, direction, label, sort_order) values
  ('airbnb_income', 'income', 'income', 'Airbnb / Short-Term Rental', 35);
