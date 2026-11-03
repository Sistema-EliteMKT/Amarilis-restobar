// Janela "Imprimir conta": escolhe as comandas e em qual impressora sai (salão ou caixa).
// O garçom abre com o salão (Print iD) marcado; o caixa abre com o caixa (Bematech). Dá para trocar
// na hora, caso uma das impressoras pare de funcionar.
import { $, $$, esc, brl, toast, erro, abrirSheet, fecharSheet, cabecalhoSheet } from "../ui.js";
import { loja, subtotal, rotuloComanda, pedirConta, imprimirConta, baseServico, trocarMesa, comandasDaMesa } from "../regras.js";

const servico = (cs) => Math.round(baseServico(cs) * (Number(loja().taxaServico) || 0)) / 100;

export function abrirConta(cs, { origem = "caixa", titulo = "Imprimir conta", aoImprimir = () => {} } = {}) {
  const lj = loja();
  const nome = (id) => lj.impressoras.find((i) => i.id === id)?.nome || id;
  const salao = lj.impressoraContaGarcom || lj.impressoras.find((i) => i.id !== lj.impressoraConta)?.id || lj.impressoraConta;
  const caixa = lj.impressoraConta;
  const opcoes = [["salao", salao, "Salão"], ["caixa", caixa, "Caixa"]].filter((o, i, a) => a.findIndex((x) => x[1] === o[1]) === i);
  const s = abrirSheet(`${cabecalhoSheet(titulo, cs[0].tipo === "mesa" ? `Mesa ${cs[0].mesa}` : "")}<div class="sh-b">
    ${cs.length > 1 ? `<div class="grp">Comandas <small>marque as que entram na conta</small></div><div class="opts">${cs.map((c) => `<label class="opt"><input type="checkbox" name="cm" value="${c.id}"><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span><em>${brl(subtotal(c))}</em></label>`).join("")}</div>` : ""}
    ${cs.length > 1 ? `<div class="linha-btn wrap"><button class="btn ghost sm" id="cmTodas">Marcar todas</button><span class="muted" id="cmSoma"></span></div>` : ""}
    <div class="grp">Imprimir em <small>use a outra se uma impressora estiver com problema</small></div>
    <div class="opts">${opcoes.map(([k, id, rot]) => `<label class="opt"><input type="radio" name="dest" value="${esc(id)}" ${k === origem ? "checked" : ""}><span><b>${rot}</b> · ${esc(nome(id))}${k === origem ? " <small>(padrão)</small>" : ""}</span></label>`).join("")}</div>
    <div class="err" id="err"></div>
    <button class="btn or cheio grande" id="ok">Imprimir conta</button></div>`);
  // Nenhuma comanda vem marcada: quem fecha escolhe quais entram na conta.
  const somar = () => {
    const marc = cs.filter((c) => $$('input[name="cm"]:checked', s).some((i) => i.value === c.id));
    $("#cmSoma", s) && ($("#cmSoma", s).textContent = marc.length ? `${marc.length} marcada${marc.length > 1 ? "s" : ""} · ${brl(marc.reduce((t, c) => t + subtotal(c), 0))}` : "nenhuma marcada");
  };
  $$('input[name="cm"]', s).forEach((i) => (i.onchange = somar));
  $("#cmTodas", s) && ($("#cmTodas", s).onclick = () => { $$('input[name="cm"]', s).forEach((i) => (i.checked = true)); somar(); });
  somar();
  $("#ok", s).onclick = async (ev) => {
    const sel = cs.length > 1 ? cs.filter((c) => $$('input[name="cm"]:checked', s).some((i) => i.value === c.id)) : cs;
    if (!sel.length) return ($("#err", s).textContent = "Marque pelo menos uma comanda.");
    const alvo = $('input[name="dest"]:checked', s)?.value;
    ev.currentTarget.disabled = true;
    try {
      await pedirConta(sel.map((c) => c.id));
      await imprimirConta(sel, { servico: servico(sel) }, { impressora: alvo });
      fecharSheet();
      toast(`Conta enviada para ${nome(alvo)}.`, "bom");
      aoImprimir(sel);
    } catch (e) { erro(e); ev.currentTarget.disabled = false; }
  };
}

// Trocar de mesa: escolhe QUAIS comandas vão (uma, duas ou todas) e para qual mesa.
// Se a mesa de destino já tem gente, as comandas ficam juntas lá.
export function trocarMesaUI(cs, mesaAtual, { aoFim = () => {} } = {}) {
  const lj = loja();
  const s = abrirSheet(`${cabecalhoSheet(`Trocar de mesa · mesa ${mesaAtual}`, cs.length > 1 ? "Marque as comandas que vão mudar" : "")}<div class="sh-b">
    ${cs.length > 1 ? `<div class="opts">${cs.map((c) => `<label class="opt"><input type="checkbox" name="tc" value="${c.id}"><span>${esc(rotuloComanda(c))}${c.nome ? " · " + esc(c.nome) : ""}</span><em>${brl(subtotal(c))}</em></label>`).join("")}</div>
      <div class="linha-btn"><button class="btn ghost sm" id="todas">Marcar todas</button></div>` : ""}
    <label class="f" for="tm">Para qual mesa?</label><input class="in" id="tm" type="number" inputmode="numeric" min="1" max="${Number(lj.nMesas) || 36}" placeholder="Nº da mesa">
    <small class="muted" id="tmInfo"></small>
    <div class="err" id="err"></div>
    <button class="btn pri cheio grande" id="ok">Mudar de mesa</button></div>`);
  $("#todas", s) && ($("#todas", s).onclick = () => $$('input[name="tc"]', s).forEach((i) => (i.checked = true)));
  $("#tm", s).oninput = () => {
    const n = Number($("#tm", s).value);
    const ocupada = n && comandasDaMesa(n).length;
    $("#tmInfo", s).textContent = ocupada ? `A mesa ${n} já está ocupada: as comandas vão ficar junto com as de lá.` : "";
  };
  $("#ok", s).onclick = async (ev) => {
    const sel = cs.length > 1 ? cs.filter((c) => $$('input[name="tc"]:checked', s).some((i) => i.value === c.id)) : cs;
    const n = Number($("#tm", s).value);
    if (!sel.length) return ($("#err", s).textContent = "Marque pelo menos uma comanda.");
    if (!n || n === mesaAtual) return ($("#err", s).textContent = "Escolha uma mesa diferente da atual.");
    if (n < 1 || n > Number(lj.nMesas)) return ($("#err", s).textContent = `A mesa ${n} não existe (vai até ${lj.nMesas}).`);
    ev.currentTarget.disabled = true;
    try {
      await trocarMesa(sel.map((c) => c.id), n);
      fecharSheet();
      toast(sel.length === cs.length ? `Mesa ${mesaAtual} agora é a mesa ${n}.` : `${sel.length} ${sel.length > 1 ? "comandas foram" : "comanda foi"} para a mesa ${n}.`, "bom");
      aoFim({ n, todas: sel.length === cs.length });
    } catch (e) { erro(e); ev.currentTarget.disabled = false; }
  };
}
