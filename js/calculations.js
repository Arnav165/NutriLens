const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

export function scaleNutrients(nutrientsPer100g, servingSizeG, servingsConsumed) {
  const factor = (servingSizeG * servingsConsumed) / 100;
  const result = {};
  for (const [id, val] of Object.entries(nutrientsPer100g)) {
    if (val != null) result[id] = val * factor;
  }
  return result;
}

export function computeDailyTotals(log) {
  const totals = {};
  for (const meal of MEALS) {
    for (const entry of log.entries[meal] || []) {
      const scaled = scaleNutrients(
        entry.nutrientsPer100g,
        entry.servingSizeG,
        entry.servingsConsumed
      );
      for (const [id, val] of Object.entries(scaled)) {
        totals[id] = (totals[id] || 0) + val;
      }
    }
  }
  return totals;
}

export function computeMealTotals(entries) {
  const totals = {};
  for (const entry of entries) {
    const scaled = scaleNutrients(
      entry.nutrientsPer100g,
      entry.servingSizeG,
      entry.servingsConsumed
    );
    for (const [id, val] of Object.entries(scaled)) {
      totals[id] = (totals[id] || 0) + val;
    }
  }
  return totals;
}

export function percentOfGoal(total, goal) {
  if (!goal) return 0;
  return Math.min(100, Math.round((total / goal) * 100));
}

export function nutrientStatus(total, goal) {
  if (!goal) return 'unknown';
  const pct = (total / goal) * 100;
  if (pct >= 90) return 'excellent';
  if (pct >= 50) return 'good';
  return 'low';
}

export function fmt(val, decimals = 1) {
  if (val == null || isNaN(val)) return '—';
  const rounded = Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(decimals);
}
