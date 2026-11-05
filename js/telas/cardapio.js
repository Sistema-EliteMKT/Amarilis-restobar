// Cardápio do cliente: escolhe, monta a sacola e faz o pedido (entrega ou retirada).
import { $, $$, esc, brl, hora, toast, erro, confirmar, buscaNaLista, abrirSheet, fecharSheet, cabecalhoSheet, rodapeMarca, numero, setasRolagem } from "../ui.js";
import { D, loja, aoMudar, criarPedido, ETAPAS, totalPedido, vendeEm, itensValidos } from "../regras.js";
import { store } from "../store.js";
import { entregaPorRaio, taxaDoPonto, localizador, kmTxt } from "../entrega.js";
import { statusOnline, previsao } from "../horario.js";
import { buscarCep } from "../entrega.js";
import { montarItem, editarItem } from "./item.js";

const fmtCep = (c) => { const n = String(c || "").replace(/\D/g, "").slice(0, 8); return n.length > 5 ? n.slice(0, 5) + "-" + n.slice(5) : n; };
const K = "se_cliente";
const lerLocal = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
const gravarLocal = (v) => { try { localStorage.setItem(K, JSON.stringify({ ...lerLocal(), ...v })); } catch {} };
// Desconto no primeiro pedido: vale para quem nunca pediu por este celular. Liga/desliga e % em Ajustes > Cupons.
const PRIMEIRO = "PRIMEIRO PEDIDO";
const pctPrimeiro = (lj) => {
  const pp = { ativo: true, pct: 10, ...(lj.primeiroPedido || {}) };
  return pp.ativo && !lerLocal().ultimo ? Math.min(50, Math.max(0, Number(pp.pct) || 0)) : 0;
};

export function telaCardapio(raiz) {
  const sacola = [];
  let cat = null;
  let acompanhando = null;
  let timer;

  const desenhar = () => {
    const lj = loja();
    const cats = D.categorias.filter((c) => D.produtos.some((p) => p.cat === c.id && vendeEm(p, "delivery")));
    cat = cat && cats.some((c) => c.id === cat) ? cat : cats[0]?.id;
    const rolou = $(".c-cats .chips", raiz)?.scrollLeft || 0;
    raiz.innerHTML = `
      <header class="c-hero"><div class="pat" aria-hidden="true"></div><div class="c-hero-in">
        ${lj.logoClaro ? `<img src="${esc(lj.logoClaro)}" alt="${esc(lj.nome)}">` : `<h1>${esc(lj.nome)}</h1>`}
        ${lj.slogan ? `<p>${esc(lj.slogan)}</p>` : ""}
        ${pctPrimeiro(lj) ? `<p class="c-promo">🎁 <b>${pctPrimeiro(lj)}% de desconto</b> no seu primeiro pedido pelo app</p>` : ""}
        <div class="facts"><span id="statusOnline" class="${statusOnline(lj).aberto ? "st-aberto" : "st-fechado"}">${statusOnline(lj).aberto ? "🟢" : "🔴"} ${esc(statusOnline(lj).texto)}</span>${previsao(lj, "entrega") ? `<span>🛵 Entrega ${esc(previsao(lj, "entrega"))}</span>` : ""}${previsao(lj, "retirada") ? `<span>🥡 Retirada ${esc(previsao(lj, "retirada"))}</span>` : ""}${lj.telefone ? `<span>${esc(lj.telefone)}</span>` : ""}</div>
      </div></header>
      <div class="c-wrap">
        <div id="acomp"></div>
        <div class="c-cats"><div class="chips">${cats.map((c) => `<button class="chip" data-c="${esc(c.id)}" aria-pressed="${c.id === cat}">${esc(c.nome)}</button>`).join("")}</div></div>
        <div id="menu">${cats.map((c) => secao(c)).join("") || (D.falhaCarregar ? `<div class="vazio">Não conseguimos carregar o cardápio. Confira a internet e toque em tentar de novo.<br><button class="btn pri" style="margin-top:10px" onclick="location.reload()">Tentar de novo</button><br><small>Se abriu pelo Instagram ou WhatsApp, toque nos 3 pontinhos e escolha <b>Abrir no navegador</b>.</small></div>` : D.carregou && (!D.carregou.produtos || !D.carregou.categorias) ? `<p class="vazio carregando-cardapio">Carregando cardápio…</p>` : `<p class="vazio">Cardápio ainda não cadastrado.</p>`)}</div>
        ${rodapeMarca()}
      </div>
      <div class="cartbar" id="cartbar" ${sacola.length ? "" : "hidden"}><button id="verSacola"><span><span class="q">${sacola.reduce((s, l) => s + l.qtd, 0)}</span>Ver sacola</span><span>${brl(sacola.reduce((s, l) => s + l.unit * l.qtd, 0))}</span></button></div>`;
    const fila = $(".c-cats .chips", raiz);
    if (fila) { setasRolagem(fila); fila.scrollLeft = rolou; }
    $$("[data-c]", raiz).forEach((b) => (b.onclick = () => {
      cat = b.dataset.c;
      $$("[data-c]", raiz).forEach((x) => x.setAttribute("aria-pressed", x === b));
      document.getElementById("sec-" + cat)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    $$("[data-p]", raiz).forEach((b) => (b.onclick = () => {
      if (!statusOnline(loja()).aberto) return toast(`${statusOnline(loja()).texto}. Não estamos aceitando pedidos agora.`);
      const p = D.produtos.find((x) => x.id === b.dataset.p);
      montarItem(p, (item) => { sacola.push(item); toast("Adicionado à sacola"); desenhar(); }, { onde: "delivery", cliente: true });
    }));
    $("#verSacola", raiz) && ($("#verSacola", raiz).onclick = abrirSacola);
    desenharAcomp();
  };

  const secao = (c) => {
    const itens = D.produtos.filter((p) => p.cat === c.id && vendeEm(p, "delivery"));
    return `<section class="c-sec" id="sec-${esc(c.id)}"><h2>${esc(c.nome)}</h2>${c.nota ? `<p class="nota">${esc(c.nota)}</p>` : ""}
      ${itens.map((p) => `<button class="it" data-p="${esc(p.id)}"><span class="n"><b>${esc(p.nome)}${p.veg ? `<span class="veg" title="Vegetariana">V</span>` : ""}</b>${p.desc ? `<small>${esc(p.desc)}</small>` : ""}</span>
        <span class="p">${brl(p.preco)}${p.precoBroto ? `<small>média ${brl(p.precoBroto)}</small>` : ""}</span><span class="plus" aria-hidden="true">+</span></button>`).join("")}</section>`;
  };

  const abrirSacola = () => {
    const lj = loja();
    const salvo = lerLocal();
    let modo = salvo.modo || "entrega";
    const taxas = lj.taxasEntrega || [];
    const porRaio = entregaPorRaio(lj);
    let loc = salvo.lat != null && porRaio ? { ponto: [salvo.lat, salvo.lng], ...taxaDoPonto(lj, [salvo.lat, salvo.lng]) } : null;
    const auto = pctPrimeiro(lj) ? { codigo: PRIMEIRO, pct: pctPrimeiro(lj) } : null; // desconto do primeiro pedido, já aplicado
    let ctl = null, autoEnd = "", cupomAplicado = auto, ruaEditada = false; // ruaEditada: a pessoa mexeu na rua; aí o CEP não troca mais
    const formas = lj.formasPagamento || [];
    const s = abrirSheet(`${cabecalhoSheet("Sua sacola")}<div class="sh-b">
      <div id="linhas"></div>
      <div class="seg" id="modo"><button data-m="entrega">Entrega</button><button data-m="retirada">Retirar no balcão</button></div>
      <p class="previsao" id="previsao" role="status"></p>
      <label class="f" for="cn">Seu nome</label><input class="in" id="cn" autocomplete="name" value="${esc(salvo.nome || "")}">
      <label class="f" for="ct">WhatsApp</label><input class="in" id="ct" type="tel" autocomplete="tel" inputmode="tel" value="${esc(salvo.telefone || "")}">
      <div id="end">
        ${porRaio ? `<div id="loc"></div>` : `<label class="f" for="ccep">CEP <b class="obrig">*</b></label><input class="in" id="ccep" inputmode="numeric" maxlength="9" autocomplete="postal-code" placeholder="00000-000" value="${esc(fmtCep(salvo.cep))}"><small class="muted" id="cepMsg" role="status"></small>`}
        <label class="f" for="ce">Rua <b class="obrig">*</b></label><input class="in" id="ce" autocomplete="address-line1" value="${esc(salvo.rua || salvo.endereco || "")}">
        <div class="opts dois"><div><label class="f" for="cnum">Número da casa <b class="obrig">*</b></label><input class="in" id="cnum" inputmode="numeric" autocomplete="off" placeholder="Ex.: 120 ou S/N" value="${esc(salvo.numero || "")}"></div>
          <div><label class="f" for="ccomp">Complemento</label><input class="in" id="ccomp" placeholder="Apto, bloco…" value="${esc(salvo.comp || "")}"></div></div>
        ${porRaio ? "" : taxas.length ? `<label class="f" for="cb">Seu bairro <b class="obrig">*</b></label><select class="in" id="cb"><option value="">Escolha o bairro…</option>${taxas.map((t) => `<option value="${esc(t.nome)}" ${t.nome === salvo.bairro ? "selected" : ""}>${esc(t.nome)} · ${brl(t.taxa)}</option>`).join("")}</select>` : ""}
        <label class="f" for="cr">Ponto de referência</label><input class="in" id="cr" value="${esc(salvo.referencia || "")}">
      </div>
      <label class="f" for="cp">Pagamento (na entrega ou retirada)</label><select class="in" id="cp">${formas.map((f) => `<option>${esc(f)}</option>`).join("")}</select>
      <div id="trocoBox" hidden><label class="f" for="cx">Troco para quanto? (deixe vazio se não precisar)</label><input class="in" id="cx" inputmode="decimal"></div>
      ${(lj.cupons || []).some((c) => c.ativo !== false) ? `<label class="f" for="ccup">Cupom de desconto</label><div class="linha-btn"><input class="in" id="ccup" autocomplete="off" autocapitalize="characters" placeholder="Digite o cupom"><button type="button" class="btn ghost" id="aplicarCup">Aplicar</button></div><small id="cupMsg" role="status"></small>` : ""}
      <div class="sum" id="sum"></div>
      <div class="err" id="err"></div>
      <button class="btn pri cheio" id="enviar">Fazer pedido</button></div>`);
    const total = () => {
      const sub = sacola.reduce((x, l) => x + l.unit * l.qtd, 0);
      const t = modo !== "entrega" ? 0 : porRaio ? (loc && !loc.fora ? loc.taxa : 0) : taxas.find((t) => t.nome === $("#cb", s)?.value)?.taxa || 0;
      const desc = cupomAplicado ? Math.round(sub * cupomAplicado.pct) / 100 : 0;
      return { sub, taxa: t, desc, total: Math.max(0, sub - desc + t) };
    };
    // Entrega por raio: mapa + CEP/localização calculam a taxa e preenchem o endereço.
    if (porRaio) {
      ctl = localizador($("#loc", s), lj, { inicial: salvo.lat != null ? { lat: salvo.lat, lng: salvo.lng, cep: salvo.cep, rua: salvo.rua, bairro: salvo.bairro } : { cep: salvo.cep }, aoMudar: (r, dados) => {
        loc = r;
        const d = r || dados || {};
        // Preenche a rua sozinho, mas não apaga o que a pessoa já digitou.
        const campo = $("#ce", s);
        if (d.rua && (!campo.value.trim() || !ruaEditada)) campo.value = autoEnd = d.rua;
        if (d.numero && !$("#cnum", s).value.trim()) $("#cnum", s).value = d.numero;
        atualizar();
      } });
    }
    // CEP obrigatório: sem o mapa, confere no ViaCEP e já preenche a rua.
    let cepAchado = null; // null = ainda não conferido, true = existe, false = não existe
    const cepCampo = $("#ccep", s);
    if (cepCampo) {
      const conferir = async () => {
        const n = cepCampo.value.replace(/\D/g, "");
        cepAchado = null;
        if (n.length !== 8) return ($("#cepMsg", s).textContent = "");
        $("#cepMsg", s).textContent = "Conferindo o CEP…";
        try {
          const r = await buscarCep(n);
          cepAchado = true;
          $("#cepMsg", s).innerHTML = `<span class="ok-txt">${esc([r.rua, r.bairro, r.cidade].filter(Boolean).join(" · ") || "CEP encontrado")}</span>`;
          const campo = $("#ce", s);
          if (r.rua && (!campo.value.trim() || !ruaEditada)) campo.value = autoEnd = r.rua;
          // Sugere o bairro da lista que combina com o do CEP (a pessoa ainda pode trocar).
          const cb = $("#cb", s);
          if (cb && !cb.value && r.bairro) {
            const sa = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const ach = taxas.find((t) => sa(t.nome) === sa(r.bairro)) || taxas.find((t) => sa(t.nome).includes(sa(r.bairro)) || sa(r.bairro).includes(sa(t.nome)));
            if (ach) { cb.value = ach.nome; atualizar(); }
          }
        } catch (x) {
          if (/não encontrado/i.test(x.message)) { cepAchado = false; $("#cepMsg", s).innerHTML = `<span class="ruim-txt">CEP não encontrado. Confira os números.</span>`; }
          else $("#cepMsg", s).textContent = ""; // sem internet para conferir: vale o CEP digitado
        }
      };
      cepCampo.oninput = () => { cepCampo.value = fmtCep(cepCampo.value); conferir(); };
      if (cepCampo.value) conferir();
    }
    // Rua digitada à mão não é trocada pelo CEP; rua que veio de um pedido anterior (ou do CEP) é.
    $("#ce", s).addEventListener("input", () => { ruaEditada = true; atualizar(); });
    $("#cnum", s).addEventListener("input", () => atualizar());
    // Com o mapa, o número digitado aqui também vai para a busca do endereço.
    if (porRaio) {
      $("#cnum", s).addEventListener("input", () => { const n = $("[data-num]", s); if (n) n.value = $("#cnum", s).value; });
      // Terminou de digitar o número: refaz a busca para o ponto no mapa ficar mais certo.
      $("#cnum", s).addEventListener("change", () => { if (($("[data-cep]", s)?.value || "").replace(/\D/g, "").length === 8) ctl?.buscar(); });
    }
    const atualizar = () => {
      $$("[data-m]", s).forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === modo));
      $("#end", s).hidden = modo !== "entrega";
      $("#previsao", s).textContent = previsao(lj, modo) ? `⏱️ Previsão: ${previsao(lj, modo)}` : "";
      $("#trocoBox", s).hidden = $("#cp", s).value !== "Dinheiro";
      $("#linhas", s).innerHTML = sacola.map((l, i) => `<div class="cl"><div class="n"><b>${esc(l.nome)}</b>${l.det.map((d) => `<small>${esc(d)}</small>`).join("")}${l.obs ? `<small>Obs: ${esc(l.obs)}</small>` : ""}<small>${brl(l.unit * l.qtd)}</small></div>
        <div class="mini"><button class="ed" data-ed="${i}">Editar</button><button data-menos="${i}" aria-label="Diminuir">−</button><span>${l.qtd}</span><button data-mais="${i}" aria-label="Aumentar">+</button></div></div>`).join("") || `<p class="vazio">Sacola vazia.</p>`;
      const t = total();
      $("#sum", s).innerHTML = `<div><span>Itens</span><span>${brl(t.sub)}</span></div>${t.desc ? `<div class="ok-txt"><span>${cupomAplicado.codigo === PRIMEIRO ? "🎁 Desconto do primeiro pedido" : `Cupom ${esc(cupomAplicado.codigo)}`} (${cupomAplicado.pct}%)</span><span>- ${brl(t.desc)}</span></div>` : ""}${modo === "entrega" ? `<div><span>Entrega${porRaio && loc ? ` (${loc.area || kmTxt(loc.km)})` : ""}</span><span>${porRaio && !loc ? "a confirmar pelo restaurante" : !porRaio && taxas.length && !$("#cb", s)?.value ? "escolha o bairro" : brl(t.taxa)}</span></div>` : ""}<div class="t"><span>Total</span><span>${brl(t.total)}</span></div>${modo === "entrega" && $("#ce", s).value.trim() ? `<div class="addr-conf"><span>📍 Entregar em</span><span>${esc($("#ce", s).value.trim())}${$("#cnum", s).value.trim() ? ", " + esc($("#cnum", s).value.trim()) : ""}${$("#ccomp", s).value.trim() ? " - " + esc($("#ccomp", s).value.trim()) : ""}</span></div>` : ""}`;
      $$("[data-menos]", s).forEach((b) => (b.onclick = () => { const l = sacola[b.dataset.menos]; if (--l.qtd <= 0) sacola.splice(b.dataset.menos, 1); atualizar(); desenhar(); }));
      $$("[data-mais]", s).forEach((b) => (b.onclick = () => { sacola[b.dataset.mais].qtd++; atualizar(); desenhar(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(sacola[b.dataset.ed], "delivery", (novo) => { sacola[b.dataset.ed] = novo; atualizar(); desenhar(); }, { cliente: true })));
      $("#enviar", s).disabled = !sacola.length || (modo === "entrega" && porRaio && loc && loc.fora);
    };
    $$("[data-m]", s).forEach((b) => (b.onclick = () => { modo = b.dataset.m; atualizar(); }));
    // Cupom: confere na lista da loja; cada aparelho usa o mesmo cupom uma vez só.
    const usados = () => { try { return JSON.parse(localStorage.getItem("se_cupons") || "[]"); } catch { return []; } };
    $("#aplicarCup", s) && ($("#aplicarCup", s).onclick = () => {
      const cod = $("#ccup", s).value.trim().toUpperCase().replace(/\s+/g, "");
      const c = (lj.cupons || []).find((x) => x.ativo !== false && String(x.codigo || "").toUpperCase() === cod);
      const msg = $("#cupMsg", s);
      cupomAplicado = auto; // cupom vazio ou inválido: fica o desconto do primeiro pedido (se tiver)
      if (!cod) msg.innerHTML = "";
      else if (!c) msg.innerHTML = `<span class="ruim-txt">Cupom não encontrado ou fora da validade.</span>`;
      else if (usados().includes(c.codigo.toUpperCase())) msg.innerHTML = `<span class="ruim-txt">Esse cupom já foi usado neste aparelho.</span>`;
      else { cupomAplicado = { codigo: c.codigo.toUpperCase(), pct: Math.min(50, Number(c.pct) || 0) }; msg.innerHTML = `<span class="ok-txt">Cupom aplicado: ${cupomAplicado.pct}% de desconto nos itens ✓</span>`; }
      atualizar();
    });
    $$("select", s).forEach((x) => (x.onchange = atualizar));
    buscaNaLista($("#cb", s), { placeholder: "Digite seu bairro para achar mais rápido" });
    $("#enviar", s).onclick = async () => {
      const st = statusOnline(loja());
      if (!st.aberto) return ($("#err", s).textContent = `${st.texto}. Não estamos aceitando pedidos agora.`);
      const rua = $("#ce", s).value.trim(), num = $("#cnum", s).value.trim(), comp = $("#ccomp", s).value.trim();
      const cep = (porRaio ? $("[data-cep]", s)?.value || "" : $("#ccep", s)?.value || "").replace(/\D/g, "");
      const c = { nome: $("#cn", s).value.trim(), telefone: $("#ct", s).value.trim(), rua, numero: num, comp, cep, endereco: `${rua}, ${num}${comp ? " - " + comp : ""}`, bairro: porRaio ? loc?.bairro || "" : $("#cb", s)?.value || "", referencia: $("#cr", s).value.trim() };
      if (porRaio && loc && !loc.fora) Object.assign(c, { lat: loc.ponto[0], lng: loc.ponto[1], distanciaKm: loc.km != null ? Math.round(loc.km * 10) / 10 : null, area: loc.area || "" });
      const e = $("#err", s);
      e.textContent = "";
      const falta = (msg, sel) => { e.textContent = msg; const i = $(sel, s); if (i) { i.classList.add("falta"); i.focus(); i.addEventListener("input", () => i.classList.remove("falta"), { once: true }); } };
      if (!c.nome) return falta("Coloque seu nome.", "#cn");
      if (c.telefone.replace(/\D/g, "").length < 10) return falta("Coloque um WhatsApp com DDD.", "#ct");
      // Entrega: CEP (8 números), rua e número da casa são obrigatórios. "S/N" vale para casa sem número.
      if (modo === "entrega") {
        if (cep.length !== 8) return falta("Coloque o CEP completo (8 números). Sem o CEP não dá para entregar.", porRaio ? "[data-cep]" : "#ccep");
        if (!porRaio && cepAchado === false) return falta("CEP não encontrado. Confira os números.", "#ccep");
        if (!porRaio && taxas.length && !$("#cb", s)?.value) return falta("Escolha o seu bairro para ver a taxa de entrega.", "#cb");
        if (!rua) return falta("Coloque o nome da rua.", "#ce");
        if (!/\d/.test(num) && !/^s\s*\/?\s*n$/i.test(num)) return falta("Coloque o número da casa (ou S/N se não tiver).", "#cnum");
        if (porRaio && loc && loc.fora) return (e.textContent = "Esse endereço está fora da nossa área de entrega.");
      }
      // Última conferência: a pessoa vê exatamente o endereço que vai no pedido.
      if (modo === "entrega") {
        const qual = `${rua}, ${num}${comp ? " - " + comp : ""}${c.bairro ? " · " + c.bairro : ""} · CEP ${fmtCep(cep)}`;
        if (!(await confirmar("O endereço está certo?", qual, { ok: "Está certo, enviar pedido" }))) return;
      }
      const t = total();
      const forma = $("#cp", s).value;
      const trocoPara = forma === "Dinheiro" ? numero($("#cx", s).value) : 0;
      if (trocoPara && trocoPara < t.total) return (e.textContent = "O troco precisa ser maior que o total.");
      const btn = $("#enviar", s);
      btn.disabled = true; btn.textContent = "Enviando…";
      try {
        const id = await criarPedido({
          tipo: modo, origem: "online", cliente: modo === "entrega" ? c : { nome: c.nome, telefone: c.telefone },
          itens: sacola.map((l) => ({ ...l })), taxaEntrega: t.taxa, pagamento: { forma, trocoPara }, obs: "", // observação vai em cada item (sai junto do sabor no papel)
          ...(t.desc ? { cupom: { codigo: cupomAplicado.codigo, pct: cupomAplicado.pct }, descontoCupom: t.desc } : {}),
          ...(modo === "entrega" && porRaio && !loc ? { taxaPendente: true } : {}),
        });
        gravarLocal({ ...c, modo, ultimo: id });
        if (cupomAplicado && cupomAplicado.codigo !== PRIMEIRO) try { localStorage.setItem("se_cupons", JSON.stringify([...usados(), cupomAplicado.codigo])); } catch {}
        sacola.length = 0;
        fecharSheet();
        toast("Pedido enviado! Acompanhe aqui em cima.");
        acompanhar(id);
        desenhar();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (x) { erro(x); btn.disabled = false; btn.textContent = "Fazer pedido"; }
    };
    atualizar();
  };

  // Acompanhamento do pedido (consulta a cada 15 segundos)
  const acompanhar = async (id) => {
    clearTimeout(timer);
    if (!id) return;
    try { acompanhando = await store.obter("pedidos", id); } catch { acompanhando = null; }
    desenharAcomp();
    const fim = !acompanhando || ["concluido", "cancelado"].includes(acompanhando.status);
    if (!fim) timer = setTimeout(() => acompanhar(id), 15000);
  };
  // "Previsão: entre 20:40 e 21:00", contada a partir da hora do pedido.
  const previsaoHora = (p) => {
    if (["pronto", "saiu", "concluido", "cancelado"].includes(p.status)) return "";
    const lj = loja(), a = Number(lj[p.tipo === "entrega" ? "tempoEntregaMin" : "tempoRetiradaMin"]), b = Number(lj[p.tipo === "entrega" ? "tempoEntregaMax" : "tempoRetiradaMax"]);
    if (!(a > 0)) return "";
    return `<p class="previsao">⏱️ Previsão: ${b > a ? `entre ${hora(p.criadoEm + a * 60000)} e ${hora(p.criadoEm + b * 60000)}` : `por volta de ${hora(p.criadoEm + a * 60000)}`}</p>`;
  };
  const desenharAcomp = () => {
    const el = $("#acomp", raiz);
    if (!el) return;
    const p = acompanhando;
    if (!p || (p.status === "concluido" && Date.now() - (p.concluidoEm || 0) > 6 * 3600e3)) { el.innerHTML = ""; return; }
    const passos = p.tipo === "entrega" ? ["novo", "preparo", "saiu", "concluido"] : ["novo", "preparo", "pronto", "concluido"];
    const atual = passos.indexOf(p.status);
    const nomes = { ...ETAPAS, novo: "Pedido recebido", concluido: p.tipo === "entrega" ? "Entregue" : "Retirado", pronto: "Pronto para retirar" };
    el.innerHTML = p.status === "cancelado"
      ? `<div class="track"><h3>Pedido cancelado</h3><p class="muted">${esc(p.motivo || "Fale com a gente pelo telefone.")}</p><button class="btn sec sm" id="okAc">Ok</button></div>`
      : `<div class="track"><h3>Seu pedido${p.numero ? ` #${p.numero}` : ""}</h3><p class="muted">Feito às ${hora(p.criadoEm)} · ${brl(totalPedido(p))}</p>${previsaoHora(p)}
        <ol class="steps">${passos.map((k, i) => `<li class="${i < atual ? "done" : i === atual ? "now" : ""}">${esc(nomes[k])}</li>`).join("")}</ol>
        <details class="track-itens"><summary>Ver o que pedi</summary>
          ${itensValidos(p).map((i) => `<div class="cl"><div class="n"><b>${i.qtd}x ${esc(i.nome)}</b>${(i.det || []).map((d) => `<small>${esc(d)}</small>`).join("")}${i.obs ? `<small>Obs: ${esc(i.obs)}</small>` : ""}</div><div class="v">${brl(i.unit * i.qtd)}</div></div>`).join("")}
          ${p.descontoCupom ? `<div class="cl"><div class="n"><b>Cupom ${esc(p.cupom?.codigo || "")}</b></div><div class="v">- ${brl(p.descontoCupom)}</div></div>` : ""}
          ${p.tipo === "entrega" ? `<div class="cl"><div class="n"><b>Entrega</b>${p.taxaPendente ? `<small>Valor a confirmar pelo restaurante</small>` : ""}</div><div class="v">${p.taxaPendente ? "a confirmar" : brl(p.taxaEntrega || 0)}</div></div>` : ""}
          <div class="cl"><div class="n"><b>Total</b></div><div class="v"><b>${brl(totalPedido(p))}</b></div></div>
          ${p.tipo === "entrega" && p.cliente?.endereco ? `<small class="muted">📍 ${esc(p.cliente.endereco)}${p.cliente.bairro ? " · " + esc(p.cliente.bairro) : ""}</small>` : ""}
          <small class="muted">Pagamento: ${esc(p.pagamento?.forma || "")}${p.pagamento?.trocoPara ? ` · troco para ${brl(p.pagamento.trocoPara)}` : ""}</small>
        </details></div>`;
    const ok = $("#okAc", el);
    if (ok) ok.onclick = () => { gravarLocal({ ultimo: null }); acompanhando = null; desenharAcomp(); };
  };

  // O horário muda com o tempo: atualiza o "Aberto até…" sem redesenhar a tela toda.
  const relogio = setInterval(() => {
    const e = document.getElementById("statusOnline"), st = statusOnline(loja());
    if (e) { e.textContent = `${st.aberto ? "🟢" : "🔴"} ${st.texto}`; e.className = st.aberto ? "st-aberto" : "st-fechado"; }
  }, 30000);
  const parar = aoMudar(desenhar);
  desenhar();
  acompanhar(lerLocal().ultimo);
  return () => { parar(); clearTimeout(timer); clearInterval(relogio); };
}
