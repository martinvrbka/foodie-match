-- Ingredient name and measure as written in the source, so the app can show
-- "Vegetable oil · For frying" instead of "For frying Vegetable Oil".
-- raw_text keeps the full original line.
alter table public.recipe_ingredients add column name text, add column measure text;
