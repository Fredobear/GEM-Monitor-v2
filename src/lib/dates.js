// Operacje na datach w UTC. Daty przechowujemy jako 'YYYY-MM-DD', miesiące jako 'YYYY-MM'.

export const toISO = (d) => d.toISOString().slice(0, 10);
export const parseISO = (iso) => new Date(`${iso}T00:00:00Z`);
export const monthOf = (iso) => iso.slice(0, 7);

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  const year = Math.floor(t / 12);
  const month = t - year * 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function lastDayOfMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}

// Ostatni dzień roboczy (pn–pt) miesiąca. Święta giełdowe obsługuje tolerancja w walidacji.
export function lastWeekdayOfMonth(monthKey) {
  const d = parseISO(lastDayOfMonth(monthKey));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return toISO(d);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

// Ta sama data N miesięcy wcześniej/później; 31.03 - 1M = 28/29.02.
export function shiftMonthsISO(iso, n) {
  const target = addMonths(monthOf(iso), n);
  const day = Math.min(Number(iso.slice(8, 10)), Number(lastDayOfMonth(target).slice(8, 10)));
  return `${target}-${String(day).padStart(2, '0')}`;
}

const MONTHS_NOM = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

// „listopad 2026”
export const monthNamePL = (monthKey) => `${MONTHS_NOM[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`;
// „koniec października 2026”
export const monthGenitivePL = (monthKey) => `${MONTHS_GEN[Number(monthKey.slice(5, 7)) - 1]} ${monthKey.slice(0, 4)}`;
// „2 listopada 2026”
export const datePL = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
