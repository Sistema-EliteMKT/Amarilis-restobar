// Aba "Caixa": abrir o caixa com o fundo de troco, sangria / reforço / despesa e fechar com a conferência do dinheiro.
import { $, $$, esc, brl, hora, toast, erro, abrirSheet, fecharSheet, cabecalhoSheet, numero, valorCampo, confirmar } from "../ui.js";
import { D, loja, abrirCaixa, movimentoCaixa, resumoCaixa, fecharCaixa, reimprimirFechamento, TIPOS_MOV } from "../regras.js";
import { hoje } from "../ui.js";

const dataHora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function abaFluxo(el, { usuario }) {
  const cx = D.caixa;
  if (!cx) return desenharFechado(el, usuario);
  const velho = cx.dia !== hoje();
  el.innerHTML = `${velho ? `<div class="aviso-desvio" role="alert"><span>⚠️ Este caixa abriu em ${esc(dataHora(cx.abertoEm))} e ainda não foi fechado. Feche para começar o dia certo.</span></div>` : ""}
    <div class="card"><div class="card-h"><div><b>🟢 Caixa aberto</b><small>desde ${esc(dataHora(cx.abertoEm))} · ${esc(cx.abertoPor || "")} · fundo de troco ${brl(cx.fundo)}</small></div>
      <button class="btn pri" id="fecharCx">Fechar caixa</button></div>
      <div class="linha-btn wrap"><button class="btn sec" data-mov="sangria">Sangria</button><button class="btn sec" data-mov="suprimento">Reforço de troco</button><button class="btn sec" data-mov="despesa">Despesa</button></div>
      <p class="muted pq">Sangria: tirar dinheiro da gaveta (ex.: levar para o cofre). Reforço: colocar troco. Despesa: pagou algo com o dinheiro do caixa. Pagamento de freelancer fica na aba Freelancers e também desconta daqui.</p></div>
    <div id="rCx"><p class="muted">Calculando…</p></div>`;
  $("#fecharCx", el).onclick = () => fechar(cx, usuario);
  $$("[data-mov]", el).forEach((b) => (b.onclick = () => movimento(b.dataset.mov, usuario)));
  resumoCaixa(cx).then((r) => {
    const alvo = $("#rCx", el);
    if (!alvo || D.caixa?.id !== cx.id) return;
    alvo.innerHTML = corpoResumo(cx, r);
  }).catch((e) => { const a = $("#rCx", el); if (a) a.innerHTML = `<p class="ruim-txt">${esc(e.message)}</p>`; });
}

function corpoResumo(cx, r) {
  const linha = (a, b, cl = "") => `<div class="${cl}"><span>${a}</span><span>${b}</span></div>`;
  return `<div class="grade">
    <div class="card"><b>Dinheiro na gaveta (esperado)</b><div class="sum">
      ${linha("Fundo de troco", brl(cx.fundo))}${linha("+ Dinheiro das vendas", brl(r.dinheiroVendas))}
      ${r.suprimentos ? linha("+ Reforços", brl(r.suprimentos)) : ""}${r.sangrias ? linha("− Sangrias", brl(r.sangrias)) : ""}
      ${r.despesas ? linha("− Despesas", brl(r.despesas)) : ""}${r.freelaDinheiro ? linha("− Freelancers (dinheiro)", brl(r.freelaDinheiro)) : ""}
      ${linha("Deve ter na gaveta", brl(r.esperado), "t")}</div></div>
    <div class="card"><b>Vendas desde a abertura</b><div class="sum">
      ${Object.entries(r.porForma).map(([f, v]) => linha(esc(f), brl(v))).join("") || `<p class="vazio">Nada recebido ainda.</p>`}
      ${linha("Total recebido", brl(r.vendas), "t")}${linha("Contas", r.contas)}${r.servico ? linha("Taxa de serviço", brl(r.servico)) : ""}${r.desconto ? linha("Descontos", brl(r.desconto)) : ""}</div></div></div>
    <div class="card"><b>Movimentações</b>${r.movimentos.map((m) => `<div class="cl"><div class="n"><b>${esc(TIPOS_MOV[m.tipo])}</b><small>${hora(m.criadoEm)}${m.motivo ? " · " + esc(m.motivo) : ""} · ${esc(m.por)}</small></div><div class="v">${m.tipo === "suprimento" ? "+" : "−"} ${brl(m.valor)}</div></div>`).join("") || `<p class="vazio">Nenhuma ainda.</p>`}</div>`;
}

function desenharFechado(el, usuario) {
  const fechados = D.caixasDia;
  el.innerHTML = `<div class="card"><div class="card-h"><div><b>🔴 Caixa fechado</b><small>Abra o caixa no começo do expediente, contando o troco que está na gaveta.</small></div></div>
      <label class="f" for="fundo">Fundo de troco (dinheiro na gaveta agora)</label><input class="in" id="fundo" inputmode="decimal" placeholder="0,00">
      <div class="err" id="err"></div><button class="btn ok cheio grande" id="abrirCx">Abrir caixa</button></div>
    ${fechados.length ? `<div class="card"><b>Caixas fechados hoje</b>${fechados.map((c) => `<div class="cl"><div class="n"><b>${dataHora(c.abertoEm)} → ${dataHora(c.fechadoEm)}</b><small>${esc(c.fechadoPor || "")} · vendas ${brl(c.resumo?.vendas || 0)} · contado ${brl(c.contado)} · ${c.diferenca === 0 ? "bateu" : c.diferenca < 0 ? "faltou " + brl(-c.diferenca) : "sobrou " + brl(c.diferenca)}</small></div>
      <div class="v"><button class="btn ghost sm" data-re="${c.id}">Imprimir</button></div></div>`).join("")}</div>` : ""}`;
  $("#abrirCx", el).onclick = async (ev) => {
    ev.currentTarget.disabled = true;
    try { await abrirCaixa(numero($("#fundo", el).value), usuario); toast("Caixa aberto ✓", "bom"); } catch (e) { $("#err", el).textContent = e.message; ev.currentTarget.disabled = false; }
  };
  $$("[data-re]", el).forEach((b) => (b.onclick = () => reimprimirFechamento(D.caixasDia.find((c) => c.id === b.dataset.re)).then(() => toast("Enviado para impressão")).catch(erro)));
}

function movimento(tipo, usuario) {
  const s = abrirSheet(`${cabecalhoSheet(TIPOS_MOV[tipo])}<div class="sh-b">
    <label class="f" for="mv">Valor (R$)</label><input class="in" id="mv" inputmode="decimal" placeholder="0,00">
    <label class="f" for="mm">${tipo === "sangria" ? "Para onde / motivo" : tipo === "despesa" ? "O que foi pago" : "Motivo (opcional)"}</label><input class="in" id="mm" maxlength="80">
    <div class="err" id="err"></div><button class="btn ok cheio" id="ok">Registrar${tipo === "sangria" ? " e imprimir comprovante" : ""}</button></div>`);
  $("#ok", s).onclick = async (ev) => {
    const valor = numero($("#mv", s).value), motivo = $("#mm", s).value.trim();
    if (!(valor > 0)) return ($("#err", s).textContent = "Coloque o valor.");
    if (tipo === "despesa" && !motivo) return ($("#err", s).textContent = "Diga o que foi pago.");
    ev.currentTarget.disabled = true;
    try { await movimentoCaixa(tipo, valor, motivo, usuario); fecharSheet(); toast("Registrado ✓", "bom"); } catch (e) { $("#err", s).textContent = e.message; ev.currentTarget.disabled = false; }
  };
}

async function fechar(cx, usuario) {
  let r;
  try { r = await resumoCaixa(cx); } catch (e) { return erro(e); }
  // Todas as formas de pagamento (menos dinheiro), mesmo as que não tiveram venda: débito, crédito, Pix, vale…
  const formasCartao = [...new Set([...(loja().formasPagamento || []), ...Object.keys(r.porForma)])].filter((f) => f !== "Dinheiro" && f !== "Convênio");
  const s = abrirSheet(`${cabecalhoSheet("Fechar caixa", `Aberto às ${dataHora(cx.abertoEm)}`)}<div class="sh-b">
    <div class="sum"><div><span>Dinheiro que deve ter na gaveta</span><b>${brl(r.esperado)}</b></div></div>
    <label class="f" for="cont">Dinheiro contado na gaveta (R$)</label><input class="in" id="cont" inputmode="decimal" placeholder="0,00">
    <div class="sum" id="dif"></div>
    <div class="grp">Conferir cartão e Pix <small>coloque o total que a maquininha mostra</small></div>
    ${formasCartao.map((f, i) => `<div class="conf-lin"><div><b>${esc(f)}</b><small>sistema: ${brl(r.porForma[f] || 0)}</small></div>
      <input class="in" inputmode="decimal" data-cf="${i}" placeholder="0,00" aria-label="Total de ${esc(f)} na maquininha"><span class="conf-dif" data-cd="${i}"></span></div>`).join("")}
    <label class="f" for="obs">Observação (opcional)</label><input class="in" id="obs" maxlength="120">
    <div class="err" id="err"></div><button class="btn ok cheio" id="ok">Fechar caixa e imprimir</button></div>`);
  const dif = () => {
    const c = numero($("#cont", s).value), d = Math.round((c - r.esperado) * 100) / 100;
    $("#dif", s).innerHTML = $("#cont", s).value.trim() === "" ? "" : d === 0 ? `<div class="troco"><span>Bateu certinho ✓</span><span>${brl(0)}</span></div>` : d < 0 ? `<div class="falta"><span>Faltou</span><span>${brl(-d)}</span></div>` : `<div class="troco"><span>Sobrou</span><span>${brl(d)}</span></div>`;
  };
  $("#cont", s).oninput = dif;
  const difCartao = () => formasCartao.forEach((f, i) => {
    const v = $(`[data-cf="${i}"]`, s).value.trim(), alvo = $(`[data-cd="${i}"]`, s);
    if (v === "") return (alvo.textContent = "");
    const d = Math.round((numero(v) - (r.porForma[f] || 0)) * 100) / 100;
    alvo.className = "conf-dif " + (d === 0 ? "ok-txt" : "ruim-txt");
    alvo.textContent = d === 0 ? "bateu ✓" : d < 0 ? `faltou ${brl(-d)}` : `sobrou ${brl(d)}`;
  });
  $$("[data-cf]", s).forEach((e) => (e.oninput = difCartao));
  $("#ok", s).onclick = async (ev) => {
    if ($("#cont", s).value.trim() === "") return ($("#err", s).textContent = "Conte o dinheiro da gaveta e coloque o valor.");
    ev.currentTarget.disabled = true;
    // Só vai para o fechamento o que foi preenchido.
    const conferencia = {};
    formasCartao.forEach((f, i) => { const v = $(`[data-cf="${i}"]`, s).value.trim(); if (v !== "") conferencia[f] = { sistema: r.porForma[f] || 0, informado: numero(v) }; });
    try { await fecharCaixa(cx, numero($("#cont", s).value), $("#obs", s).value.trim(), usuario, conferencia); fecharSheet(); toast("Caixa fechado. Resumo enviado para impressão ✓", "bom"); } catch (e) { $("#err", s).textContent = e.message; ev.currentTarget.disabled = false; }
  };
}
