// Consumo da equipe: lança o que cada funcionário consumiu e soma por mês (com extrato para imprimir e assinar).
import { $, $$, esc, brl, hora, toast, erro, confirmar, abrirSheet, fecharSheet, cabecalhoSheet, numero } from "../ui.js";
import { D, loja, lancarConsumo, consumosDoMes, imprimirExtratoConsumo } from "../regras.js";
import { store } from "../store.js";
import { seletorProdutos, linhaItem } from "./seletor.js";
import { editarItem } from "./item.js";

const mesDe = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dataHora = (t) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
let mes = mesDe();
let cache = { mes: null, chave: "", regs: [] };

export function cardConsumo(el, { usuario, admin }) {
  const chave = `${mes}:${D.movimentos.filter((m) => m.tipo === "consumo").length}`;
  const desenhar = (regs) => {
    const por = {};
    for (const x of regs) (por[x.funcionario] ||= []).push(x);
    const nomes = Object.keys(por).sort((a, b) => a.localeCompare(b));
    const totalGeral = regs.reduce((t, x) => t + x.total, 0);
    el.innerHTML = `<div class="card inteiro"><div class="card-h"><div><b>🍽️ Consumo da equipe</b><small>O que os funcionários consumiram. No fim do mês o extrato mostra o total de cada um.</small></div>
        <div class="linha-btn wrap"><input class="in" type="month" id="cmMes" value="${esc(mes)}" aria-label="Mês"><button class="btn pri" id="cmNovo">+ Lançar consumo</button></div></div>
      ${nomes.map((n) => { const l = por[n], t = l.reduce((s, x) => s + x.total, 0); return `<details class="cm-func"><summary><span>${esc(n)}</span><b>${brl(t)}</b></summary>
        ${l.map((x) => `<div class="cl"><div class="n"><b>${esc(dataHora(x.criadoEm))}</b><small>${x.itens.map((i) => `${i.qtd}x ${esc(i.nome)}`).join(", ")}${x.descontoPct ? ` · desconto ${x.descontoPct}%` : ""} · por ${esc(x.por || "")}</small></div>
          <div class="v">${brl(x.total)}${admin ? `<button class="mini-x" data-cmdel="${esc(x.id)}" title="Apagar lançamento">×</button>` : ""}</div></div>`).join("")}
        <div class="linha-btn wrap"><button class="btn ghost sm" data-cmimp="${esc(n)}">Imprimir extrato do mês</button></div></details>`; }).join("") || `<p class="vazio">Nenhum consumo lançado neste mês.</p>`}
      ${nomes.length ? `<div class="sum"><div class="t"><span>Total do mês (toda a equipe)</span><span>${brl(totalGeral)}</span></div></div>` : ""}</div>`;
    $("#cmNovo", el).onclick = () => lancar();
    $("#cmMes", el).onchange = (e) => { if (e.target.value) { mes = e.target.value; carregar(); } };
    $$("[data-cmimp]", el).forEach((b) => (b.onclick = () => imprimirExtratoConsumo(b.dataset.cmimp, mes, por[b.dataset.cmimp]).then(() => toast("Extrato enviado para impressão")).catch(erro)));
    $$("[data-cmdel]", el).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("Apagar lançamento", "Apagar este consumo? O valor sai da conta do funcionário.", { ok: "Apagar", perigo: true }))) return;
      store.apagar("movimentos", b.dataset.cmdel).then(() => { cache.chave = ""; carregar(true); toast("Lançamento apagado"); }).catch(erro);
    }));
  };
  const carregar = async (forcar = false) => {
    if (!forcar && cache.mes === mes && cache.chave === chave) return desenhar(cache.regs);
    try { const regs = await consumosDoMes(mes); cache = { mes, chave, regs }; desenhar(regs); }
    catch (e) { el.innerHTML = `<div class="card inteiro"><b>🍽️ Consumo da equipe</b><p class="ruim-txt">${esc(e.message)}</p></div>`; }
  };
  desenhar(cache.mes === mes ? cache.regs : []);
  carregar();

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
