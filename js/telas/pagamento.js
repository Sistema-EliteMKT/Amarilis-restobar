// Janela de receber pagamento (fecha mesa ou pedido). Aceita dividir em várias formas.
import { $, $$, esc, brl, numero, valorCampo, toast, erro, avisoDesfazer, abrirSheet, fecharSheet, cabecalhoSheet } from "../ui.js";
import { D, loja, totalPedido, registrarPagamento, dinheiro, imprimirComprovante, imprimirRecibo, baseServico, desfazerPagamento, FORMA_CONVENIO } from "../regras.js";

// Resolve com o pagamento registrado, ou null se fechou sem receber.
export function receber(pedidos, quem, { servico = 0, forma = "", titulo = "Receber", recebido = 0, salao = false } = {}) {
  return new Promise((res) => {
    const lj = loja();
    const formas = [...(lj.formasPagamento || ["Dinheiro"]).filter((f) => f !== FORMA_CONVENIO), FORMA_CONVENIO];
    const equipe = [...D.usuarios.filter((u) => u.ativo !== false), ...D.motoboys.filter((m) => m.ativo !== false)].map((u) => u.nome);
    const sub = dinheiro(pedidos.reduce((s, p) => s + totalPedido(p), 0));
    const linhas = [{ forma: forma || formas[0], valor: 0 }];
    let comServico = servico > 0;
    // Serviço pela porcentagem escolhida na hora (padrão: a da loja); o valor sugerido já vem arredondado.
    const valorServ = () => (comServico ? dinheiro((baseServico(pedidos) * Math.min(30, Math.max(0, Number($("#spct", s)?.value) || 0))) / 100) : 0);
    const s = abrirSheet(`${cabecalhoSheet(titulo, pedidos.map((p) => p.nome || p.cliente?.nome || "").filter(Boolean).join(", "))}<div class="sh-b">
      <div class="sum"><div><span>Subtotal</span><span>${brl(sub)}</span></div></div>
      ${!D.caixa && !D.leve ? `<p class="ruim-txt pq">⚠️ O caixa está fechado. Abra na aba Caixa para o recebimento entrar no fechamento.</p>` : ""}
      ${servico > 0 ? `<div class="opt serv-lin"><label><input type="checkbox" id="serv" checked><span>Taxa de serviço</span></label>
        <input class="in" id="spct" type="number" min="0" max="30" step="0.5" value="${Number(lj.taxaServico) || 0}" aria-label="Porcentagem do serviço"><span>%</span><em id="servV">${brl(servico)}</em></div>` : ""}
      <label class="f" for="desc">Desconto (R$)</label><input class="in" id="desc" inputmode="decimal" placeholder="0,00">
      <div class="grp">Formas de pagamento <small>pode dividir</small></div>
      <div id="formas"></div>
      <button class="btn ghost sm" id="maisForma">+ Outra forma</button>
      <div class="dividir"><span class="muted">Dividir igual por</span>${[2, 3, 4, 5, 6].map((n) => `<button class="chip" data-div="${n}">${n}</button>`).join("")}<span id="divTxt" class="muted"></span></div>
      <label class="f" for="cpf">CPF na nota (opcional)</label><input class="in" id="cpf" inputmode="numeric" placeholder="Só números">
      <div class="sum" id="sum"></div>
      <label class="opt"><input type="checkbox" id="comp"><span>Imprimir comprovante</span></label>
      <label class="opt"><input type="checkbox" id="rec"><span>Imprimir recibo para o cliente assinar <small>(a loja guarda)</small></span></label>
      <div class="err" id="err"></div>
      <button class="btn ok cheio" id="ok">Confirmar recebimento</button></div>`);
    const total = () => dinheiro(sub + valorServ() - numero($("#desc", s).value));
    const pago = () => dinheiro(linhas.reduce((x, l) => x + (Number(l.valor) || 0), 0));
    const desenharFormas = () => {
      $("#formas", s).innerHTML = linhas.map((l, i) => `<div class="forma"><select class="in" data-f="${i}">${formas.map((f) => `<option ${f === l.forma ? "selected" : ""}>${esc(f)}</option>`).join("")}</select>
        <input class="in" data-v="${i}" inputmode="decimal" value="${valorCampo(l.valor)}" aria-label="Valor">${l.forma === FORMA_CONVENIO ? `<select class="in conv-func" data-fn="${i}" aria-label="Funcionário"><option value="">Funcionário…</option>${equipe.map((n) => `<option ${n === l.func ? "selected" : ""}>${esc(n)}</option>`).join("")}<option value="__outro" ${l.func && !equipe.includes(l.func) ? "selected" : ""}>Outro…</option></select>${l.func && !equipe.includes(l.func) || l.outro ? `<input class="in" data-fo="${i}" placeholder="Nome do funcionário" value="${esc(l.func || "")}">` : ""}` : ""}${linhas.length > 1 ? `<button class="mini-x" data-x="${i}" aria-label="Tirar">×</button>` : ""}</div>`).join("");
      $$("[data-f]", s).forEach((e) => (e.onchange = () => { linhas[e.dataset.f].forma = e.value; desenharFormas(); }));
      $$("[data-fn]", s).forEach((e) => (e.onchange = () => { const l = linhas[e.dataset.fn]; l.outro = e.value === "__outro"; l.func = l.outro ? "" : e.value; desenharFormas(); }));
      $$("[data-fo]", s).forEach((e) => (e.oninput = () => { linhas[e.dataset.fo].func = e.value.trim(); }));
      $$("[data-v]", s).forEach((e) => (e.oninput = () => { linhas[e.dataset.v].valor = numero(e.value); resumo(); }));
      $$("[data-x]", s).forEach((e) => (e.onclick = () => { linhas.splice(+e.dataset.x, 1); completar(); }));
    };
    // A última linha recebe o que falta.
    const completar = () => {
      const outros = linhas.slice(0, -1).reduce((x, l) => x + (Number(l.valor) || 0), 0);
      linhas[linhas.length - 1].valor = Math.max(0, dinheiro(total() - outros));
      desenharFormas(); resumo();
    };
    const resumo = () => {
      const t = total(), p = pago();
      $("#sum", s).innerHTML = `<div class="t"><span>Total</span><span>${brl(t)}</span></div>
        <div><span>Recebido</span><span>${brl(p)}</span></div>
        ${p > t ? `<div class="troco"><span>Troco</span><span>${brl(p - t)}</span></div>` : p < t ? `<div class="falta"><span>Falta</span><span>${brl(t - p)}</span></div>` : ""}`;
    };
    const mostrarServ = () => { $("#servV", s) && ($("#servV", s).textContent = brl(valorServ())); };
    $("#serv", s) && ($("#serv", s).onchange = (e) => { comServico = e.target.checked; mostrarServ(); completar(); });
    $("#spct", s) && ($("#spct", s).oninput = () => { mostrarServ(); completar(); });
    $("#desc", s).oninput = completar;
    $("#maisForma", s).onclick = () => { linhas.push({ forma: formas.find((f) => !linhas.some((l) => l.forma === f)) || formas[0], valor: 0 }); completar(); };
    $$("[data-div]", s).forEach((b) => (b.onclick = () => {
      const n = +b.dataset.div;
      $("#divTxt", s).textContent = `= ${brl(total() / n)} cada`;
    }));
    $(".x", s).onclick = () => { fecharSheet(); res(null); };
    $("#ok", s).onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try {
        const pag = await registrarPagamento(pedidos, {
          servico: valorServ(), desconto: numero($("#desc", s).value),
          pagamentos: linhas, cpf: $("#cpf", s).value.replace(/\D/g, ""),
        }, quem);
        if ($("#comp", s).checked) await imprimirComprovante(pedidos, pag, { salao });
        if ($("#rec", s).checked) await imprimirRecibo(pedidos, pag, { salao });
        toast(pag.troco ? `Recebido. Troco: ${brl(pag.troco)}` : "Recebido ✓", "bom");
        fecharSheet();
        // Fechou por engano? Por alguns segundos dá para desfazer (a mesa volta a ficar aberta).
        avisoDesfazer("Conta recebida e fechada.", () => desfazerPagamento(pag, quem).then(() => toast("Recebimento desfeito. A mesa voltou a ficar aberta.", "bom")).catch(erro));
        res(pag);
      } catch (e) { $("#err", s).textContent = e.message; btn.disabled = false; }
    };
    completar();
    // Cliente avisou "troco para R$ X": já deixa o valor entregue preenchido.
    if (recebido > total()) { linhas[0].valor = dinheiro(recebido); desenharFormas(); resumo(); }
  });
}
