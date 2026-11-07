// Regras do negócio: estado ao vivo, totais, comandas, pedidos, pagamentos e cupons de impressão.
import { store, novoId } from "./store.js";
import { LOJA_INICIAL, EQUIPE_INICIAL, MARCA } from "./config.js";
import { CATEGORIAS, PRODUTOS, BORDAS, TAXAS_ENTREGA, ADICIONAIS } from "./cardapio-inicial.js";
import { hoje } from "./ui.js";
import { temInternet } from "./rede.js";
import { fiscalDoItem, tPagDe } from "./fiscal.js";

// ---------------------------------------------------------------------------
//  Estado ao vivo (o que está no banco, sempre atualizado)
// ---------------------------------------------------------------------------
export const D = {
  loja: null, categorias: [], produtos: [], usuarios: [], motoboys: [],
  abertos: [], doDia: [], impressoes: [], pagamentos: [], saidas: [], caixa: null, caixasDia: [], movimentos: [], fiscal: null, leve: true,
  get pedidos() {
    const m = new Map();
    for (const p of [...this.doDia, ...this.abertos]) m.set(p.id, p);
    return [...m.values()];
  },
};
const ouvintes = new Set();
export const aoMudar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
let agendado = false;
// Junta várias mudanças seguidas num redesenho só. Com a janela minimizada ou atrás de outra,
// o navegador para o requestAnimationFrame: aí vai pelo setTimeout, senão o caixa não reage
// (e o papel do pedido online não sai) até alguém voltar para a tela.
const rodarAvisos = () => { if (!agendado) return; agendado = false; ouvintes.forEach((f) => f()); };
const avisar = () => {
  if (agendado) return;
  agendado = true;
  if (document.hidden) setTimeout(rodarAvisos, 0);
  else { requestAnimationFrame(rodarAvisos); setTimeout(rodarAvisos, 300); }
};
document.addEventListener("visibilitychange", () => { if (document.hidden && agendado) setTimeout(rodarAvisos, 0); });
const ordem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(b.nome);

let desligar = [];
let desligarPesados = [];
let leve = true; // começa leve (tela do PIN, garçom); o caixa/administrador liga o resto ao entrar. Celular do garçom: só o necessário (poupa leituras do banco, que têm limite diário no plano grátis)
let ultimoPublico = false;
// publico = cardápio do cliente (só lê cardápio e dados da loja)
export function conectar({ publico = false } = {}) {
  desligar.forEach((f) => f());
  desligarPesados.forEach((f) => f());
  desligar = []; desligarPesados = [];
  ultimoPublico = publico;
  D.carregou = { loja: false, categorias: false, produtos: false };
  D.falhaCarregar = false;
  let planoB = null;
  const chegou = (k) => { D.carregou[k] = true; };
  const tentarPlanoB = () => { if (!planoB) planoB = carregarPeloPlanoB(); };
  desligar = [
    store.ouvirDoc("config", "loja", (d) => { D.loja = d; chegou("loja"); avisar(); }, tentarPlanoB),
    store.ouvir("categorias", (docs) => { if (docs.length || !D.categorias.length) D.categorias = docs.sort(ordem); if (docs.length) chegou("categorias"); avisar(); }, null, tentarPlanoB),
    store.ouvir("produtos", (docs) => { if (docs.length || !D.produtos.length) D.produtos = docs.sort(ordem); if (docs.length) chegou("produtos"); avisar(); }, null, tentarPlanoB),
  ];
  // Plano B: se em 4 s a conexão ao vivo não trouxe o cardápio, busca por uma leitura comum.
  const t1 = setTimeout(() => { if (!D.carregou.produtos || !D.carregou.categorias) tentarPlanoB(); }, 4000);
  // Plano C: em 15 s, se nada chegou, mostra o botão "Tentar de novo".
  const t2 = setTimeout(() => { if (!D.produtos.length) { D.falhaCarregar = true; avisar(); } }, 15000);
  desligar.push(() => clearTimeout(t1), () => clearTimeout(t2));
  if (publico) return;
  const dia = hoje();
  desligar.push(
    store.ouvir("usuarios", (docs) => { D.usuarios = docs.sort((a, b) => a.nome.localeCompare(b.nome)); avisar(); }),
    store.ouvir("pedidos", (docs) => { D.abertos = docs; avisar(); }, ["aberto", "==", true]),
  );
  if (!leve) ligarPesados(dia);
  // Virou o dia com o sistema aberto: reconecta para pegar o dia novo.
  clearTimeout(conectar._t);
  const amanha = new Date(); amanha.setHours(24, 0, 5, 0);
  conectar._t = setTimeout(() => conectar({ publico }), amanha - Date.now());
}

// O que só o caixa/administrador usa: relatórios, fila de impressão, caixa aberto, equipe de motoboys…
function ligarPesados(dia) {
  desligarPesados = [
    store.ouvirDoc("config", "fiscal", (d) => { D.fiscal = d; avisar(); }),
    store.ouvir("motoboys", (docs) => { D.motoboys = docs.sort((a, b) => a.nome.localeCompare(b.nome)); avisar(); }),
    store.ouvir("pedidos", (docs) => { D.doDia = docs; avisar(); }, ["dia", "==", dia]),
    store.ouvir("impressoes", (docs) => { D.impressoes = docs.sort((a, b) => b.criadoEm - a.criadoEm); avisar(); }, ["dia", "==", dia]),
    store.ouvir("pagamentos", (docs) => { D.pagamentos = docs.sort((a, b) => b.criadoEm - a.criadoEm); avisar(); }, ["dia", "==", dia]),
    // Caixa aberto (de qualquer dia: o turno pode passar da meia-noite) e os fechados de hoje.
    store.ouvir("caixas", (docs) => { D.caixa = docs.sort((a, b) => b.abertoEm - a.abertoEm)[0] || null; avisar(); }, ["status", "==", "aberto"]),
    store.ouvir("caixas", (docs) => { D.caixasDia = docs.filter((c) => c.status === "fechado").sort((a, b) => b.fechadoEm - a.fechadoEm); avisar(); }, ["dia", "==", dia]),
    store.ouvir("movimentos", (docs) => { D.movimentos = docs; avisar(); }, ["dia", "==", dia]),
    store.ouvir("saidas", (docs) => { D.saidas = docs.sort((a, b) => b.criadoEm - a.criadoEm); avisar(); }, ["dia", "==", dia]),
  ];
}

// Garçom: desliga o que não usa (menos leituras no banco). Caixa/administrador: religa tudo.
// Busca loja, categorias e produtos sem a conexão ao vivo (só preenche o que ainda não chegou).
async function carregarPeloPlanoB() {
  try {
    const [lj, cats, prods] = await Promise.all([
      D.carregou.loja ? null : store.lerPublico("config", "loja"),
      D.carregou.categorias ? null : store.lerPublico("categorias"),
      D.carregou.produtos ? null : store.lerPublico("produtos"),
    ]);
    if (lj && !D.carregou.loja) D.loja = lj;
    if (cats?.length && !D.carregou.categorias) D.categorias = cats.sort(ordem);
    if (prods?.length && !D.carregou.produtos) D.produtos = prods.sort(ordem);
    if (D.produtos.length) D.falhaCarregar = false;
    avisar();
  } catch (e) { console.error("plano B", e); }
}

export function modoLeve(sim) {
  if (sim === leve || ultimoPublico) return;
  leve = sim;
  D.leve = sim;
  if (sim) { desligarPesados.forEach((f) => f()); desligarPesados = []; }
  else ligarPesados(hoje());
  avisar();
}

export const loja = () => ({ ...LOJA_INICIAL, ...(D.loja || {}) });
export const produto = (id) => D.produtos.find((p) => p.id === id);
export const categoria = (id) => D.categorias.find((c) => c.id === id);
export const setorDe = (prod) => prod?.setor || categoria(prod?.cat)?.setor || "cozinha";
export const nomeSetor = (id) => loja().setores.find((s) => s.id === id)?.nome || id;

// Onde cada produto é vendido: "todos", "mesa" (só no salão) ou "delivery" (só entrega/retirada).
// Produto/categoria marcado como "não imprime" (ex.: rodízio): é lançado e vai para a conta, mas não sai papel nenhum.
export const naoImprime = (p) => !!(p?.semImpressao || categoria(p?.cat)?.semImpressao);
// Produto/categoria que fica de fora da taxa de serviço (ex.: rodízio): o serviço só incide sobre o resto da conta.
export const naoCobraServico = (p) => !!(p?.semServico || categoria(p?.cat)?.semServico);
export const baseServico = (pedidos) => dinheiro(pedidos.flatMap((p) => itensValidos(p))
  .filter((i) => !(i.semServico || naoCobraServico(produto(i.produtoId)))).reduce((t, i) => t + i.unit * i.qtd, 0));
export const canalDe = (p) => p?.canal || (p?.semEntrega ? "mesa" : "todos");
// Promoção: produto com janela de validade (dias da semana, horário, período). Fora dela não aparece para vender.
export function promoValida(p, d = new Date()) {
  const r = p?.promo;
  if (!r) return true;
  if ((r.dias || []).length && !r.dias.includes(d.getDay())) return false;
  const min = (h) => { const [a, b] = String(h).split(":"); return Number(a) * 60 + (Number(b) || 0); };
  if (r.de && r.ate) {
    const agora = d.getHours() * 60 + d.getMinutes(), a = min(r.de), b = min(r.ate);
    if (a <= b ? agora < a || agora > b : agora < a && agora > b) return false; // horário que passa da meia-noite também vale
  }
  const dia = hoje(d.getTime());
  if (r.inicio && dia < r.inicio) return false;
  if (r.fim && dia > r.fim) return false;
  return true;
}
export const vendeEm = (p, onde) => p.ativo !== false && promoValida(p) && (!onde || canalDe(p) === "todos" || canalDe(p) === onde);

// Primeira vez: grava loja, cardápio e equipe iniciais.
export async function semearSePreciso() {
  const atual = await store.obter("config", "loja");
  if (atual) {
    // Uma vez só: a loja já existia sem bairros de entrega. Grava a lista inicial (os bairros da pizzaria).
    // Se depois alguém apagar todos de propósito, não volta (bairrosImportadosEm fica marcado).
    if (!(atual.taxasEntrega || []).length && !atual.bairrosImportadosEm && TAXAS_ENTREGA.length) {
      await store.lote([{ tipo: "salvar", col: "config", id: "loja", dados: { taxasEntrega: TAXAS_ENTREGA, bairrosImportadosEm: Date.now() } }]);
      return "bairros";
    }
    return false;
  }
  const ops = [
    { tipo: "salvar", col: "config", id: "loja", dados: { ...LOJA_INICIAL, bordas: BORDAS, taxasEntrega: TAXAS_ENTREGA, adicionais: ADICIONAIS, criadoEm: Date.now() } },
    ...CATEGORIAS.map((c) => ({ tipo: "salvar", col: "categorias", id: c.id, dados: (({ id, ...r }) => r)(c) })),
    ...PRODUTOS.map((p) => ({ tipo: "salvar", col: "produtos", id: p.id, dados: (({ id, ...r }) => r)(p) })),
    ...EQUIPE_INICIAL.map((u) => ({ tipo: "salvar", col: "usuarios", id: u.id, dados: { nome: u.nome, papel: u.papel, pin: u.pin, ativo: true } })),
  ];
  await store.lote(ops);
  return true;
}

// ---------------------------------------------------------------------------
//  Totais
// ---------------------------------------------------------------------------
export const itensValidos = (p) => (p.itens || []).filter((i) => !i.cancelado);
export const subtotal = (p) => itensValidos(p).reduce((s, i) => s + i.unit * i.qtd, 0);
export const totalPedido = (p) => Math.max(0, subtotal(p) + (Number(p.taxaEntrega) || 0) - (Number(p.descontoCupom) || 0));
export const dinheiro = (v) => Math.round((Number(v) || 0) * 100) / 100;

// ---------------------------------------------------------------------------
//  Mesas e comandas
// ---------------------------------------------------------------------------
export const comandasDaMesa = (mesa) =>
  D.abertos.filter((p) => p.tipo === "mesa" && p.mesa === mesa).sort((a, b) => a.criadoEm - b.criadoEm);

export function situacaoMesa(mesa) {
  const cs = comandasDaMesa(mesa);
  if (!cs.length) return { status: "livre", comandas: cs, total: 0 };
  const total = cs.reduce((s, c) => s + subtotal(c), 0);
  const conta = cs.some((c) => c.status === "conta");
  const desde = Math.min(...cs.map((c) => c.criadoEm));
  const pessoas = cs.reduce((s, c) => s + (Number(c.pessoas) || 0), 0);
  return { status: conta ? "conta" : "ocupada", comandas: cs, total, desde, pessoas };
}

export const comandaAberta = (numero) =>
  D.abertos.find((p) => p.tipo === "mesa" && String(p.numero) === String(numero));

// Abre a comanda (número do cartão físico). Uma comanda aberta não pode ser aberta
// de novo em outra mesa: a "trava" garante isso mesmo com dois garçons ao mesmo tempo.
// atendente: nome do garçom responsável (pode ser outro, quando o caixa abre) · pessoas: nº de pessoas
// Sem número = lançamento direto na mesa (sem cartão de comanda): não tem trava.
export async function abrirComanda(mesa, numero, nome, garcom, { atendente = "", pessoas = 0 } = {}) {
  numero = String(numero || "").trim();
  if (!numero) return abrirSemComanda(mesa, nome, garcom, { atendente, pessoas });
  if (!/^\d{1,5}$/.test(numero)) throw new Error("O número da comanda tem que ser só números.");
  const travaId = `comanda-${numero}`;
  const id = novoId();
  const trava = { aberta: true, pedido: id, mesa, dia: hoje(), em: Date.now() };
  let ocupada = null;
  try {
    if (!temInternet()) throw Object.assign(new Error("Sem conexão com a internet."), { offline: true });
    await store.transacao("travas", travaId, (t) => {
      if (t?.aberta) { ocupada = t; return null; }
      return trava;
    });
  } catch (e) {
    if (!e.offline) throw e;
    // Sem internet: confere com o que este aparelho já sabe e abre mesmo assim.
    const ja = comandaAberta(numero);
    if (ja) throw Object.assign(new Error(`A comanda ${numero} já está aberta na mesa ${ja.mesa}.`), { mesa: ja.mesa, comanda: ja.id });
    await store.salvar("travas", travaId, trava);
  }
  if (ocupada) {
    const p = D.abertos.find((x) => x.id === ocupada.pedido) || (await store.obter("pedidos", ocupada.pedido));
    if (p?.aberto) throw Object.assign(new Error(`A comanda ${numero} já está aberta na mesa ${p.mesa}.`), { mesa: p.mesa, comanda: p.id });
    // Trava esquecida (comanda já fechada): libera e usa.
    await store.transacao("travas", travaId, (t) => {
      if (t?.aberta && t.pedido !== ocupada.pedido) throw new Error(`A comanda ${numero} acabou de ser aberta em outra mesa.`);
      return trava;
    });
  }
  await store.salvar("pedidos", id, {
    tipo: "mesa", mesa, numero, nome: (nome || "").trim(), aberto: true, status: "aberta",
    itens: [], garcom: atendente || garcom?.nome || "", pessoas: Number(pessoas) || 0, abertoPor: garcom?.nome || "", criadoEm: Date.now(), dia: hoje(),
  });
  return id;
}

// Uma mesa tem no máximo um lançamento "sem comanda" aberto: se já existe, usa ele.
async function abrirSemComanda(mesa, nome, garcom, { atendente = "", pessoas = 0 } = {}) {
  const ja = comandasDaMesa(mesa).find((c) => !c.numero);
  if (ja) return ja.id;
  const id = novoId();
  await store.salvar("pedidos", id, {
    tipo: "mesa", mesa, numero: "", nome: (nome || "").trim(), aberto: true, status: "aberta",
    itens: [], garcom: atendente || garcom?.nome || "", pessoas: Number(pessoas) || 0, abertoPor: garcom?.nome || "", criadoEm: Date.now(), dia: hoje(),
  });
  return id;
}

export const rotuloComanda = (c) => (c?.numero ? `Comanda ${c.numero}` : "Sem comanda");

const liberarComandas = (pedidos) =>
  pedidos.filter((p) => p.tipo === "mesa" && p.numero).map((p) => ({ tipo: "salvar", col: "travas", id: `comanda-${p.numero}`, dados: { aberta: false, pedido: p.id } }));

// Lança itens numa comanda e manda para as impressoras dos setores.
export async function lancarItens(comandaId, itens, quem) {
  const agora = Date.now();
  const novos = itens.map((i) => ({ ...i, key: i.key || novoId(), enviadoEm: agora, por: quem?.nome || "" }));
  const pedido = D.abertos.find((x) => x.id === comandaId) || (await store.obter("pedidos", comandaId));
  if (!pedido || !pedido.aberto) throw new Error("Essa comanda já foi fechada.");
  // arrayUnion: funciona sem internet e não apaga o que outro garçom lançou ao mesmo tempo.
  await store.adicionarItens("pedidos", comandaId, novos, pedido.status === "conta" ? { status: "aberta" } : {});
  // Item a mais em pedido de delivery/retirada: o papel da cozinha sai marcado como ADICIONAL.
  await imprimirProducao({ ...pedido, itens: novos }, quem, pedido.tipo !== "mesa" ? { adicional: true } : {});
}

// Altera um item já lançado (quantidade, escolhas e/ou valor).
// Se mudou o que foi pedido, imprime "ALTERADO" no setor com o antes e o agora; só valor não imprime.
export async function alterarItem(pedidoId, key, novo, quem) {
  const p = D.pedidos.find((x) => x.id === pedidoId) || (await store.obter("pedidos", pedidoId));
  if (!p) throw new Error("Pedido não encontrado.");
  if (p.tipo === "mesa" && !p.aberto) throw new Error("Essa comanda já foi fechada.");
  if (p.pago) throw new Error("Esse pedido já foi pago. Cancele o pagamento antes de alterar.");
  const antes = (p.itens || []).find((i) => i.key === key && !i.cancelado);
  if (!antes) throw new Error("Item não encontrado.");
  const item = {
    ...antes, ...novo, key, enviadoEm: antes.enviadoEm ?? null, por: antes.por ?? "",
    alteradoPor: quem?.nome || "", alteradoEm: Date.now(), ...(antes.unitOriginal == null && Number(novo.unit) !== Number(antes.unit) ? { unitOriginal: antes.unit } : {}),
  };
  // O banco não aceita campo "undefined" (item de pedido online não tem alguns campos).
  for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
  // Transação: não apaga item que outro garçom lançou ao mesmo tempo. Sem internet, grava direto.
  try {
    if (!temInternet()) throw Object.assign(new Error("offline"), { offline: true });
    await store.transacao("pedidos", pedidoId, (atual) => ({ itens: (atual?.itens || []).map((i) => (i.key === key ? item : i)) }));
  } catch (e) {
    if (!e.offline) throw e;
    await store.salvar("pedidos", pedidoId, { itens: (p.itens || []).map((i) => (i.key === key ? item : i)) });
  }
  const assinatura = (i) => JSON.stringify([i.qtd, i.nome, i.det || [], i.obs || ""]);
  if (antes.enviadoEm && assinatura(antes) !== assinatura(item)) {
    await imprimirProducao({ ...p, itens: [item] }, quem, { alteracao: antes });
  }
  return item;
}

export async function cancelarItem(pedidoId, key, motivo, quem) {
  let item, pedido;
  await store.transacao("pedidos", pedidoId, (atual) => {
    if (!atual) return null;
    pedido = { id: pedidoId, ...atual };
    const itens = (atual.itens || []).map((i) => {
      if (i.key !== key || i.cancelado) return i;
      item = { ...i, cancelado: true, motivo, canceladoPor: quem?.nome || "", canceladoEm: Date.now() };
      return item;
    });
    return item ? { itens } : null;
  });
  if (item && item.enviadoEm) await imprimirProducao({ ...pedido, itens: [item] }, quem, { cancelamento: true });
}

export async function moverItem(origemId, key, destinoId) {
  let item;
  await store.transacao("pedidos", origemId, (atual) => {
    item = (atual?.itens || []).find((i) => i.key === key && !i.cancelado);
    return item ? { itens: atual.itens.filter((i) => i.key !== key) } : null;
  });
  if (!item) return;
  await store.transacao("pedidos", destinoId, (atual) => ({ itens: [...(atual?.itens || []), item] }));
}

export async function trocarMesa(comandaIds, novaMesa) {
  const cs = D.abertos.filter((p) => comandaIds.includes(p.id));
  await store.lote([
    ...comandaIds.map((id) => ({ tipo: "salvar", col: "pedidos", id, dados: { mesa: novaMesa } })),
    ...cs.filter((c) => c.numero).map((c) => ({ tipo: "salvar", col: "travas", id: `comanda-${c.numero}`, dados: { mesa: novaMesa } })),
  ]);
}

export const pedirConta = (ids, sim = true) =>
  store.lote(ids.map((id) => ({ tipo: "salvar", col: "pedidos", id, dados: { status: sim ? "conta" : "aberta" } })));

export async function cancelarComanda(id, motivo, quem) {
  const p = D.abertos.find((x) => x.id === id) || (await store.obter("pedidos", id));
  await store.lote([
    { tipo: "salvar", col: "pedidos", id, dados: { aberto: false, status: "cancelada", motivo, canceladoPor: quem?.nome || "", fechadoEm: Date.now() } },
    ...liberarComandas([p]),
  ]);
  const enviados = itensValidos(p).filter((i) => i.enviadoEm);
  if (enviados.length) await imprimirProducao({ ...p, itens: enviados }, quem, { cancelamento: true });
}

// ---------------------------------------------------------------------------
//  Delivery, retirada e balcão
// ---------------------------------------------------------------------------
export const ETAPAS = {
  novo: "Aguardando aceite",
  preparo: "Em preparo",
  pronto: "Pronto",
  saiu: "Saiu para entrega",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

// Sem internet, numera pelo que este aparelho já viu hoje (o caixa é quem numera).
async function numeroDoPedido() {
  try {
    if (!temInternet()) throw Object.assign(new Error("Sem conexão com a internet."), { offline: true });
    return await store.proximoNumero(hoje());
  }
  catch (e) {
    if (!e.offline) throw e;
    return Math.max(0, ...D.doDia.filter((p) => p.tipo !== "mesa").map((p) => Number(p.numero) || 0)) + 1;
  }
}

export async function criarPedido(dados, quem) {
  const online = dados.origem === "online";
  const base = {
    ...dados, aberto: true, criadoEm: Date.now(), dia: hoje(),
    status: online ? "novo" : "preparo",
    itens: dados.itens.map((i) => ({ ...i, key: i.key || novoId(), enviadoEm: online ? null : Date.now() })),
  };
  if (!online) base.numero = await numeroDoPedido();
  const id = online && store.criarPublico ? await store.criarPublico("pedidos", base) : await store.criar("pedidos", base);
  if (!online) await imprimirNovoPedido({ id, ...base }, quem);
  return id;
}

export async function aceitarPedido(p, quem) {
  const numero = p.numero || (await numeroDoPedido());
  const itens = p.itens.map((i) => ({ ...i, enviadoEm: Date.now() }));
  await store.salvar("pedidos", p.id, { status: "preparo", numero, itens, aceitoEm: Date.now(), aceitoPor: quem?.nome || "" });
  // A via com tudo já saiu quando o pedido chegou; ao aceitar saem só os papéis dos setores.
  const novo = { ...p, numero, itens, aceitoPor: quem?.nome || "" };
  if (p.producaoImpressa) return; // via e papéis da cozinha já saíram quando o pedido chegou
  if (p.viaImpressa) await imprimirProducao(novo, quem);
  else await imprimirNovoPedido(novo, quem);
}

// Pedido que chega pelo cardápio online: a via sai sozinha na impressora do caixa, na hora,
// para ninguém perder o pedido. Quem pega o pedido primeiro (transação) imprime; os outros não repetem.
const viaOnline = new Set();
export async function imprimirViaOnline(p) {
  if (!p || p.origem !== "online" || p.status !== "novo" || p.viaImpressa || viaOnline.has(p.id)) return false;
  viaOnline.add(p.id);
  try {
    const numero = p.numero || (await numeroDoPedido());
    const comCozinha = loja().imprimirCozinhaAoChegar !== false;
    const pegou = await store.transacao("pedidos", p.id, (d) => (d && !d.viaImpressa && d.status === "novo" ? { viaImpressa: Date.now(), numero: d.numero || numero, ...(comCozinha ? { producaoImpressa: true } : {}) } : null));
    if (!pegou) return false;
    const novo = { ...p, numero: pegou.numero };
    await store.lote([filaImpressao(loja().impressoraConta, `NOVO ONLINE ${titulo(novo)}`, [
      { t: "*** PEDIDO NOVO PELO APP ***", b: true, c: true }, { t: comCozinha ? "papéis da cozinha saem em seguida" : "aguardando aceite no caixa", c: true }, { sep: true },
      ...cupomEntrega(novo),
    ], { pedido: p.id })]);
    // Depois da via inteira, os papéis de cada setor para levar à cozinha (como no Insta Delivery).
    if (comCozinha) await imprimirProducao({ ...novo, itens: p.itens.map((i) => ({ ...i, enviadoEm: Date.now() })) }, null);
    return true;
  } catch (e) { viaOnline.delete(p.id); console.error("via online", e); return false; }
}

export const mudarEtapa = (p, status, extra = {}) =>
  store.salvar("pedidos", p.id, { status, [`${status}Em`]: Date.now(), ...extra });

export async function cancelarPedido(p, motivo, quem) {
  await store.salvar("pedidos", p.id, { status: "cancelado", aberto: false, motivo, canceladoPor: quem?.nome || "", fechadoEm: Date.now() });
  const enviados = itensValidos(p).filter((i) => i.enviadoEm);
  if (enviados.length) await imprimirProducao({ ...p, itens: enviados }, quem, { cancelamento: true });
}

// ---------------------------------------------------------------------------
//  Pagamento (fecha comandas da mesa ou conclui pedido)
// ---------------------------------------------------------------------------
function itensFiscais(pedidos) {
  const lj = loja();
  return pedidos.flatMap((p) => itensValidos(p)).map((i) => {
    const prod = produto(i.produtoId);
    const f = fiscalDoItem(D.fiscal, prod, categoria(prod?.cat));
    return { cod: i.produtoId || "", desc: i.nome, qtd: i.qtd, vUnit: dinheiro(i.unit), vTotal: dinheiro(i.unit * i.qtd), ...f };
  });
}

// pedidos: lista de pedidos/comandas pagos juntos; valores: {servico, desconto, pagamentos:[{forma,valor}]}
export const FORMA_CONVENIO = "Convênio";
export async function registrarPagamento(pedidos, valores, quem) {
  const sub = dinheiro(pedidos.reduce((s, p) => s + totalPedido(p), 0));
  const total = dinheiro(sub + (Number(valores.servico) || 0) - (Number(valores.desconto) || 0));
  const pago = dinheiro(valores.pagamentos.reduce((s, x) => s + (Number(x.valor) || 0), 0));
  if (pago + 0.004 < total) throw new Error(`Falta receber ${(total - pago).toFixed(2).replace(".", ",")}.`);
  const troco = dinheiro(pago - total);
  const pid = novoId();
  const agora = Date.now();
  const mesa = pedidos[0].tipo === "mesa" ? pedidos[0].mesa : null;
  const pag = {
    dia: hoje(), criadoEm: agora, por: quem?.nome || "", mesa, tipo: pedidos[0].tipo,
    pedidos: pedidos.map((p) => p.id), numeros: pedidos.map((p) => p.numero).filter(Boolean),
    nomes: pedidos.map((p) => p.nome || p.cliente?.nome || "").filter(Boolean),
    subtotal: sub, servico: dinheiro(valores.servico), desconto: dinheiro(valores.desconto), total,
    pagamentos: valores.pagamentos.filter((x) => Number(x.valor) > 0).map((x) => ({ forma: x.forma, valor: dinheiro(x.valor), tPag: tPagDe(x.forma), ...(x.forma === FORMA_CONVENIO ? { funcionario: x.func || "" } : {}) })),
    troco, cpf: valores.cpf || "", caixa: D.caixa?.id || null,
    // Dados para a nota fiscal (NFC-e), que será emitida depois a partir daqui.
    nfce: { status: "pendente" }, itensFiscais: itensFiscais(pedidos),
  };
  // Comanda paga fecha na hora; pedido de entrega/retirada continua aberto até ser concluído.
  const fim = (p) => (p.tipo === "mesa" ? { status: "fechada", aberto: false } : {});
  // Delivery/retirada: a forma que o cliente escolheu no pedido passa a ser a que foi paga de verdade
  // (ex.: pediu débito e pagou no crédito). A escolhida fica guardada em formaPedida para o "desfazer".
  const formaPaga = [...new Set(pag.pagamentos.map((x) => x.forma))].join(" + ");
  const formaReal = (p) => (p.tipo === "mesa" || !formaPaga ? {} : { pagamento: { ...(p.pagamento || {}), forma: formaPaga, formaPedida: p.pagamento?.formaPedida ?? p.pagamento?.forma ?? "" } });
  const conv = pag.pagamentos.map((x, i) => ({ x, i })).filter(({ x }) => x.forma === FORMA_CONVENIO);
  if (conv.some(({ x }) => !x.funcionario)) throw new Error("Escolha o funcionário do convênio.");
  const itensConv = pedidos.flatMap((p) => (p.itens || []).filter((i) => !i.cancelado).map((i) => ({ nome: i.nome, qtd: i.qtd, unit: i.unit, det: i.det || [], obs: i.obs || "" })));
  // Convênio: o valor vai para a conta do funcionário, que é descontada no fim do mês (mesmo lugar do consumo da equipe).
  await store.lote([
    ...conv.map(({ x, i }) => ({ tipo: "criar", col: "movimentos", id: `conv-${pid}-${i}`, dados: {
      tipo: "consumo", origem: "convenio", funcionario: x.funcionario, funcionarioId: "", itens: itensConv, subtotal: x.valor, descontoPct: 0, total: x.valor,
      pagamentoId: pid, pedidoNumeros: pag.numeros, dia: pag.dia, mes: pag.dia.slice(0, 7), criadoEm: agora, por: quem?.nome || "" } })),
    { tipo: "criar", col: "pagamentos", id: pid, dados: pag },
    ...pedidos.map((p) => ({ tipo: "salvar", col: "pedidos", id: p.id, dados: { pago: true, pagamentoId: pid, pagoEm: agora, ...fim(p), ...formaReal(p) } })),
    ...liberarComandas(pedidos),
  ]);
  return { id: pid, ...pag };
}

// Desfaz um recebimento feito sem querer: a mesa/pedido volta a ficar aberto e o dinheiro sai do caixa.
export async function desfazerPagamento(pag, quem) {
  const pedidos = (await Promise.all(pag.pedidos.map((id) => store.obter("pedidos", id)))).filter(Boolean);
  if (!pedidos.length) throw new Error("Não achei os pedidos desse recebimento.");
  const marca = { reabertoPor: quem?.nome || "", reabertoEm: Date.now(), pago: false, pagamentoId: null, pagoEm: null };
  const ops = [];
  for (const p of pedidos) {
    if (p.tipo === "mesa") {
      if (p.numero) {
        const t = await store.obter("travas", `comanda-${p.numero}`);
        if (t?.aberta && t.pedido !== p.id) throw new Error(`A comanda ${p.numero} já foi aberta de novo${t.mesa ? " na mesa " + t.mesa : ""}. Feche essa antes de desfazer.`);
        ops.push({ tipo: "salvar", col: "travas", id: `comanda-${p.numero}`, dados: { aberta: true, pedido: p.id, mesa: p.mesa, dia: p.dia || hoje(), em: Date.now() } });
      }
      ops.push({ tipo: "salvar", col: "pedidos", id: p.id, dados: { ...marca, aberto: true, status: "conta" } });
    } else {
      const volta = p.pagamento?.formaPedida != null ? { pagamento: { ...p.pagamento, forma: p.pagamento.formaPedida } } : {};
      ops.push({ tipo: "salvar", col: "pedidos", id: p.id, dados: { ...marca, ...volta, ...(p.aberto === false ? { aberto: true, status: p.tipo === "entrega" ? "saiu" : "pronto", concluidoEm: null } : {}) } });
    }
  }
  ops.push({ tipo: "apagar", col: "pagamentos", id: pag.id });
  (pag.pagamentos || []).forEach((x, i) => { if (x.forma === FORMA_CONVENIO) ops.push({ tipo: "apagar", col: "movimentos", id: `conv-${pag.id}-${i}` }); });
  await store.lote(ops);
}

// Texto do pedido para copiar/colar ou mandar no WhatsApp do cliente.
export function textoPedido(p) {
  const lj = loja(), c = p.cliente || {};
  const real = (v) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
  const tipo = { entrega: "Entrega", retirada: "Retirada", balcao: "Balcão", mesa: "Mesa" }[p.tipo] || "";
  const linhas = [`*${lj.nome}*${p.numero ? ` · Pedido #${p.numero}` : ""}`, tipo + (c.nome ? ` · ${c.nome}` : "")];
  if (p.tipo === "entrega" && c.endereco) linhas.push(`Endereço: ${c.endereco}${c.bairro ? " - " + c.bairro : ""}${c.cep ? " · CEP " + String(c.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : ""}`);
  linhas.push("", "*Itens:*");
  for (const i of itensValidos(p)) {
    linhas.push(`• ${i.qtd}x ${i.nome} — ${real(i.unit * i.qtd)}`);
    for (const d of i.det || []) linhas.push(`    ${d}`);
    if (i.obs) linhas.push(`    Obs: ${i.obs}`);
  }
  if (p.descontoCupom) linhas.push(`Cupom ${p.cupom?.codigo || ""}: -${real(p.descontoCupom)}`);
  if (p.taxaEntrega) linhas.push(`Entrega: ${real(p.taxaEntrega)}`);
  if (p.taxaPendente) linhas.push("Entrega: a confirmar (vamos te avisar o valor)");
  linhas.push(`*Total: ${real(totalPedido(p))}*`);
  const pg = p.pagamento || {};
  if (pg.forma) linhas.push(`Pagamento: ${pg.forma}${p.pago ? " (pago)" : ""}${pg.trocoPara ? ` · troco para ${real(pg.trocoPara)}` : ""}`);
  const min = Number(lj[p.tipo === "entrega" ? "tempoEntregaMin" : "tempoRetiradaMin"]), max = Number(lj[p.tipo === "entrega" ? "tempoEntregaMax" : "tempoRetiradaMax"]);
  if (min > 0 && (p.tipo === "entrega" || p.tipo === "retirada")) linhas.push(`Previsão: ${max > min ? `${min} a ${max} min` : `${min} min`}`);
  if (p.obs) linhas.push(`Obs do pedido: ${p.obs}`);
  linhas.push("", "Obrigado pela preferência! 🍕");
  return linhas.join("\n");
}

// Pedido de entrega/retirada concluído (e pago) sai da tela de pedidos abertos.
export const concluirPedido = (p) => store.salvar("pedidos", p.id, { status: "concluido", aberto: false, concluidoEm: Date.now() });

// ---------------------------------------------------------------------------
//  Equipe do dia (garçons e freelancers)
// ---------------------------------------------------------------------------
// Vendas e taxa de serviço de cada garçom hoje (pelo nome gravado na comanda).
export function vendasPorGarcom() {
  const r = {};
  const linha = (nome) => (r[nome] ||= { nome, comandas: 0, vendas: 0, servico: 0 });
  for (const c of D.pedidos) {
    if (c.tipo !== "mesa" || c.status === "cancelada" || !c.garcom) continue;
    const l = linha(c.garcom);
    l.comandas++;
    l.vendas += subtotal(c);
  }
  // Serviço pago é dividido entre as comandas da conta, pelo valor de cada uma.
  for (const pg of D.pagamentos) {
    if (!pg.servico || pg.tipo !== "mesa") continue;
    const cs = pg.pedidos.map((id) => D.pedidos.find((p) => p.id === id)).filter(Boolean);
    const soma = cs.reduce((s, c) => s + subtotal(c), 0) || 1;
    for (const c of cs) if (c.garcom) linha(c.garcom).servico += (pg.servico * subtotal(c)) / soma;
  }
  return r;
}

// ---------------------------------------------------------------------------
//  Caixa: abrir, sangria/reforço/despesa, fechar
// ---------------------------------------------------------------------------
export const TIPOS_MOV = { sangria: "Sangria (retirada)", suprimento: "Reforço (entrada de troco)", despesa: "Despesa paga do caixa" };

export async function abrirCaixa(fundo, quem) {
  if (D.caixa) throw new Error("O caixa já está aberto.");
  const id = novoId();
  await store.salvar("caixas", id, { status: "aberto", dia: hoje(), abertoEm: Date.now(), abertoPor: quem?.nome || "", fundo: dinheiro(fundo) });
  return id;
}

export async function movimentoCaixa(tipo, valor, motivo, quem) {
  if (!D.caixa) throw new Error("Abra o caixa primeiro.");
  if (!(Number(valor) > 0)) throw new Error("Coloque o valor.");
  const mov = { tipo, valor: dinheiro(valor), motivo: motivo || "", caixa: D.caixa.id, dia: hoje(), criadoEm: Date.now(), por: quem?.nome || "" };
  await store.lote([
    { tipo: "criar", col: "movimentos", dados: mov },
    ...(tipo === "sangria" ? [filaImpressao(loja().impressoraConta, "Comprovante de sangria", cupomMovimento(mov))] : []),
  ]);
  return mov;
}

// Tudo o que entrou e saiu desde que o caixa abriu (e até fechar, se já fechou).
export async function resumoCaixa(cx) {
  const ate = cx.fechadoEm || Date.now() + 60000;
  const f = [["criadoEm", ">=", cx.abertoEm]];
  const [pags, saidas, movs] = await Promise.all([store.consultar("pagamentos", f), store.consultar("saidas", f), store.consultar("movimentos", f)]);
  const dentro = (x) => x.criadoEm <= ate;
  const pg = pags.filter(dentro), sd = saidas.filter(dentro), mv = movs.filter(dentro).filter((m) => TIPOS_MOV[m.tipo]); // consumo da equipe também fica em "movimentos", mas não é do caixa
  const porForma = {};
  let troco = 0, servico = 0, desconto = 0, vendas = 0;
  for (const p of pg) {
    for (const x of p.pagamentos) porForma[x.forma] = dinheiro((porForma[x.forma] || 0) + x.valor);
    troco += p.troco || 0; servico += p.servico || 0; desconto += p.desconto || 0; vendas += p.total || 0;
  }
  if (porForma.Dinheiro) porForma.Dinheiro = dinheiro(porForma.Dinheiro - troco);
  const soma = (t) => dinheiro(mv.filter((m) => m.tipo === t).reduce((a, m) => a + m.valor, 0));
  const sangrias = soma("sangria"), suprimentos = soma("suprimento"), despesas = soma("despesa");
  const freelaDinheiro = dinheiro(sd.filter((x) => x.forma === "Dinheiro").reduce((a, x) => a + x.valor, 0));
  const freelaTotal = dinheiro(sd.reduce((a, x) => a + x.valor, 0));
  const dinheiroVendas = porForma.Dinheiro || 0;
  const esperado = dinheiro((cx.fundo || 0) + dinheiroVendas + suprimentos - sangrias - despesas - freelaDinheiro);
  return { pagamentos: pg, saidas: sd, movimentos: mv.sort((a, b) => a.criadoEm - b.criadoEm), porForma, servico: dinheiro(servico), desconto: dinheiro(desconto), vendas: dinheiro(vendas),
    sangrias, suprimentos, despesas, freelaDinheiro, freelaTotal, dinheiroVendas, esperado, contas: pg.length };
}

export async function fecharCaixa(cx, contado, obs, quem, conferencia = {}) {
  const r = await resumoCaixa(cx);
  const fechamento = { status: "fechado", fechadoEm: Date.now(), fechadoPor: quem?.nome || "", contado: dinheiro(contado), esperado: r.esperado, diferenca: dinheiro(contado - r.esperado), obs: obs || "", conferencia,
    resumo: { porForma: r.porForma, vendas: r.vendas, servico: r.servico, desconto: r.desconto, sangrias: r.sangrias, suprimentos: r.suprimentos, despesas: r.despesas, freelaDinheiro: r.freelaDinheiro, contas: r.contas } };
  await store.lote([
    { tipo: "salvar", col: "caixas", id: cx.id, dados: fechamento },
    filaImpressao(loja().impressoraConta, "Fechamento de caixa", cupomFechamentoCaixa({ ...cx, ...fechamento }, r)),
  ]);
  return { ...cx, ...fechamento };
}

export const reimprimirFechamento = async (cx) => store.lote([filaImpressao(loja().impressoraConta, "Fechamento de caixa (reimpressão)", cupomFechamentoCaixa(cx, await resumoCaixa(cx)))]);

const r2 = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
function cupomMovimento(m) {
  return [L(loja().nome, { b: true, c: true }), SEP, L(m.tipo === "sangria" ? "SANGRIA DO CAIXA" : TIPOS_MOV[m.tipo].toUpperCase(), { b: true, g: true, c: true }), L(hh(m.criadoEm), { c: true }), SEP,
    L(lado("VALOR R$", r2(m.valor)), { b: true, g: true }), ...(m.motivo ? [L(`Motivo: ${m.motivo}`)] : []), L(`Por: ${m.por}`), SEP,
    L(""), L("______________________________", { c: true }), L("Assinatura de quem retirou", { c: true }), ...rodape()];
}
export function cupomFechamentoCaixa(cx, r) {
  const linhas = [L(loja().nome, { b: true, c: true }), L("FECHAMENTO DE CAIXA", { b: true, g: true, c: true }), SEP,
    L(`Aberto: ${hh(cx.abertoEm)} (${cx.abertoPor || "-"})`), L(`Fechado: ${hh(cx.fechadoEm || Date.now())} (${cx.fechadoPor || "-"})`), SEP,
    L("VENDAS", { b: true }), ...Object.entries(r.porForma).map(([f, v]) => L(lado(f, r2(v)))),
    L(lado("Total recebido", r2(r.vendas)), { b: true }), L(lado(`Contas (${r.contas})`, "")),
    ...(r.servico ? [L(lado("Taxa de serviço", r2(r.servico)))] : []), ...(r.desconto ? [L(lado("Descontos", r2(r.desconto)))] : []), SEP,
    L("DINHEIRO NA GAVETA", { b: true }), L(lado("Fundo de troco", r2(cx.fundo))), L(lado("+ Dinheiro das vendas", r2(r.dinheiroVendas))),
    ...(r.suprimentos ? [L(lado("+ Reforços", r2(r.suprimentos)))] : []), ...(r.sangrias ? [L(lado("- Sangrias", r2(r.sangrias)))] : []),
    ...(r.despesas ? [L(lado("- Despesas", r2(r.despesas)))] : []), ...(r.freelaDinheiro ? [L(lado("- Freelancers (dinheiro)", r2(r.freelaDinheiro)))] : []),
    L(lado("= ESPERADO", r2(cx.esperado ?? r.esperado)), { b: true }), L(lado("CONTADO", r2(cx.contado)), { b: true, g: true }),
    L(lado(cx.diferenca < 0 ? "FALTOU" : cx.diferenca > 0 ? "SOBROU" : "DIFERENÇA", r2(Math.abs(cx.diferenca || 0))), { b: true, g: true })];
  const conf = Object.entries(cx.conferencia || {});
  if (conf.length) linhas.push(SEP, L("CONFERÊNCIA DE CARTÃO / PIX", { b: true }), ...conf.flatMap(([f, c]) => {
    const d = dinheiro(c.informado - c.sistema);
    return [L(lado(f, r2(c.informado))), L(`   sistema ${r2(c.sistema)} · ${d === 0 ? "bateu" : d < 0 ? "faltou " + r2(-d) : "sobrou " + r2(d)}`)];
  }));
  if (r.movimentos?.length) linhas.push(SEP, L("MOVIMENTAÇÕES", { b: true }), ...r.movimentos.map((m) => L(lado(`${hh(m.criadoEm).slice(-5)} ${TIPOS_MOV[m.tipo].split(" ")[0]}${m.motivo ? " " + m.motivo : ""}`, (m.tipo === "suprimento" ? "+" : "-") + r2(m.valor)))));
  if (r.saidas?.length) linhas.push(SEP, L("PAGAMENTOS A FREELANCERS", { b: true }), ...r.saidas.map((x) => L(lado(`${x.nome} (${x.forma})`, r2(x.valor)))));
  if (cx.obs) linhas.push(SEP, L(`OBS: ${cx.obs}`));
  linhas.push(SEP, L(""), L("______________________________", { c: true }), L("Responsável", { c: true }), ...rodape());
  return linhas;
}

// ---------------------------------------------------------------------------
//  Consumo da equipe: o que funcionário consome é lançado e somado no mês
// ---------------------------------------------------------------------------
// Fica na coleção "movimentos" (tipo "consumo", com o campo "mes") para não precisar de regra nova no banco.
export async function lancarConsumo({ nome, funcionarioId = "", itens, descontoPct = 0, imprimir = true }, quem) {
  if (!nome) throw new Error("Escolha o funcionário.");
  if (!itens.length) throw new Error("Escolha os itens.");
  const subtotalItens = dinheiro(itens.reduce((t, i) => t + i.unit * i.qtd, 0));
  const pct = Math.min(100, Math.max(0, Number(descontoPct) || 0));
  const total = dinheiro(subtotalItens * (1 - pct / 100));
  const agora = Date.now(), dia = hoje();
  const reg = { tipo: "consumo", funcionario: nome, funcionarioId, itens: itens.map((i) => ({ nome: i.nome, qtd: i.qtd, unit: i.unit, det: i.det || [], obs: i.obs || "" })),
    subtotal: subtotalItens, descontoPct: pct, total, dia, mes: dia.slice(0, 7), criadoEm: agora, por: quem?.nome || "" };
  const id = await store.criar("movimentos", reg);
  if (imprimir) await imprimirProducao({ id, tipo: "consumo", nome, numero: "", itens: itens.map((i) => ({ ...i, enviadoEm: agora })) }, quem);
  return { id, ...reg };
}
export const consumosDoMes = async (mes) => (await store.consultar("movimentos", ["mes", "==", mes])).filter((m) => m.tipo === "consumo").sort((a, b) => a.criadoEm - b.criadoEm);

// Extrato do mês de um funcionário, para imprimir e assinar.
export function cupomExtratoConsumo(nome, mes, regs) {
  const [a, m] = mes.split("-");
  const total = dinheiro(regs.reduce((t, x) => t + x.total, 0));
  const linhas = [L(loja().nome, { b: true, g: true, c: true }), SEP, L("CONSUMO DA EQUIPE", { b: true, g: true, c: true }), L(`${m}/${a}`, { c: true }), SEP, L(nome, { b: true, g: true }), SEP];
  for (const x of regs) {
    linhas.push(L(hh(x.criadoEm), { b: true }));
    if (x.origem === "convenio") linhas.push(L(`Convênio${x.pedidoNumeros?.length ? " - comanda/pedido " + x.pedidoNumeros.join(", ") : ""}`));
    for (const i of x.itens) linhas.push(L(lado(`${i.qtd}x ${i.nome}`, r2(i.unit * i.qtd))));
    if (x.descontoPct) linhas.push(L(lado(`Desconto ${x.descontoPct}%`, "-" + r2(x.subtotal - x.total))));
    linhas.push(L(lado("Subtotal do dia", r2(x.total)), { b: true }), SEP);
  }
  linhas.push(L(lado("TOTAL DO MÊS", r2(total)), { b: true, g: true }), L(`${regs.length} ${regs.length === 1 ? "lançamento" : "lançamentos"}`), SEP,
    L(""), L("______________________________", { c: true }), L(nome, { c: true }), L("Ciente do valor acima", { c: true }), ...rodape());
  return linhas;
}
export const imprimirExtratoConsumo = (nome, mes, regs) => store.lote([filaImpressao(loja().impressoraConta, `Consumo ${nome} ${mes}`, cupomExtratoConsumo(nome, mes, regs))]);

// ---------------------------------------------------------------------------
//  Relatório de motoboys: entregas, taxas e dinheiro a acertar num período
// ---------------------------------------------------------------------------
const cacheEntregas = new Map(); // a aba se redesenha a cada mudança: dias passados ficam em cache; o dia de hoje vem do que já está na tela
async function pedidosEntregaPeriodo(ini, fim) {
  const h = hoje();
  let ps = [];
  const fimPassado = fim >= h ? hoje(Date.now() - 86400000) : fim;
  if (ini <= fimPassado) {
    const k = `${ini}|${fimPassado}`, c = cacheEntregas.get(k);
    if (c && Date.now() - c.t < 120000) ps = c.ps;
    else { ps = await store.consultar("pedidos", [["dia", ">=", ini], ["dia", "<=", fimPassado]]); cacheEntregas.set(k, { t: Date.now(), ps }); }
  }
  if (ini <= h && fim >= h) ps = [...ps, ...D.doDia];
  return ps.filter((p) => p.tipo === "entrega" && !["cancelado", "cancelada"].includes(p.status)).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
}
export async function entregasPeriodo(ini, fim) { return (await pedidosEntregaPeriodo(ini, fim)).filter((p) => p.motoboy?.nome); }
// Pedidos de entrega por bairro num período, com a porcentagem sobre o total.
export async function pedidosPorBairro(ini, fim) {
  const todas = await pedidosEntregaPeriodo(ini, fim);
  const por = {};
  for (const p of todas) { const b = (p.cliente?.bairro || "").trim() || "Sem bairro"; const k = b.toLocaleUpperCase("pt-BR"); (por[k] ||= { bairro: b, qtd: 0, valor: 0 }); por[k].qtd++; por[k].valor += totalPedido(p); }
  const total = todas.length;
  const linhas = Object.values(por).map((l) => ({ ...l, valor: dinheiro(l.valor), pct: total ? (l.qtd / total) * 100 : 0 })).sort((a, b) => b.qtd - a.qtd || a.bairro.localeCompare(b.bairro));
  return { linhas, total, valor: dinheiro(linhas.reduce((t, l) => t + l.valor, 0)) };
}
export const imprimirRelatorioBairros = (ini, fim, linhas, total, valor) => store.lote([filaImpressao(loja().impressoraConta, "Pedidos por bairro", [
  L(loja().nome, { b: true, g: true, c: true }), SEP, L("PEDIDOS POR BAIRRO", { b: true, g: true, c: true }), L(ini === fim ? dm(ini) : `${dm(ini)} a ${dm(fim)}`, { c: true }), SEP,
  ...linhas.map((l) => L(lado(`${l.bairro} (${l.qtd})`, `${l.pct.toFixed(1).replace(".", ",")}%`))),
  SEP, L(lado("Total de pedidos", String(total)), { b: true }), L(lado("Valor", r2(valor))), ...rodape()])]);

// Resumo de um motoboy a partir das entregas dele.
export function resumoMotoboy(es) {
  return { qtd: es.length, taxas: dinheiro(es.reduce((t, p) => t + (Number(p.taxaEntrega) || 0), 0)),
    dinheiro: dinheiro(es.filter((p) => p.pagamento?.forma === "Dinheiro").reduce((t, p) => t + totalPedido(p), 0)), total: dinheiro(es.reduce((t, p) => t + totalPedido(p), 0)) };
}
const dm = (d) => d.split("-").reverse().slice(0, 2).join("/");
export function cupomRelatorioMotoboy(nome, ini, fim, es) {
  const r = resumoMotoboy(es);
  const linhas = [L(loja().nome, { b: true, g: true, c: true }), SEP, L("RELATÓRIO DO MOTOBOY", { b: true, g: true, c: true }), L(ini === fim ? dm(ini) : `${dm(ini)} a ${dm(fim)}`, { c: true }), SEP, L(nome, { b: true, g: true }), SEP];
  let dia = "";
  for (const p of es) {
    if (p.dia !== dia) { dia = p.dia; linhas.push(L(dm(dia), { b: true })); }
    linhas.push(L(lado(`${hh(p.saiuEm || p.criadoEm).slice(-5)} ${titulo(p)} ${p.cliente?.bairro || p.cliente?.nome || ""}`, r2(totalPedido(p)))), L(`   taxa ${r2(p.taxaEntrega)} · ${p.pagamento?.forma || ""}`));
  }
  linhas.push(SEP, L(lado("Entregas", String(r.qtd)), { b: true }), L(lado("Taxas de entrega", r2(r.taxas)), { b: true }), L(lado("Total entregue", r2(r.total))), L(lado("Dinheiro a acertar", r2(r.dinheiro)), { b: true, g: true }),
    SEP, L(""), L("______________________________", { c: true }), L(nome, { c: true }), ...rodape());
  return linhas;
}
export const imprimirRelatorioMotoboy = (nome, ini, fim, es) => store.lote([filaImpressao(loja().impressoraConta, `Motoboy ${nome}`, cupomRelatorioMotoboy(nome, ini, fim, es))]);

// Pagamento a freelancer/equipe: sai do caixa e entra no fechamento. Devolve o registro (com id) para imprimir o recibo.
export async function pagarEquipe(dados, quem) {
  const reg = { ...dados, valor: dinheiro(dados.valor), dia: hoje(), criadoEm: Date.now(), por: quem?.nome || "" };
  const id = await store.criar("saidas", reg);
  return { id, ...reg };
}

// Valor por extenso, para o recibo (ex.: 120,50 → "cento e vinte reais e cinquenta centavos").
const EXT_U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const EXT_D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const EXT_C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
const ate999 = (n) => {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(EXT_C[c]);
  if (r) p.push(r < 20 ? EXT_U[r] : EXT_D[Math.floor(r / 10)] + (r % 10 ? " e " + EXT_U[r % 10] : ""));
  return p.join(" e ");
};
export function extenso(valor) {
  const total = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const milhar = Math.floor(reais / 1000), resto = reais % 1000;
  let txt = "";
  if (milhar) txt = (milhar === 1 ? "mil" : ate999(milhar) + " mil") + (resto ? (resto < 100 || resto % 100 === 0 ? " e " : " ") + ate999(resto) : "");
  else txt = ate999(resto) || "zero";
  const partes = [];
  if (reais || !cent) partes.push(`${txt} ${reais === 1 ? "real" : "reais"}`);
  if (cent) partes.push(`${ate999(cent)} ${cent === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

// Recibo de pagamento a freelancer/funcionário, para a pessoa assinar e a loja guardar.
export function cupomReciboEquipe(x, via = "") {
  const lj = loja();
  return [L(lj.nome, { b: true, g: true, c: true }), ...(lj.telefone ? [L(lj.telefone, { c: true })] : []), ...(lj.endereco ? [L(lj.endereco, { c: true })] : []),
    SEP, L("RECIBO DE PAGAMENTO", { b: true, g: true, c: true }), ...(via ? [L(via, { c: true })] : []), L(hh(x.criadoEm)), SEP,
    L(`Recebi de ${lj.nome} a quantia de`), L(lado("R$", r$(x.valor)), { b: true, g: true }), L(`(${extenso(x.valor)})`),
    L(`referente a: ${x.funcao || "serviços prestados"}${x.obs ? " - " + x.obs : ""}`), L(`Forma de pagamento: ${x.forma}`), SEP,
    L(`Nome: ${x.nome}`, { b: true }), L("CPF: ______________________________"),
    L(""), L(""), L("______________________________", { c: true }), L(x.nome, { c: true }), L("Assinatura de quem recebeu", { c: true }),
    L(""), L(`Pago por: ${x.por || "-"}`), ...rodape()];
}
export const imprimirReciboEquipe = (x, { vias = 1 } = {}) =>
  store.lote(Array.from({ length: vias }, (_, i) => filaImpressao(loja().impressoraConta, `Recibo ${x.nome}`, cupomReciboEquipe(x, vias > 1 ? (i ? "VIA DE QUEM RECEBEU" : "VIA DA LOJA") : ""))));

// ---------------------------------------------------------------------------
//  Cupons (texto para impressora térmica)
// ---------------------------------------------------------------------------
// Cada linha: { t: texto, b: negrito, g: grande, c: centralizado } ou { sep: true }
// Linha com texto à esquerda e valor à direita: guarda as duas partes (e, d) para cada
// impressora alinhar na sua largura; "t" já vem alinhado em 48 colunas para quem não sabe.
const L = (t, o = {}) => (t && typeof t === "object" ? { t: t.t, e: t.e, d: t.d, ...o } : { t: String(t ?? ""), ...o });
const SEP = { sep: true };
const larg = () => Number(loja().colunas) || 48;
const lado = (a, b, w = larg()) => {
  a = String(a); b = String(b);
  const n = w - b.length;
  const ac = a.length > n - 1 ? a.slice(0, n - 1) : a;
  return { t: ac + " ".repeat(Math.max(1, n - ac.length)) + b, e: a, d: b };
};
const r$ = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
const hh = (t = Date.now()) => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const rodape = () => [SEP, L(`${MARCA.sistema} · ${MARCA.empresa}`, { c: true })];

const titulo = (p) => {
  if (p.tipo === "consumo") return `CONSUMO · ${p.nome}`;
  if (p.tipo === "mesa") return `MESA ${p.mesa}${p.numero ? ` · COMANDA ${p.numero}` : ""}${p.nome && p.nome !== "Mesa inteira" ? " · " + p.nome : ""}`;
  const n = p.numero ? ` #${p.numero}` : "";
  if (p.tipo === "entrega") return `ENTREGA${n}`;
  if (p.tipo === "retirada") return `RETIRADA${n}`;
  return `BALCÃO${n}`;
};

// Esfihas (salgadas e doces): no papel o título do grupo já diz o que é, então o nome sai sem a palavra "Esfiha".
const catEsfiha = (i) => {
  const c = categoria(produto(i.produtoId)?.cat);
  const nome = String(c?.nome || i.nome || "");
  if (c?.id === "esfdoces" || (/esfih/i.test(nome) && /doce/i.test(nome))) return "doce";
  if (c?.id === "esfihas" || /esfih/i.test(nome)) return "salgada";
  return null;
};
const semEsfiha = (i) => ({ ...i, nome: String(i.nome || "").replace(/^esfihas?\s+(doces?\s+)?/i, "") || i.nome });
const TITULO_ESFIHA = { salgada: "ESFIHAS SALGADAS", doce: "ESFIHAS DOCES" };
// Itens de um papel de setor: esfihas salgadas e doces em grupos com título; o resto como sempre.
function linhasProducao(itens, opts) {
  const sal = itens.filter((i) => catEsfiha(i) === "salgada"), doc = itens.filter((i) => catEsfiha(i) === "doce");
  const resto = itens.filter((i) => !catEsfiha(i));
  if (!sal.length && !doc.length) return linhasItens(itens, opts);
  const out = [];
  const grupo = (tipo, its) => { if (!its.length) return; if (out.length) out.push(L("")); out.push(L(`${TITULO_ESFIHA[tipo]} (${its.reduce((t, i) => t + i.qtd, 0)})`, { b: true, g: true }), ...linhasItens(its.map(semEsfiha), opts)); };
  grupo("salgada", sal); grupo("doce", doc);
  if (resto.length) { if (out.length) out.push(L("")); out.push(...linhasItens(resto, opts)); }
  return out;
}

function linhasItens(itens, { precos = false, espaco = 0 } = {}) {
  const out = [];
  itens.forEach((i, k) => {
    // Espaço entre os itens (para a cozinha riscar com caneta marca-texto): linhas em branco antes do próximo.
    if (espaco && k > 0) for (let n = 0; n < espaco; n++) out.push(L(""));
    if (precos) out.push(L(lado(`${i.qtd}x ${i.nome}`, r$(i.unit * i.qtd))));
    else out.push(L(`${i.qtd}x ${i.nome}`, { b: true, g: true }));
    for (const d of i.det || []) out.push(L(`   ${d}`, { b: !precos }));
    if (i.obs) out.push(L(`   OBS: ${i.obs}`, { b: true }));
  });
  return out;
}

// alteracao: o item como era antes (sai "ANTES: ..." embaixo do item novo)
const linhasAntes = (a) => (a ? [SEP, L(`ANTES: ${a.qtd}x ${a.nome}`), ...(a.det || []).map((d) => L(`   ${d}`)), ...(a.obs ? [L(`   OBS: ${a.obs}`)] : [])] : []);

export function cupomProducao(p, itens, setor, quem, { cancelamento = false, alteracao = null, adicional = false } = {}) {
  const linhas = [];
  if (adicional) linhas.push(L("*** ADICIONAL ***", { b: true, g: true, c: true }), L("itens a mais neste pedido", { c: true }));
  if (cancelamento) linhas.push(L("*** CANCELADO ***", { b: true, g: true, c: true }));
  if (alteracao) linhas.push(L("*** ALTERADO ***", { b: true, g: true, c: true }));
  linhas.push(L(nomeSetor(setor).toUpperCase(), { b: true, c: true }), SEP);
  linhas.push(L(titulo(p), { b: true, g: true }));
  if (p.tipo !== "mesa" && p.cliente?.nome) linhas.push(L(p.cliente.nome, { b: true }));
  linhas.push(L(`${hh()}${quem?.nome ? " · " + quem.nome : ""}`));
  // Observação geral do pedido em destaque, antes dos itens (no fim do papel ninguém via).
  if (p.obs && p.tipo !== "mesa") linhas.push(...[SEP, L("*** OBSERVAÇÃO DO PEDIDO ***", { b: true, c: true }), L(p.obs, { b: true, g: true, c: true })]);
  linhas.push(SEP, ...(alteracao ? [L("AGORA:", { b: true })] : []), ...linhasProducao(itens, { espaco: Number(loja().espacoItens) || 0 }), ...linhasAntes(alteracao));
  if (cancelamento && itens[0]?.motivo) linhas.push(SEP, L(`Motivo: ${itens[0].motivo}`));
  linhas.push(...rodape());
  return linhas;
}

// Vários setores no mesmo papel: cabeçalho uma vez, depois cada setor com seu título.
function cupomJunto(p, grupos, quem, { cancelamento = false, alteracao = null, adicional = false } = {}) {
  const linhas = [];
  if (adicional) linhas.push(L("*** ADICIONAL ***", { b: true, g: true, c: true }));
  if (cancelamento) linhas.push(L("*** CANCELADO ***", { b: true, g: true, c: true }));
  if (alteracao) linhas.push(L("*** ALTERADO ***", { b: true, g: true, c: true }));
  linhas.push(L(titulo(p), { b: true, g: true }));
  if (p.tipo !== "mesa" && p.cliente?.nome) linhas.push(L(p.cliente.nome, { b: true }));
  if (p.taxaPendente) linhas.push(L("** TAXA DE ENTREGA A CONFIRMAR **", { b: true }));
  linhas.push(L(`${hh()}${quem?.nome ? " · " + quem.nome : ""}`));
  if (p.obs && p.tipo !== "mesa") linhas.push(...[SEP, L("*** OBSERVAÇÃO DO PEDIDO ***", { b: true, c: true }), L(p.obs, { b: true, g: true, c: true })]);
  for (const [s, its] of grupos) {
    linhas.push(SEP, L(`== ${nomeSetor(s).toUpperCase()} ==`, { b: true, c: true }), ...linhasProducao(its, { espaco: Number(loja().espacoItens) || 0 }), ...linhasAntes(alteracao));
  }
  if (cancelamento && grupos[0]?.[1][0]?.motivo) linhas.push(SEP, L(`Motivo: ${grupos[0][1][0].motivo}`));
  linhas.push(...rodape());
  return linhas;
}

export function cupomConta(pedidos, { servico = 0, desconto = 0, pagamento = null } = {}) {
  const lj = loja();
  const p0 = pedidos[0];
  const linhas = [L(lj.nome, { b: true, g: true, c: true })];
  if (lj.telefone) linhas.push(L(lj.telefone, { c: true }));
  if (lj.endereco) linhas.push(L(lj.endereco, { c: true }));
  linhas.push(SEP, L(p0.tipo === "mesa" ? `CONTA · MESA ${p0.mesa}` : titulo(p0), { b: true, g: true }));
  // Mesa com uma comanda só: mostra qual comanda está sendo fechada (com várias, cada uma vem com o seu nome abaixo).
  if (p0.tipo === "mesa" && pedidos.length === 1) linhas.push(L(`${rotuloComanda(p0).toUpperCase()}${p0.nome && p0.nome !== "Mesa inteira" ? " · " + p0.nome : ""}`, { b: true, g: true }));
  linhas.push(L(hh()));
  for (const p of pedidos) {
    if (pedidos.length > 1 || (p.tipo === "mesa" && p.nome && p.nome !== "Mesa inteira")) linhas.push(SEP, L(p.tipo === "mesa" ? `${rotuloComanda(p)}${p.nome ? " · " + p.nome : ""}` : p.nome || titulo(p), { b: true }));
    else linhas.push(SEP);
    linhas.push(...linhasItens(itensValidos(p), { precos: true }));
    if (p.descontoCupom) linhas.push(L(lado(`Cupom ${p.cupom?.codigo || ""}`, "-" + r$(p.descontoCupom))));
    if (p.taxaEntrega) linhas.push(L(lado("Taxa de entrega", r$(p.taxaEntrega))));
  }
  const sub = pedidos.reduce((s, p) => s + totalPedido(p), 0);
  linhas.push(SEP, L(lado("Subtotal", r$(sub))));
  if (servico) linhas.push(L(lado("Serviço (opcional)", r$(servico))));
  if (desconto) linhas.push(L(lado("Desconto", "-" + r$(desconto))));
  const total = sub + (servico || 0) - (desconto || 0);
  linhas.push(L(lado("TOTAL R$", r$(total)), { b: true, g: true }));
  if (pagamento) {
    linhas.push(SEP);
    for (const x of pagamento.pagamentos) linhas.push(L(lado(x.forma, r$(x.valor))));
    if (pagamento.troco) linhas.push(L(lado("Troco", r$(pagamento.troco))));
  } else if (p0.tipo === "mesa" && total > 0) {
    // ajuda o cliente a dividir
    const pessoas = pedidos.reduce((s, p) => s + (Number(p.pessoas) || 0), 0);
    if (pessoas > 1) linhas.push(SEP, L(lado(`Por pessoa (${pessoas})`, r$(total / pessoas)), { b: true }));
    else linhas.push(SEP, L(`Dividido por 2: ${r$(total / 2)} · por 3: ${r$(total / 3)} · por 4: ${r$(total / 4)}`));
  }
  linhas.push(SEP, L("NÃO É DOCUMENTO FISCAL", { c: true }), ...rodape());
  return linhas;
}

// Itens agrupados por categoria (Esfihas, Pizzas, Esfihas doces, Pastéis…), cada grupo com título em negrito e a quantidade.
function linhasPorCategoria(its, opts) {
  const grupos = new Map();
  for (const i of its) {
    const tipo = catEsfiha(i);
    const c = categoria(produto(i.produtoId)?.cat);
    const k = tipo ? `esfiha-${tipo}` : c?.id || "_";
    const ordem = tipo ? (categoria(tipo === "doce" ? "esfdoces" : "esfihas")?.ordem ?? c?.ordem ?? 999) : c?.ordem ?? 999;
    if (!grupos.has(k)) grupos.set(k, { nome: tipo ? TITULO_ESFIHA[tipo] : c?.nome || "Outros", ordem, esfiha: !!tipo, itens: [] });
    grupos.get(k).itens.push(i);
  }
  const lista = [...grupos.values()].sort((a, b) => a.ordem - b.ordem);
  if (lista.length < 2 && !lista[0]?.esfiha) return linhasItens(its, opts);
  const out = [];
  lista.forEach((g, n) => {
    if (n) out.push(L(""));
    out.push(L(`${g.nome.replace(/^[^\p{L}\p{N}]+/u, "").toUpperCase()} (${g.itens.reduce((t, i) => t + i.qtd, 0)})`, { b: true, g: true }), ...linhasItens(g.esfiha ? g.itens.map(semEsfiha) : g.itens, opts));
  });
  return out;
}

export function cupomEntrega(p) {
  const lj = loja();
  const c = p.cliente || {};
  const linhas = [L(lj.nome, { b: true, c: true }), SEP, L(titulo(p), { b: true, g: true }), L(`Horário: ${hh(p.criadoEm)}`)];
  linhas.push(L(`Tipo: ${{ entrega: "DELIVERY", retirada: "RETIRADA", balcao: "BALCÃO" }[p.tipo] || ""}${p.origem === "online" ? " (pelo cardápio online)" : ""}`));
  const operador = p.criadoPor || p.aceitoPor;
  if (operador) linhas.push(L(`Operador: ${operador}`));
  linhas.push(SEP, L(c.nome || "Cliente", { b: true, g: true }));
  if (c.telefone) linhas.push(L(`Tel: ${c.telefone}`, { b: true }));
  if (p.tipo === "entrega") {
    linhas.push(L(c.endereco || "", { b: true }));
    if (c.cep) linhas.push(L(`CEP: ${String(c.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`, { b: true }));
    if (c.bairro) linhas.push(L(`Bairro: ${c.bairro}`, { b: true }));
    if (c.area) linhas.push(L(`Área de entrega: ${c.area}`));
    if (c.distanciaKm) linhas.push(L(`Distância: ${String(c.distanciaKm).replace(".", ",")} km`));
    if (c.referencia) linhas.push(L(`Complemento/ref.: ${c.referencia}`));
  }
  const its = itensValidos(p);
  const nItens = its.reduce((s, i) => s + i.qtd, 0);
  if (p.obs) linhas.push(...[SEP, L("*** OBSERVAÇÃO DO PEDIDO ***", { b: true, c: true }), L(p.obs, { b: true, g: true, c: true })]);
  linhas.push(SEP, L(`ITENS (${nItens})`, { b: true }), ...linhasPorCategoria(its, { precos: true }));
  linhas.push(SEP, L(lado(`Itens (${nItens})`, r$(subtotal(p)))));
  if (p.desconto) linhas.push(L(lado("Desconto", "-" + r$(p.desconto))));
  if (p.descontoCupom) linhas.push(L(lado(`Cupom ${p.cupom?.codigo || ""}`, "-" + r$(p.descontoCupom))));
  if (p.taxaEntrega) linhas.push(L(lado(`Entrega${p.cliente?.area ? " (" + p.cliente.area + ")" : ""}`, r$(p.taxaEntrega))));
  if (p.taxaPendente) linhas.push(L("TAXA DE ENTREGA A CONFIRMAR", { b: true, g: true }));
  linhas.push(SEP, L(lado("TOTAL R$", r$(totalPedido(p))), { b: true, g: true }));
  const pg = p.pagamento || {};
  if (pg.forma) linhas.push(L(`Pagamento: ${pg.forma}${p.pago ? " (PAGO)" : ""}`, { b: true }));
  if (pg.trocoPara) linhas.push(L(`Troco para ${r$(pg.trocoPara)} · levar ${r$(pg.trocoPara - totalPedido(p))}`, { b: true }));
  else if (pg.forma === "Dinheiro" && !p.pago) linhas.push(L("Troco: não precisa", { b: true }));

  if (p.motoboy?.nome) linhas.push(L(`Motoboy: ${p.motoboy.nome}`));
  linhas.push(SEP, L("NÃO É DOCUMENTO FISCAL", { c: true }), ...rodape());
  return linhas;
}

// ---------------------------------------------------------------------------
//  Fila de impressão
// ---------------------------------------------------------------------------
// Mesa (salão) usa a impressora do setor; delivery/retirada/balcão usa a "impressoraDelivery".
export function impressoraDoSetor(setor, tipo = "mesa") {
  const lj = loja();
  const s = lj.setores.find((x) => x.id === setor);
  const imp = tipo === "mesa" || tipo === "consumo" ? s?.impressora : s?.impressoraDelivery || s?.impressora;
  return imp || lj.impressoras[0]?.id;
}

// criadoEm sempre crescente: a impressora imprime na ordem em que os papéis foram pedidos.
let ultimoCupom = 0;
// Desvio de emergência (aba Impressoras): se uma impressora parar, os cupons dela vão para outra.
export const desvioDe = (id) => {
  const para = loja().desvios?.[id];
  return para && para !== id && loja().impressoras.some((i) => i.id === para) ? para : null;
};
const nomeImpressora = (id) => loja().impressoras.find((i) => i.id === id)?.nome || id;
const cabecalhoDesvio = (de) => [{ t: `** DESVIADO: ERA DA ${nomeImpressora(de).toUpperCase()} **`, b: true, c: true }, { sep: true }];

// Sem internet, o computador do caixa pode imprimir na hora pelo navegador (veja estacao.js).
let imprimirLocal = null;
export const aoImprimirSemInternet = (fn) => (imprimirLocal = fn);

export function filaImpressao(impressora, tituloJob, linhas, extra = {}) {
  ultimoCupom = Math.max(Date.now(), ultimoCupom + 1);
  const para = desvioDe(impressora);
  if (para) { extra = { ...extra, desviadoDe: impressora }; linhas = [...cabecalhoDesvio(impressora), ...linhas]; impressora = para; }
  // tamanho/fonte escolhidos em Impressoras vão junto com o cupom (o agente usa direto)
  const imp = loja().impressoras.find((i) => i.id === impressora) || {};
  const estilo = {
    tamanho: imp.tamanho || "medio", fonte: imp.fonte || "arial", corte: imp.corte || "total", avanco: Number(imp.avanco ?? 4), entrelinhas: imp.entrelinhas || "normal",
    ...(imp.colunas ? { colunas: Number(imp.colunas) } : {}),
  };
  const dados = { impressora, titulo: tituloJob, linhas, estilo, status: "pendente", criadoEm: ultimoCupom, dia: hoje(), ...extra };
  // Já sai impresso daqui: quando a internet voltar, o agente não imprime de novo.
  if (imprimirLocal?.(dados)) Object.assign(dados, { status: "impresso", por: "navegador", impressoEm: Date.now() });
  return { tipo: "criar", col: "impressoes", dados };
}

// Liga/desliga o desvio e leva junto o que ficou parado na fila da impressora que parou.
export async function desviarImpressora(de, para) {
  const lj = loja();
  const desvios = { ...(lj.desvios || {}) };
  desvios[de] = para && para !== de ? para : ""; // "" desliga (apagar a chave não funciona com gravação parcial)
  await store.salvar("config", "loja", { desvios });
  if (!para || para === de) return 0;
  const imp = lj.impressoras.find((i) => i.id === para) || {};
  const parados = D.impressoes.filter((j) => j.impressora === de && ["pendente", "erro"].includes(j.status));
  await Promise.all(parados.map((j) => store.salvar("impressoes", j.id, {
    impressora: para, status: "pendente", erro: null, tentativas: 0, desviadoDe: de,
    linhas: [...cabecalhoDesvio(de), ...j.linhas],
    estilo: { ...(j.estilo || {}), tamanho: imp.tamanho || "medio", fonte: imp.fonte || "arial", ...(imp.colunas ? { colunas: Number(imp.colunas) } : {}) },
  })));
  return parados.length;
}

// p.itens = só os itens que devem sair agora (novos ou cancelados)
export async function imprimirProducao(p, quem, opts = {}) {
  const itens = p.itens.filter((i) => !(i.semImpressao || naoImprime(produto(i.produtoId))));
  if (!itens.length) return;
  // Cancelar só muda no computador: o papel "CANCELADO" no setor só sai se a loja ligar em Ajustes.
  if (opts.cancelamento && !loja().imprimirCancelamento) return;
  const lj = loja();
  const porSetor = new Map();
  for (const i of itens) {
    const s = i.setor || setorDe(produto(i.produtoId));
    // Delivery/retirada/balcão: setor marcado "só na via" (esfihas) não ganha papel separado, a via completa já serve.
    if (p.tipo !== "mesa" && p.tipo !== "consumo" && lj.setores.find((x) => x.id === s)?.soViaDelivery) continue;
    if (!porSetor.has(s)) porSetor.set(s, []);
    porSetor.get(s).push(i);
  }
  if (!porSetor.size) return;
  const ops = [];
  const nome = `${titulo(p)}${opts.cancelamento ? " (cancelado)" : opts.alteracao ? " (alterado)" : opts.adicional ? " (adicional)" : ""}`;
  // separado: um papel para cada setor (padrão da loja em Ajustes, ou forçado pelo botão)
  if (opts.separado ?? lj.papelPorSetor) {
    for (const [s, its] of porSetor) ops.push(filaImpressao(impressoraDoSetor(s, p.tipo), `${nomeSetor(s)} · ${nome}`, cupomProducao(p, its, s, quem, opts), { setor: s, pedido: p.id }));
  } else {
    // Um papel por impressora, com os setores separados por título.
    const porImp = new Map();
    for (const [s, its] of porSetor) {
      const imp = impressoraDoSetor(s, p.tipo);
      if (!porImp.has(imp)) porImp.set(imp, []);
      porImp.get(imp).push([s, its]);
    }
    for (const [imp, grupos] of porImp) ops.push(filaImpressao(imp, nome, cupomJunto(p, grupos, quem, opts), { pedido: p.id }));
  }
  await store.lote(ops);
}

// Delivery/retirada: primeiro o papel com tudo (via com endereço e valores), depois os papéis de cada setor.
async function imprimirNovoPedido(p, quem) {
  await store.lote([filaImpressao(loja().impressoraConta, `Via ${titulo(p)}`, cupomEntrega(p), { pedido: p.id })]);
  await imprimirProducao(p, quem);
}

// Botão "Imprimir por setor": reimprime o pedido inteiro, um papel para cada setor.
export const imprimirPorSetor = (p, quem) => imprimirProducao({ ...p, itens: itensValidos(p) }, quem, { separado: true });

// Botão "Imprimir tudo junto": reimprime o pedido inteiro num papel só, dividido por setor.
export const imprimirJunto = (p, quem) => imprimirProducao({ ...p, itens: itensValidos(p) }, quem, { separado: false });

const tituloConta = (pedidos) => (pedidos[0].tipo === "mesa" && pedidos.length > 1 ? `MESA ${pedidos[0].mesa}` : titulo(pedidos[0]));
// Conta pedida pelo garçom (tela do garçom) sai na impressora do salão (Print iD no bar), não na do caixa.
const impressoraDaConta = (salao) => (salao ? loja().impressoraContaGarcom || loja().impressoraConta : loja().impressoraConta);
export const imprimirConta = (pedidos, valores, { salao = false, impressora = null } = {}) =>
  store.lote([filaImpressao(impressora || impressoraDaConta(salao), `Conta ${tituloConta(pedidos)}`, cupomConta(pedidos, valores))]);

// Recibo para o cliente assinar e a loja guardar.
export function cupomRecibo(pedidos, pag, via = "VIA DA LOJA") {
  const lj = loja(), p0 = pedidos[0];
  const nomes = pedidos.map((p) => p.nome || p.cliente?.nome || "").filter((x) => x && x !== "Mesa inteira").join(", ");
  const onde = p0.tipo === "mesa" ? `Mesa ${p0.mesa}${pedidos.length > 1 ? "" : p0.numero ? " · comanda " + p0.numero : ""}` : titulo(p0);
  const linhas = [L(lj.nome, { b: true, g: true, c: true }), ...(lj.telefone ? [L(lj.telefone, { c: true })] : []), ...(lj.endereco ? [L(lj.endereco, { c: true })] : []),
    SEP, L("RECIBO DE PAGAMENTO", { b: true, g: true, c: true }), L(via, { c: true }), L(hh(pag.criadoEm || Date.now())), SEP, L(onde, { b: true }), ...(nomes ? [L(`Cliente: ${nomes}`)] : []), SEP];
  for (const x of pag.pagamentos) linhas.push(L(lado(x.forma, r$(x.valor))));
  if (pag.servico) linhas.push(L(lado("Serviço", r$(pag.servico))));
  if (pag.desconto) linhas.push(L(lado("Desconto", "-" + r$(pag.desconto))));
  if (pag.troco) linhas.push(L(lado("Troco", r$(pag.troco))));
  linhas.push(L(lado("TOTAL PAGO R$", r$(pag.total)), { b: true, g: true }), SEP,
    L(`Declaro que paguei o valor de R$ ${r$(pag.total)} referente ao consumo acima.`),
    L(""), L(""), L("______________________________", { c: true }), L("Assinatura do cliente", { c: true }), L(""),
    L("Nome: ______________________________"), L(pag.cpf ? `CPF: ${pag.cpf}` : "CPF: ______________________________"), ...(pag.por ? [L(`Recebido por: ${pag.por}`)] : []),
    SEP, L("NÃO É DOCUMENTO FISCAL", { c: true }), ...rodape());
  return linhas;
}
export const imprimirRecibo = (pedidos, pag, { salao = false, vias = 1 } = {}) =>
  store.lote(Array.from({ length: vias }, (_, i) => filaImpressao(impressoraDaConta(salao), `Recibo ${tituloConta(pedidos)}`, cupomRecibo(pedidos, pag, vias > 1 ? (i ? "VIA DO CLIENTE" : "VIA DA LOJA") : "VIA DA LOJA"))));

export const imprimirComprovante = (pedidos, pag, { salao = false } = {}) =>
  store.lote([filaImpressao(impressoraDaConta(salao), `Comprovante ${tituloConta(pedidos)}`, cupomConta(pedidos, { servico: pag.servico, desconto: pag.desconto, pagamento: pag }))]);

export const imprimirVia = (p) =>
  store.lote([filaImpressao(loja().impressoraConta, `Via ${titulo(p)}`, cupomEntrega(p), { pedido: p.id })]);

export const reimprimir = (job) =>
  store.lote([filaImpressao(job.impressora, job.titulo + " (reimpressão)", job.linhas)]);

export const tituloPedido = titulo;
