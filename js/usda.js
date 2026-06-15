const BASE = 'https://api.nal.usda.gov/fdc/v1';

// Cache fetched food details to avoid re-fetching within a session
const detailCache = new Map();

export async function searchFoods(query, apiKey = 'DEMO_KEY', page = 1, signal) {
  const url = `${BASE}/foods/search?query=${encodeURIComponent(query)}&api_key=${apiKey}&pageSize=20&pageNumber=${page}&dataType=Foundation,SR%20Legacy,Branded`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 429) throw new Error('Rate limit reached. Try again in a minute, or add your own API key in Settings.');
    throw new Error(`USDA API error (${res.status})`);
  }
  return res.json();
}

// Search USDA by barcode (UPC/EAN). Returns the best matching food or null.
export async function searchByBarcode(barcode, apiKey = 'DEMO_KEY') {
  const url = `${BASE}/foods/search?query=${encodeURIComponent(barcode)}&api_key=${apiKey}&pageSize=5&dataType=Branded`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA API error (${res.status})`);
  const data = await res.json();
  // Prefer an exact gtinUpc match, fall back to first result
  const exact = (data.foods || []).find(f => f.gtinUpc === barcode || f.gtinUpc === barcode.padStart(14, '0'));
  return exact || data.foods?.[0] || null;
}

export async function getFoodById(fdcId, apiKey = 'DEMO_KEY') {
  if (detailCache.has(fdcId)) return detailCache.get(fdcId);
  const url = `${BASE}/food/${fdcId}?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA API error (${res.status})`);
  const food = await res.json();
  detailCache.set(fdcId, food);
  return food;
}

export function extractNutrients(food) {
  const map = {};
  const nutrients = food.foodNutrients || [];
  for (const n of nutrients) {
    // Search results use nutrientId; detail responses use nutrient.id
    const id = n.nutrientId ?? n.nutrient?.id;
    const val = n.value ?? n.amount;
    if (id != null && val != null) map[id] = val;
  }
  return map;
}

export function foodDisplayName(food) {
  return food.description || food.lowercaseDescription || 'Unknown food';
}

export function foodBrand(food) {
  return food.brandOwner || food.brandName || null;
}
