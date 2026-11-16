// Consumo da equipe: lança o que cada funcionário consumiu e soma por mês (com extrato para imprimir e assinar).
import { $, $$, esc, brl, hora, toast, erro, confirmar, abrirSheet, fecharSheet, cabecalhoSheet, numero } from "../ui.js";
import { D, loja, lancarConsumo, consumosDoMes, imprimirExtratoConsumo, baixasDoMes, receberFiado, FORMA_CONVENIO, FORMA_DESCONTO_SALARIO } from "../regras.js";
import { store } from "../store.js";
import { seletorProdutos, linhaItem } from "./seletor.js";
import { editarItem } from "./item.js";

const mesDe = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dataHora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
let mes = mesDe();
let cache = { mes: null, chave: "", regs: [], baixas: [] };

export function cardConsumo(el, { usuario, admin }) {
  const chave = `${mes}:${D.movimentos.filter((m) => m.tipo === "consumo" || m.tipo === "fiadoRecebido").length}`;
  const desenhar = (regs, baixas = []) => {
    const por = {}, pagos = {};
    for (const x of regs) (por[x.funcionario] ||= []).push(x);
    for (const b of baixas) { (pagos[b.funcionario] ||= []).push(b); por[b.funcionario] ||= []; }
    const nomes = Object.keys(por).sort((a, b) => a.localeCompare(b));
    const totalGeral = regs.reduce((t, x) => t + x.total, 0);
    const recebidoGeral = baixas.reduce((t, x) => t + x.valor, 0);
    const recebido = (n) => (pagos[n] || []).reduce((t, x) => t + x.valor, 0);
    const consumido = (n) => por[n].reduce((t, x) => t + x.total, 0);
    const aberto = (n) => Math.max(0, Math.round((consumido(n) - recebido(n)) * 100) / 100);
    el.innerHTML = `<div class="card inteiro"><div class="card-h"><div><b>🍽️ Consumo da equipe</b><small>O que os funcionários consumiram (lançado aqui ou pago como Convênio). É fiado: só entra no caixa quando vocês dão baixa, no dia que escolherem.</small></div>
        <div class="linha-btn wrap"><input class="in" type="month" id="cmMes" value="${esc(mes)}" aria-label="Mês"><button class="btn pri" id="cmNovo">+ Lançar consumo</button></div></div>
      ${nomes.map((n) => { const l = por[n], t = consumido(n), ab = aberto(n); return `<details class="cm-func"><summary><span>${esc(n)}</span><b>${ab ? `em aberto ${brl(ab)}` : t ? "quitado ✓" : brl(0)}</b></summary>
        <div class="sum"><div><span>Consumido no mês</span><span>${brl(t)}</span></div><div><span>Já recebido (baixas)</span><span>${brl(recebido(n))}</span></div><div class="t"><span>Em aberto</span><span>${brl(ab)}</span></div></div>
        ${(pagos[n] || []).map((b) => `<div class="cl"><div class="n"><b>💵 Baixa ${esc(dataHora(b.criadoEm))}</b><small>${esc(b.forma)} · por ${esc(b.por || "")}</small></div><div class="v">${brl(b.valor)}${admin ? `<button class="mini-x" data-bxdel="${esc(b.id)}" title="Apagar baixa">×</button>` : ""}</div></div>`).join("")}
        ${l.map((x) => `<div class="cl"><div class="n"><b>${esc(dataHora(x.criadoEm))}</b><small>${x.itens.map((i) => `${i.qtd}x ${esc(i.nome)}`).join(", ")}${x.descontoPct ? ` · desconto ${x.descontoPct}%` : ""} · por ${esc(x.por || "")}</small></div>
          <div class="v">${brl(x.total)}${admin ? `<button class="mini-x" data-cmdel="${esc(x.id)}" title="Apagar lançamento">×</button>` : ""}</div></div>`).join("")}
        <div class="linha-btn wrap">${ab ? `<button class="btn ok sm" data-cmrec="${esc(n)}">💵 Receber / dar baixa</button>` : ""}<button class="btn ghost sm" data-cmimp="${esc(n)}">Imprimir extrato do mês</button></div></details>`; }).join("") || `<p class="vazio">Nenhum consumo lançado neste mês.</p>`}
      ${nomes.length ? `<div class="sum"><div><span>Consumido no mês (toda a equipe)</span><span>${brl(totalGeral)}</span></div><div><span>Já recebido</span><span>${brl(recebidoGeral)}</span></div><div class="t"><span>Em aberto</span><span>${brl(Math.max(0, totalGeral - recebidoGeral))}</span></div></div>` : ""}</div>`;
    $("#cmNovo", el).onclick = () => lancar();
    $("#cmMes", el).onchange = (e) => { if (e.target.value) { mes = e.target.value; carregar(); } };
    $$("[data-cmrec]", el).forEach((b) => (b.onclick = () => receber(b.dataset.cmrec, aberto(b.dataset.cmrec))));
    $$("[data-bxdel]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("Apagar baixa", "Apagar este recebimento? O valor volta a ficar em aberto e sai do caixa.", { ok: "Apagar", perigo: true }))) return;
      store.apagar("movimentos", b.dataset.bxdel).then(() => { cache.chave = ""; carregar(true); toast("Baixa apagada"); }).catch(erro);
    }));
    $$("[data-cmimp]", el).forEach((b) => (b.onclick = () => imprimirExtratoConsumo(b.dataset.cmimp, mes, por[b.dataset.cmimp]).then(() => toast("Extrato enviado para impressão")).catch(erro)));
    $$("[data-cmdel]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("Apagar lançamento", "Apagar este consumo? O valor sai da conta do funcionário.", { ok: "Apagar", perigo: true }))) return;
      store.apagar("movimentos", b.dataset.cmdel).then(() => { cache.chave = ""; carregar(true); toast("Lançamento apagado"); }).catch(erro);
    }));
  };
  const carregar = async (forcar = false) => {
    if (!forcar && cache.mes === mes && cache.chave === chave) return desenhar(cache.regs, cache.baixas);
    try { const [regs, baixas] = await Promise.all([consumosDoMes(mes), baixasDoMes(mes)]); cache = { mes, chave, regs, baixas }; desenhar(regs, baixas); }
    catch (e) { el.innerHTML = `<div class="card inteiro"><b>🍽️ Consumo da equipe</b><p class="ruim-txt">${esc(e.message)}</p></div>`; }
  };
  desenhar(cache.mes === mes ? cache.regs : [], cache.mes === mes ? cache.baixas : []);
  carregar();

  // Baixa do fiado: o funcionário pagou (ou vai ser descontado no salário). Entra no caixa de hoje.
  function receber(nome, emAberto) {
    const formas = [...(loja().formasPagamento || ["Dinheiro", "Pix"]).filter((f) => f !== FORMA_CONVENIO), FORMA_DESCONTO_SALARIO];
    const [a, m] = mes.split("-");
    const s = abrirSheet(`${cabecalhoSheet("Receber fiado", `${nome} · consumo de ${m}/${a}`)}<div class="sh-b">
      <div class="sum"><div class="t"><span>Em aberto</span><span>${brl(emAberto)}</span></div></div>
      <label class="f" for="rfv">Valor recebido (R$)</label><input class="in" id="rfv" inputmode="decimal" value="${String(emAberto.toFixed(2)).replace(".", ",")}">
      <label class="f" for="rff">Como pagou</label><select class="in" id="rff">${formas.map((f) => `<option>${esc(f)}</option>`).join("")}</select>
      <p class="muted pq">Entra no caixa de hoje${D.caixa ? "" : " (o caixa está fechado: abra o caixa antes para entrar no fechamento)"}. Dá para receber uma parte agora e o resto depois.</p>
      <div class="err" id="err"></div><button class="btn ok cheio" id="rfok">Dar baixa</button></div>`);
    $("#rfok", s).onclick = async (ev) => {
      const valor = numero($("#rfv", s).value);
      if (!(valor > 0)) return ($("#err", s).textContent = "Coloque o valor.");
      if (valor > emAberto + 0.004) return ($("#err", s).textContent = `O valor passa do que está em aberto (${brl(emAberto)}).`);
      ev.currentTarget.disabled = true;
      try { await receberFiado({ funcionario: nome, mes, valor, forma: $("#rff", s).value }, usuario); fecharSheet(); cache.chave = ""; carregar(true); toast(`Baixa de ${brl(valor)} para ${nome} ✓`, "bom"); }
      catch (e) { $("#err", s).textContent = e.message; ev.currentTarget.disabled = false; }
    };
  }

  function lancar() {
    const itens = [];
    const pessoas = [...D.usuarios.filter((u) => u.ativo !== false), ...D.motoboys.filter((m) => m.ativo !== false)];
    const s = abrirSheet(`${cabecalhoSheet("Lançar consumo da equipe", "Escolha o funcionário e o que ele consumiu")}<div class="sh-b novo-ped">
      <div class="np-sel" id="sel"></div>
      <div class="np-form">
        <label class="f" for="cmf">Funcionário</label><select class="in" id="cmf">${pessoas.map((u) => `<option value="${esc(u.nome)}">${esc(u.nome)}</option>`).join("")}<option value="__outro">Outro (digitar o nome)…</option></select>
        <input class="in" id="cmo" placeholder="Nome do funcionário" hidden>
        <div class="grp">Itens consumidos</div><div id="itens"></div>
        <label class="f" for="cmd">Desconto para funcionário (%)</label><input class="in" id="cmd" type="number" min="0" max="100" value="${Number(loja().descontoEquipe) || 0}">
        <div class="sum" id="soma"></div>
        <label class="opt"><input type="checkbox" id="cmi" checked><span>Enviar para a cozinha/bar (imprimir o papel)</span></label>
        <div class="err" id="err"></div><button class="btn ok cheio grande" id="cmok">Lançar consumo</button></div></div>`, { largo: true });
    const atualizar = () => {
      $("#cmo", s).hidden = $("#cmf", s).value !== "__outro";
      $("#itens", s).innerHTML = itens.map((i, k) => linhaItem(i, { acoes: `<button class="btn ghost sm" data-ed="${k}">Editar</button><button class="mini-x" data-rm="${k}">×</button>` })).join("") || `<p class="vazio">Escolha os produtos ao lado.</p>`;
      const sub = itens.reduce((t, i) => t + i.unit * i.qtd, 0), pct = Math.min(100, Math.max(0, Number($("#cmd", s).value) || 0));
      $("#soma", s).innerHTML = `<div><span>Itens</span><span>${brl(sub)}</span></div>${pct ? `<div><span>Desconto ${pct}%</span><span>- ${brl(sub * pct / 100)}</span></div>` : ""}<div class="t"><span>Entra na conta dele</span><span>${brl(sub * (1 - pct / 100))}</span></div>`;
      $$("[data-rm]", s).forEach((b) => (b.onclick = () => { itens.splice(+b.dataset.rm, 1); atualizar(); }));
      $$("[data-ed]", s).forEach((b) => (b.onclick = () => editarItem(itens[b.dataset.ed], "mesa", (novo) => { itens[b.dataset.ed] = novo; atualizar(); })));
    };
    seletorProdutos($("#sel", s), (i) => { itens.push(i); toast(`+ ${i.qtd}x ${i.nome}`); atualizar(); }, { onde: "mesa" });
    $("#cmf", s).onchange = atualizar; $("#cmd", s).oninput = atualizar;
    $("#cmok", s).onclick = async (ev) => {
      const nome = $("#cmf", s).value === "__outro" ? $("#cmo", s).value.trim() : $("#cmf", s).value;
      if (!nome) return ($("#err", s).textContent = "Escolha ou digite o nome do funcionário.");
      if (!itens.length) return ($("#err", s).textContent = "Escolha pelo menos um item.");
      ev.currentTarget.disabled = true;
      try {
        await lancarConsumo({ nome, itens, descontoPct: Number($("#cmd", s).value) || 0, imprimir: $("#cmi", s).checked }, usuario);
        fecharSheet(); cache.chave = ""; toast(`Consumo de ${nome} lançado ✓`, "bom"); carregar(true);
      } catch (e) { $("#err", s).textContent = e.message; ev.currentTarget.disabled = false; }
    };
    atualizar();
  }
}
