const BASE = 'https://world.openfoodfacts.org/api/v2/product';

// OFF nutriment key → our NUTRIENT_ID + unit conversion factor
// sodium is stored in grams on OFF, we use mg → ×1000
const OFF_MAP = [
  { offKey: 'energy-kcal', id: 1008, factor: 1    },
  { offKey: 'proteins',    id: 1003, factor: 1    },
  { offKey: 'carbohydrates', id: 1005, factor: 1  },
  { offKey: 'fat',         id: 1004, factor: 1    },
  { offKey: 'fiber',       id: 1079, factor: 1    },
  { offKey: 'sodium',      id: 1093, factor: 1000 }, // g → mg
  { offKey: 'calcium',     id: 1087, factor: 1    },
  { offKey: 'iron',        id: 1089, factor: 1    },
  { offKey: 'magnesium',   id: 1090, factor: 1    },
  { offKey: 'potassium',   id: 1092, factor: 1    },
  { offKey: 'zinc',        id: 1095, factor: 1    },
  { offKey: 'vitamin-c',   id: 1162, factor: 1    },
  { offKey: 'vitamin-a-rae', id: 1106, factor: 1  },
  { offKey: 'vitamin-d',   id: 1114, factor: 1    },
  { offKey: 'vitamin-e',   id: 1109, factor: 1    },
  { offKey: 'vitamin-k',   id: 1185, factor: 1    },
  { offKey: 'vitamin-b1',  id: 1165, factor: 1    },
  { offKey: 'vitamin-b2',  id: 1166, factor: 1    },
  { offKey: 'vitamin-pp',  id: 1167, factor: 1    }, // niacin
  { offKey: 'vitamin-b6',  id: 1175, factor: 1    },
  { offKey: 'vitamin-b12', id: 1178, factor: 1    },
  { offKey: 'folates',     id: 1177, factor: 1    },
];

export async function lookupBarcode(barcode) {
  const fields = 'product_name,brands,nutriments,serving_size,serving_quantity';
  const res = await fetch(`${BASE}/${barcode}.json?fields=${fields}`);
  if (!res.ok) throw new Error(`Open Food Facts error (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) throw new Error('Product not found');
  return data.product;
}

export function offProductToFood(product, barcode) {
  const nutriments = product.nutriments || {};

  // Build foodNutrients in USDA-search-result format so existing extractNutrients() works
  const foodNutrients = [];
  for (const { offKey, id, factor } of OFF_MAP) {
    const val = nutriments[`${offKey}_100g`];
    if (val != null && !isNaN(val) && val >= 0) {
      foodNutrients.push({ nutrientId: id, value: val * factor });
    }
  }

  const brand = (product.brands || '').split(',')[0].trim() || null;

  return {
    fdcId:        `off_${barcode}`,
    description:  product.product_name || 'Unknown Product',
    brandOwner:   brand,
    foodNutrients,
    _source:      'openfoodfacts',
    _servingSize: product.serving_size || null,
    _servingQty:  product.serving_quantity || null, // grams per serving (numeric)
  };
}

// Parse grams from strings like "30g", "1 serving (28 g)", "30 g / 1 oz"
export function parseServingGrams(str) {
  if (!str) return null;
  const match = str.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? parseFloat(match[1]) : null;
}
