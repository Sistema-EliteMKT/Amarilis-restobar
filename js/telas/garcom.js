// App do garçom: mesas, comandas pelo número do cartão e lançamento de itens.
import { $, $$, esc, brl, hora, toast, erro, pedirTexto, confirmar, abrirSheet, fecharSheet, cabecalhoSheet, rodapeMarca, tempoDesde } from "../ui.js";
import { D, loja, aoMudar, situacaoMesa, comandasDaMesa, comandaAberta, abrirComanda, lancarItens, pedirConta, imprimirConta, subtotal, trocarMesa, rotuloComanda, cancelarItem, cancelarComanda, baseServico } from "../regras.js";
import { seletorProdutos, linhaItem } from "./seletor.js";
import { editarItem, editarLancado } from "./item.js";
import { receber } from "./pagamento.js";
import { abrirConta, trocarMesaUI } from "./conta.js";

export function telaGarcom(raiz, usuario, sair) {
  // nova: comanda acabou de ser aberta e talvez ainda não esteja na lista (ex.: sem internet)
  const V = { mesa: null, comanda: null, rascunho: [], nova: null };
  const comandaAtual = () => D.abertos.find((x) => x.id === V.comanda) || (V.nova?.id === V.comanda ? V.nova : null);

  const desenhar = () => {
    if (V.comanda) return desenharLancar();
    if (V.mesa != null) return desenharMesa();
    desenharMesas();
  };

  const topo = () => `<header class="g-top"><div class="who"><small>Garçom</small><b>${esc(usuario.nome)}</b></div>
    <button class="btn claro sm" id="sair">${usuario.papel === "garcom" ? "Sair" : "‹ Caixa"}</button></header>`;
  const ligarTopo = () => ($("#sair", raiz).onclick = sair);

  // Abre direto a comanda pelo número (ex.: garçom pega o cartão 120 na mão).
  const irParaComanda = (n) => {
    const c = comandaAberta(n);
    if (!c) return toast(`Comanda ${n} não está aberta.`);
    V.mesa = c.mesa; V.comanda = c.id; V.rascunho = []; desenhar();
  };

  function desenharMesas() {
    const n = Number(loja().nMesas) || 0;
    raiz.innerHTML = `${topo()}<div class="g-wrap">
      <div class="g-titulo"><h2>Mesas</h2>
        <form class="busca-com" id="buscaCom"><input class="in" id="numCom" inputmode="numeric" placeholder="Comanda nº" aria-label="Número da comanda"><button class="btn pri sm">Ir</button></form></div>
      <div class="legenda"><span class="m-livre">Livre</span><span class="m-ocupada">Ocupada</span><span class="m-conta">Pediu a conta</span></div>
      <div class="mesas">${Array.from({ length: n }, (_, i) => {
        const m = i + 1, s = situacaoMesa(m);
        return `<button class="mesa m-${s.status}" data-m="${m}"><b>${m}</b><small>${s.status === "livre" ? "Livre" : s.status === "conta" ? "Conta" : brl(s.total)}</small>${s.status === "livre" ? "" : `<em>${tempoDesde(s.desde)}</em>`}</button>`;
      }).join("")}</div>${rodapeMarca()}</div>`;
    ligarTopo();
    $$("[data-m]", raiz).forEach((b) => (b.onclick = () => { V.mesa = +b.dataset.m; desenhar(); }));
    $("#buscaCom", raiz).onsubmit = (e) => { e.preventDefault(); const v = $("#numCom", raiz).value.trim(); if (v) irParaComanda(v); };
  }

  // Garçons ativos; quem está logado vem primeiro.
  const atendentes = () => {
    const gs = D.usuarios.filter((u) => u.ativo !== false && (u.papel === "garcom" || u.id === usuario.id));
    if (!gs.some((u) => u.id === usuario.id)) gs.unshift(usuario);
    return gs.map((u) => `<option ${u.id === usuario.id ? "selected" : ""}>${esc(u.nome)}</option>`).join("");
  };

  const formAbrir = (primeira) => `<div class="card abrir"><b>${primeira ? "Abrir a mesa" : "Nova comanda nesta mesa"}</b>
      <p class="muted pq">${primeira ? "Uma comanda para a mesa inteira, ou uma para cada pessoa." : "Para quem vai pagar separado."}</p>
      <form id="fAbrir" class="form-comanda">
        <label class="f" for="fNum">Identificação da comanda <small class="muted">(opcional)</small></label><input class="in grande" id="fNum" inputmode="numeric" maxlength="5" placeholder="Nº do cartão">
        <label class="f" for="fAt">Atendente</label><select class="in" id="fAt">${atendentes()}</select>
        <div class="opts dois"><div><label class="f" for="fNome">Cliente <small class="muted">(opcional)</small></label><input class="in" id="fNome" autocomplete="off"></div>
          <div><label class="f" for="fPes">Nº de pessoas</label><input class="in" id="fPes" type="number" min="1" max="99" inputmode="numeric"></div></div>
        <button class="btn pri cheio grande">Avançar</button>
        <button type="button" class="btn ghost cheio" id="semCom">Lançar sem comanda</button></form>
      <div class="err" id="fErr"></div></div>`;

  const ligarAbrir = (focar) => {
    const f = $("#fAbrir", raiz);
    if (!f) return;
    const semCom = $("#semCom", raiz);
    if (semCom) semCom.onclick = () => { $("#fNum", raiz).value = ""; f.requestSubmit(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const num = $("#fNum", raiz).value.trim();
      $("#fErr", raiz).textContent = "";
      try {
        const id = await abrirComanda(V.mesa, num, $("#fNome", raiz).value, usuario, { atendente: $("#fAt", raiz).value, pessoas: $("#fPes", raiz).value });
        V.nova = { id, mesa: V.mesa, numero: num, nome: $("#fNome", raiz).value.trim(), aberto: true, itens: [] };
        V.comanda = id; V.rascunho = []; desenhar();
      } catch (x) {
        if (x.mesa) {
          // Comanda já aberta em outra mesa: não duplica; oferece ir para ela.
          $("#fErr", raiz).innerHTML = `${esc(x.message)} <button type="button" class="btn sec sm" id="irCom">Ir para a mesa ${x.mesa}</button>`;
          $("#irCom", raiz).onclick = () => { V.mesa = x.mesa; V.comanda = x.comanda; V.rascunho = []; desenhar(); };
        } else $("#fErr", raiz).textContent = x.message;
      }
    };
    if (focar) setTimeout(() => $("#fNum", raiz)?.focus(), 50);
  };

  function desenharMesa() {
    const cs = comandasDaMesa(V.mesa);
    const s = situacaoMesa(V.mesa);
    const status = { livre: "Livre", ocupada: "Aberta", conta: "Pediu a conta" }[s.status];
    raiz.innerHTML = `${topo()}<div class="g-wrap">
      <div class="g-cab"><button class="btn sec sm" id="voltar">‹ Mesas</button><h2>Mesa ${V.mesa}</h2><span class="pill st-${s.status}">${status}</span></div>
      ${cs.length ? `<p class="muted pq">Aberta às ${hora(s.desde)} · ${esc(cs[0].garcom || "")}${s.pessoas ? ` · ${s.pessoas} ${s.pessoas > 1 ? "pessoas" : "pessoa"}` : ""}</p>` : ""}
      ${cs.map((c) => `<div class="card comanda"><div class="card-h"><div><b>${esc(rotuloComanda(c))}${c.nome ? ` · ${esc(c.nome)}` : ""}</b>${c.status === "conta" ? `<small class="laranja">pediu a conta</small>` : ""}</div><b>${brl(subtotal(c))}</b></div>
        ${(c.itens || []).length ? c.itens.map((i) => linhaItem(i, { acoes: i.cancelado ? "" : `<button class="btn ghost sm" data-edl="${c.id}|${i.key}">Editar</button><button class="btn ghost sm perigo" data-ci="${c.id}|${i.key}">Remover</button>` })).join("") : `<p class="muted pq">Nenhum item ainda.</p>`}
        <button class="btn ghost cheio" data-lancar="${c.id}">+ Adicionar itens</button>
        <button class="btn ghost sm perigo g-cancelar" data-cc="${c.id}">Cancelar esta comanda</button></div>`).join("")}
      ${cs.length ? `<div class="g-acoes"><button class="btn sec" id="trocar">Trocar / juntar mesa</button><button class="btn sec" id="conta">${s.status === "conta" ? "Reimprimir conta" : "Pedir a conta"}</button></div>
        <button class="btn ok cheio" id="fechar">Fechar conta (receber)</button>
        <div class="total-mesa"><span>Total da mesa</span><b>${brl(s.total)}</b></div>` : ""}
      ${formAbrir(!cs.length)}
      ${rodapeMarca()}</div>`;
    ligarTopo();
    ligarAbrir(!cs.length);
    $("#voltar", raiz).onclick = () => { V.mesa = null; desenhar(); };
    $$("[data-edl]", raiz).forEach((b) => (b.onclick = () => {
      const [cid, key] = b.dataset.edl.split("|");
      const c = cs.find((x) => x.id === cid);
      editarLancado(c, c.itens.find((i) => i.key === key), usuario, "mesa", desenhar);
    }));
    $$("[data-lancar]", raiz).forEach((b) => (b.onclick = () => { V.comanda = b.dataset.lancar; V.rascunho = []; desenhar(); }));
    $("#trocar", raiz) && ($("#trocar", raiz).onclick = () => trocarMesaUI(cs, V.mesa, { aoFim: ({ n, todas }) => { if (todas) V.mesa = n; desenhar(); } }));
    $("#conta", raiz) && ($("#conta", raiz).onclick = () => escolherConta(cs));
    // Remover item já lançado: sai um aviso de cancelamento na impressora do setor.
    $$("[data-ci]", raiz).forEach((b) => (b.onclick = async () => {
      const [cid, key] = b.dataset.ci.split("|");
      const i = cs.find((x) => x.id === cid)?.itens.find((x) => x.key === key);
      const motivo = await pedirTexto(`Remover ${i ? `${i.qtd}x ${i.nome}` : "item"}`, "Motivo (ex.: cliente desistiu, lançado errado)", { ok: "Remover item" });
      if (motivo == null) return;
      try { await cancelarItem(cid, key, motivo, usuario); toast(`Item removido.${loja().imprimirCancelamento ? " Aviso enviado ao setor." : ""}`); } catch (e) { erro(e); }
      desenhar();
    }));
    $$("[data-cc]", raiz).forEach((b) => (b.onclick = async () => {
      const c = cs.find((x) => x.id === b.dataset.cc);
      const motivo = await pedirTexto(`Cancelar ${rotuloComanda(c)}`, "Motivo (a comanda é cancelada no sistema)", { ok: "Cancelar comanda" });
      if (motivo == null) return;
      try { await cancelarComanda(c.id, motivo, usuario); toast("Comanda cancelada."); } catch (e) { erro(e); }
      if (!comandasDaMesa(V.mesa).length) V.mesa = null;
      desenhar();
    }));
    $("#fechar", raiz) && ($("#fechar", raiz).onclick = () => escolherComandas(cs, "Fechar conta", "Receber", async (sel) => {
      const pag = await receber(sel, usuario, { servico: servicoDe(sel), titulo: `Fechar mesa ${V.mesa}`, salao: true });
      if (!pag) return;
      if (!comandasDaMesa(V.mesa).length) V.mesa = null;
      desenhar();
    }));
  }

  // Mesa com várias comandas: pergunta quais (uma só vai direto).
  function escolherComandas(cs, titulo, botao, fn) {
    const vivas = cs.filter((c) => c.aberto !== false);
    if (vivas.length === 1) return fn(vivas);
    const s = abrirSheet(`${cabecalhoSheet(`${titulo} · mesa ${V.mesa}`, "Marque as comandas")}<div class="sh-b">
      <div class="opts">${vivas.map((c) => `<label class="opt"><input type="checkbox" value="${c.id}" checked><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span><em>${brl(subtotal(c))}</em></label>`).join("")}</div>
      <button class="btn ok cheio" id="ok">${esc(botao)}</button></div>`);
    $("#ok", s).onclick = () => {
      const ids = $$("input:checked", s).map((i) => i.value);
      if (!ids.length) return toast("Marque pelo menos uma comanda.");
      fecharSheet();
      fn(vivas.filter((c) => ids.includes(c.id)));
    };
  }

  // Pedir a conta: abre a janela para escolher as comandas e a impressora (padrão: salão, Print iD).
  function escolherConta(cs) {
    abrirConta(cs, { origem: "salao", titulo: cs[0].status === "conta" ? "Reimprimir conta" : "Pedir a conta" });
  }

  function desenharLancar() {
    const c = comandaAtual();
    if (!c) { V.comanda = null; return desenhar(); }
    raiz.innerHTML = `${topo()}<div class="g-wrap lancar">
      <div class="g-cab"><button class="btn sec sm" id="voltar">‹ Mesa ${c.mesa}</button><h2>${esc(rotuloComanda(c))}</h2>${c.nome ? `<span class="pill">${esc(c.nome)}</span>` : ""}</div>
      <div id="sel"></div></div>
      <div class="gbar"><button class="btn pri cheio" id="ver" ${V.rascunho.length ? "" : "disabled"}></button></div>`;
    ligarTopo();
    const barra = () => {
      const n = V.rascunho.reduce((t, i) => t + i.qtd, 0);
      const tot = V.rascunho.reduce((t, i) => t + i.unit * i.qtd, 0);
      const b = $("#ver", raiz);
      b.disabled = !n;
      b.innerHTML = n ? `<span>Ver pedido (${n} ${n === 1 ? "item" : "itens"})</span><span>${brl(tot)}</span>` : "Escolha os itens";
    };
    $("#voltar", raiz).onclick = async () => {
      if (V.rascunho.length && !(await confirmar("Sair sem enviar?", "Os itens escolhidos ainda não foram para a produção.", { ok: "Sair sem enviar", perigo: true }))) return;
      V.comanda = null; V.rascunho = []; desenhar();
    };
    seletorProdutos($("#sel", raiz), (item) => {
      const igual = V.rascunho.find((r) => r.produtoId === item.produtoId && r.nome === item.nome && !r.obs && !item.obs && !r.det.length && !item.det.length);
      if (igual) igual.qtd += item.qtd; else V.rascunho.push(item);
      toast(`+ ${item.qtd}x ${item.nome}`);
      barra();
    }, { onde: "mesa" });
    $("#ver", raiz).onclick = () => verPedido(c, barra);
    barra();
  }

  function verPedido(c, barra) {
    const des = () => {
      const tot = V.rascunho.reduce((t, i) => t + i.unit * i.qtd, 0);
      const s = abrirSheet(`${cabecalhoSheet(`Mesa ${c.mesa} · ${rotuloComanda(c)}`, "Confira antes de enviar")}<div class="sh-b">
        ${V.rascunho.map((i, k) => `<div class="cl"><div class="n"><b>${esc(i.nome)}</b>${i.det.map((d) => `<small>${esc(d)}</small>`).join("")}${i.obs ? `<small class="obs">Obs: ${esc(i.obs)}</small>` : ""}<small>${brl(i.unit * i.qtd)}</small></div>
          <div class="mini"><button class="ed" data-ed="${k}">Editar</button><button data-menos="${k}" aria-label="Diminuir">−</button><span>${i.qtd}</span><button data-mais="${k}" aria-label="Aumentar">+</button></div></div>`).join("") || `<p class="vazio">Nada escolhido.</p>`}
        <div class="sum"><div class="t"><span>Total</span><span>${brl(tot)}</span></div></div>
        <button class="btn ok cheio grande" id="enviar" ${V.rascunho.length ? "" : "disabled"}>Enviar para produção</button>
        <button class="btn ghost cheio" id="mais">Continuar escolhendo</button></div>`);
      $$("[data-menos]", s).forEach((b) => (b.onclick = () => { const i = V.rascunho[b.dataset.menos]; if (--i.qtd <= 0) V.rascunho.splice(b.dataset.menos, 1); barra(); des(); }));
      $$("[data-mais]", s).forEach((b) => (b.onclick = () => { V.rascunho[b.dataset.mais].qtd++; barra(); des(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(V.rascunho[b.dataset.ed], "mesa", (novo) => { V.rascunho[b.dataset.ed] = novo; barra(); des(); })));
      $("#mais", s).onclick = fecharSheet;
      $("#enviar", s).onclick = async (ev) => {
        ev.currentTarget.disabled = true;
        try {
          await lancarItens(c.id, V.rascunho, usuario);
          fecharSheet();
          toast("Enviado para a produção ✓", "bom");
          V.rascunho = []; V.comanda = null; desenhar();
        } catch (e) { erro(e); ev.currentTarget.disabled = false; }
      };
    };
    des();
  }

  // Na tela de lançar, só redesenha se a comanda sumir (não atrapalha quem está escolhendo).
  const parar = aoMudar(() => {
    if (V.comanda) { if (!comandaAtual()) desenhar(); return; }
    if (document.activeElement?.closest?.("#fAbrir, #buscaCom")) return; // digitando o número
    desenhar();
  });
  desenhar();
  return parar;
}

export const servicoDe = (cs) => {
  const pct = Number(loja().taxaServico) || 0;
  return Math.round(baseServico(cs) * pct) / 100; // itens "sem serviço" (rodízio) ficam de fora
};
