// Taxa de entrega por raio (distância em linha reta do restaurante) com mapa.
// Endereço pelo CEP (ViaCEP), pela localização do celular ou marcando no mapa.
// Mapa: Leaflet (pasta assets/leaflet) com os mapas do OpenStreetMap; busca de endereço: Nominatim.
import { $, esc, brl } from "./ui.js";

const BASE = new URL("../assets/leaflet/", import.meta.url).href;
export const CENTRO_PADRAO = [-22.5727, -47.1727, 14]; // Artur Nogueira, só até a loja ser marcada em Ajustes

export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180, R = 6371;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const kmTxt = (v) => (v == null ? "" : v.toFixed(1).replace(".", ",") + " km");

// Raios da loja, do menor para o maior: [{ km, taxa }]
export const raiosDe = (lj) => (lj.raios || []).filter((r) => Number(r.km) > 0).map((r) => ({ km: Number(r.km), taxa: Number(r.taxa) || 0 })).sort((a, b) => a.km - b.km);
export const lojaPonto = (lj) => (Number.isFinite(Number(lj.entregaLat)) && lj.entregaLat !== "" && lj.entregaLat != null && lj.entregaLng != null ? [Number(lj.entregaLat), Number(lj.entregaLng)] : null);
// Áreas desenhadas no mapa: [{ nome, taxa, pontos: [{ lat, lng }, ...] }] (o Firestore não guarda lista dentro de lista, por isso objetos).
export const zonasDe = (lj) => (lj.zonas || []).filter((z) => (z.pontos || []).length >= 3).map((z) => ({ nome: z.nome || "Área", taxa: Number(z.taxa) || 0, pontos: z.pontos }));
// A taxa de entrega é pela lista de bairros (Ajustes > Entrega por bairro). O cálculo pelo mapa foi desligado
// a pedido da loja (as áreas davam taxa errada); as funções do mapa ficam aqui caso queiram voltar.
export const entregaPorMapa = () => false;
export const entregaPorRaio = entregaPorMapa;

// Ponto dentro do polígono (traçado de raio).
export function dentroDe(ponto, pontos) {
  const [y, x] = ponto;
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const yi = pontos[i].lat, xi = pontos[i].lng, yj = pontos[j].lat, xj = pontos[j].lng;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Taxa para um ponto: primeiro as áreas desenhadas, depois os raios. Retorna
// { taxa, area?, km?, ate? } ou { fora: true, km?, max? } quando não cai em nada.
export function taxaDoPonto(lj, ponto) {
  const loja = lojaPonto(lj);
  const km = loja ? distanciaKm(loja, ponto) : null;
  const z = zonasDe(lj).find((x) => dentroDe(ponto, x.pontos));
  if (z) return { km, taxa: z.taxa, area: z.nome };
  const r = loja && raiosDe(lj).find((x) => km <= x.km + 1e-9);
  if (r) return { km, taxa: r.taxa, ate: r.km };
  return { km, fora: true, max: raiosDe(lj).length ? Math.max(...raiosDe(lj).map((x) => x.km)) : null };
}

// ---------------------------------------------------------------- buscas
const json = async (url) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10000);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
};
export async function buscarCep(cep) {
  const n = String(cep).replace(/\D/g, "");
  if (n.length !== 8) throw new Error("O CEP tem 8 números.");
  const d = await json(`https://viacep.com.br/ws/${n}/json/`);
  if (d.erro) throw new Error("CEP não encontrado.");
  return { cep: n, rua: d.logradouro || "", bairro: d.bairro || "", cidade: d.localidade || "", uf: d.uf || "" };
}
const nominatim = (p) => json(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&${new URLSearchParams(p)}`);
// Tenta do mais exato (rua + número) para o mais geral (só o CEP).
export async function achar({ rua, numero, bairro, cidade, uf, cep, texto }) {
  const tentativas = texto ? [{ q: texto }] : [
    rua && numero && { street: `${numero} ${rua}`, city: cidade, state: uf },
    rua && { street: rua, city: cidade, state: uf },
    cep && { postalcode: cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"), country: "Brasil" },
    bairro && cidade && { q: `${bairro}, ${cidade}, ${uf}` },
  ].filter(Boolean);
  for (const t of tentativas) {
    const q = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
    try { const r = (await nominatim(q))[0]; if (r) return { ponto: [Number(r.lat), Number(r.lon)], nome: r.display_name }; } catch (e) { console.warn("busca de endereço", e); }
  }
  // Reserva: o BrasilAPI devolve a coordenada do CEP quando o mapa não achou a rua.
  if (cep) {
    try {
      const r = await json(`https://brasilapi.com.br/api/cep/v2/${cep.replace(/\D/g, "")}`);
      const c = r?.location?.coordinates;
      if (c && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude))) return { ponto: [Number(c.latitude), Number(c.longitude)], nome: "CEP" };
    } catch (e) { console.warn("coordenada do CEP", e); }
  }
  return null;
}
export async function enderecoDoPonto(ponto) {
  try {
    const r = await json(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=pt-BR&lat=${ponto[0]}&lon=${ponto[1]}`);
    const a = r.address || {};
    return { rua: a.road || "", numero: a.house_number || "", bairro: a.suburb || a.neighbourhood || a.city_district || "", cidade: a.city || a.town || a.village || "", cep: (a.postcode || "").replace(/\D/g, "") };
  } catch { return null; }
}
export const minhaLocalizacao = () => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej(new Error("Este aparelho não consegue informar a localização."));
  navigator.geolocation.getCurrentPosition((p) => res([p.coords.latitude, p.coords.longitude]),
    (e) => rej(new Error(e.code === 1 ? "A localização está bloqueada. Libere no navegador ou use o CEP." : "Não consegui pegar a localização. Use o CEP.")),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
});

// ---------------------------------------------------------------- mapa
let carregando;
export function carregarMapa() {
  if (window.L) return Promise.resolve(window.L);
  carregando ||= new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = BASE + "leaflet.css"; document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = BASE + "leaflet.js";
    js.onload = () => { window.L.Icon.Default.prototype.options.imagePath = BASE + "images/"; res(window.L); };
    js.onerror = () => { carregando = null; rej(new Error("Não consegui carregar o mapa.")); };
    document.head.appendChild(js);
  });
  return carregando;
}
export async function novoMapa(el, centro = CENTRO_PADRAO) {
  const L = await carregarMapa();
  el.hidden = false;
  const mapa = L.map(el, { zoomControl: true, attributionControl: true }).setView([centro[0], centro[1]], centro[2] || 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
  setTimeout(() => mapa.invalidateSize(), 60);
  return { L, mapa };
}
const CORES = ["#2E7D32", "#F9A825", "#EF6C00", "#C62828", "#6A1B9A", "#1565C0"];
export function desenharRaios(L, mapa, grupo, lj, { pino = true } = {}) {
  grupo.clearLayers();
  const p = lojaPonto(lj);
  if (p) {
    raiosDe(lj).slice().reverse().forEach((r, i, tudo) => {
      const cor = CORES[(tudo.length - 1 - i) % CORES.length];
      L.circle(p, { radius: r.km * 1000, color: cor, weight: 2, fillColor: cor, fillOpacity: 0.07 }).bindTooltip(`até ${kmTxt(r.km)} · ${brl(r.taxa)}`, { sticky: true }).addTo(grupo);
    });
    if (pino) L.marker(p, { title: "Restaurante" }).addTo(grupo);
  }
  zonasDe(lj).forEach((z, i) => {
    const cor = CORES[(i + 3) % CORES.length];
    L.polygon(z.pontos.map((q) => [q.lat, q.lng]), { color: cor, weight: 2, dashArray: "6 4", fillColor: cor, fillOpacity: 0.16 })
      .bindTooltip(`${z.nome} · ${brl(z.taxa)}`, { sticky: true }).addTo(grupo);
  });
}

// ---------------------------------------------------------------- localizador (cliente e caixa)
// Monta no elemento: botão de localização, CEP + número, mapa com marcador que se arrasta.
// aoMudar({ ponto, km, taxa, fora, rua, bairro, cidade, cep }) a cada mudança; aoMudar(null) se limpar.
export function localizador(el, lj, { inicial = null, aoMudar = () => {}, rotuloCaixa = false } = {}) {
  const loja = lojaPonto(lj);
  const z0 = zonasDe(lj)[0];
  const base = loja || (z0 ? [z0.pontos[0].lat, z0.pontos[0].lng] : CENTRO_PADRAO.slice(0, 2));
  el.innerHTML = `<div class="loc">
    <button type="button" class="btn sec cheio" data-geo>📍 Usar minha localização</button>
    <div class="loc-ou">ou procure pelo CEP</div>
    <div class="loc-cep"><input class="in" data-cep inputmode="numeric" maxlength="9" placeholder="CEP" aria-label="CEP" value="${esc(inicial?.cep || "")}"><input class="in" data-num placeholder="Nº" aria-label="Número da casa" value="${esc(inicial?.numero || "")}"><button type="button" class="btn ghost" data-achar>Buscar</button></div>
    <div class="mapa-entrega" data-mapa hidden></div>
    <div class="loc-msg" data-msg role="status"></div></div>`;
  const q = (s) => el.querySelector(s);
  let dados = { rua: inicial?.rua || "", bairro: inicial?.bairro || "", cidade: inicial?.cidade || "", cep: inicial?.cep || "" };
  let mp = null, marcador = null;
  const msg = (t, ruim) => { q("[data-msg]").innerHTML = t ? `<span class="${ruim ? "ruim-txt" : "ok-txt"}">${t}</span>` : ""; };

  const aplicar = (ponto) => {
    const r = taxaDoPonto(lj, ponto);
    const dist = r.km != null ? `A ${kmTxt(r.km)} do restaurante · ` : "";
    msg(r.fora ? `📍 ${dist}<b>Fora da nossa área de entrega</b>${r.max ? ` (vamos até ${kmTxt(r.max)})` : ""}.`
      : `📍 ${dist}${r.area ? `Área ${esc(r.area)} · ` : ""}<b>Entrega ${brl(r.taxa)}</b>`, !!r.fora);
    aoMudar({ ponto, ...r, ...dados });
  };
  const mostrar = async (ponto, zoom = 16) => {
    if (!mp) {
      try {
        const m = await novoMapa(q("[data-mapa]"), [ponto[0], ponto[1], zoom]);
        mp = m;
        desenharRaios(m.L, m.mapa, (mp.grupo = m.L.layerGroup().addTo(m.mapa)), lj);
        marcador = m.L.marker(ponto, { draggable: true, title: "Arraste para o local da entrega", icon: m.L.divIcon({ className: "pino-cli", html: "📍", iconSize: [30, 30], iconAnchor: [15, 28] }) }).addTo(m.mapa);
        marcador.on("dragend", () => aplicar([marcador.getLatLng().lat, marcador.getLatLng().lng]));
        m.mapa.on("click", (e) => { marcador.setLatLng(e.latlng); aplicar([e.latlng.lat, e.latlng.lng]); });
      } catch (e) { return msg(e.message, true); }
    } else marcador.setLatLng(ponto);
    mp.mapa.invalidateSize();
    // Mostra o restaurante e o cliente juntos para dar noção da distância.
    if (loja) mp.mapa.fitBounds([loja, ponto], { padding: [34, 34], maxZoom: zoom });
    else mp.mapa.setView(ponto, zoom);
    aplicar(ponto);
  };
  // Sem achar o endereço: abre o mapa na loja para a pessoa tocar onde está.
  const manual = async (aviso) => { msg(aviso, true); if (!mp) { try { const m = await novoMapa(q("[data-mapa]"), [...base, 13]); mp = m; mp.grupo = m.L.layerGroup().addTo(m.mapa); desenharRaios(m.L, m.mapa, mp.grupo, lj);
      marcador = m.L.marker(base, { draggable: true, icon: m.L.divIcon({ className: "pino-cli", html: "📍", iconSize: [30, 30], iconAnchor: [15, 28] }) }); marcador.on("dragend", () => aplicar([marcador.getLatLng().lat, marcador.getLatLng().lng]));
      m.mapa.on("click", (e) => { if (!m.mapa.hasLayer(marcador)) marcador.addTo(m.mapa); marcador.setLatLng(e.latlng); aplicar([e.latlng.lat, e.latlng.lng]); }); } catch (e) { msg(e.message, true); } } };

  q("[data-geo]").onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true; msg("Pegando sua localização…");
    try {
      const ponto = await minhaLocalizacao();
      const e = await enderecoDoPonto(ponto);
      // A localização dá o ponto no mapa; não troca CEP e número que a pessoa já digitou.
      if (e) { dados = { ...dados, ...e }; if (e.cep && !q("[data-cep]").value.trim()) q("[data-cep]").value = e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"); if (e.numero && !q("[data-num]").value.trim()) q("[data-num]").value = e.numero; }
      await mostrar(ponto);
    } catch (e) { msg(e.message, true); } finally { b.disabled = false; }
  };
  const buscar = async () => {
    const b = q("[data-achar]"); if (b.disabled) return; b.disabled = true; msg("Procurando…"); aoMudar(null, dados);
    try {
      const c = await buscarCep(q("[data-cep]").value);
      dados = { rua: c.rua, bairro: c.bairro, cidade: c.cidade, cep: c.cep, uf: c.uf, numero: q("[data-num]").value.trim() };
      const a = await achar({ ...c, numero: q("[data-num]").value.trim() });
      if (a) await mostrar(a.ponto); else await manual("Achamos o CEP, mas não o ponto no mapa. Toque no mapa onde você está.");
    } catch (e) { msg(e.message, true); } finally { b.disabled = false; }
  };
  q("[data-achar]").onclick = buscar;
  // Busca sozinho quando o CEP fica completo (não depende de apertar "Buscar").
  q("[data-cep]").oninput = (e) => { const n = e.target.value.replace(/\D/g, "").slice(0, 8); e.target.value = n.length > 5 ? n.slice(0, 5) + "-" + n.slice(5) : n; if (n.length === 8) buscar(); };
  q("[data-cep]").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
  if (inicial?.lat != null) mostrar([inicial.lat, inicial.lng]);
  return { buscar, destruir() { try { mp?.mapa.remove(); } catch {} } };
}
