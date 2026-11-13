// Janela de montar item (tamanho, sabores, borda, adicionais, opção, observação, quantidade).
// Usada pelo cardápio do cliente, pelo garçom e pelo caixa.
// onde: "mesa" (garçom/comanda) ou "delivery" (cardápio online, entrega, retirada, balcão).
import { $, $$, esc, brl, abrirSheet, fecharSheet, cabecalhoSheet, numero, valorCampo, toast, erro } from "../ui.js";
import { D, loja, categoria, setorDe, produto, vendeEm, alterarItem, naoImprime, naoCobraServico } from "../regras.js";

const grupo = (p) => categoria(p.cat)?.grupoPizza || "";
const saboresPossiveis = (p, onde) =>
  D.produtos.filter((x) => x.tipo === "pizza" && grupo(x) === grupo(p) && vendeEm(x, onde));

// Promoção em que o cliente escolhe N itens (ex.: 2 sabores): nomes digitados + produtos das categorias marcadas.
export function itensDaEscolha(p) {
  const e = p.escolha;
  if (!e?.n) return [];
  const dosCats = D.produtos.filter((x) => (e.cats || []).includes(x.cat) && x.ativo !== false).map((x) => x.nome);
  return [...new Set([...(e.itens || []), ...dosCats])];
}

// inicial: escolhas de um item já montado (botão Editar), para abrir a janela preenchida.
// cliente: true quando quem monta é o cliente no cardápio online (sem adicionais e sem as observações rápidas).
export function montarItem(p, aoAdicionar, { onde = "", rapido = false, inicial = null, cliente = false } = {}) {
  const cat = categoria(p.cat);
  // Adicionais só para a equipe (mesa, delivery, retirada, balcão), da lista do grupo do produto (Pizza, Esfiha, Pastel…).
  const grupoAd = p.grupoAdicional ?? cat?.grupoAdicional ?? "";
  const adicionais = !cliente && grupoAd ? (loja().adicionais || []).filter((a) => a.grupo === grupoAd) : [];
  // Item simples sem opções: no garçom/caixa entra direto com 1 toque.
  if (rapido && !inicial && p.tipo !== "pizza" && !(p.opcoes || []).length && !p.escolha?.n && !adicionais.length) {
    aoAdicionar(criar(p, { qtd: 1 }));
    return;
  }
  const pizza = p.tipo === "pizza";
  const broto = pizza && p.precoBroto;
  // Meia porção: liga/desliga em Ajustes (padrão: vende na mesa, não vende no delivery/retirada).
  const meiaLiberada = onde === "mesa" ? loja().meiaPorcaoMesa !== false : !!loja().meiaPorcaoDelivery;
  const meia = !pizza && Number(p.precoMeia) > 0 && meiaLiberada;
  const bordas = grupo(p) === "salgada" ? loja().bordas || [] : [];
  const outros = pizza ? saboresPossiveis(p, onde).filter((x) => x.id !== p.id) : [];
  let qtd = inicial?.qtd || 1;

  const s = abrirSheet(`${cabecalhoSheet(pizza ? `Pizza ${p.nome}` : (cat?.prefixo || "") + p.nome, p.desc)}<div class="sh-b">
    ${pizza ? `
      ${broto ? `<div class="grp">Tamanho</div><div class="opts dois">
        <label class="opt"><input type="radio" name="tam" value="G" checked><span>Grande (8 pedaços)<br><em>${brl(p.preco)}</em></span></label>
        <label class="opt"><input type="radio" name="tam" value="B"><span>Média (4 pedaços)<br><em>${brl(p.precoBroto)}</em></span></label></div>` : ""}
      ${outros.length ? `<div class="grp">Sabores <small>vale o preço do mais caro</small></div>
      <div class="opts dois"><label class="opt"><input type="radio" name="ns" value="1" checked><span>1 sabor</span></label>
        <label class="opt"><input type="radio" name="ns" value="2"><span>Meio a meio</span></label></div>
      <div class="sabor" id="s2" hidden><span class="muted">2º sabor</span>
        <input type="hidden" id="s2sel" value="${esc(outros[0]?.id || "")}">
        <input class="in" id="s2q" type="search" placeholder="Buscar sabor (ex.: calabresa)" autocomplete="off" aria-label="Buscar o 2º sabor">
        <small class="muted" id="s2atual"></small>
        <div class="s2lista" id="s2lista"></div></div>` : ""}
      ${bordas.length ? `<div class="grp">Borda</div><div class="opts">
        <label class="opt"><input type="radio" name="bor" value="" checked><span>Sem borda</span></label>
        ${bordas.map((b, i) => `<label class="opt"><input type="radio" name="bor" value="${i}"><span>${esc(b.nome)}</span><em>+ ${brl(b.preco)}</em></label>`).join("")}</div>` : ""}
    ` : ""}
    ${p.escolha?.n ? `<div class="grp">${esc(p.escolha.titulo || `Escolha ${p.escolha.n}`)} <small>marque ${p.escolha.n}${p.escolha.n > 1 ? "" : ""}</small></div><div class="opts dois">${itensDaEscolha(p).map((o) =>
      `<label class="opt"><input type="checkbox" name="es" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("")}</div>` : ""}
    ${meia ? `<div class="grp">Tamanho</div><div class="opts dois">
        <label class="opt"><input type="radio" name="tam" value="G" checked><span>Porção inteira<br><em>${brl(p.preco)}</em></span></label>
        <label class="opt"><input type="radio" name="tam" value="M"><span>Meia porção<br><em>${brl(p.precoMeia)}</em></span></label></div>` : ""}
    ${(p.opcoes || []).length ? `<div class="grp">Escolha</div><div class="opts dois">${p.opcoes.map((o, i) =>
      `<label class="opt"><input type="radio" name="op" value="${esc(o)}" ${i ? "" : "checked"}><span>${esc(o)}</span></label>`).join("")}</div>` : ""}
    ${adicionais.length ? `<div class="grp">Adicionais <small>pode marcar vários</small></div><div class="opts">${adicionais.map((a, i) =>
      `<label class="opt"><input type="checkbox" name="ad" value="${i}"><span>${esc(a.nome)}</span><em>+ ${brl(a.preco)}</em></label>
       ${a.livre ? `<input class="in livre" data-livre="${i}" placeholder="Qual adicional? (ex.: bacon)" hidden>` : ""}`).join("")}</div>` : ""}
    <label class="f" for="obs">${cliente ? "Observação deste item <small>(opcional)</small>" : "Observação"}</label>
    ${!cliente && (loja().obsRapidas?.[setorDe(p)] || []).length ? `<div class="chips quebra obs-chips">${loja().obsRapidas[setorDe(p)].map((o) => `<button type="button" class="chip" data-oc="${esc(o)}" aria-pressed="false">${esc(o)}</button>`).join("")}</div>` : ""}
    <input class="in" id="obs" placeholder="${cliente ? "Escreva aqui se quiser algo diferente" : "Ex.: copo com gelo, sem cebola, bem passada"}" maxlength="120">
    <div class="addrow"><div class="qtd"><button id="qm" aria-label="Diminuir">−</button><span id="qv">1</span><button id="qp" aria-label="Aumentar">+</button></div>
      <button class="btn pri" id="add"><span>Adicionar</span><span id="ap"></span></button></div></div>`, { nivel: 2 });

  const val = (n) => $(`input[name="${n}"]:checked`, s)?.value;
  const ler = () => {
    const tam = broto || meia ? val("tam") : "G";
    const segundo = val("ns") === "2" ? produto($("#s2sel", s)?.value) : null;
    const bi = val("bor");
    return {
      tam, segundo, borda: bi === "" || bi == null ? null : bordas[+bi], opcao: val("op"),
      escolhidos: $$('input[name="es"]:checked', s).map((i) => i.value),
      extras: $$('input[name="ad"]:checked', s).map((i) => {
        const a = adicionais[+i.value];
        const qual = a.livre ? $(`[data-livre="${i.value}"]`, s)?.value.trim() : "";
        return qual ? { ...a, base: a.nome, qual, nome: `${a.nome.replace(/^Outros adicionais/i, "Adicional")}: ${qual}` } : a;
      }),
      obs: $("#obs", s).value.trim(), qtd,
    };
  };
  const atualizar = () => {
    $("#qv", s).textContent = qtd;
    // Escolha de N itens: ao chegar em N, as outras caixas ficam travadas.
    const n = p.escolha?.n;
    if (n) { const marcados = $$('input[name="es"]:checked', s).length; $$('input[name="es"]', s).forEach((i) => (i.disabled = !i.checked && marcados >= n)); }
    $("#ap", s).textContent = brl(criar(p, ler()).unit * qtd);
    const s2 = $("#s2", s);
    if (s2) s2.hidden = val("ns") !== "2";
    $$("[data-livre]", s).forEach((t) => (t.hidden = !$(`input[name="ad"][value="${t.dataset.livre}"]`, s).checked));
  };
  // 2º sabor do meio a meio: busca por sabor, ingrediente ou aba; as pizzas aparecem agrupadas por aba.
  const semAc = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const s2 = $("#s2sel", s);
  if (s2) {
    const marcar = () => {
      const x = outros.find((o) => o.id === s2.value);
      $("#s2atual", s).textContent = x ? `Escolhido: ${x.nome} · ${brl(x.preco)}` : "";
      $$("[data-s2]", s).forEach((b) => b.classList.toggle("on", b.dataset.s2 === s2.value));
    };
    const lista = () => {
      const q = semAc($("#s2q", s).value.trim());
      // Casa pelo sabor/ingrediente ou pelo nome da aba (aceita "especial" para a aba "Especiais").
      const daAba = (o) => { const n = semAc(categoria(o.cat)?.nome); return n.includes(q) || (q.length > 4 && n.includes(q.slice(0, -1))); };
      const ach = outros.filter((o) => !q || semAc(`${o.nome} ${o.desc}`).includes(q) || daAba(o));
      const cats = [...new Set(ach.map((o) => o.cat))];
      $("#s2lista", s).innerHTML = cats.map((c) => `<h4 class="sel-sec">${esc(categoria(c)?.nome || "")}</h4>` + ach.filter((o) => o.cat === c).map((o) =>
        `<button type="button" class="s2opt" data-s2="${esc(o.id)}"><span>${esc(o.nome)}</span><b>${brl(o.preco)}</b></button>`).join("")).join("") || `<p class="vazio">Nenhum sabor encontrado.</p>`;
      $$("[data-s2]", s).forEach((b) => (b.onclick = () => { s2.value = b.dataset.s2; marcar(); atualizar(); }));
      marcar();
    };
    s2._marcar = marcar;
    $("#s2q", s).addEventListener("input", lista);
    $("#s2q", s).addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    lista();
  }
  if (inicial) preencher(s, inicial, { bordas, adicionais });
  // Botões de observação rápida: tocar marca/desmarca e escreve na barra.
  const partes = () => $("#obs", s).value.split(",").map((x) => x.trim()).filter(Boolean);
  const marcarChips = () => $$("[data-oc]", s).forEach((b) => b.setAttribute("aria-pressed", partes().includes(b.dataset.oc)));
  $$("[data-oc]", s).forEach((b) => (b.onclick = () => {
    const l = partes(), i = l.indexOf(b.dataset.oc);
    if (i >= 0) l.splice(i, 1); else l.push(b.dataset.oc);
    $("#obs", s).value = l.join(", ");
    marcarChips(); atualizar();
  }));
  $("#obs", s).addEventListener("input", marcarChips);
  marcarChips();
  $$("input,select", s).forEach((i) => i.addEventListener("change", atualizar));
  $("#qm", s).onclick = () => { if (qtd > 1) { qtd--; atualizar(); } };
  $("#qp", s).onclick = () => { qtd++; atualizar(); };
  $("#add", s).onclick = () => {
    const n = p.escolha?.n;
    if (n && $$('input[name="es"]:checked', s).length !== n) return toast(`Marque ${n} ${n > 1 ? "opções" : "opção"} para a promoção.`);
    const semNome = $$("[data-livre]", s).find((t) => !t.hidden && !t.value.trim());
    if (semNome) { semNome.focus(); semNome.placeholder = "Escreva qual é o adicional"; semNome.classList.add("falta"); return; }
    const novo = criar(p, ler());
    fecharSheet(); // fecha antes: quem recebe pode abrir outra janela (ex.: Alterar item)
    aoAdicionar(novo);
  };
  if (inicial) $("#add span", s).textContent = "Salvar alteração";
  atualizar();
}

// Botão "Editar": reabre a janela do item com as escolhas feitas; aoSalvar recebe o item novo.
export function editarItem(item, onde, aoSalvar, { cliente = false } = {}) {
  const p = produto(item.produtoId);
  if (!p) return;
  montarItem(p, aoSalvar, { onde, cliente, inicial: { ...(item.escolhas || {}), obs: item.obs, qtd: item.qtd } });
}

// Editar item JÁ LANÇADO (na comanda ou no pedido): quantidade, escolhas e valor.
export function editarLancado(pedido, item, quem, onde, aoFim = () => {}) {
  let rasc = { ...item };
  const des = () => {
    const s = abrirSheet(`${cabecalhoSheet("Alterar item", loja().imprimirAlteracao === true ? "Já foi para a produção: se mudar o pedido, sai um papel ALTERADO no setor" : "A mudança fica registrada no sistema (não imprime papel novo)")}<div class="sh-b">
      <div class="cl"><div class="n"><b>${esc(rasc.nome)}</b>${(rasc.det || []).map((d) => `<small>${esc(d)}</small>`).join("")}${rasc.obs ? `<small class="obs">Obs: ${esc(rasc.obs)}</small>` : ""}</div></div>
      <button class="btn sec cheio" id="esc">Mudar sabores, borda, adicionais ou observação</button>
      <div class="opts dois"><div><label class="f">Quantidade</label><div class="qtd"><button id="qm" aria-label="Diminuir">−</button><span id="qv">${rasc.qtd}</span><button id="qp" aria-label="Aumentar">+</button></div></div>
        <div><label class="f" for="vu">Valor de cada (R$)</label><input class="in" id="vu" inputmode="decimal" value="${valorCampo(rasc.unit)}"></div></div>
      ${item.unitOriginal != null || Number(rasc.unit) !== Number(item.unit) ? `<small class="muted">Valor original: ${brl(item.unitOriginal ?? item.unit)}</small>` : ""}
      <div class="sum"><div class="t"><span>Total do item</span><span id="tot">${brl(rasc.unit * rasc.qtd)}</span></div></div>
      <div class="err" id="err"></div>
      <button class="btn ok cheio grande" id="ok">Salvar alteração</button></div>`, { nivel: 2 });
    const tot = () => { rasc.unit = numero($("#vu", s).value); $("#qv", s).textContent = rasc.qtd; $("#tot", s).textContent = brl(rasc.unit * rasc.qtd); };
    $("#qm", s).onclick = () => { if (rasc.qtd > 1) { rasc.qtd--; tot(); } };
    $("#qp", s).onclick = () => { rasc.qtd++; tot(); };
    $("#vu", s).oninput = tot;
    $("#esc", s).onclick = () => {
      tot();
      editarItem(rasc, onde, (novo) => { rasc = { ...rasc, ...novo }; des(); });
    };
    $("#ok", s).onclick = async (ev) => {
      tot();
      if (!(rasc.unit >= 0)) return ($("#err", s).textContent = "Valor inválido.");
      ev.currentTarget.disabled = true;
      try {
        const { produtoId, setor, qtd, unit, nome, det, obs, escolhas } = rasc;
        await alterarItem(pedido.id, item.key, { produtoId, setor, qtd, unit, nome, det: det || [], obs: obs || "", escolhas: escolhas || null }, quem);
        fecharSheet();
        toast("Item alterado ✓", "bom");
        aoFim();
      } catch (e) { $("#err", s).textContent = e.message; ev.currentTarget.disabled = false; }
    };
  };
  des();
}

// Marca na janela as escolhas guardadas no item (para editar).
function preencher(s, e, { bordas, adicionais }) {
  const marcar = (sel) => { const i = $(sel, s); if (i) i.checked = true; };
  if (e.tam) marcar(`input[name="tam"][value="${e.tam}"]`);
  if (e.segundo) { marcar('input[name="ns"][value="2"]'); const sel = $("#s2sel", s); if (sel) { sel.value = e.segundo; sel._marcar?.(); } }
  if (e.borda) { const i = bordas.findIndex((b) => b.nome === e.borda); if (i >= 0) marcar(`input[name="bor"][value="${i}"]`); }
  if (e.opcao) $$('input[name="op"]', s).forEach((i) => (i.checked = i.value === e.opcao));
  for (const x of e.extras || []) {
    const i = adicionais.findIndex((a) => a.nome === x.nome);
    if (i < 0) continue;
    marcar(`input[name="ad"][value="${i}"]`);
    const t = $(`[data-livre="${i}"]`, s);
    if (t && x.qual) t.value = x.qual;
  }
  for (const nome of e.escolhidos || []) $$('input[name="es"]', s).forEach((i) => { if (i.value === nome) i.checked = true; });
  if (e.obs) $("#obs", s).value = e.obs;
}

// Monta a linha do pedido a partir do produto e das escolhas.
export function criar(p, { tam = "G", segundo = null, borda = null, opcao = "", extras = [], obs = "", qtd = 1, escolhidos = [] } = {}) {
  const cat = categoria(p.cat);
  const escolhas = {
    tam, segundo: segundo?.id || null, borda: borda?.nome || null, opcao: opcao || "", obs: obs || "", qtd, escolhidos,
    extras: extras.map((a) => ({ nome: a.base || a.nome, qual: a.qual || "" })),
  };
  const base = { produtoId: p.id, setor: setorDe(p), qtd, obs: obs || "", det: [], escolhas, ...(naoImprime(p) ? { semImpressao: true } : {}), ...(naoCobraServico(p) ? { semServico: true } : {}) };
  const somaExtras = extras.reduce((t, a) => t + (Number(a.preco) || 0), 0);
  const detExtras = extras.map((a) => `+ ${a.nome}`);
  if (p.tipo !== "pizza") {
    const meia = tam === "M" && Number(p.precoMeia) > 0;
    const nomeBase = (cat?.prefixo || "") + p.nome;
    const nomeFinal = meia ? (/^porção\s/i.test(nomeBase) ? nomeBase.replace(/^porção\s/i, "Meia porção ") : `Meia ${nomeBase}`) : nomeBase;
    return { ...base, nome: nomeFinal + (opcao ? ` (${opcao})` : ""), det: [...escolhidos.map((x) => `• ${x}`), ...detExtras], unit: (meia ? Number(p.precoMeia) : Number(p.preco) || 0) + somaExtras };
  }
  const preco = (x) => (tam === "B" && x.precoBroto ? x.precoBroto : x.preco);
  const sabores = segundo ? [p, segundo] : [p];
  let unit = Math.max(...sabores.map((x) => Number(preco(x)) || 0)) + somaExtras;
  const det = segundo ? sabores.map((x) => `1/2 ${x.nome}`) : [];
  if (borda) { unit += Number(borda.preco) || 0; det.push(`Borda ${borda.nome}`); }
  det.push(...detExtras);
  const tamanho = p.precoBroto ? (tam === "B" ? " média" : " grande") : "";
  return { ...base, nome: `Pizza${tamanho}${segundo ? " meio a meio" : " " + p.nome}`, det, unit };
}
