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
