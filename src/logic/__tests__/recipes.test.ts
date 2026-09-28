import { estimateCookTime, estimateDifficulty, formatIngredientLine, splitInstructions } from '../recipes';

describe('splitInstructions', () => {
  it('splits on lines and drops empty ones', () => {
    expect(splitInstructions('Chop the onion.\r\n\r\nFry it.\n')).toEqual(['Chop the onion.', 'Fry it.']);
  });

  it('drops "STEP 1" label lines and leading numbering', () => {
    const text = 'step 1\r\nMake the filling.\r\n\r\nSTEP 2\r\nBake it.\r\n3. Serve.\r\nStep 4: Enjoy.';
    expect(splitInstructions(text)).toEqual(['Make the filling.', 'Bake it.', 'Serve.', 'Enjoy.']);
  });

  it('keeps numbers that are part of the text', () => {
    expect(splitInstructions('200g flour goes in first.')).toEqual(['200g flour goes in first.']);
  });

  it('splits one long paragraph into sentences', () => {
    const sentence = 'Stir the sauce gently over a low heat for a while. ';
    const steps = splitInstructions(sentence.repeat(10).trim());
    expect(steps).toHaveLength(10);
    expect(steps[0]).toBe(sentence.trim());
  });

  it('keeps a short single paragraph as one step', () => {
    expect(splitInstructions('Mix. Serve.')).toEqual(['Mix. Serve.']);
  });

  it('returns no steps for empty text', () => {
    expect(splitInstructions('  \r\n ')).toEqual([]);
  });
});

describe('estimateCookTime', () => {
  it('adds mentioned durations to a prep time based on ingredient count', () => {
    // prep 5 + 1.5 × 10 = 20; + 30 + 10 = 60
    expect(estimateCookTime('Bake for 30 minutes, then rest for 10 mins.', 10)).toBe(60);
  });

  it('uses the upper bound of a range', () => {
    // prep 5 + 1.5 × 4 = 11; + 8 = 19 → 20
    expect(estimateCookTime('Roast for 6-8 minutes.', 4)).toBe(20);
  });

  it('understands hours', () => {
    // prep 11 + 90 = 101 → 100
    expect(estimateCookTime('Simmer for 1.5 hours.', 4)).toBe(100);
  });

  it('caps a single long duration (marinating) at 4 hours and the total at 300', () => {
    expect(estimateCookTime('Marinate for 24 hours.', 4)).toBe(250);
    expect(estimateCookTime('Marinate 24 hours. Rest 24 hours.', 4)).toBe(300);
  });

  it('never goes below 10 minutes', () => {
    expect(estimateCookTime('Mix and serve.', 1)).toBe(10);
  });

  it('ignores temperatures and quantities', () => {
    expect(estimateCookTime('Heat oven to 200C. Add 500g flour.', 2)).toBe(10);
  });

  it('is rounded to 5 minutes', () => {
    expect(estimateCookTime('Cook for 13 minutes.', 3) % 5).toBe(0);
  });
});

describe('formatIngredientLine', () => {
  it('puts the ingredient first and the purpose next to it', () => {
    expect(formatIngredientLine('Vegetable Oil', 'For frying')).toEqual({ name: 'Vegetable Oil', detail: 'For frying' });
  });

  it('capitalizes the first letter and tidies spaces, keeping the rest as written', () => {
    expect(formatIngredientLine('  vegetable   oil ', 'to taste')).toEqual({ name: 'Vegetable oil', detail: 'To taste' });
    expect(formatIngredientLine('Raw tiger prawns', '150g')).toEqual({ name: 'Raw tiger prawns', detail: '150g' });
    expect(formatIngredientLine('Dijon Mustard', '3  tablespoons')).toEqual({ name: 'Dijon Mustard', detail: '3 tablespoons' });
  });

  it('allows an empty measure', () => {
    expect(formatIngredientLine('Salt', '  ')).toEqual({ name: 'Salt', detail: '' });
  });
});

describe('estimateDifficulty', () => {
  it('few ingredients, few steps, quick ⇒ easy', () => {
    expect(estimateDifficulty(6, 3, 20)).toBe('easy');
    expect(estimateDifficulty(12, 3, 20)).toBe('easy'); // one point is still easy
  });

  it('2–3 points ⇒ medium', () => {
    expect(estimateDifficulty(12, 7, 20)).toBe('medium');
    expect(estimateDifficulty(16, 4, 60)).toBe('medium');
  });

  it('4+ points ⇒ hard', () => {
    expect(estimateDifficulty(16, 11, 30)).toBe('hard');
    expect(estimateDifficulty(10, 7, 120)).toBe('medium');
    expect(estimateDifficulty(12, 7, 120)).toBe('hard');
  });

  it('thresholds are inclusive', () => {
    expect(estimateDifficulty(11, 6, 59)).toBe('easy');
    expect(estimateDifficulty(16, 11, 120)).toBe('hard');
  });
});
