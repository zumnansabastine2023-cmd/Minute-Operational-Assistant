// Preserve the existing Monday-through-today UTC default.
export function currentWeek(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) }
}
