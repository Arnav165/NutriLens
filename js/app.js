import { NUTRIENT_IDS, NUTRIENT_META, MACRO_IDS, VITAMIN_IDS, MINERAL_IDS, getNutrientMeta } from './nutrients.js';
import * as storage from './storage.js';
import { scaleNutrients, computeDailyTotals, computeMealTotals, percentOfGoal, nutrientStatus, fmt } from './calculations.js';
import { todayStr, prevDay, nextDay, isValidDate, displayDate, longDisplayDate } from './dates.js';
import { searchFoods, searchByBarcode, extractNutrients, foodDisplayName, foodBrand } from './usda.js';
import { lookupBarcode, offProductToFood, parseServingGrams } from './openfoodfacts.js';
import { extractNutritionLabel, labelDataToNutrients } from './groq.js';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const MACRO_BAR_COLORS = { 1003: 'var(--protein)', 1005: 'var(--carbs)', 1004: 'var(--fat)', 1079: 'var(--fiber)' };
const CUSTOM_NUTRIENT_IDS = [1008, 1003, 1005, 1004, 1079, 1093, 1087, 1089, 1092, 1090, 1095, 1106, 1162, 1114];

// ── State ──────────────────────────────────────────────────────────
let currentDate = todayStr();
let targetMeal  = 'breakfast';
let selectedFood = null;
let searchPage   = 1;
let searchQuery  = '';
let searchResults = [];
let customResults = [];
let totalHits    = 0;
let debounceTimer  = null;
let abortController = null;

// ── Scanner state ────────────────────────────────────────────────
let barcodeDetector = null;
let zxingReader     = null;
let zxingControls   = null;
let scanStream      = null;
let scanAnimFrame   = null;

// ── Modal state ──────────────────────────────────────────────────
let editingEntryId      = null;
let editingMeal         = null;
let creatingCustomFoodId = null;

// ── Init ─────────────────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  if (dateParam && isValidDate(dateParam)) currentDate = dateParam;
  refresh();
  bindStaticEvents();
})();

// ── Refresh ──────────────────────────────────────────────────────
function refresh() {
  const log    = storage.getLog(currentDate);
  const goals  = storage.getGoals();
  const totals = computeDailyTotals(log);
  renderHeader();
  renderSummary(totals, goals);
  for (const meal of MEALS) renderMealSection(meal, log.entries[meal], goals);
  renderMicros(totals, goals);
}

// ── Header ───────────────────────────────────────────────────────
function renderHeader() {
  document.getElementById('date-label').textContent = displayDate(currentDate);
  const btnToday = document.getElementById('btn-today');
  if (currentDate === todayStr()) {
    btnToday.classList.add('hidden');
  } else {
    btnToday.classList.remove('hidden');
  }
  document.title = `${displayDate(currentDate)} · NutriLens`;
}

// ── Macro Summary ────────────────────────────────────────────────
function renderSummary(totals, goals) {
  const cal     = totals[1008] || 0;
  const calGoal = goals[1008]  || 2000;
  const protein = totals[1003] || 0;
  const carbs   = totals[1005] || 0;
  const fat     = totals[1004] || 0;
  const fiber   = totals[1079] || 0;

  const R = 52, CX = 60, CY = 60;
  const circumference = 2 * Math.PI * R;
  const proteinCals = protein * 4;
  const carbsCals   = carbs   * 4;
  const fatCals     = fat     * 9;
  const macroTotal  = proteinCals + carbsCals + fatCals || 1;

  function arc(startFrac, endFrac, color) {
    const start = circumference * startFrac;
    const len   = circumference * Math.min(endFrac - startFrac, 0.999);
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="12"
      stroke-dasharray="${len} ${circumference}"
      stroke-dashoffset="${-start}"
      stroke-linecap="round"/>`;
  }

  const pFrac = proteinCals / macroTotal;
  const cFrac = carbsCals   / macroTotal;
  const fFrac = fatCals     / macroTotal;
  let ringHTML = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="12"/>`;
  if (cal > 0) {
    ringHTML += arc(0, pFrac, '#3b82f6');
    ringHTML += arc(pFrac, pFrac + cFrac, '#f59e0b');
    ringHTML += arc(pFrac + cFrac, pFrac + cFrac + fFrac, '#f43f5e');
  }

  const macroBarHTML = [
    { id: 1003, label: 'Protein', val: protein, unit: 'g', color: 'var(--protein)' },
    { id: 1005, label: 'Carbs',   val: carbs,   unit: 'g', color: 'var(--carbs)'   },
    { id: 1004, label: 'Fat',     val: fat,      unit: 'g', color: 'var(--fat)'     },
    { id: 1079, label: 'Fiber',   val: fiber,    unit: 'g', color: 'var(--fiber)'   },
  ].map(({ id, label, val, unit, color }) => {
    const goal = goals[id] || 1;
    const pct  = percentOfGoal(val, goal);
    const over = val > goal;
    return `
      <div class="macro-row">
        <div class="macro-row-header">
          <span class="macro-name" style="color:${color}">${label}</span>
          <span class="macro-value">${fmt(val, 1)}${unit} / ${fmt(goal, 0)}${unit}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${over ? 'over' : ''}" style="width:${pct}%;background:${over ? '' : color}"></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('macro-summary').innerHTML = `
    <div class="summary-layout">
      <div class="calorie-ring-wrap">
        <svg viewBox="0 0 120 120">${ringHTML}</svg>
        <div class="ring-label">
          <div class="cal-value">${Math.round(cal)}</div>
          <div class="cal-sub">/ ${Math.round(calGoal)} kcal</div>
        </div>
      </div>
      <div class="macro-bars">${macroBarHTML}</div>
    </div>`;
}

// ── Meal Section ─────────────────────────────────────────────────
function renderMealSection(meal, entries, goals) {
  const mealTotals = computeMealTotals(entries);
  const mealCal    = Math.round(mealTotals[1008] || 0);

  const entriesHTML = entries.length === 0
    ? `<div class="empty-meal">No foods logged yet</div>`
    : entries.map(entry => renderFoodRow(entry)).join('');

  document.getElementById(`meal-${meal}`).innerHTML = `
    <div class="meal-header" data-meal="${meal}">
      <span class="meal-title">${MEAL_LABELS[meal]}</span>
      <div class="meal-meta">
        <span class="meal-cal">${mealCal} kcal</span>
        <span class="collapse-icon">▼</span>
      </div>
    </div>
    <div class="meal-body" id="meal-body-${meal}">
      <div class="meal-entries">${entriesHTML}</div>
      <div class="meal-footer">
        <button class="btn-add-food" data-meal="${meal}">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
          Add Food
        </button>
      </div>
    </div>`;

  document.querySelector(`#meal-${meal} .meal-header`).addEventListener('click', () => {
    const body = document.getElementById(`meal-body-${meal}`);
    const icon = document.querySelector(`#meal-${meal} .collapse-icon`);
    body.classList.toggle('collapsed');
    icon.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
  });

  document.querySelector(`#meal-${meal} .btn-add-food`).addEventListener('click', () => {
    openModal(meal);
  });

  document.querySelector(`#meal-${meal} .meal-entries`).addEventListener('click', e => {
    const delBtn  = e.target.closest('[data-action="delete"]');
    const editBtn = e.target.closest('[data-action="edit"]');
    if (delBtn) {
      storage.deleteEntry(currentDate, meal, delBtn.dataset.id);
      refresh();
    }
    if (editBtn) {
      const log = storage.getLog(currentDate);
      const entry = log.entries[meal].find(e => e.id === editBtn.dataset.id);
      if (entry) openModalForEdit(meal, entry);
    }
  });
}

function renderFoodRow(entry) {
  const scaled = scaleNutrients(entry.nutrientsPer100g, entry.servingSizeG, entry.servingsConsumed);
  const cal    = Math.round(scaled[1008] || 0);
  const pro    = fmt(scaled[1003] || 0, 1);
  const carb   = fmt(scaled[1005] || 0, 1);
  const fat    = fmt(scaled[1004] || 0, 1);
  const totalG = fmt(entry.servingSizeG * entry.servingsConsumed, 0);
  const servingLabel = entry.servingsConsumed === 1
    ? `${fmt(entry.servingSizeG, 0)}g`
    : `${fmt(entry.servingsConsumed, 1)} × ${fmt(entry.servingSizeG, 0)}g = ${totalG}g`;

  return `
    <div class="food-row">
      <div class="food-info">
        <div class="food-name">${escHtml(entry.name)}</div>
        ${entry.brand ? `<div class="food-brand">${escHtml(entry.brand)}</div>` : ''}
        <div class="food-serving">${servingLabel}</div>
        <div class="food-macros">
          <span style="color:var(--protein)">P ${pro}g</span>
          <span style="color:var(--carbs)">C ${carb}g</span>
          <span style="color:var(--fat)">F ${fat}g</span>
        </div>
      </div>
      <div class="food-cal">${cal}</div>
      <div class="food-actions">
        <button class="btn-edit" data-action="edit" data-id="${entry.id}" title="Edit serving">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
        </button>
        <button class="btn-del" data-action="delete" data-id="${entry.id}" title="Remove">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </div>`;
}

// ── Micros Panel ─────────────────────────────────────────────────
function renderMicros(totals, goals) {
  const vitaminRows = VITAMIN_IDS.map(id => microRow(id, totals, goals)).join('');
  const mineralRows = MINERAL_IDS.map(id => microRow(id, totals, goals)).join('');

  document.getElementById('micros-card').innerHTML = `
    <div class="micros-header">
      <span class="micros-title">Vitamins &amp; Minerals</span>
      <span class="collapse-icon">▶</span>
    </div>
    <div class="micros-body collapsed" id="micros-body">
      <div class="micros-group-title">Vitamins</div>
      <table class="micro-table">
        <thead><tr><th>Nutrient</th><th>Amount</th><th>Goal</th><th>%</th><th class="micro-bar-cell"></th><th>Status</th></tr></thead>
        <tbody>${vitaminRows}</tbody>
      </table>
      <div class="micros-group-title">Minerals</div>
      <table class="micro-table">
        <thead><tr><th>Nutrient</th><th>Amount</th><th>Goal</th><th>%</th><th class="micro-bar-cell"></th><th>Status</th></tr></thead>
        <tbody>${mineralRows}</tbody>
      </table>
    </div>`;

  document.querySelector('#micros-card .micros-header').addEventListener('click', () => {
    const body = document.getElementById('micros-body');
    const icon = document.querySelector('#micros-card .collapse-icon');
    body.classList.toggle('collapsed');
    icon.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
  });
}

function microRow(id, totals, goals) {
  const meta   = getNutrientMeta(id);
  if (!meta) return '';
  const val    = totals[id] || 0;
  const goal   = goals[id]  || meta.defaultGoal;
  const pct    = percentOfGoal(val, goal);
  const status = nutrientStatus(val, goal);
  const color  = status === 'excellent' ? 'var(--success)' : status === 'good' ? 'var(--warning)' : 'var(--danger)';

  return `
    <tr>
      <td>${meta.name}</td>
      <td style="font-variant-numeric:tabular-nums">${fmt(val, 1)} ${meta.unit}</td>
      <td style="color:var(--text-muted);font-variant-numeric:tabular-nums">${fmt(goal, 0)} ${meta.unit}</td>
      <td style="font-variant-numeric:tabular-nums">${pct}%</td>
      <td class="micro-bar-cell">
        <div class="micro-bar-track">
          <div class="micro-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </td>
      <td><span class="badge badge-${status}">${status}</span></td>
    </tr>`;
}

// ── Modal ────────────────────────────────────────────────────────
function openModal(meal) {
  targetMeal        = meal;
  editingEntryId    = null;
  editingMeal       = null;
  selectedFood      = null;
  creatingCustomFoodId = null;
  document.getElementById('modal-title').textContent = `Add Food to ${MEAL_LABELS[meal]}`;
  document.getElementById('btn-add-confirm').textContent = `Add to ${MEAL_LABELS[meal]}`;
  showSearchStep();
  document.getElementById('search-input').value = '';
  searchResults = [];
  searchQuery   = '';
  searchPage    = 1;
  customResults = storage.getCustomFoods();
  renderSearchResults();
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('search-input').focus();
}

function openModalForEdit(meal, entry) {
  targetMeal     = meal;
  editingEntryId = entry.id;
  editingMeal    = meal;
  selectedFood   = {
    fdcId: entry.fdcId,
    description: entry.name,
    brandOwner:  entry.brand,
    foodNutrients: Object.entries(entry.nutrientsPer100g).map(([id, value]) => ({ nutrientId: +id, value })),
  };
  document.getElementById('modal-title').textContent = 'Edit Serving';
  document.getElementById('btn-add-confirm').textContent = 'Save Changes';
  document.getElementById('serving-food-name').textContent = entry.name;
  document.getElementById('input-grams').value    = entry.servingSizeG;
  document.getElementById('input-servings').value = entry.servingsConsumed;
  document.getElementById('label-scan-status').textContent = '';
  showServingStep();
  updatePreview();
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  stopScanner();
  if (abortController) { abortController.abort(); abortController = null; }
}

function showSearchStep() {
  stopScanner();
  document.getElementById('scan-step').style.display         = 'none';
  document.getElementById('search-step').style.display       = 'flex';
  document.getElementById('serving-step').style.display      = 'none';
  document.getElementById('create-food-step').style.display  = 'none';
}

function showServingStep() {
  document.getElementById('search-step').style.display       = 'none';
  document.getElementById('serving-step').style.display      = 'flex';
  document.getElementById('create-food-step').style.display  = 'none';
}

function showCreateFoodStep() {
  document.getElementById('search-step').style.display       = 'none';
  document.getElementById('serving-step').style.display      = 'none';
  document.getElementById('create-food-step').style.display  = 'flex';
  document.getElementById('modal-title').textContent         = 'Create Custom Food';
  creatingCustomFoodId = null;
  clearCreateForm();
  document.getElementById('create-name').focus();
}

// ── Search ───────────────────────────────────────────────────────
function bindStaticEvents() {
  document.getElementById('btn-prev').addEventListener('click', () => {
    currentDate = prevDay(currentDate);
    updateUrlDate();
    refresh();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    currentDate = nextDay(currentDate);
    updateUrlDate();
    refresh();
  });

  document.getElementById('btn-today').addEventListener('click', () => {
    currentDate = todayStr();
    updateUrlDate();
    refresh();
  });

  document.getElementById('btn-modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    selectedFood = null;
    showSearchStep();
    document.getElementById('search-input').focus();
  });

  document.getElementById('btn-create-back').addEventListener('click', () => {
    showSearchStep();
    document.getElementById('modal-title').textContent =
      editingEntryId ? 'Edit Serving' : `Add Food to ${MEAL_LABELS[targetMeal]}`;
  });

  document.getElementById('btn-create-food').addEventListener('click', showCreateFoodStep);
  document.getElementById('btn-save-custom').addEventListener('click', saveCustomFoodFromForm);

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (q === searchQuery && q !== '') return;
    searchQuery  = q;
    searchPage   = 1;
    searchResults = [];
    clearTimeout(debounceTimer);
    if (!q) {
      customResults = storage.getCustomFoods();
      renderSearchResults();
      return;
    }
    customResults = storage.getCustomFoods().filter(f => {
      const lq = q.toLowerCase();
      return f.name.toLowerCase().includes(lq) || (f.brand && f.brand.toLowerCase().includes(lq));
    });
    debounceTimer = setTimeout(() => runSearch(q, 1, false), 400);
  });

  document.getElementById('input-grams').addEventListener('input', updatePreview);
  document.getElementById('input-servings').addEventListener('input', updatePreview);
  document.getElementById('btn-add-confirm').addEventListener('click', confirmAdd);

  // Barcode scanner
  document.getElementById('btn-scan').addEventListener('click', startScanner);
  document.getElementById('btn-scan-cancel').addEventListener('click', showSearchStep);

  document.getElementById('btn-scan-manual').addEventListener('click', () => {
    const code = document.getElementById('scan-manual-input').value.trim();
    if (code) { stopScanner(); handleBarcode(code); }
  });

  document.getElementById('scan-manual-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const code = e.target.value.trim();
      if (code) { stopScanner(); handleBarcode(code); }
    }
  });

  document.getElementById('scan-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (barcodeDetector) {
        const bitmap = await createImageBitmap(file);
        const barcodes = await barcodeDetector.detect(bitmap);
        bitmap.close();
        if (!barcodes.length) {
          document.getElementById('scan-status').textContent = 'No barcode found in photo. Try again.';
          return;
        }
        await handleBarcode(barcodes[0].rawValue);
      } else if (zxingReader) {
        const url = URL.createObjectURL(file);
        try {
          const result = await zxingReader.decodeFromImageUrl(url);
          await handleBarcode(result.getText());
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      document.getElementById('scan-status').textContent = 'No barcode found in photo. Try again.';
    } finally {
      e.target.value = '';
    }
  });

  // Label scan in serving step
  document.getElementById('label-scan-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    await handleLabelScanForServing(file);
    e.target.value = '';
  });

  // Label scan in create food step
  document.getElementById('create-label-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    await handleLabelScanForCreate(file);
    e.target.value = '';
  });
}

async function runSearch(query, page, append) {
  if (abortController) abortController.abort();
  abortController = new AbortController();

  const spinner = document.getElementById('search-spinner');
  spinner.classList.remove('hidden');

  try {
    const apiKey = storage.getApiKey();
    const data   = await searchFoods(query, apiKey, page, abortController.signal);
    totalHits = data.totalHits || 0;

    if (append) {
      searchResults = [...searchResults, ...(data.foods || [])];
    } else {
      searchResults = data.foods || [];
    }

    renderSearchResults();
  } catch (err) {
    if (err.name === 'AbortError') return;
    document.getElementById('search-results').innerHTML =
      `<div class="error-msg">⚠ ${err.message}</div>`;
  } finally {
    spinner.classList.add('hidden');
  }
}

function renderSearchResults() {
  const allFoods = [...customResults, ...searchResults];

  if (!allFoods.length) {
    if (!searchQuery) {
      document.getElementById('search-results').innerHTML = `
        <div class="search-placeholder">
          <div class="icon">🔍</div>
          <div>Search for any food to get started</div>
          <div style="font-size:.75rem;margin-top:4px;color:var(--text-muted)">Powered by USDA FoodData Central</div>
        </div>`;
    } else {
      document.getElementById('search-results').innerHTML =
        `<div class="search-placeholder"><div class="icon">🤷</div><div>No results found</div></div>`;
    }
    return;
  }

  const foodMap = new Map(allFoods.map(f => [String(f.fdcId), f]));

  let html = '';
  if (customResults.length) {
    if (searchResults.length) html += `<div class="results-section-header">My Foods</div>`;
    html += customResults.map(f => renderResultItem(f, true)).join('');
  }
  if (searchResults.length) {
    if (customResults.length) html += `<div class="results-section-header">USDA Database</div>`;
    html += searchResults.map(f => renderResultItem(f, false)).join('');
    if (searchResults.length < totalHits) {
      html += `<button id="load-more-btn" class="load-more-btn">Load more results</button>`;
    }
  }

  document.getElementById('search-results').innerHTML = html;

  document.getElementById('search-results').querySelectorAll('.result-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.btn-result-delete')) return;
      const food = foodMap.get(el.dataset.fdcid);
      if (food) selectFood(food);
    });
  });

  document.getElementById('search-results').querySelectorAll('.btn-result-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Remove from My Foods?')) return;
      const id = btn.dataset.customId;
      storage.deleteCustomFood(id);
      customResults = customResults.filter(f => String(f.fdcId) !== id);
      renderSearchResults();
      showToast('Food removed from My Foods');
    });
  });

  const loadMore = document.getElementById('load-more-btn');
  if (loadMore) {
    loadMore.addEventListener('click', () => {
      searchPage++;
      runSearch(searchQuery, searchPage, true);
    });
  }
}

function renderResultItem(food, isCustom) {
  const nutrients = extractNutrients(food);
  const cal     = Math.round(nutrients[1008] || 0);
  const protein = fmt(nutrients[1003] || 0, 1);
  const carbs   = fmt(nutrients[1005] || 0, 1);
  const fat     = fmt(nutrients[1004] || 0, 1);
  const brand   = foodBrand(food);
  const fdcId   = escHtml(String(food.fdcId));

  const badge = isCustom ? `<span class="badge-my-food">MY FOOD</span>` : '';

  const rightHTML = isCustom
    ? `<div class="result-right">
         <div class="result-cal">${cal} kcal</div>
         <button class="btn-result-delete" data-custom-id="${fdcId}" title="Delete from My Foods">
           <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
             <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
           </svg>
         </button>
       </div>`
    : `<div class="result-cal">${cal} kcal</div>`;

  return `
    <div class="result-item${isCustom ? ' result-item-custom' : ''}" data-fdcid="${fdcId}">
      <div class="result-info">
        <div class="result-name">${escHtml(foodDisplayName(food))}${badge}</div>
        ${brand ? `<div class="result-brand">${escHtml(brand)}</div>` : ''}
        <div class="result-macros">P ${protein}g · C ${carbs}g · F ${fat}g <span style="font-size:.65rem;color:var(--text-muted)">(per 100g)</span></div>
      </div>
      ${rightHTML}
    </div>`;
}

function selectFood(food) {
  // If a corrected custom version of this database food exists, use it instead
  if (!food._isCustom) {
    const corrected = storage.getCustomFoods().find(f => f._originalFdcId === String(food.fdcId));
    if (corrected) food = corrected;
  }
  selectedFood = food;
  document.getElementById('serving-food-name').textContent = foodDisplayName(food);
  const defaultG = food._servingQty || parseServingGrams(food._servingSize) || 100;
  document.getElementById('input-grams').value    = defaultG;
  document.getElementById('input-servings').value = 1;
  document.getElementById('btn-add-confirm').textContent = `Add to ${MEAL_LABELS[targetMeal]}`;
  document.getElementById('label-scan-status').textContent = '';
  showServingStep();
  updatePreview();
  document.getElementById('input-grams').focus();
}

// ── Serving Preview ──────────────────────────────────────────────
function updatePreview() {
  if (!selectedFood) return;
  const grams    = parseFloat(document.getElementById('input-grams').value)    || 0;
  const servings = parseFloat(document.getElementById('input-servings').value) || 0;
  const totalG   = grams * servings;

  document.getElementById('total-display').textContent = `Total: ${fmt(totalG, 0)}g`;

  const nutrients = extractNutrients(selectedFood);
  const scaled    = scaleNutrients(nutrients, grams, servings);

  const previewItems = [
    { id: 1008, label: 'Calories', unit: 'kcal', decimals: 0 },
    { id: 1003, label: 'Protein',  unit: 'g',    decimals: 1 },
    { id: 1005, label: 'Carbs',    unit: 'g',    decimals: 1 },
    { id: 1004, label: 'Fat',      unit: 'g',    decimals: 1 },
    { id: 1079, label: 'Fiber',    unit: 'g',    decimals: 1 },
    { id: 1162, label: 'Vit C',    unit: 'mg',   decimals: 1 },
  ].map(({ id, label, unit, decimals }) => `
    <div class="preview-item">
      <div class="preview-value">${fmt(scaled[id] || 0, decimals)}</div>
      <div class="preview-label">${label}</div>
      <div class="preview-unit">${unit}</div>
    </div>`).join('');

  document.getElementById('nutrient-preview-grid').innerHTML = previewItems;
}

// ── Confirm Add ──────────────────────────────────────────────────
function confirmAdd() {
  if (!selectedFood) return;
  const grams    = parseFloat(document.getElementById('input-grams').value)    || 100;
  const servings = parseFloat(document.getElementById('input-servings').value) || 1;

  const entry = {
    id:               editingEntryId || crypto.randomUUID(),
    fdcId:            selectedFood.fdcId,
    name:             foodDisplayName(selectedFood),
    brand:            foodBrand(selectedFood),
    servingSizeG:     grams,
    servingsConsumed: servings,
    nutrientsPer100g: extractNutrients(selectedFood),
    addedAt:          new Date().toISOString(),
  };

  if (editingEntryId) {
    storage.updateEntry(currentDate, editingMeal, editingEntryId, {
      servingSizeG:     entry.servingSizeG,
      servingsConsumed: entry.servingsConsumed,
      nutrientsPer100g: entry.nutrientsPer100g,
    });
  } else {
    storage.addEntry(currentDate, targetMeal, entry);
  }

  closeModal();
  refresh();
  showToast(editingEntryId ? 'Entry updated' : `Added to ${MEAL_LABELS[targetMeal]}`);
}

// ── Label Scan (serving step) ────────────────────────────────────
async function handleLabelScanForServing(file) {
  const groqKey = storage.getGroqApiKey();
  if (!groqKey) {
    showToast('Add your Gemini API key in Settings first');
    return;
  }

  const statusEl = document.getElementById('label-scan-status');
  statusEl.textContent = 'Reading label…';

  try {
    const { b64, mimeType } = await fileToBase64(file);
    const labelData = await extractNutritionLabel(b64, mimeType, groqKey);
    const nutrients = labelDataToNutrients(labelData);

    if (selectedFood) {
      // Merge: update existing nutrient values from label, keep others
      const existing = Object.fromEntries(
        (selectedFood.foodNutrients || []).map(n => [n.nutrientId, n.value])
      );
      const merged = { ...existing, ...Object.fromEntries(Object.entries(nutrients).map(([k, v]) => [+k, v])) };
      selectedFood.foodNutrients = Object.entries(merged).map(([id, value]) => ({ nutrientId: +id, value }));

      if (labelData.serving_size_g) {
        document.getElementById('input-grams').value = labelData.serving_size_g;
      }
      updatePreview();

      statusEl.innerHTML = `✓ Values updated. <button id="btn-save-label-food" class="btn-save-label-food">Save corrected version to My Foods</button>`;
      document.getElementById('btn-save-label-food').addEventListener('click', () => {
        const name  = foodDisplayName(selectedFood);
        const brand = foodBrand(selectedFood);
        const servingSizeG = parseFloat(document.getElementById('input-grams').value) || 100;
        const nutrientsPer100g = Object.fromEntries(
          selectedFood.foodNutrients.map(n => [n.nutrientId, n.value])
        );
        const id = 'custom_' + crypto.randomUUID();
        storage.saveCustomFood({
          id, name, brand, servingSizeG, nutrientsPer100g,
          createdAt: new Date().toISOString(),
          fdcId: id, description: name, brandOwner: brand,
          foodNutrients: selectedFood.foodNutrients,
          _isCustom: true, _servingQty: servingSizeG,
          _originalFdcId: String(selectedFood.fdcId),
        });
        statusEl.textContent = `✓ Saved "${name}" to My Foods with corrected values`;
        showToast('Saved to My Foods');
      });
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

// ── Label Scan (create food step) ────────────────────────────────
async function handleLabelScanForCreate(file) {
  const groqKey = storage.getGroqApiKey();
  if (!groqKey) {
    showToast('Add your Gemini API key in Settings first');
    return;
  }

  const statusEl = document.getElementById('create-scan-status');
  statusEl.textContent = 'Reading label…';
  statusEl.style.display = 'block';

  try {
    const { b64, mimeType } = await fileToBase64(file);
    const labelData = await extractNutritionLabel(b64, mimeType, groqKey);
    const nutrients = labelDataToNutrients(labelData);
    fillCreateFormFromNutrients(nutrients, labelData.serving_size_g);
    statusEl.textContent = '✓ Label read — review values below and save';
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

// ── Custom Food Creator ──────────────────────────────────────────
function clearCreateForm() {
  document.getElementById('create-name').value    = '';
  document.getElementById('create-brand').value   = '';
  document.getElementById('create-serving').value = '100';
  for (const id of CUSTOM_NUTRIENT_IDS) {
    const el = document.getElementById(`cn-${id}`);
    if (el) el.value = '';
  }
  document.getElementById('create-scan-status').textContent = '';
  document.getElementById('create-scan-status').style.display = 'none';
}

function fillCreateFormFromNutrients(nutrients, servingSizeG) {
  if (servingSizeG) document.getElementById('create-serving').value = servingSizeG;
  for (const [id, val] of Object.entries(nutrients)) {
    const el = document.getElementById(`cn-${id}`);
    if (el && val != null) el.value = Number(val).toFixed(1);
  }
}

function saveCustomFoodFromForm() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) {
    showToast('Please enter a food name');
    document.getElementById('create-name').focus();
    return;
  }

  const brand       = document.getElementById('create-brand').value.trim() || null;
  const servingSizeG = parseFloat(document.getElementById('create-serving').value) || 100;

  const nutrientsPer100g = {};
  for (const id of CUSTOM_NUTRIENT_IDS) {
    const el = document.getElementById(`cn-${id}`);
    if (el && el.value !== '') {
      const val = parseFloat(el.value);
      if (!isNaN(val) && val >= 0) nutrientsPer100g[id] = val;
    }
  }

  const id = creatingCustomFoodId || ('custom_' + crypto.randomUUID());
  const foodNutrients = Object.entries(nutrientsPer100g).map(([nid, val]) => ({ nutrientId: +nid, value: val }));

  const customFood = {
    id,
    name,
    brand,
    servingSizeG,
    nutrientsPer100g,
    createdAt: new Date().toISOString(),
    // USDA-compatible fields so existing extract/display functions work
    fdcId:       id,
    description: name,
    brandOwner:  brand,
    foodNutrients,
    _isCustom:   true,
    _servingQty: servingSizeG,
  };

  storage.saveCustomFood(customFood);
  showToast(`"${name}" saved to My Foods`);
  selectFood(customFood);
}

// ── Helpers ──────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result  = reader.result;
      const b64     = result.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      resolve({ b64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateUrlDate() {
  const url = new URL(window.location);
  if (currentDate === todayStr()) {
    url.searchParams.delete('date');
  } else {
    url.searchParams.set('date', currentDate);
  }
  history.replaceState(null, '', url);
}

function showToast(msg) {
  const existing = document.querySelector('.success-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'success-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ── Barcode Scanner ──────────────────────────────────────────────
async function initBarcodeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      barcodeDetector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      return;
    } catch { /* not supported */ }
  }
  // Fallback for iOS/browsers without native BarcodeDetector (e.g. Chrome on iPhone)
  try {
    const { BrowserMultiFormatReader } = await import('https://esm.sh/@zxing/browser@0.1.4');
    zxingReader = new BrowserMultiFormatReader();
  } catch { /* ZXing unavailable */ }
}

async function startScanner() {
  // Lazy-init: only load detector/ZXing when user actually taps scan
  if (!barcodeDetector && !zxingReader) await initBarcodeDetector();

  document.getElementById('search-step').style.display  = 'none';
  document.getElementById('scan-step').style.display    = 'flex';
  document.getElementById('scan-status').textContent    = 'Point camera at a barcode';
  document.getElementById('scan-manual-input').value    = '';

  if (!barcodeDetector && !zxingReader) {
    document.getElementById('scan-status').textContent = 'Barcode scanning not supported. Enter barcode manually below.';
    return;
  }

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const video = document.getElementById('scan-video');
    video.srcObject = scanStream;
    await video.play();

    if (barcodeDetector) {
      scanFrames(video);
    } else {
      // ZXing continuous scan from the live stream
      zxingControls = await zxingReader.decodeFromStream(scanStream, video, (result, err) => {
        if (result) {
          stopScanner();
          handleBarcode(result.getText());
        }
      });
    }
  } catch {
    document.getElementById('scan-status').textContent = 'Camera unavailable. Take a photo instead.';
    document.getElementById('scan-file-label').style.display = 'flex';
  }
}

async function scanFrames(video) {
  if (!scanStream || !barcodeDetector) return;
  try {
    const barcodes = await barcodeDetector.detect(video);
    if (barcodes.length > 0) {
      stopScanner();
      await handleBarcode(barcodes[0].rawValue);
      return;
    }
  } catch { /* frame not ready yet */ }
  scanAnimFrame = requestAnimationFrame(() => scanFrames(video));
}

function stopScanner() {
  if (scanAnimFrame) { cancelAnimationFrame(scanAnimFrame); scanAnimFrame = null; }
  if (zxingControls) { try { zxingControls.stop(); } catch {} zxingControls = null; }
  if (scanStream)    { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const video = document.getElementById('scan-video');
  if (video) video.srcObject = null;
  document.getElementById('scan-file-label').style.display = 'none';
}

async function handleBarcode(barcode) {
  document.getElementById('scan-status').textContent = `Looking up ${barcode}…`;
  try {
    const product = await lookupBarcode(barcode);
    selectFood(offProductToFood(product, barcode));
    return;
  } catch { /* not in OFF — try USDA */ }

  try {
    document.getElementById('scan-status').textContent = 'Not in Open Food Facts — trying USDA…';
    const apiKey = storage.getApiKey();
    const food   = await searchByBarcode(barcode, apiKey);
    if (!food) throw new Error('not found in either database');
    selectFood(food);
  } catch {
    document.getElementById('scan-status').textContent = 'Not found. Try searching by name instead.';
    setTimeout(() => {
      if (document.getElementById('scan-step').style.display !== 'none') startScanner();
    }, 2500);
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
