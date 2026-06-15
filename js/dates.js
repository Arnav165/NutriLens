export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDate(str) {
  // Parse YYYY-MM-DD as local time (avoid UTC offset issues)
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(parseDate(str));
}

export function prevDay(str) {
  const d = parseDate(str);
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

export function nextDay(str) {
  const d = parseDate(str);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isToday(str) {
  return str === todayStr();
}

export function displayDate(str) {
  const d = parseDate(str);
  if (isToday(str)) return 'Today';
  const diff = Math.round((parseDate(todayStr()) - d) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function longDisplayDate(str) {
  if (isToday(str)) {
    const d = parseDate(str);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  const d = parseDate(str);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
