/** Persistencia en localStorage con tolerancia a errores (modo privado, cuota…). */
const PREFIX = 'ajedrez3d.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
export function loadRaw(key) {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}
export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* nada */ }
}
