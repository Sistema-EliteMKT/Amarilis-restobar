// Painel do caixa: pedidos (entrega/retirada/balcão), mesas, motoboys, resumo, impressoras, cardápio e ajustes.
import { $, $$, esc, brl, hora, minutos, toast, erro, bip, pedirTexto, confirmar, buscaNaLista, abrirSheet, fecharSheet, cabecalhoSheet, rodapeMarca, numero, icone, tempoDesde } from "../ui.js";
import {
  D, loja, aoMudar, ETAPAS, situacaoMesa, comandasDaMesa, subtotal, totalPedido, itensValidos, tituloPedido,
  criarPedido, aceitarPedido, mudarEtapa, cancelarPedido, concluirPedido, cancelarItem, cancelarComanda, moverItem,
  abrirComanda, lancarItens, imprimirConta, imprimirVia, pedirConta, imprimirPorSetor, imprimirJunto,
  rotuloComanda, desvioDe, desviarImpressora, imprimirViaOnline, textoPedido,
} from "../regras.js";
import { store } from "../store.js";
import { seletorProdutos, linhaItem } from "./seletor.js";
import { editarItem, editarLancado } from "./item.js";
import { receber } from "./pagamento.js";
import { abaFluxo } from "./fluxo.js";
import { abrirConta, trocarMesaUI } from "./conta.js";
import { abaPromocoes } from "./promocoes.js";
import { barraOnline } from "./horario-ui.js";
import { entregaPorRaio, localizador, kmTxt } from "../entrega.js";
import { servicoDe } from "./garcom.js";
import { abaMotoboys, abaImpressao, abaRelatorio, abaCardapio, abaAjustes, abaEquipe } from "./gestao.js";

const ABAS = [
  ["pedidos", "Pedidos"], ["mesas", "Mesas"], ["fluxo", "Caixa"], ["motoboys", "Motoboys"], ["equipe", "Equipe"], ["relatorio", "Resumo"],
  ["impressao", "Impressoras"], ["cardapio", "Cardápio"], ["promocoes", "Promoções"], ["ajustes", "Ajustes"],
];
const TIPO = { entrega: "Delivery", retirada: "Retirada", balcao: "Balcão" };

export function telaCaixa(raiz, usuario, { sair, modoGarcom }) {
  let aba = sessionStorage.getItem("se_aba") || "mesas"; // restobar: o salão é o principal
  const vistos = new Set();
  let primeira = true;
  const admin = usuario.papel === "admin";
  const mbEscolhido = {}; // motoboy escolhido no cartão, antes de despachar
  let buscaPed = "", buscaMesa = "";
  const sem = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Casa o que foi digitado com nome, telefone, número do pedido/comanda, mesa, endereço ou atendente.
  const casaPedido = (p, q) => {
    const c = p.cliente || {};
    const campos = [p.nome, c.nome, c.telefone, c.endereco, c.bairro, c.rua, p.numero && `#${p.numero}`, p.numero, p.mesa && `mesa ${p.mesa}`, p.garcom, p.atendente, p.criadoPor];
    const dig = q.replace(/\D/g, "");
    return campos.some((x) => x != null && sem(x).includes(q)) || (dig.length >= 4 && String(c.telefone || "").replace(/\D/g, "").includes(dig));
  };
  // Põe o foco de volta na barra de busca depois de redesenhar a aba.
  const refocar = (el, sel) => { const n = $(sel, el); if (n) { n.focus(); const l = n.value.length; n.setSelectionRange(l, l); } };

  const desenhar = () => {
    // Aviso sonoro de pedido online novo
    const novos = D.abertos.filter((p) => p.status === "novo");
    const chegaram = novos.filter((p) => !vistos.has(p.id));
    chegaram.forEach((p) => vistos.add(p.id));
    if (chegaram.length && !primeira) { bip(3); toast("Pedido novo pelo cardápio online!", "bom"); }
    // Imprime a via de todo pedido online novo ainda sem papel (inclusive os que chegaram com o caixa fechado).
    novos.forEach((p) => imprimirViaOnline(p));
    primeira = false;
    if (!raiz.dataset.pronto) {
      raiz.dataset.pronto = "1";
      const lj = loja();
      raiz.innerHTML = `<div class="cx">
        <aside class="cx-side">
          <div class="cx-logo">${lj.logo ? `<img src="${esc(lj.logo)}" alt="${esc(lj.nome)}">` : `<b>${esc(lj.nome)}</b>`}</div>
          <nav class="cx-nav" id="abas" aria-label="Seções do caixa"></nav>
          <div class="cx-user"><span class="cx-avatar">${esc((usuario.nome || "?").trim().charAt(0).toUpperCase())}</span><span class="cx-quem"><b>${esc(usuario.nome)}</b><small>${admin ? "Administrador" : "Caixa"}</small></span>
            <button class="cx-sair" id="sair" title="Sair" aria-label="Sair">${icone("sair")}</button></div>
        </aside>
        <div class="cx-main">
          <header class="cx-top">
            <div class="cx-tit"><h1 id="tituloAba"></h1><span class="cx-data">${(() => { const d = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); return d.charAt(0).toUpperCase() + d.slice(1); })()} · <b id="relogioCx"></b></span></div>
            <div class="cx-acoes"><button class="btn pri" id="novo">${icone("mais")}Novo pedido</button><button class="btn ghost" id="abrirMesa">${icone("mesas")}Abrir mesa</button><button class="btn ghost" id="garcom">${icone("celular")}Modo garçom</button></div>
          </header>
          <div id="avisoImp"></div>
          <main class="cx-corpo" id="corpo"></main>
          ${rodapeMarca()}
        </div></div>`;
      $("#sair", raiz).onclick = sair;
      $("#garcom", raiz).onclick = modoGarcom;
      $("#novo", raiz).onclick = () => novoPedido();
      $("#abrirMesa", raiz).onclick = () => abrirMesaCaixa();
      atualizarAba();
    } else atualizarAba(true);
    atualizarAbas();
  };

  const atualizarAbas = () => {
    const cont = {
      pedidos: D.abertos.filter((p) => p.status === "novo").length,
      mesas: new Set(D.abertos.filter((p) => p.tipo === "mesa" && p.status === "conta").map((p) => p.mesa)).size,
      impressao: D.impressoes.filter((j) => j.status === "erro").length,
      fluxo: D.caixa ? 0 : "!",
    };
    avisoImpressora();
    $("#abas", raiz).innerHTML = ABAS.filter(([k]) => admin || k !== "ajustes")
      .map(([k, l]) => `<button class="cx-item" data-aba="${k}" aria-pressed="${aba === k}">${icone(k)}<span>${l}</span>${cont[k] ? `<span class="badge">${cont[k]}</span>` : ""}</button>`).join("");
    const t = $("#tituloAba", raiz); if (t) t.textContent = (ABAS.find(([k]) => k === aba) || ABAS[0])[1];
    $$("[data-aba]", raiz).forEach((b) => (b.onclick = () => { aba = b.dataset.aba; sessionStorage.setItem("se_aba", aba); atualizarAbas(); atualizarAba(); }));
  };

  // Aviso no topo: desvio de emergência ligado, ou impressora dando erro (com botão para desviar).
  const avisoImpressora = () => {
    const el = $("#avisoImp", raiz);
    if (!el) return;
    const lj = loja();
    const nome = (id) => lj.impressoras.find((i) => i.id === id)?.nome || id;
    // Papéis esperando há mais de 90 s = o programa de impressão do computador do caixa não está rodando.
    const parados = D.impressoes.filter((j) => j.status === "pendente" && Date.now() - j.criadoEm > 90000);
    const alertaParado = parados.length ? `<div class="aviso-desvio" role="alert"><span>🖨️ ${parados.length} ${parados.length > 1 ? "papéis" : "papel"} esperando há ${Math.round((Date.now() - Math.min(...parados.map((j) => j.criadoEm))) / 60000)} min e nada está imprimindo. O programa de impressão do computador do caixa está desligado: abra o <b>iniciar.bat</b> nele.</span>
      <button class="btn sm" data-descartar>Descartar os papéis antigos</button></div>` : "";
    const html = alertaParado + lj.impressoras.map((imp) => {
      const para = desvioDe(imp.id);
      if (para) return `<div class="aviso-desvio" role="status"><span>🚨 Desvio ligado: cupons da ${esc(nome(imp.id))} estão saindo na ${esc(nome(para))}.</span>
        <button class="btn sm" data-desf="${imp.id}">Voltar ao normal</button></div>`;
      const errs = D.impressoes.filter((j) => j.impressora === imp.id && j.status === "erro").length;
      const outra = lj.impressoras.find((i) => i.id !== imp.id && !desvioDe(i.id));
      if (!errs || !outra) return "";
      return `<div class="aviso-desvio" role="alert"><span>⚠️ ${esc(nome(imp.id))} não está imprimindo (${errs} cupom${errs > 1 ? "s" : ""} com erro).</span>
        <button class="btn sm" data-dsv="${imp.id}" data-para="${outra.id}">Mandar para a ${esc(nome(outra.id))}</button></div>`;
    }).join("");
    if (el.innerHTML !== html) el.innerHTML = html;
    $$("[data-descartar]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("Descartar papéis antigos", `Os ${parados.length} papéis que estão esperando não vão mais ser impressos (ao ligar o programa de impressão, eles saem todos de uma vez). Descartar?`, { ok: "Descartar", perigo: true }))) return;
      store.lote(parados.map((j) => ({ tipo: "salvar", col: "impressoes", id: j.id, dados: { status: "descartado", erro: "Descartado no caixa" } }))).then(() => toast("Papéis antigos descartados")).catch(erro);
    }));
    $$("[data-desf]", el).forEach((b) => (b.onclick = () => desviarImpressora(b.dataset.desf, "").then(() => toast("Desvio desligado", "bom")).catch(erro)));
    $$("[data-dsv]", el).forEach((b) => (b.onclick = () => desviarImpressora(b.dataset.dsv, b.dataset.para)
      .then((n) => toast(`Desvio ligado${n ? `: ${n} cupom${n > 1 ? "s" : ""} parado${n > 1 ? "s" : ""} já foi junto` : ""}`, "bom")).catch(erro)));
  };

  // porDados = redesenho porque algo mudou no banco. Ajustes tem formulário: não redesenha por baixo de quem digita.
  const atualizarAba = (porDados = false) => {
    const el = $("#corpo", raiz);
    if (!el || (porDados && aba === "ajustes")) return;
    if (porDados && el.contains(document.activeElement) && document.activeElement.matches("input,select,textarea")) return;
    const ctx = { usuario, admin };
    ({ pedidos: abaPedidos, mesas: abaMesas, fluxo: abaFluxo, promocoes: abaPromocoes, motoboys: abaMotoboys, equipe: abaEquipe, impressao: abaImpressao, relatorio: abaRelatorio, cardapio: abaCardapio, ajustes: abaAjustes }[aba] || abaPedidos)(el, ctx);
  };

  // ------------------------------------------------------------------ Pedidos
  const kpis = () => {
    const vendido = D.pagamentos.reduce((s, p) => s + p.total, 0);
    const andamento = D.abertos.filter((p) => p.tipo !== "mesa").length;
    const n = Number(loja().nMesas) || 0;
    const ocup = new Set(D.abertos.filter((p) => p.tipo === "mesa").map((p) => p.mesa)).size;
    const rua = new Set(D.abertos.filter((p) => p.status === "saiu" && p.motoboy?.id).map((p) => p.motoboy.id)).size;
    return `<div class="kpis"><div class="kpi k1">${icone("dinheiro")}<b>${brl(vendido)}</b><span>vendido hoje</span></div>
      <div class="kpi k2">${icone("pedidos")}<b>${andamento}</b><span>delivery, retirada e balcão</span></div>
      <div class="kpi k3">${icone("mesas")}<b>${ocup}<small>/${n}</small></b><span>mesas ocupadas</span><i class="kpi-barra"><i style="width:${n ? Math.round((ocup / n) * 100) : 0}%"></i></i></div>
      <div class="kpi k4">${icone("motoboys")}<b>${rua}</b><span>motoboys na rua</span></div></div>`;
  };

  function abaPedidos(el) {
    const ps = D.abertos.filter((p) => p.tipo !== "mesa");
    const por = (sts) => ps.filter((p) => sts.includes(p.status)).sort((a, b) => a.criadoEm - b.criadoEm);
    const feitos = D.doDia.filter((p) => p.tipo !== "mesa" && !p.aberto).sort((a, b) => (b.concluidoEm || b.fechadoEm || 0) - (a.concluidoEm || a.fechadoEm || 0)).slice(0, 15);
    const col = (titulo, lista, vazio) => `<section class="coluna"><h3>${titulo}<span>${lista.length}</span></h3>${lista.length ? lista.map(cartao).join("") : `<p class="muted pq">${vazio}</p>`}</section>`;
    const q = sem(buscaPed.trim());
    const achados = q ? D.doDia.filter((p) => !["cancelado", "cancelada"].includes(p.status) && casaPedido(p, q)).sort((a, b) => b.criadoEm - a.criadoEm) : [];
    const resultado = q ? `<div class="card"><div class="card-h"><b>${achados.length} ${achados.length === 1 ? "resultado" : "resultados"} para “${esc(buscaPed.trim())}”</b><button class="btn ghost sm" id="limparBusca">Limpar busca</button></div>
      ${achados.map((p) => p.tipo === "mesa"
        ? `<div class="cl"><div class="n"><b>Mesa ${p.mesa} · ${esc(rotuloComanda(p))}${p.nome ? " · " + esc(p.nome) : ""}</b><small>${hora(p.criadoEm)} · ${esc(p.garcom || "")} · ${p.aberto ? (p.status === "conta" ? "pediu a conta" : "aberta") : "fechada"}</small></div><div class="v">${brl(subtotal(p))}${p.aberto ? `<button class="btn ghost sm" data-abrirmesa="${p.mesa}">Abrir mesa</button>` : ""}</div></div>`
        : cartao(p)).join("") || `<p class="vazio">Nada encontrado hoje.</p>`}</div>` : "";
    el.innerHTML = `${kpis()}
      <div class="busca-ped"><input class="in" id="buscaPed" type="search" placeholder="🔎 Buscar pedido por nome, telefone, nº do pedido, comanda ou mesa" value="${esc(buscaPed)}" aria-label="Buscar pedido"></div>
      ${resultado}
      <div id="barraOnline"></div>
      <div class="novos-ped"><button class="btn pri grande" data-novo="entrega">🛵 Novo pedido · Delivery</button><button class="btn sec grande" data-novo="retirada">🥡 Novo pedido · Retirada</button><button class="btn ghost grande" data-novo="balcao">🧾 Balcão</button></div>
      ${q ? "" : `<div class="colunas">
      ${col("Novos", por(["novo"]), "Nenhum.")}
      ${col("Em preparo", por(["preparo"]), "Nenhum.")}
      ${col("Pronto / na rua", por(["pronto", "saiu"]), "Nenhum.")}
      ${col("Concluídos", feitos, "Nenhum ainda.")}</div>`}`;
    barraOnline($("#barraOnline", el));
    $("#buscaPed", el).oninput = (e) => { buscaPed = e.target.value; abaPedidos(el); refocar(el, "#buscaPed"); };
    $("#limparBusca", el) && ($("#limparBusca", el).onclick = () => { buscaPed = ""; abaPedidos(el); });
    $$("[data-abrirmesa]", el).forEach((b) => (b.onclick = () => detalheMesa(+b.dataset.abrirmesa)));
    $$("[data-novo]", el).forEach((b) => (b.onclick = () => novoPedido(b.dataset.novo)));
    $$("[data-acao]", el).forEach((b) => (b.onclick = () => acaoPedido(b.dataset.acao, D.pedidos.find((p) => p.id === b.dataset.id))));
    $$("[data-mb]", el).forEach((s) => (s.onchange = () => (mbEscolhido[s.dataset.mb] = s.value)));
  }

  const cartao = (p) => {
    const c = p.cliente || {};
    const pg = p.pagamento || {};
    const motos = D.motoboys.filter((m) => m.ativo !== false);
    const principal = {
      novo: `<button class="btn ok cheio" data-acao="aceitar" data-id="${p.id}">Aceitar e imprimir</button>`,
      preparo: p.tipo === "entrega"
        ? `<select class="in" data-mb="${p.id}" aria-label="Motoboy"><option value="">Escolher motoboy…</option>${motos.map((m) => `<option value="${m.id}" ${mbEscolhido[p.id] === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select>
           <button class="btn pri cheio" data-acao="despachar" data-id="${p.id}">Saiu para entrega</button>`
        : `<button class="btn pri cheio" data-acao="pronto" data-id="${p.id}">Pronto</button>`,
      pronto: `<button class="btn ok cheio" data-acao="concluir" data-id="${p.id}">${p.pago ? "Retirado" : "Retirado e pago"}</button>`,
      saiu: `<button class="btn ok cheio" data-acao="concluir" data-id="${p.id}">${p.pago ? "Entregue" : "Entregue e pago"}</button>`,
    }[p.status] || "";
    const fim = !p.aberto;
    return `<article class="pedido ${p.status === "novo" ? "alerta" : ""}">
      <div class="pe-h"><b>#${esc(p.numero || "—")}</b><span class="pill ${p.tipo}">${TIPO[p.tipo]}</span><span class="muted">${hora(p.criadoEm)}</span></div>
      <b class="pe-nome">${esc(c.nome || TIPO[p.tipo])}</b>
      ${p.tipo === "entrega" && c.endereco ? `<small class="muted">${esc(c.endereco)}${c.bairro ? " · " + esc(c.bairro) : ""}</small>` : ""}
      <small class="muted">${esc(pg.forma || "")}${pg.trocoPara ? ` · troco p/ ${brl(pg.trocoPara)}` : ""}${p.origem === "online" ? " · pelo app" : ""}${!fim && p.status !== "novo" ? ` · há ${minutos(p.criadoEm)} min` : ""}</small>
      <div class="pe-itens">${itensValidos(p).map((i) => `<div><span>${i.qtd}x ${esc(i.nome)}${i.det?.length ? `<small>${esc(i.det.join(" · "))}</small>` : ""}${i.obs ? `<small class="obs">${esc(i.obs)}</small>` : ""}</span><span>${brl(i.unit * i.qtd)}</span></div>`).join("")}
        ${p.descontoCupom ? `<div><span>Cupom ${esc(p.cupom?.codigo || "")}</span><span>- ${brl(p.descontoCupom)}</span></div>` : ""}
        ${p.taxaEntrega ? `<div><span>Taxa de entrega${c.area ? ` · ${esc(c.area)}` : ""}</span><span>${brl(p.taxaEntrega)}</span></div>` : ""}
        ${p.taxaPendente ? `<div class="ruim-txt"><span><b>Taxa de entrega a confirmar</b> (endereço sem ponto no mapa)</span><span><button class="btn pri sm" data-acao="taxa" data-id="${p.id}">Definir taxa</button></span></div>` : ""}</div>
      ${p.obs ? `<small class="obs">Obs: ${esc(p.obs)}</small>` : ""}
      <div class="pe-t"><span>Total</span><b>${brl(totalPedido(p))}</b></div>
      ${p.motoboy?.nome ? `<small class="muted">Motoboy: <b>${esc(p.motoboy.nome)}</b></small>` : ""}
      ${fim ? `<div class="pe-fim">${p.status === "cancelado" ? `<span class="pill bad">Cancelado</span>` : `<span class="pill ok">Pago${p.pagamento?.forma ? " · " + esc(p.pagamento.forma) : ""}</span>`}</div>`
        : `<div class="pe-a">${principal}</div>
           <div class="pe-links">${p.status === "novo" ? `<button data-acao="recusar" data-id="${p.id}">Recusar</button>` : `<button data-acao="via" data-id="${p.id}">Imprimir tudo</button><button data-acao="setores" data-id="${p.id}">Imprimir por setor</button>`}<button data-acao="mais" data-id="${p.id}">Mais opções</button></div>`}
    </article>`;
  };

  async function acaoPedido(acao, p) {
    if (!p) return;
    try {
      if (acao === "aceitar") { await aceitarPedido(p, usuario); salvarCliente(p); toast("Aceito e enviado para impressão ✓", "bom"); }
      else if (acao === "recusar" || acao === "cancelar") {
        const motivo = await pedirTexto("Cancelar pedido", "Motivo (o cliente vê no acompanhamento)", { ok: "Cancelar pedido" });
        if (motivo == null) return;
        await cancelarPedido(p, motivo || "Pedido cancelado pela loja.", usuario);
      }
      else if (acao === "pronto") await mudarEtapa(p, "pronto");
      else if (acao === "taxa") await definirTaxa(p);
      else if (acao === "despachar") {
        if (p.taxaPendente && !(await definirTaxa(p))) return toast("Defina a taxa de entrega antes de sair.");
        const m = D.motoboys.find((x) => x.id === mbEscolhido[p.id]);
        if (!m && D.motoboys.some((x) => x.ativo !== false)) return toast("Escolha o motoboy.");
        await mudarEtapa(p, "saiu", { motoboy: m ? { id: m.id, nome: m.nome } : null });
        toast("Saiu para entrega");
      }
      else if (acao === "concluir") {
        if (p.taxaPendente && !(await definirTaxa(p))) return toast("Defina a taxa de entrega antes de concluir.");
        if (!p.pago) {
          const pag = await receber([p], usuario, { forma: p.pagamento?.forma, recebido: p.pagamento?.trocoPara, titulo: `Receber #${p.numero}` });
          if (!pag) return;
        }
        await concluirPedido(p);
      }
      else if (acao === "via") { await imprimirVia(p); toast("Papel com tudo enviado para impressão"); }
      else if (acao === "setores") { await imprimirPorSetor(p, usuario); toast("Um papel para cada setor enviado para impressão"); }
      else if (acao === "mais") maisPedido(p);
    } catch (e) { erro(e); }
  }

  function maisPedido(p) {
    const s = abrirSheet(`${cabecalhoSheet(`Pedido #${p.numero || ""}`, p.cliente?.nome || "")}<div class="sh-b">
      ${(p.itens || []).map((i) => linhaItem(i, { acoes: i.cancelado || p.pago ? "" : `<button class="btn ghost sm" data-edl="${i.key}">Editar</button>${p.status !== "novo" ? `<button class="mini-x" data-ci="${i.key}" title="Cancelar item">×</button>` : ""}` })).join("")}
      <div class="linha-btn wrap"><button class="btn sec" id="copiarPed">📋 Copiar pedido</button>
        ${p.cliente?.telefone ? `<a class="btn ok" id="zapPed" target="_blank" rel="noopener" href="https://wa.me/55${esc(p.cliente.telefone.replace(/\D/g, "").replace(/^55/, ""))}?text=${encodeURIComponent(textoPedido(p))}">💬 Enviar para o cliente no WhatsApp</a>` : ""}</div>
      <div class="linha-btn wrap">
        ${!p.pago && p.status !== "novo" ? `<button class="btn pri" id="addItens">+ Adicionar itens ao pedido</button>` : ""}
        ${p.tipo !== "mesa" ? `<button class="btn sec" id="edCli">Editar dados do cliente</button>` : ""}
        ${(p.tipo === "entrega" || p.tipo === "retirada") && !p.pago && p.aberto !== false ? `<button class="btn sec" id="trTipo">${p.tipo === "entrega" ? "🏪 Mudar para retirada" : "🛵 Mudar para delivery"}</button>` : ""}
        ${p.tipo === "entrega" && !p.pago ? `<button class="btn ${p.taxaPendente ? "pri" : "ghost"}" id="defTaxa">${p.taxaPendente ? "Definir taxa de entrega" : "Mudar taxa de entrega"}</button>` : ""}
        ${p.status !== "novo" ? `<button class="btn sec" id="impJunto">Imprimir tudo junto (sem valores)</button>` : ""}
        ${!p.pago && p.status !== "novo" ? `<button class="btn sec" id="pagar">Receber agora</button>` : ""}
        ${p.status === "saiu" || p.status === "pronto" ? `<button class="btn sec" id="voltarPreparo">Voltar para preparo</button>` : ""}
        <button class="btn perigo" id="cancelar">Cancelar pedido</button></div></div>`);
    $("#copiarPed", s).onclick = async () => {
      const t = textoPedido(p);
      try { await navigator.clipboard.writeText(t); toast("Pedido copiado ✓ É só colar na conversa.", "bom"); }
      catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); toast("Pedido copiado ✓", "bom"); } catch { toast("Não consegui copiar neste aparelho."); } a.remove(); }
    };
    $$("[data-edl]", s).forEach((b) => (b.onclick = () => editarLancado(p, p.itens.find((i) => i.key === b.dataset.edl), usuario, "delivery", () => fecharSheet())));
    $$("[data-ci]", s).forEach((b) => (b.onclick = async () => {
      const motivo = await pedirTexto("Cancelar item", "Motivo", { ok: "Cancelar item" });
      if (motivo == null) return;
      try { await cancelarItem(p.id, b.dataset.ci, motivo, usuario); toast(`Item cancelado.${loja().imprimirCancelamento ? " Aviso enviado ao setor." : ""}`); fecharSheet(); } catch (e) { erro(e); }
    }));
    $("#addItens", s) && ($("#addItens", s).onclick = () => adicionarNoPedido(p));
    $("#edCli", s) && ($("#edCli", s).onclick = () => editarCliente(p));
    $("#trTipo", s) && ($("#trTipo", s).onclick = () => trocarTipo(p));
    $("#defTaxa", s) && ($("#defTaxa", s).onclick = () => definirTaxa(p).then((ok) => ok && fecharSheet()).catch(erro));
    $("#impJunto", s) && ($("#impJunto", s).onclick = () => imprimirJunto(p, usuario).then(() => toast("Enviado para impressão")).catch(erro));
    $("#pagar", s) && ($("#pagar", s).onclick = () => receber([p], usuario, { forma: p.pagamento?.forma, recebido: p.pagamento?.trocoPara }));
    $("#voltarPreparo", s) && ($("#voltarPreparo", s).onclick = async () => { await mudarEtapa(p, "preparo"); fecharSheet(); });
    $("#cancelar", s).onclick = () => { fecharSheet(); acaoPedido("cancelar", p); };
  }

  // Cliente ligou para colocar mais coisa no pedido de delivery/retirada que já foi enviado.
  function adicionarNoPedido(p) {
    const itens = [];
    const s = abrirSheet(`${cabecalhoSheet(`Adicionar ao pedido #${p.numero || ""}`, p.cliente?.nome || "")}<div class="sh-b novo-ped">
      <div class="np-sel" id="sel"></div>
      <div class="np-form"><div class="grp">Itens a adicionar</div><div id="itens"></div><div class="sum" id="somaAd"></div>
        <button class="btn ok cheio grande" id="env">Adicionar e enviar para a cozinha</button></div></div>`, { largo: true });
    const atualizar = () => {
      $("#itens", s).innerHTML = itens.map((i, k) => linhaItem(i, { acoes: `<button class="btn ghost sm" data-ed="${k}">Editar</button><button class="mini-x" data-rm="${k}">×</button>` })).join("") || `<p class="vazio">Escolha os produtos ao lado.</p>`;
      $("#somaAd", s).innerHTML = itens.length ? `<div><span>Novo total do pedido</span><span>${brl(totalPedido(p) + itens.reduce((t, i) => t + i.unit * i.qtd, 0))}</span></div>` : "";
      $$("[data-rm]", s).forEach((b) => (b.onclick = () => { itens.splice(+b.dataset.rm, 1); atualizar(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(itens[b.dataset.ed], "delivery", (novo) => { itens[b.dataset.ed] = novo; atualizar(); })));
    };
    seletorProdutos($("#sel", s), (i) => { itens.push(i); atualizar(); }, { onde: "delivery" });
    $("#env", s).onclick = async (ev) => {
      if (!itens.length) return toast("Escolha os itens.");
      ev.currentTarget.disabled = true;
      try { await lancarItens(p.id, itens, usuario); toast("Itens adicionados e enviados para a cozinha ✓", "bom"); fecharSheet(); } catch (e) { erro(e); ev.currentTarget.disabled = false; }
    };
    atualizar();
  }

  const salvarCliente = (p) => {
    const tel = (p.cliente?.telefone || "").replace(/\D/g, "");
    if (tel.length >= 10) store.salvar("clientes", tel, { ...p.cliente, atualizadoEm: Date.now() }).catch(() => {});
  };

  // -------------------------------------------------------------- Novo pedido
  // O cliente pediu delivery e vai buscar (ou o contrário): troca o tipo do pedido já lançado.
  async function trocarTipo(p) {
    if (p.tipo === "entrega") {
      if (!(await confirmar("Mudar para retirada?", `O pedido #${p.numero || ""} passa a ser retirada no balcão e a taxa de entrega (${brl(p.taxaEntrega || 0)}) sai do total.`, { ok: "Mudar para retirada" }))) return;
      await store.salvar("pedidos", p.id, { tipo: "retirada", taxaAnterior: p.taxaEntrega || 0, taxaEntrega: 0, taxaPendente: false, motoboy: null, status: p.status === "saiu" ? "pronto" : p.status, mudouTipoEm: Date.now(), mudouTipoPor: usuario.nome });
      toast("Agora é retirada ✓ Use \"Imprimir tudo\" se precisar de um papel novo.", "bom"); fecharSheet(); return;
    }
    const c = p.cliente || {};
    const s = abrirSheet(`${cabecalhoSheet("Mudar para delivery", `Pedido #${p.numero || ""} · ${c.nome || ""}`)}<div class="sh-b">
      <label class="f" for="mdE">Endereço de entrega <b class="obrig">*</b></label><input class="in" id="mdE" value="${esc(c.endereco || "")}" placeholder="Rua, número, complemento">
      <label class="f" for="mdB">Bairro / taxa</label><select class="in" id="mdB">${(loja().taxasEntrega || []).map((t) => `<option value="${esc(t.nome)}" ${t.nome === c.bairro ? "selected" : ""}>${esc(t.nome)} · ${brl(t.taxa)}</option>`).join("")}<option value="">Outra taxa…</option></select>
      <input class="in" id="mdT" inputmode="decimal" placeholder="Taxa de entrega (R$)" ${(loja().taxasEntrega || []).length ? "hidden" : ""}>
      <label class="f" for="mdR">Referência</label><input class="in" id="mdR" value="${esc(c.referencia || "")}">
      <div class="err" id="err"></div><button class="btn ok cheio" id="mdOk">Mudar para delivery</button></div>`, { nivel: 2 });
    $("#mdB", s).onchange = () => { $("#mdT", s).hidden = $("#mdB", s).value !== ""; };
    buscaNaLista($("#mdB", s), { placeholder: "Buscar bairro" });
    $("#mdOk", s).onclick = async (ev) => {
      const endereco = $("#mdE", s).value.trim(), nomeB = $("#mdB", s).value;
      if (!endereco) return ($("#err", s).textContent = "Coloque o endereço de entrega.");
      const taxa = nomeB ? (loja().taxasEntrega || []).find((t) => t.nome === nomeB)?.taxa || 0 : numero($("#mdT", s).value);
      ev.currentTarget.disabled = true;
      try {
        await store.salvar("pedidos", p.id, { tipo: "entrega", cliente: { ...c, endereco, bairro: nomeB || c.bairro || "", referencia: $("#mdR", s).value.trim() }, taxaEntrega: taxa, taxaPendente: false, status: p.status === "pronto" ? "preparo" : p.status, mudouTipoEm: Date.now(), mudouTipoPor: usuario.nome });
        fecharSheet(); fecharSheet(); toast(`Agora é delivery ✓ Taxa ${brl(taxa)}`, "bom");
      } catch (x) { $("#err", s).textContent = x.message; ev.currentTarget.disabled = false; }
    };
  }

  // Corrige nome, telefone e endereço de um pedido já lançado (ex.: cliente do cardápio digitou errado).
  function editarCliente(p) {
    const c = p.cliente || {};
    const s = abrirSheet(`${cabecalhoSheet("Dados do cliente", `Pedido #${p.numero || ""}`)}<div class="sh-b">
      <label class="f" for="ecn">Nome <b class="obrig">*</b></label><input class="in" id="ecn" value="${esc(c.nome || "")}" autocomplete="off">
      <label class="f" for="ect">Telefone / WhatsApp <b class="obrig">*</b></label><input class="in" id="ect" type="tel" inputmode="tel" value="${esc(c.telefone || "")}">
      ${p.tipo === "entrega" ? `<label class="f" for="ece">Endereço (rua, número, complemento)</label><input class="in" id="ece" value="${esc(c.endereco || "")}">
        <label class="f" for="ecb">Bairro</label><input class="in" id="ecb" value="${esc(c.bairro || "")}">
        <label class="f" for="ecr">Referência</label><input class="in" id="ecr" value="${esc(c.referencia || "")}">` : ""}
      <label class="f" for="eco">Observação do pedido</label><input class="in" id="eco" value="${esc(p.obs || "")}">
      <div class="err" id="err"></div><button class="btn ok cheio" id="ecok">Salvar</button></div>`, { nivel: 2 });
    $("#ecok", s).onclick = async (ev) => {
      const nome = $("#ecn", s).value.trim(), tel = $("#ect", s).value.trim();
      if (!nome) return ($("#err", s).textContent = "Coloque o nome do cliente.");
      if (tel.replace(/\D/g, "").length < 10) return ($("#err", s).textContent = "Coloque o telefone com DDD.");
      ev.currentTarget.disabled = true;
      const cliente = { ...c, nome, telefone: tel };
      if (p.tipo === "entrega") Object.assign(cliente, { endereco: $("#ece", s).value.trim(), bairro: $("#ecb", s).value.trim(), referencia: $("#ecr", s).value.trim() });
      try { await store.salvar("pedidos", p.id, { cliente, obs: $("#eco", s).value.trim() }); fecharSheet(); toast("Dados do cliente atualizados ✓", "bom"); }
      catch (x) { $("#err", s).textContent = x.message; ev.currentTarget.disabled = false; }
    };
  }

  // Taxa de entrega de pedido que chegou sem ponto no mapa: precisa ser definida antes de o pedido sair.
  async function definirTaxa(p) {
    const v = await pedirTexto("Taxa de entrega", `Valor da taxa para ${p.cliente?.bairro || p.cliente?.endereco || "este endereço"} (R$)`, { valor: p.taxaEntrega ? String(p.taxaEntrega).replace(".", ",") : "", ok: "Salvar" });
    if (v == null) return false;
    const taxa = numero(v);
    if (!taxa && !(await confirmar("Sem taxa?", "Entregar sem cobrar taxa de entrega?", { ok: "Sem taxa" }))) return false;
    await store.salvar("pedidos", p.id, { taxaEntrega: taxa, taxaPendente: false });
    toast(`Taxa de entrega: ${brl(taxa)} ✓`, "bom");
    return true;
  }

  function novoPedido(tipoInicial = "entrega") {
    const lj = loja();
    const itens = [];
    let tipo = tipoInicial;
    const s = abrirSheet(`${cabecalhoSheet("Novo pedido", "Telefone, delivery, retirada ou balcão")}<div class="sh-b novo-ped">
      <div class="np-sel" id="sel"></div>
      <div class="np-form">
        <div class="seg" id="tipo"><button data-t="entrega">Delivery</button><button data-t="retirada">Retirada</button><button data-t="balcao">Balcão</button></div>
        <label class="f" for="tel">Telefone <b class="obrig">*</b></label><input class="in" id="tel" type="tel" inputmode="tel" placeholder="Digite e o cliente aparece">
        <label class="f" for="nom">Nome <b class="obrig">*</b></label><input class="in" id="nom">
        <div id="endBox"><label class="f" for="end">Endereço</label><input class="in" id="end">
          <label class="f" for="bai">Bairro / taxa</label><select class="in" id="bai">${(lj.taxasEntrega || []).map((t) => `<option value="${esc(t.nome)}">${esc(t.nome)} · ${brl(t.taxa)}</option>`).join("")}<option value="">Outra taxa…</option></select>
          <input class="in" id="taxaLivre" inputmode="decimal" placeholder="Taxa de entrega (R$)" hidden>
          ${entregaPorRaio(lj) ? `<button type="button" class="btn sec sm" id="porMapa">📍 Calcular taxa pelo CEP / mapa</button><small class="muted" id="mapaInfo"></small>` : ""}
          <label class="f" for="ref">Referência</label><input class="in" id="ref"></div>
        <label class="f" for="pg">Pagamento</label><select class="in" id="pg">${(lj.formasPagamento || []).map((f) => `<option>${esc(f)}</option>`).join("")}</select>
        <input class="in" id="troco" inputmode="decimal" placeholder="Troco para (R$)" hidden>
        <label class="f" for="obs">Observação</label><input class="in" id="obs">
        <div class="grp">Itens</div><div id="itens"></div>
        <div class="sum" id="sum"></div><div class="err" id="err"></div>
        <button class="btn ok cheio grande" id="criar">Lançar e imprimir</button>
      </div></div>`, { largo: true });
    const taxa = () => {
      if (tipo !== "entrega") return 0;
      const b = $("#bai", s).value;
      return b ? (lj.taxasEntrega || []).find((t) => t.nome === b)?.taxa || 0 : numero($("#taxaLivre", s).value);
    };
    const atualizar = () => {
      $$("[data-t]", s).forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === tipo));
      $("#endBox", s).hidden = tipo !== "entrega";
      $("#taxaLivre", s).hidden = $("#bai", s).value !== "";
      $("#troco", s).hidden = $("#pg", s).value !== "Dinheiro";
      $("#itens", s).innerHTML = itens.map((i, k) => linhaItem(i, { acoes: `<button class="btn ghost sm" data-ed="${k}">Editar</button><button class="mini-x" data-rm="${k}" aria-label="Tirar">×</button>` })).join("") || `<p class="vazio">Escolha os produtos ao lado.</p>`;
      $$("[data-rm]", s).forEach((b) => (b.onclick = () => { itens.splice(+b.dataset.rm, 1); atualizar(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(itens[b.dataset.ed], "delivery", (novo) => { itens[b.dataset.ed] = novo; atualizar(); })));
      const sub = itens.reduce((x, i) => x + i.unit * i.qtd, 0);
      $("#sum", s).innerHTML = `<div><span>Itens</span><span>${brl(sub)}</span></div>${tipo === "entrega" ? `<div><span>Entrega</span><span>${brl(taxa())}</span></div>` : ""}<div class="t"><span>Total</span><span>${brl(sub + taxa())}</span></div>`;
    };
    seletorProdutos($("#sel", s), (item) => { itens.push(item); toast(`+ ${item.qtd}x ${item.nome}`); atualizar(); }, { onde: "delivery" });
    $$("[data-t]", s).forEach((b) => (b.onclick = () => { tipo = b.dataset.t; atualizar(); }));
    ["#bai", "#pg"].forEach((q) => ($(q, s).onchange = atualizar));
    buscaNaLista($("#bai", s), { placeholder: "Buscar bairro (digite parte do nome)" });
    $("#taxaLivre", s).oninput = () => { geo = null; atualizar(); };
    let geo = null; // ponto calculado pelo mapa (vai junto no pedido)
    $("#porMapa", s) && ($("#porMapa", s).onclick = () => {
      let achou = null;
      const s2 = abrirSheet(`${cabecalhoSheet("Taxa pelo mapa", "CEP, localização ou toque no mapa")}<div class="sh-b"><div id="locx"></div>
        <button class="btn ok cheio" id="usarTaxa" disabled>Usar esta taxa</button></div>`, { nivel: 2 });
      localizador($("#locx", s2), lj, { aoMudar: (r, d) => {
        achou = r && !r.fora ? r : null;
        $("#usarTaxa", s2).disabled = !achou;
        if (r && r.rua && !$("#end", s).value.trim()) $("#end", s).value = r.rua + (r.numero ? ", " + r.numero : "");
      } });
      $("#usarTaxa", s2).onclick = () => {
        $("#bai", s).value = ""; $("#taxaLivre", s).value = String(achou.taxa).replace(".", ",");
        geo = { lat: achou.ponto[0], lng: achou.ponto[1], distanciaKm: achou.km != null ? Math.round(achou.km * 10) / 10 : null, area: achou.area || "", cep: achou.cep || "", bairro: achou.bairro || "" };
        $("#mapaInfo", s).textContent = achou.area ? ` Área ${achou.area}` : ` ${kmTxt(achou.km)} do restaurante`;
        fecharSheet(); atualizar();
      };
    });
    $("#tel", s).onchange = async () => {
      const tel = $("#tel", s).value.replace(/\D/g, "");
      if (tel.length < 10) return;
      try {
        const c = await store.obter("clientes", tel);
        if (!c) return;
        if (!$("#nom", s).value) $("#nom", s).value = c.nome || "";
        if (!$("#end", s).value) $("#end", s).value = c.endereco || "";
        if (!$("#ref", s).value) $("#ref", s).value = c.referencia || "";
        if (c.bairro && [...$("#bai", s).options].some((o) => o.value === c.bairro)) $("#bai", s).value = c.bairro;
        toast("Cliente encontrado ✓"); atualizar();
      } catch {}
    };
    $("#criar", s).onclick = async (ev) => {
      const e = $("#err", s);
      if (!itens.length) return (e.textContent = "Coloque pelo menos um item.");
      const cliente = { nome: $("#nom", s).value.trim(), telefone: $("#tel", s).value.trim() };
      if (!cliente.nome) return (e.textContent = "Coloque o nome do cliente.");
      if (tipo !== "balcao" && cliente.telefone.replace(/\D/g, "").length < 10) return (e.textContent = "Coloque o telefone do cliente com DDD.");
      if (tipo === "entrega") Object.assign(cliente, { endereco: $("#end", s).value.trim(), bairro: $("#bai", s).value || geo?.bairro || "", referencia: $("#ref", s).value.trim() }, geo ? { lat: geo.lat, lng: geo.lng, distanciaKm: geo.distanciaKm, area: geo.area, cep: geo.cep } : {});
      if (tipo === "entrega" && !cliente.endereco) return (e.textContent = "Coloque o endereço.");
      const forma = $("#pg", s).value;
      ev.currentTarget.disabled = true;
      try {
        const dados = { tipo, origem: "caixa", cliente, itens, taxaEntrega: taxa(), pagamento: { forma, trocoPara: forma === "Dinheiro" ? numero($("#troco", s).value) : 0 }, obs: $("#obs", s).value.trim(), criadoPor: usuario.nome };
        await criarPedido(dados, usuario);
        salvarCliente(dados);
        fecharSheet();
        toast("Pedido lançado e enviado para impressão ✓", "bom");
        aba = "pedidos"; atualizarAbas(); atualizarAba();
      } catch (x) { erro(x); ev.currentTarget.disabled = false; }
    };
    atualizar();
  }

  // -------------------------------------------------------------------- Mesas
  let filtroMesa = "todas";
  function abaMesas(el) {
    const n = Number(loja().nMesas) || 0;
    const qm = sem(buscaMesa.trim());
    const tudo = Array.from({ length: n }, (_, i) => ({ m: i + 1, ...situacaoMesa(i + 1) }));
    const todas = tudo.filter((s) => s.status !== "livre");
    const oc = todas.filter((s) => !qm || String(s.m) === qm.replace(/^mesa\s*/, "") || s.comandas.some((c) => casaPedido(c, qm)))
      .filter((s) => filtroMesa !== "conta" || s.status === "conta")
      .sort((a, b) => (b.status === "conta") - (a.status === "conta") || a.desde - b.desde);
    const pedindo = todas.filter((m) => m.status === "conta").length;
    const pessoas = todas.reduce((s, m) => s + (m.pessoas || 0), 0);
    const noFiltro = (s) => filtroMesa === "todas" || (filtroMesa === "livres" ? s.status === "livre" : filtroMesa === "conta" ? s.status === "conta" : s.status !== "livre");
    // Mapa do salão: todas as mesas de uma vez. Mesa livre abre comanda; ocupada abre as comandas dela.
    const mapa = tudo.filter(noFiltro).map((s) => {
      const min = s.desde ? Math.round((Date.now() - s.desde) / 60000) : 0;
      return `<button class="sm-mesa st-${s.status} ${s.status === "ocupada" && min >= 120 ? "demora" : ""}" data-mp="${s.m}" title="${s.status === "livre" ? `Mesa ${s.m} livre: abrir comanda` : `Mesa ${s.m}: ver comandas`}">
        <span class="sm-n">${s.m}</span>
        ${s.status === "livre" ? `<span class="sm-l">Livre</span>` : `<span class="sm-v">${brl(s.total)}</span><span class="sm-t">${icone("relogio", "ic mini")}${tempoDesde(s.desde)}${s.pessoas ? ` · ${s.pessoas}p` : ""}</span>${s.status === "conta" ? `<span class="sm-tag">Conta</span>` : ""}`}
        ${s.status !== "livre" && s.comandas[0]?.garcom ? `<span class="sm-g">${esc(s.comandas[0].garcom)}</span>` : ""}</button>`;
    }).join("");
    el.innerHTML = `<div class="kpis"><div class="kpi k3">${icone("mesas")}<b>${todas.length}<small>/${n}</small></b><span>mesas ocupadas</span><i class="kpi-barra"><i style="width:${n ? Math.round((todas.length / n) * 100) : 0}%"></i></i></div>
      <div class="kpi k1">${icone("dinheiro")}<b>${brl(todas.reduce((s, m) => s + m.total, 0))}</b><span>em comandas abertas</span></div>
      <div class="kpi k4 ${pedindo ? "chama" : ""}">${icone("sino")}<b>${pedindo}</b><span>pedindo a conta</span></div>
      <div class="kpi k2">${icone("pessoas")}<b>${pessoas}</b><span>pessoas no salão</span></div></div>
      <section class="salao"><div class="salao-h"><h2>Salão</h2>
        <div class="seg salao-f" role="group" aria-label="Filtrar mesas">${[["todas", "Todas"], ["abertas", "Abertas"], ["conta", "Conta"], ["livres", "Livres"]].map(([v, l]) => `<button data-fm="${v}" aria-pressed="${filtroMesa === v}">${l}</button>`).join("")}</div></div>
        <div class="legenda"><span class="m-livre">Livre</span><span class="m-ocupada">Aberta</span><span class="m-conta">Pediu a conta</span><span class="m-demora">Aberta há mais de 2h</span></div>
        <div class="salao-grade">${mapa || `<p class="vazio">Nenhuma mesa neste filtro.</p>`}</div></section>
      <div class="salao-h"><h2>Comandas abertas</h2></div>
      <div class="busca-ped"><input class="in" id="buscaMesa" type="search" placeholder="🔎 Buscar mesa, comanda ou nome do cliente" value="${esc(buscaMesa)}" aria-label="Buscar mesa"></div>
      <div class="grade-mesas">${oc.map((s) => `<article class="card mesa-card ${s.status === "conta" ? "conta" : ""}">
        <div class="card-h"><b class="mc-t">Mesa ${s.m}</b><span class="pill ${s.status === "conta" ? "bad" : "st-ocupada"}">${s.status === "conta" ? "Pediu a conta" : "Aberta"}</span></div>
        <small class="muted">${esc(s.comandas[0].garcom || "")} · desde ${hora(s.desde)} (${tempoDesde(s.desde)})${s.pessoas ? ` · ${s.pessoas} ${s.pessoas > 1 ? "pessoas" : "pessoa"}` : ""} · ${s.comandas.length} ${s.comandas.length > 1 ? "comandas" : "comanda"}</small>
        <div class="pe-itens">${s.comandas.map((c) => `${s.comandas.length > 1 || c.nome ? `<div class="sub"><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span><span>${brl(subtotal(c))}</span></div>` : ""}
          ${itensValidos(c).map((i) => `<div><span>${i.qtd}x ${esc(i.nome)}</span><span>${brl(i.unit * i.qtd)}</span></div>`).join("")}`).join("")}</div>
        <div class="pe-t"><span>Total</span><b>${brl(s.total)}</b></div>
        <button class="btn pri cheio" data-fechar="${s.m}">Fechar conta</button>
        <div class="pe-links"><button data-imp="${s.m}">Imprimir conta</button><button data-set="${s.m}">Imprimir por setor</button><button data-det="${s.m}">Lançar / editar</button><button data-troc="${s.m}">Trocar mesa</button></div>
      </article>`).join("") || `<p class="vazio">${qm ? "Nenhuma mesa com esse nome ou número." : filtroMesa === "conta" ? "Nenhuma mesa pediu a conta." : "Nenhuma mesa aberta. Toque numa mesa livre do salão para abrir."}</p>`}</div>`;
    $$("[data-fm]", el).forEach((b) => (b.onclick = () => { filtroMesa = b.dataset.fm; abaMesas(el); }));
    $$("[data-mp]", el).forEach((b) => (b.onclick = () => { const m = +b.dataset.mp; if (situacaoMesa(m).status === "livre") abrirMesaCaixa(m); else detalheMesa(m); }));
    $("#buscaMesa", el).oninput = (e) => { buscaMesa = e.target.value; abaMesas(el); refocar(el, "#buscaMesa"); };
    const cs = (m) => comandasDaMesa(+m);
    $$("[data-fechar]", el).forEach((b) => (b.onclick = () => escolher(cs(b.dataset.fechar), "Fechar conta", (sel) =>
      receber(sel, usuario, { servico: servicoDe(sel), titulo: `Fechar mesa ${b.dataset.fechar}` }))));
    $$("[data-imp]", el).forEach((b) => (b.onclick = () => abrirConta(cs(b.dataset.imp), { origem: "caixa" })));
    $$("[data-det]", el).forEach((b) => (b.onclick = () => detalheMesa(+b.dataset.det)));
    $$("[data-troc]", el).forEach((b) => (b.onclick = () => trocarMesaUI(cs(b.dataset.troc), +b.dataset.troc)));
    $$("[data-set]", el).forEach((b) => (b.onclick = () => escolher(cs(b.dataset.set), "Imprimir por setor", async (sel) => {
      for (const c of sel) await imprimirPorSetor(c, usuario);
      toast("Um papel para cada setor enviado para impressão");
      fecharSheet();
    })));
  }

  // Mesmos campos do app do garçom: comanda, atendente, cliente, pessoas e mesa.
  function abrirMesaCaixa(mesaInicial) {
    const gs = D.usuarios.filter((u) => u.ativo !== false && u.papel === "garcom");
    const s = abrirSheet(`${cabecalhoSheet("Criar comanda", "Abre a comanda e já escolhe os itens")}<div class="sh-b">
      <label class="f" for="abCom">Identificação da comanda <small class="muted">(opcional: em branco lança sem comanda)</small></label><input class="in grande" id="abCom" inputmode="numeric" maxlength="5" placeholder="Nº do cartão">
      <label class="f" for="abAt">Atendente</label><select class="in" id="abAt">${gs.map((u) => `<option>${esc(u.nome)}</option>`).join("")}<option>${esc(usuario.nome)}</option></select>
      <div class="opts dois"><div><label class="f" for="abNome">Cliente <small class="muted">(opcional)</small></label><input class="in" id="abNome" autocomplete="off"></div>
        <div><label class="f" for="abPes">Nº de pessoas</label><input class="in" id="abPes" type="number" min="1" max="99" inputmode="numeric"></div></div>
      <label class="f" for="abMesa">Mesa</label><select class="in grande" id="abMesa"><option value="">Escolha a mesa</option>${Array.from({ length: Number(loja().nMesas) || 0 }, (_, i) => {
        const st = situacaoMesa(i + 1).status;
        return `<option value="${i + 1}" ${mesaInicial === i + 1 ? "selected" : ""}>Mesa ${i + 1}${st === "livre" ? "" : " (ocupada)"}</option>`;
      }).join("")}</select>
      <div class="err" id="aerr"></div><button class="btn pri cheio grande" id="ok">Avançar</button></div>`);
    setTimeout(() => $("#abCom", s).focus(), 50);
    $("#ok", s).onclick = async () => {
      const mesa = Number($("#abMesa", s).value);
      if (!mesa) return ($("#aerr", s).textContent = "Escolha a mesa.");
      try {
        const id = await abrirComanda(mesa, $("#abCom", s).value, $("#abNome", s).value, usuario, { atendente: $("#abAt", s).value, pessoas: $("#abPes", s).value });
        lancarNaComanda(id, fecharSheet);
      } catch (e) { $("#aerr", s).textContent = e.message; }
    };
  }

  function detalheMesa(mesa) {
    const desenharMesa = () => {
      const cs = comandasDaMesa(mesa);
      if (!cs.length) return fecharSheet();
      const s = abrirSheet(`${cabecalhoSheet(`Mesa ${mesa}`, `${cs.length} comanda(s) · ${brl(cs.reduce((x, c) => x + subtotal(c), 0))}`)}<div class="sh-b">
        ${cs.map((c) => `<div class="card comanda"><div class="card-h"><div><b>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</b><small>${esc(c.garcom || "")} · ${hora(c.criadoEm)}</small></div><b>${brl(subtotal(c))}</b></div>
          ${(c.itens || []).map((i) => linhaItem(i, { acoes: i.cancelado ? "" : `<button class="btn ghost sm" data-edl="${c.id}|${i.key}">Editar</button><button class="mini-x" data-ci="${c.id}|${i.key}" title="Cancelar item">×</button>${cs.length > 1 ? `<button class="mini-x" data-mv="${c.id}|${i.key}" title="Passar para outra comanda">⇄</button>` : ""}` })).join("") || `<p class="muted pq">Sem itens.</p>`}
          <div class="linha-btn wrap"><button class="btn sec sm" data-lc="${c.id}">+ Itens</button><button class="btn ghost sm" data-rs="${c.id}">Imprimir por setor</button><button class="btn ghost sm" data-rj="${c.id}">Imprimir tudo junto</button><button class="btn ghost sm" data-cc="${c.id}">Cancelar comanda</button></div></div>`).join("")}
        <div class="g-acoes"><button class="btn sec" id="nova">+ Outra comanda nesta mesa</button><button class="btn pri" id="fecharMesa">Fechar conta · ${brl(cs.reduce((x, c) => x + subtotal(c), 0))}</button></div></div>`, { largo: true });
      $("#fecharMesa", s).onclick = () => escolher(comandasDaMesa(mesa), "Fechar conta", (sel) => receber(sel, usuario, { servico: servicoDe(sel), titulo: `Fechar mesa ${mesa}` }));
      $("#nova", s).onclick = async () => {
        const num = await pedirTexto(`Nova comanda · mesa ${mesa}`, "Número da comanda", { ok: "Abrir", tipo: "number" });
        if (!num) return;
        try { const id = await abrirComanda(mesa, num, "", usuario); lancarNaComanda(id, desenharMesa); } catch (e) { erro(e); }
      };
      $$("[data-lc]", s).forEach((b) => (b.onclick = () => lancarNaComanda(b.dataset.lc, desenharMesa)));
      const comanda = (id) => cs.find((c) => c.id === id);
      $$("[data-rs]", s).forEach((b) => (b.onclick = () => imprimirPorSetor(comanda(b.dataset.rs), usuario).then(() => toast("Um papel para cada setor enviado")).catch(erro)));
      $$("[data-rj]", s).forEach((b) => (b.onclick = () => imprimirJunto(comanda(b.dataset.rj), usuario).then(() => toast("Papel com tudo enviado")).catch(erro)));
      $$("[data-edl]", s).forEach((b) => (b.onclick = () => {
        const [cid, key] = b.dataset.edl.split("|");
        const c = cs.find((x) => x.id === cid);
        editarLancado(c, c.itens.find((i) => i.key === key), usuario, "mesa", desenharMesa);
      }));
      $$("[data-ci]", s).forEach((b) => (b.onclick = async () => {
        const [cid, key] = b.dataset.ci.split("|");
        const motivo = await pedirTexto("Cancelar item", "Motivo", { ok: "Cancelar item" });
        if (motivo != null) { try { await cancelarItem(cid, key, motivo, usuario); toast(`Item cancelado.${loja().imprimirCancelamento ? " Aviso enviado ao setor." : ""}`); } catch (e) { erro(e); } }
        desenharMesa();
      }));
      $$("[data-mv]", s).forEach((b) => (b.onclick = () => {
        const [cid, key] = b.dataset.mv.split("|");
        const s2 = abrirSheet(`${cabecalhoSheet("Passar item para…")}<div class="sh-b"><div class="opts">${cs.filter((c) => c.id !== cid).map((c) => `<button class="opt" data-dst="${c.id}"><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span></button>`).join("")}</div></div>`, { nivel: 2 });
        $$("[data-dst]", s2).forEach((d) => (d.onclick = async () => { fecharSheet(); try { await moverItem(cid, key, d.dataset.dst); } catch (e) { erro(e); } desenharMesa(); }));
      }));
      $$("[data-cc]", s).forEach((b) => (b.onclick = async () => {
        const motivo = await pedirTexto("Cancelar comanda inteira", "Motivo", { ok: "Cancelar comanda" });
        if (motivo != null) { try { await cancelarComanda(b.dataset.cc, motivo, usuario); toast("Comanda cancelada."); } catch (e) { erro(e); } }
        desenharMesa();
      }));
    };
    desenharMesa();
  }

  // Escolhe quais comandas entram (juntas) na conta.
  function escolher(cs, titulo, fn) {
    if (cs.length === 1) return Promise.resolve(fn(cs)).catch(erro);
    const s = abrirSheet(`${cabecalhoSheet(titulo, "Marque as comandas que entram juntas")}<div class="sh-b">
      <div class="opts">${cs.map((c) => `<label class="opt"><input type="checkbox" value="${c.id}" checked><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span><em>${brl(subtotal(c))}</em></label>`).join("")}</div>
      <button class="btn pri cheio" id="ok">Continuar</button></div>`);
    $("#ok", s).onclick = () => {
      const ids = $$("input:checked", s).map((i) => i.value);
      if (!ids.length) return toast("Marque pelo menos uma.");
      Promise.resolve(fn(cs.filter((c) => ids.includes(c.id)))).catch(erro);
    };
  }

  function lancarNaComanda(id, voltar) {
    const itens = [];
    const c = D.abertos.find((x) => x.id === id) || {};
    const s = abrirSheet(`${cabecalhoSheet(`Mesa ${c.mesa ?? ""} · ${rotuloComanda(c)}`, "Escolha os itens e envie para a produção")}<div class="sh-b novo-ped">
      <div class="np-sel" id="sel"></div>
      <div class="np-form"><div class="grp">Itens a enviar</div><div id="itens"></div><button class="btn ok cheio grande" id="env">Enviar para produção</button></div></div>`, { largo: true });
    const atualizar = () => {
      $("#itens", s).innerHTML = itens.map((i, k) => linhaItem(i, { acoes: `<button class="btn ghost sm" data-ed="${k}">Editar</button><button class="mini-x" data-rm="${k}">×</button>` })).join("") || `<p class="vazio">Escolha os produtos.</p>`;
      $$("[data-rm]", s).forEach((b) => (b.onclick = () => { itens.splice(+b.dataset.rm, 1); atualizar(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(itens[b.dataset.ed], "mesa", (novo) => { itens[b.dataset.ed] = novo; atualizar(); })));
    };
    seletorProdutos($("#sel", s), (i) => { itens.push(i); atualizar(); }, { onde: "mesa" });
    $(".x", s).onclick = voltar;
    $("#env", s).onclick = async () => {
      if (!itens.length) return toast("Escolha os itens.");
      try { await lancarItens(id, itens, usuario); toast("Enviado para a produção ✓", "bom"); voltar(); } catch (e) { erro(e); }
    };
    atualizar();
  }

  const parar = aoMudar(desenhar);
  delete raiz.dataset.pronto;
  desenhar();
  // O aviso de impressão parada depende da hora que passa, não só de mudanças no banco.
  const tique = () => { const r = $("#relogioCx", raiz); if (r) r.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  const tempos = setInterval(() => { if (!raiz.isConnected) return clearInterval(tempos); tique(); if (aba === "mesas") atualizarAba(true); }, 30000);
  setTimeout(tique, 0);
  const relogio = setInterval(() => { if (raiz.isConnected) { avisoImpressora(); const b = $("#barraOnline", raiz); if (b && aba === "pedidos") barraOnline(b); } }, 20000);
  return () => { parar(); clearInterval(relogio); };
}
