// Alarme de pedido novo pelo cardápio online (como no iFood): toque de telefone que se repete
// até alguém aceitar o pedido ou tocar em "Silenciar", e notificação do computador
// (aparece mesmo com o caixa minimizado ou atrás do WhatsApp).
// Liga/desliga por computador (fica guardado neste navegador).
import { esc, brl } from "./ui.js";

const K = "se_som";
export const lerSom = () => { try { return { ligado: true, ...(JSON.parse(localStorage.getItem(K)) || {}) }; } catch { return { ligado: true }; } };
const gravarSom = (v) => { try { localStorage.setItem(K, JSON.stringify({ ...lerSom(), ...v })); } catch {} };

// Toque de telefone gerado aqui mesmo (sem arquivo): dois "trrrim" e uma pausa, em loop.
// É um <audio> em loop: continua tocando com a janela minimizada (o navegador não pausa áudio).
let audio = null;
function criarToque() {
  const taxa = 22050, dur = 3.0, n = Math.floor(taxa * dur);
  const dados = new Int16Array(n);
  const trim = (t0, t1) => (t) => t >= t0 && t < t1;
  const tocando = [trim(0, 0.45), trim(0.6, 1.05)];
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    if (!tocando.some((f) => f(t))) continue;
    // campainha: dois tons misturados, "tremendo" 20 vezes por segundo
    const trem = Math.sin(2 * Math.PI * 20 * t) > 0 ? 1 : 0.35;
    const v = (Math.sin(2 * Math.PI * 1046 * t) + 0.8 * Math.sin(2 * Math.PI * 1318 * t)) * trem;
    dados[i] = Math.max(-1, Math.min(1, v * 0.42)) * 32767;
  }
  const buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
  const s = (o, txt) => [...txt].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  s(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, taxa, true); dv.setUint32(28, taxa * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  s(36, "data"); dv.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(dados);
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
  a.loop = true;
  a.volume = 1;
  return a;
}

let tocandoAgora = false, bloqueado = false;
function tocar() {
  audio ||= criarToque();
  if (tocandoAgora && !audio.paused) return;
  tocandoAgora = true;
  audio.play().then(() => { bloqueado = false; desenharFaixa(); }).catch(() => { bloqueado = true; tocandoAgora = false; desenharFaixa(); });
}
function parar() {
  tocandoAgora = false;
  if (audio) { audio.pause(); audio.currentTime = 0; }
}
// O navegador só deixa tocar som depois de um clique na página: no primeiro clique, destrava.
document.addEventListener("pointerdown", () => { if (bloqueado && pendentes().length && lerSom().ligado) tocar(); }, true);

// ------------------------------------------------------------ estado
const silenciados = new Set();
const notificados = new Set();
let novos = [];
let irParaPedidos = () => {};
const pendentes = () => novos.filter((p) => !silenciados.has(p.id));

function notificar(p) {
  if (notificados.has(p.id)) return;
  notificados.add(p.id);
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const tipo = p.tipo === "entrega" ? "Delivery" : p.tipo === "retirada" ? "Retirada" : "Pedido";
    const total = (p.itens || []).filter((i) => !i.cancelado).reduce((s, i) => s + i.unit * i.qtd, 0) + (Number(p.taxaEntrega) || 0) - (Number(p.descontoCupom) || 0);
    const n = new Notification("🔔 Pedido novo pelo app", { body: `${tipo} · ${p.cliente?.nome || ""} · ${brl(total)}`, tag: `pedido-${p.id}`, requireInteraction: true });
    n.onclick = () => { window.focus(); irParaPedidos(); n.close(); };
  } catch {}
}

// Chamado pelo caixa a cada mudança: lista dos pedidos online que ainda estão "novos".
export function alarmePedidos(lista, { primeira = false, ver } = {}) {
  if (ver) irParaPedidos = ver;
  novos = lista;
  const ids = new Set(lista.map((p) => p.id));
  for (const id of [...silenciados]) if (!ids.has(id)) silenciados.delete(id);
  if (primeira) lista.forEach((p) => notificados.add(p.id)); // ao abrir o caixa, não notifica os antigos (mas toca)
  else lista.forEach(notificar);
  if (pendentes().length && lerSom().ligado) tocar(); else parar();
  desenharFaixa();
}

export function silenciar() { novos.forEach((p) => silenciados.add(p.id)); parar(); desenharFaixa(); }

export function alternarSom() {
  const ligado = !lerSom().ligado;
  gravarSom({ ligado });
  if (ligado) testarSom(); else parar();
  if (ligado && pendentes().length) tocar();
  return ligado;
}

export function testarSom() {
  audio ||= criarToque();
  pedirNotificacao();
  audio.loop = false;
  audio.currentTime = 0;
  audio.play().catch(() => {}).finally(() => setTimeout(() => { audio.loop = true; }, 50));
}

export function pedirNotificacao() {
  try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().then(desenharFaixa); } catch {}
}

// Faixa no topo da tela enquanto houver pedido novo esperando.
function desenharFaixa() {
  let el = document.getElementById("alarmeFaixa");
  const pend = pendentes();
  if (!pend.length && !(bloqueado && novos.length)) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div");
    el.id = "alarmeFaixa";
    el.className = "alarme-faixa";
    el.setAttribute("role", "alert");
    document.body.appendChild(el);
  }
  const qtd = novos.length;
  el.innerHTML = `<span class="alarme-sino">🔔</span><div class="alarme-txt"><b>${qtd} ${qtd > 1 ? "pedidos novos" : "pedido novo"} pelo app</b>
      <small>${esc(novos.map((p) => p.cliente?.nome || "").filter(Boolean).slice(0, 3).join(", "))}${bloqueado ? " · toque aqui para ligar o som" : ""}</small></div>
    <button class="btn sm" data-al="ver">Ver pedidos</button>${pend.length && !bloqueado ? `<button class="btn sm ghost" data-al="sil">Silenciar</button>` : ""}`;
  el.querySelector('[data-al="ver"]').onclick = () => { if (bloqueado) tocar(); irParaPedidos(); };
  const sil = el.querySelector('[data-al="sil"]');
  if (sil) sil.onclick = silenciar;
  el.onclick = (e) => { if (bloqueado && !e.target.closest("button")) tocar(); };
}

export function pararAlarme() { novos = []; parar(); desenharFaixa(); }
