export const NUTRIENT_IDS = {
  ENERGY:    1008,
  PROTEIN:   1003,
  CARBS:     1005,
  FAT:       1004,
  FIBER:     1079,
  VIT_A:     1106,
  VIT_C:     1162,
  VIT_D:     1114,
  VIT_E:     1109,
  VIT_K:     1185,
  B1:        1165,
  B2:        1166,
  B3:        1167,
  B6:        1175,
  B12:       1178,
  FOLATE:    1177,
  CALCIUM:   1087,
  IRON:      1089,
  MAGNESIUM: 1090,
  POTASSIUM: 1092,
  SODIUM:    1093,
  ZINC:      1095,
};

export const NUTRIENT_META = [
  { id: 1008, name: 'Calories',   unit: 'kcal', defaultGoal: 2000, category: 'macro'   },
  { id: 1003, name: 'Protein',    unit: 'g',    defaultGoal: 150,  category: 'macro'   },
  { id: 1005, name: 'Carbs',      unit: 'g',    defaultGoal: 250,  category: 'macro'   },
  { id: 1004, name: 'Fat',        unit: 'g',    defaultGoal: 65,   category: 'macro'   },
  { id: 1079, name: 'Fiber',      unit: 'g',    defaultGoal: 28,   category: 'macro'   },
  { id: 1106, name: 'Vitamin A',  unit: 'mcg',  defaultGoal: 900,  category: 'vitamin' },
  { id: 1162, name: 'Vitamin C',  unit: 'mg',   defaultGoal: 90,   category: 'vitamin' },
  { id: 1114, name: 'Vitamin D',  unit: 'mcg',  defaultGoal: 20,   category: 'vitamin' },
  { id: 1109, name: 'Vitamin E',  unit: 'mg',   defaultGoal: 15,   category: 'vitamin' },
  { id: 1185, name: 'Vitamin K',  unit: 'mcg',  defaultGoal: 120,  category: 'vitamin' },
  { id: 1165, name: 'Vitamin B1', unit: 'mg',   defaultGoal: 1.2,  category: 'vitamin' },
  { id: 1166, name: 'Vitamin B2', unit: 'mg',   defaultGoal: 1.3,  category: 'vitamin' },
  { id: 1167, name: 'Vitamin B3', unit: 'mg',   defaultGoal: 16,   category: 'vitamin' },
  { id: 1175, name: 'Vitamin B6', unit: 'mg',   defaultGoal: 1.7,  category: 'vitamin' },
  { id: 1178, name: 'Vitamin B12',unit: 'mcg',  defaultGoal: 2.4,  category: 'vitamin' },
  { id: 1177, name: 'Folate',     unit: 'mcg',  defaultGoal: 400,  category: 'vitamin' },
  { id: 1087, name: 'Calcium',    unit: 'mg',   defaultGoal: 1000, category: 'mineral' },
  { id: 1089, name: 'Iron',       unit: 'mg',   defaultGoal: 18,   category: 'mineral' },
  { id: 1090, name: 'Magnesium',  unit: 'mg',   defaultGoal: 420,  category: 'mineral' },
  { id: 1092, name: 'Potassium',  unit: 'mg',   defaultGoal: 4700, category: 'mineral' },
  { id: 1093, name: 'Sodium',     unit: 'mg',   defaultGoal: 2300, category: 'mineral' },
  { id: 1095, name: 'Zinc',       unit: 'mg',   defaultGoal: 11,   category: 'mineral' },
];

export const DEFAULT_GOALS = Object.fromEntries(
  NUTRIENT_META.map(n => [n.id, n.defaultGoal])
);

export const MACRO_IDS = [1008, 1003, 1005, 1004, 1079];
export const VITAMIN_IDS = [1106, 1162, 1114, 1109, 1185, 1165, 1166, 1167, 1175, 1178, 1177];
export const MINERAL_IDS = [1087, 1089, 1090, 1092, 1093, 1095];

export function getNutrientMeta(id) {
  return NUTRIENT_META.find(n => n.id === id);
}
