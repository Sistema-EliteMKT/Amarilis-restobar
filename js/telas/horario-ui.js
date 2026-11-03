// Controles do horário do cardápio online: barra rápida (aba Pedidos) e quadro completo (Ajustes).
import { $, $$, esc, toast, erro } from "../ui.js";
import { hoje } from "../ui.js";
import { loja } from "../regras.js";
import { store } from "../store.js";
import { statusOnline, DIAS_CURTO } from "../horario.js";
import { HORARIOS_PADRAO } from "../config.js";

const agoraHM = () => { const d = new Date(), q = (n) => String(n).padStart(2, "0"); return `${q(d.getHours())}:${q(d.getMinutes())}`; };
// Sempre grava o objeto inteiro (o banco junta campos, então um campo antigo não pode sobrar).
const gravarHoje = (dados) => store.salvar("config", "loja", { excecaoHoje: dados ? { dia: hoje(), modo: "", de: "", ate: "", ...dados } : { dia: "", modo: "", de: "", ate: "" } });
const pill = (st) => `<span class="pill ${st.aberto ? "ok" : "bad"}">${st.aberto ? "🟢" : "🔴"} ${esc(st.texto)}</span>`;

// Barra rápida: fechar agora, fechar às HH:MM, abrir agora, voltar ao normal (tudo só por hoje).
export function barraOnline(el) {
  const lj = loja(), st = statusOnline(lj);
  const mudadoHoje = lj.excecaoHoje?.dia === hoje() && (lj.excecaoHoje.modo || lj.excecaoHoje.de || lj.excecaoHoje.ate);
  el.innerHTML = `<div class="barra-online"><div><b>Cardápio online</b> ${pill(st)}${mudadoHoje ? `<small class="muted"> · mudado só por hoje</small>` : ""}${lj.modoOnline === "fechado" ? `<small class="muted"> · fechado até você abrir (Ajustes)</small>` : ""}</div>
    <div class="linha-btn wrap">
      ${st.aberto ? `<button class="btn sec sm" data-h="fechar">Fechar agora</button>
        <span class="barra-hora"><input class="in" type="time" id="bhFim" value="${esc(st.ate || "")}" aria-label="Fechar às"><button class="btn ghost sm" data-h="fecharas">Fechar às</button></span>`
        : lj.modoOnline === "fechado" ? "" : `<button class="btn pri sm" data-h="abrir">Abrir agora</button>`}
      ${mudadoHoje ? `<button class="btn ghost sm" data-h="normal">Voltar ao horário normal</button>` : ""}</div></div>`;
  const ok = (t) => toast(t, "bom");
  $$("[data-h]", el).forEach((b) => (b.onclick = () => {
    const a = b.dataset.h;
    if (a === "fechar") gravarHoje({ modo: "fechado" }).then(() => ok("Cardápio fechado por hoje.")).catch(erro);
    else if (a === "abrir") gravarHoje({ modo: "aberto" }).then(() => ok("Cardápio aberto.")).catch(erro);
    else if (a === "normal") gravarHoje(null).then(() => ok("Voltou ao horário normal.")).catch(erro);
    else if (a === "fecharas") {
      const h = $("#bhFim", el).value;
      if (!h) return toast("Escolha a hora de fechar.");
      gravarHoje({ ate: h }).then(() => ok(`Hoje o cardápio fecha às ${h}.`)).catch(erro);
    }
  }));
}

// Quadro completo em Ajustes: horário de cada dia, fechar até avisar, e a mudança só de hoje.
export function cardHorario(el) {
  const lj = loja(), tabela = lj.horarios || HORARIOS_PADRAO;
  const ex = lj.excecaoHoje?.dia === hoje() ? lj.excecaoHoje : {};
  const linhas = DIAS_CURTO.map((d, i) => { const h = tabela[i] || {}; return `<div class="hor-lin"><label class="opt"><input type="checkbox" data-ha="${i}" ${h.ativo !== false && h.de ? "checked" : ""}><span>${d}</span></label>
    <input class="in" type="time" data-hd="${i}" value="${esc(h.de || "18:10")}" aria-label="Abre ${d}"><span class="muted">às</span><input class="in" type="time" data-hf="${i}" value="${esc(h.ate || "23:00")}" aria-label="Fecha ${d}"></div>`; }).join("");
  el.innerHTML = `<b>Horário do cardápio online (delivery e retirada)</b>
    <p class="muted pq">O cliente vê "Aberto até…" ou "Fechado · abre às…", e só consegue pedir dentro do horário. Quem fecha depois da meia-noite: coloque a hora de fechar menor que a de abrir (ex.: abre 18:00, fecha 00:30).</p>
    <div id="hSt" class="sum"><div><span>Agora</span><span>${pill(statusOnline(lj))}</span></div></div>
    <div class="grp">Horário de cada dia <small>desmarque o dia em que não abre</small></div>${linhas}
    <label class="opt"><input type="checkbox" id="hFix" ${lj.modoOnline === "fechado" ? "checked" : ""}><span>Manter fechado até eu abrir de novo <small>(férias, feriado…)</small></span></label>
    <div class="linha-btn"><button class="btn pri" id="hSalvar">Salvar horários</button></div>
    <div class="grp">Só para hoje <small>volta ao horário normal amanhã</small></div>
    <div class="opts dois"><div><label class="f" for="hxd">Hoje abre às</label><input class="in" id="hxd" type="time" value="${esc(ex.de || "")}"></div>
      <div><label class="f" for="hxf">Hoje fecha às</label><input class="in" id="hxf" type="time" value="${esc(ex.ate || "")}"></div></div>
    <div class="linha-btn wrap"><button class="btn sec" id="hxA">Aplicar horário de hoje</button><button class="btn ghost" id="hxF">Fechar agora</button><button class="btn ghost" id="hxO">Abrir agora</button><button class="btn ghost" id="hxN">Voltar ao horário normal</button></div>`;
  const ok = (t) => toast(t, "bom");
  $("#hSalvar", el).onclick = () => {
    const horarios = {};
    for (let i = 0; i < 7; i++) horarios[i] = { ativo: $(`[data-ha="${i}"]`, el).checked, de: $(`[data-hd="${i}"]`, el).value || "18:00", ate: $(`[data-hf="${i}"]`, el).value || "23:00" };
    store.salvar("config", "loja", { horarios, modoOnline: $("#hFix", el).checked ? "fechado" : "auto" }).then(() => ok("Horários salvos ✓")).catch(erro);
  };
  $("#hxA", el).onclick = () => {
    const de = $("#hxd", el).value, ate = $("#hxf", el).value;
    if (!de && !ate) return toast("Coloque a hora de abrir e/ou de fechar de hoje.");
    gravarHoje({ de, ate }).then(() => ok("Horário de hoje aplicado ✓")).catch(erro);
  };
  $("#hxF", el).onclick = () => gravarHoje({ modo: "fechado" }).then(() => ok("Fechado por hoje.")).catch(erro);
  $("#hxO", el).onclick = () => gravarHoje({ modo: "aberto" }).then(() => ok("Aberto agora (por hoje).")).catch(erro);
  $("#hxN", el).onclick = () => gravarHoje(null).then(() => ok("Voltou ao horário normal.")).catch(erro);
}
