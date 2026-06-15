import { DEFAULT_GOALS } from './nutrients.js';
import { GROQ_API_KEY, USDA_API_KEY as DEFAULT_USDA_KEY } from './config.js';

const LOGS_KEY     = 'nutrition_logs';
const GOALS_KEY    = 'nutrition_goals';
const SETTINGS_KEY = 'nutrition_settings';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

function emptyLog(date) {
  return {
    date,
    entries: Object.fromEntries(MEALS.map(m => [m, []])),
  };
}

function getAllLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAllLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export function getLog(date) {
  const logs = getAllLogs();
  return logs[date] || emptyLog(date);
}

export function addEntry(date, meal, entry) {
  const logs = getAllLogs();
  if (!logs[date]) logs[date] = emptyLog(date);
  logs[date].entries[meal].push(entry);
  saveAllLogs(logs);
}

export function deleteEntry(date, meal, entryId) {
  const logs = getAllLogs();
  if (!logs[date]) return;
  logs[date].entries[meal] = logs[date].entries[meal].filter(e => e.id !== entryId);
  saveAllLogs(logs);
}

export function updateEntry(date, meal, entryId, updates) {
  const logs = getAllLogs();
  if (!logs[date]) return;
  logs[date].entries[meal] = logs[date].entries[meal].map(e =>
    e.id === entryId ? { ...e, ...updates } : e
  );
  saveAllLogs(logs);
}

export function getGoals() {
  try {
    const stored = JSON.parse(localStorage.getItem(GOALS_KEY) || 'null');
    return stored ? { ...DEFAULT_GOALS, ...stored } : { ...DEFAULT_GOALS };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

export function setGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function getApiKey() {
  return getSettings().usdaApiKey || DEFAULT_USDA_KEY;
}

export function getGeminiApiKey() {
  return getSettings().geminiApiKey || GROQ_API_KEY;
}

const CUSTOM_FOODS_KEY = 'custom_foods';

export function getCustomFoods() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY) || '[]');
  } catch { return []; }
}

export function saveCustomFood(food) {
  const foods = getCustomFoods();
  const idx = foods.findIndex(f => f.id === food.id);
  if (idx >= 0) foods[idx] = food;
  else foods.push(food);
  localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
}

export function deleteCustomFood(id) {
  const foods = getCustomFoods().filter(f => f.id !== id);
  localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(foods));
}
