// Aba "Promoções": criar, ligar/desligar e remover promoções. Cada promoção é um item do cardápio, na aba
// "Promoções", que só aparece para vender nos dias/horários/período escolhidos (garçom, caixa e cardápio online).
import { $, $$, esc, brl, toast, erro, confirmar, abrirSheet, fecharSheet, cabecalhoSheet, numero, valorCampo } from "../ui.js";
import { D, loja, promoValida, canalDe } from "../regras.js";
import { store, novoId } from "../store.js";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CANAIS = [["todos", "Mesa e delivery"], ["mesa", "Só mesa"], ["delivery", "Só delivery / retirada"]];
const CAT = "promocoes";

const quando = (p) => {
  const r = p.promo || {};
  const dias = (r.dias || []).length ? (r.dias.length === 7 ? "todos os dias" : r.dias.slice().sort().map((d) => DIAS[d]).join(", ")) : "todos os dias";
  const hora = r.de && r.ate ? ` · ${r.de} às ${r.ate}` : "";
  const per = r.inicio || r.fim ? ` · ${r.inicio ? "de " + r.inicio.split("-").reverse().join("/") : ""}${r.fim ? " até " + r.fim.split("-").reverse().join("/") : ""}` : "";
  return `${dias}${hora}${per}`;
};

export function abaPromocoes(el) {
  const promos = D.produtos.filter((p) => p.cat === CAT).sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || a.nome.localeCompare(b.nome));
  el.innerHTML = `<div class="card"><div class="card-h"><div><b>🔥 Promoções</b><small>Aparecem como a primeira aba no garçom, no caixa e no cardápio online, só nos dias e horários escolhidos.</small></div>
      <button class="btn pri" id="novaPromo">+ Nova promoção</button></div></div>
    ${promos.map((p) => {
      const desligada = p.ativo === false, noAr = !desligada && promoValida(p);
      return `<div class="card promo ${desligada ? "off" : ""}"><div class="card-h"><div><b>${esc(p.nome)}</b><small>${esc(quando(p))} · ${esc(CANAIS.find(([v]) => v === canalDe(p))?.[1] || "")}</small>
          ${p.desc ? `<small>${esc(p.desc)}</small>` : ""}${p.escolha?.n ? `<small>Cliente escolhe ${p.escolha.n}: ${esc(p.escolha.titulo || "")}</small>` : ""}</div>
          <div class="promo-dir"><b>${brl(p.preco)}</b><span class="pill ${noAr ? "ok" : desligada ? "bad" : "alerta"}">${noAr ? "No ar agora" : desligada ? "Desligada" : "Fora do horário"}</span></div></div>
        <div class="linha-btn wrap"><button class="btn ghost sm" data-liga="${esc(p.id)}">${desligada ? "Ligar" : "Desligar"}</button><button class="btn ghost sm" data-ed="${esc(p.id)}">Editar</button><button class="btn ghost sm perigo" data-rm="${esc(p.id)}">Remover</button></div></div>`;
    }).join("") || `<p class="vazio">Nenhuma promoção ainda. Toque em “+ Nova promoção”. Exemplos: happy hour de chopp, combo porção + cerveja, terça do drink.</p>`}`;
  $("#novaPromo", el).onclick = () => editar({});
  $$("[data-ed]", el).forEach((b) => (b.onclick = () => editar(D.produtos.find((p) => p.id === b.dataset.ed))));
  $$("[data-liga]", el).forEach((b) => (b.onclick = () => {
    const p = D.produtos.find((x) => x.id === b.dataset.liga);
    store.salvar("produtos", p.id, { ativo: p.ativo === false }).then(() => toast(p.ativo === false ? "Promoção ligada ✓" : "Promoção desligada", "bom")).catch(erro);
  }));
  $$("[data-rm]", el).forEach((b) => (b.onclick = async () => {
    const p = D.produtos.find((x) => x.id === b.dataset.rm);
    if (await confirmar("Remover promoção", `Remover "${p.nome}"? Para só pausar, use Desligar.`, { ok: "Remover", perigo: true })) store.apagar("produtos", p.id).then(() => toast("Removida")).catch(erro);
  }));
}

function editar(p) {
  const r = p.promo || {};
  const e = p.escolha || {};
  const cats = D.categorias.filter((c) => c.id !== CAT);
  const s = abrirSheet(`${cabecalhoSheet(p.id ? "Editar promoção" : "Nova promoção")}<div class="sh-b">
    <label class="f" for="prn">Nome</label><input class="in" id="prn" value="${esc(p.nome || "")}" placeholder="Ex.: Happy hour">
    <label class="f" for="prd">Descrição (opcional)</label><input class="in" id="prd" value="${esc(p.desc || "")}" placeholder="Ex.: 1 porção de fritas + 2 cervejas 600 ml">
    <div class="opts dois"><div><label class="f" for="prp">Preço (R$)</label><input class="in" id="prp" inputmode="decimal" value="${p.preco != null ? valorCampo(p.preco) : ""}"></div>
      <div><label class="f" for="prc">Onde vale</label><select class="in" id="prc">${CANAIS.map(([v, l]) => `<option value="${v}" ${canalDe(p) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
    <div class="grp">Dias da semana <small>nenhum marcado = todos os dias</small></div>
    <div class="chips" id="prdias">${DIAS.map((d, i) => `<button type="button" class="chip" data-d="${i}" aria-pressed="${(r.dias || []).includes(i)}">${d}</button>`).join("")}</div>
    <div class="opts dois"><div><label class="f" for="prde">Horário: a partir de</label><input class="in" id="prde" type="time" value="${esc(r.de || "")}"></div>
      <div><label class="f" for="prat">até</label><input class="in" id="prat" type="time" value="${esc(r.ate || "")}"></div>
      <div><label class="f" for="prin">Período: começa em</label><input class="in" id="prin" type="date" value="${esc(r.inicio || "")}"></div>
      <div><label class="f" for="prfi">termina em</label><input class="in" id="prfi" type="date" value="${esc(r.fim || "")}"></div></div>
    <label class="f" for="prs">Impressora / setor</label><select class="in" id="prs">${loja().setores.map((x) => `<option value="${esc(x.id)}" ${(p.setor || "cozinha") === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>
    <label class="opt"><input type="checkbox" id="pre" ${e.n ? "checked" : ""}><span>O cliente escolhe itens (ex.: 2 sabores)</span></label>
    <div id="preBox" ${e.n ? "" : "hidden"}>
      <div class="opts dois"><div><label class="f" for="pren">Quantos escolhe</label><input class="in" id="pren" type="number" min="1" max="10" value="${e.n || 2}"></div>
        <div><label class="f" for="pret">Texto da escolha</label><input class="in" id="pret" value="${esc(e.titulo || "Escolha os sabores")}"></div></div>
      <label class="f" for="prei">Opções (uma por linha)</label><textarea class="in" id="prei" rows="4" placeholder="Abobrinha&#10;Baiana">${esc((e.itens || []).join("\n"))}</textarea>
      <div class="grp">Ou puxar tudo destas abas do cardápio</div>
      <div class="opts dois">${cats.map((c) => `<label class="opt"><input type="checkbox" name="prcat" value="${esc(c.id)}" ${(e.cats || []).includes(c.id) ? "checked" : ""}><span>${esc(c.nome)}</span></label>`).join("")}</div></div>
    <label class="opt"><input type="checkbox" id="pra" ${p.ativo === false ? "" : "checked"}><span>Promoção ligada</span></label>
    <div class="err" id="err"></div><div class="linha-btn"><button class="btn pri" id="ok">Salvar</button></div></div>`);
  $$("[data-d]", s).forEach((b) => (b.onclick = () => b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true")));
  $("#pre", s).onchange = () => { $("#preBox", s).hidden = !$("#pre", s).checked; };
  $("#ok", s).onclick = async () => {
    const nome = $("#prn", s).value.trim(), preco = numero($("#prp", s).value);
    if (!nome) return ($("#err", s).textContent = "Coloque o nome da promoção.");
    if (!(preco > 0)) return ($("#err", s).textContent = "Coloque o preço.");
    const de = $("#prde", s).value, ate = $("#prat", s).value;
    if ((de && !ate) || (!de && ate)) return ($("#err", s).textContent = "Para limitar por horário, preencha “a partir de” e “até”.");
    const inicio = $("#prin", s).value, fim = $("#prfi", s).value;
    if (inicio && fim && fim < inicio) return ($("#err", s).textContent = "O fim do período é antes do começo.");
    const dias = $$("[data-d]", s).filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => +b.dataset.d);
    const dados = {
      nome, desc: $("#prd", s).value.trim(), cat: CAT, preco, precoBroto: null, tipo: "simples", opcoes: [], veg: false, canal: $("#prc", s).value, semEntrega: $("#prc", s).value === "mesa",
      setor: $("#prs", s).value, ativo: $("#pra", s).checked, ordem: p.ordem ?? 0,
      promo: { dias, de: de || "", ate: ate || "", inicio: inicio || "", fim: fim || "" },
      escolha: $("#pre", s).checked ? {
        n: Math.max(1, Math.min(10, Number($("#pren", s).value) || 1)), titulo: $("#pret", s).value.trim(),
        itens: $("#prei", s).value.split("\n").map((x) => x.trim()).filter(Boolean), cats: $$('input[name="prcat"]:checked', s).map((i) => i.value),
      } : null,
    };
    if (dados.escolha && !dados.escolha.itens.length && !dados.escolha.cats.length) return ($("#err", s).textContent = "Escreva as opções ou marque abas do cardápio.");
    try {
      // A aba "Promoções" é criada na primeira promoção e vem antes de todas as outras.
      if (!D.categorias.some((c) => c.id === CAT)) await store.salvar("categorias", CAT, { nome: "🔥 Promoções", setor: dados.setor, nota: "", prefixo: "", grupoPizza: "", grupoAdicional: "", ordem: 0 });
      await store.salvar("produtos", p.id || novoId(), dados);
      fecharSheet(); toast("Promoção salva ✓", "bom");
    } catch (x) { erro(x); }
  };
}
