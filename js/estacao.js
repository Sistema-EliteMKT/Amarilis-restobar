// Estação de impressão pelo navegador: este computador pega os cupons pendentes
// das impressoras escolhidas e imprime. (O agente de impressão faz o mesmo, sem janela.)
import { store } from "./store.js";
import { D, aoMudar, loja, aoImprimirSemInternet } from "./regras.js";
import { temInternet } from "./rede.js";
import { imprimirNoNavegador } from "./imprimir-navegador.js";

const K = "se_estacao";
export const lerEstacao = () => { try { return JSON.parse(localStorage.getItem(K)) || { ativo: false, impressoras: [], semInternet: false }; } catch { return { ativo: false, impressoras: [], semInternet: false }; } };
export const gravarEstacao = (v) => { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} };

const emAndamento = new Set();
async function processar() {
  const est = lerEstacao();
  if (!est.ativo) return;
  const pend = D.impressoes.filter((j) => j.status === "pendente" && est.impressoras.includes(j.impressora) && !emAndamento.has(j.id))
    .sort((a, b) => a.criadoEm - b.criadoEm);
  for (const j of pend) {
    emAndamento.add(j.id);
    try {
      // "Pega" o cupom antes de imprimir, para outro computador/agente não imprimir de novo.
      const ok = await store.transacao("impressoes", j.id, (d) => (d && d.status === "pendente" ? { status: "imprimindo", por: "navegador" } : null));
      if (!ok) continue;
      await imprimirNoNavegador(j.linhas, loja().colunas);
      await store.salvar("impressoes", j.id, { status: "impresso", impressoEm: Date.now() });
    } catch (e) {
      console.error(e);
      await store.salvar("impressoes", j.id, { status: "erro", erro: String(e?.message || e) }).catch(() => {});
    } finally {
      emAndamento.delete(j.id);
    }
  }
}

let ligado = false;
export function iniciarEstacao() {
  if (ligado) return;
  ligado = true;
  // Internet caiu: o que for lançado neste computador sai na hora pela impressora do Windows.
  aoImprimirSemInternet((j) => {
    if (!lerEstacao().semInternet || temInternet()) return false;
    imprimirNoNavegador(j.linhas, j.estilo?.colunas || loja().colunas);
    return true;
  });
  aoMudar(processar);
}
