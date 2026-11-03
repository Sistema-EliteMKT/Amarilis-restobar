// Sabe se a internet está funcionando de verdade. O navegador só sabe se o Wi-Fi está ligado:
// quando o Wi-Fi continua ligado mas a internet do roteador cai, ele ainda diz "online".
// Por isso, de tempos em tempos, testa se o servidor do banco responde.
let ok = navigator.onLine;
const ouvintes = new Set();
export const temInternet = () => ok && navigator.onLine;
export const aoMudarRede = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

function marcar(v) {
  if (v === ok) return;
  ok = v;
  for (const fn of ouvintes) { try { fn(temInternet()); } catch (e) { console.error(e); } }
}

async function testar() {
  if (!navigator.onLine) return marcar(false);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 5000);
  try {
    await fetch("https://firestore.googleapis.com/?teste=" + Date.now(), { mode: "no-cors", cache: "no-store", signal: c.signal });
    marcar(true);
  } catch { marcar(false); } finally { clearTimeout(t); }
}

let ligado = false;
export function vigiarRede() {
  if (ligado) return;
  ligado = true;
  window.addEventListener("online", testar);
  window.addEventListener("offline", () => marcar(false));
  const ciclo = async () => { await testar(); setTimeout(ciclo, ok ? 20000 : 6000); };
  ciclo();
}
