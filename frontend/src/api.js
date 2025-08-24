// api.js
const envBase = import.meta.env.VITE_BACKEND_URL;
// Fallback: same host as the page, port 3010
const autoBase = `${window.location.protocol}//${window.location.hostname}:3010`;
const base = envBase || autoBase;

export async function apiGet(path) {
  const r = await fetch(`${base}${path}`);
  return r.json();
}
export async function apiPost(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  return r.json();
}
export async function apiDelete(path) {
  const r = await fetch(`${base}${path}`, { method: "DELETE" });
  return r.json();
}
export function backendBase() { return base; }

// Helpers
export function validateNumber(n) {
  const only = (n || "").replace(/\D/g, "");
  return only.length >= 10 ? only : null;
}
export function dedupeNumbers(arr) {
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const v = validateNumber(raw);
    if (v && !seen.has(v)) { out.push(v); seen.add(v); }
  }
  return out;
}
export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
