// Utilidades de tela: formatação, avisos, janelas (sheets) e som.
import { MARCA } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const hora = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
export const dataHora = (t) => (t ? new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
export const hoje = (t = Date.now()) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const minutos = (t) => Math.max(0, Math.round((Date.now() - t) / 60000));
export const numero = (s) => {
  const n = parseFloat(String(s ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
export const valorCampo = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");

export function toast(t, tipo = "") {
  const e = $("#toast");
  e.textContent = t;
  e.className = "toast on " + tipo;
  clearTimeout(e._t);
  e._t = setTimeout(() => (e.className = "toast"), 3000);
}

export function erro(e) {
  console.error(e);
  toast(e?.message || "Algo deu errado.", "ruim");
}

// Duas camadas: a janela principal (#sheet) e uma por cima (#sheet2), usada para
// montar item, confirmar e digitar texto sem perder o que está aberto embaixo.
const foco = {};
export function abrirSheet(html, { largo = false, nivel = 1 } = {}) {
  const id = nivel === 2 ? "#sheet2" : "#sheet";
  const s = $(id);
  if (!s.classList.contains("on")) foco[id] = document.activeElement;
  s.innerHTML = html;
  s.classList.toggle("largo", largo);
  s.classList.add("on");
  $("#scrim").classList.add("on");
  s.scrollTop = 0;
  const x = $(".x", s);
  if (x) { x.onclick = fecharSheet; x.focus(); }
  return s;
}
export function fecharSheet() {
  const id = $("#sheet2").classList.contains("on") ? "#sheet2" : "#sheet";
  $(id).classList.remove("on");
  if (!$("#sheet").classList.contains("on") && !$("#sheet2").classList.contains("on")) $("#scrim").classList.remove("on");
  foco[id]?.focus?.();
}
export function fecharTudo() {
  $("#sheet2").classList.remove("on");
  $("#sheet").classList.remove("on");
  $("#scrim").classList.remove("on");
}
export const sheetAberto = () => $("#sheet").classList.contains("on");

export const cabecalhoSheet = (titulo, sub = "") =>
  `<div class="sh-h"><div><h3>${esc(titulo)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div><button class="x" aria-label="Fechar">×</button></div>`;

export function confirmar(titulo, texto, { ok = "Confirmar", perigo = false } = {}) {
  return new Promise((res) => {
    const s = abrirSheet(`${cabecalhoSheet(titulo)}<div class="sh-b"><p>${esc(texto)}</p>
      <div class="linha-btn"><button class="btn sec" data-r="0">Voltar</button><button class="btn ${perigo ? "perigo" : "pri"}" data-r="1">${esc(ok)}</button></div></div>`, { nivel: 2 });
    $$("[data-r]", s).forEach((b) => (b.onclick = () => { fecharSheet(); res(b.dataset.r === "1"); }));
    $(".x", s).onclick = () => { fecharSheet(); res(false); };
  });
}

export function pedirTexto(titulo, rotulo, { valor = "", ok = "Salvar", tipo = "text" } = {}) {
  return new Promise((res) => {
    const s = abrirSheet(`${cabecalhoSheet(titulo)}<div class="sh-b"><label class="f" for="pt">${esc(rotulo)}</label>
      <input class="in" id="pt" type="${tipo}" value="${esc(valor)}">
      <div class="linha-btn"><button class="btn sec" data-r="0">Voltar</button><button class="btn pri" data-r="1">${esc(ok)}</button></div></div>`, { nivel: 2 });
    const inp = $("#pt", s);
    setTimeout(() => inp.focus(), 50);
    const fim = (v) => { fecharSheet(); res(v); };
    inp.onkeydown = (e) => { if (e.key === "Enter") fim(inp.value.trim()); };
    $$("[data-r]", s).forEach((b) => (b.onclick = () => fim(b.dataset.r === "1" ? inp.value.trim() : null)));
    $(".x", s).onclick = () => fim(null);
  });
}

let audio;
export function bip(vezes = 2) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < vezes; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.22;
      o.frequency.value = 880;
      o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    }
  } catch {}
}

export const rodapeMarca = () =>
  `<footer class="marca"><img src="${esc(MARCA.logo)}" alt="" width="22" height="22"><span><b>${esc(MARCA.sistema)}</b> · desenvolvido por ${esc(MARCA.empresa)}${MARCA.site ? ` · ${esc(MARCA.site)}` : ""}</span></footer>`;

// Setas ‹ › nas pontas de uma fileira de abas que rola para o lado (no computador não dá para "arrastar").
export function setasRolagem(el) {
  if (!el || el.parentNode?.classList.contains("chips-setas")) return;
  const wrap = document.createElement("div");
  wrap.className = "chips-setas";
  el.parentNode.insertBefore(wrap, el);
  const botao = (dir) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "seta"; b.textContent = dir < 0 ? "‹" : "›";
    b.setAttribute("aria-label", dir < 0 ? "Abas anteriores" : "Mais abas");
    b.onclick = () => el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.7), behavior: "smooth" });
    return b;
  };
  const esq = botao(-1), dir = botao(1);
  wrap.append(esq, el, dir);
  const atual = () => { esq.hidden = el.scrollLeft < 4; dir.hidden = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4; };
  el.addEventListener("scroll", atual, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(atual).observe(el);
  atual();
}

// Aviso com botão (ex.: "Desfazer") que fica alguns segundos na parte de baixo da tela.
export function avisoDesfazer(texto, aoClicar, { botao = "Desfazer", ms = 15000 } = {}) {
  document.querySelector(".aviso-acao")?.remove();
  const el = document.createElement("div");
  el.className = "aviso-acao";
  el.setAttribute("role", "status");
  el.innerHTML = `<span></span><button type="button"></button>`;
  el.firstChild.textContent = texto;
  const b = el.querySelector("button");
  b.textContent = botao;
  b.onclick = async () => { b.disabled = true; try { await aoClicar(); } finally { el.remove(); } };
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Campo de busca em cima de uma lista de escolha (ex.: bairros): digita parte do nome e a lista filtra.
// Opções com valor vazio ("Escolha…", "Outra taxa…") ficam sempre. Com um só resultado, ele já fica escolhido.
export function buscaNaLista(select, { placeholder = "Buscar…" } = {}) {
  if (!select || select.dataset.busca) return;
  select.dataset.busca = "1";
  const sem = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const todas = [...select.options].map((o) => ({ value: o.value, text: o.textContent, fixo: o.value === "" }));
  const inp = document.createElement("input");
  inp.className = "in busca-lista"; inp.type = "search"; inp.placeholder = placeholder; inp.autocomplete = "off";
  inp.setAttribute("aria-label", placeholder);
  select.before(inp);
  inp.oninput = () => {
    const q = sem(inp.value.trim()), antes = select.value;
    const vis = todas.filter((o) => o.fixo || !q || sem(o.text).includes(q));
    select.innerHTML = vis.map((o) => `<option value="${esc(o.value)}">${esc(o.text)}</option>`).join("");
    const achados = vis.filter((o) => !o.fixo);
    let novo;
    if (q && achados.length === 1) novo = achados[0].value; // só um bairro bate: já escolhe
    else if (vis.some((o) => o.value === antes)) novo = antes; // o escolhido continua na lista
    else novo = (q && achados[0]?.value) || vis[0]?.value || "";
    select.value = novo;
    if (select.value !== antes) select.dispatchEvent(new Event("change"));
  };
}

// Ícones de linha (traço), usados no menu e nos números do caixa.
const ICONES = {
  pedidos: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6M16 12h-6M12 16h-2"/>',
  mesas: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  fluxo: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  motoboys: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
  equipe: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  relatorio: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  impressao: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  cardapio: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  promocoes: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
  ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  dinheiro: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  mais: '<path d="M5 12h14M12 5v14"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  celular: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  pessoas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
};
export const icone = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n] || ""}</svg>`;
// "há 1h05" a partir de um horário (ms).
export const tempoDesde = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
