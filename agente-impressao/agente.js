// Agente de impressão do Sistema Elite.
// Fica rodando no computador do caixa: pega os cupons da fila e manda direto
// para cada impressora térmica (rede, compartilhada no Windows ou USB), sem janela.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, doc, runTransaction, updateDoc, connectFirestoreEmulator } from "firebase/firestore";
import { imprimir } from "./impressora.js";

const pasta = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(pasta, "config.json"), "utf8"));
const log = (...a) => console.log(new Date().toLocaleTimeString("pt-BR"), ...a);
// Versão do agente: vai gravada em cada cupom impresso, para o sistema avisar se estiver desatualizado.
export const VERSAO = "2026.10.27-6";

// ------------------------------------------------------------------ fila
const app = initializeApp(cfg.firebase);
const db = getFirestore(app);
const auth = getAuth(app);
if (cfg.emulador) { // só para testes do desenvolvedor
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
await signInWithEmailAndPassword(auth, cfg.email, cfg.senha);
log(`Agente ${VERSAO} · conectado como`, cfg.email, "· impressoras:", Object.keys(cfg.impressoras).join(", "));

const minhas = Object.keys(cfg.impressoras);
const ocupado = new Set();
const fila = new Map();

async function processar(id, job) {
  if (ocupado.has(id)) return;
  ocupado.add(id);
  const ref = doc(db, "impressoes", id);
  try {
    const pegou = await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists() || !["pendente", "erro"].includes(s.data().status)) return false;
      t.update(ref, { status: "imprimindo", por: "agente" });
      return true;
    });
    if (!pegou) return;
    const imp = cfg.impressoras[job.impressora];
    await imprimir(job, imp && { ...imp, ...(job.estilo || {}) }, cfg.acentos);
    await updateDoc(ref, { status: "impresso", impressoEm: Date.now(), erro: null, agente: VERSAO });
    log("Impresso:", job.titulo, "→", job.impressora);
  } catch (e) {
    const tentativas = (job.tentativas || 0) + 1;
    log("ERRO", job.titulo, "→", job.impressora, ":", e.message, `(tentativa ${tentativas})`);
    await updateDoc(ref, { status: "erro", erro: e.message, tentativas }).catch(() => {});
  } finally {
    ocupado.delete(id);
  }
}

// Cada impressora imprime um papel por vez, na ordem em que foram pedidos
// (ex.: no delivery, primeiro o papel com tudo e depois os de cada setor).
const rodando = new Set();
async function esvaziar(imp) {
  if (rodando.has(imp)) return;
  rodando.add(imp);
  try {
    for (;;) {
      const prox = [...fila.entries()].filter(([id, j]) => j.impressora === imp && j.status === "pendente" && !ocupado.has(id))
        .sort((a, b) => (a[1].criadoEm || 0) - (b[1].criadoEm || 0))[0];
      if (!prox) break;
      fila.delete(prox[0]);
      await processar(prox[0], prox[1]);
    }
  } finally { rodando.delete(imp); }
}

onSnapshot(query(collection(db, "impressoes"), where("status", "in", ["pendente", "erro"])), (snap) => {
  fila.clear();
  for (const d of snap.docs) {
    const j = d.data();
    if (!minhas.includes(j.impressora)) continue;
    fila.set(d.id, j);
  }
  for (const imp of minhas) esvaziar(imp);
}, (e) => log("Erro ao ouvir a fila:", e.message));

// Tenta de novo os que deram erro (impressora sem papel, desligada…), até 20 vezes.
setInterval(() => {
  for (const [id, j] of fila) if (j.status === "erro" && (j.tentativas || 0) < 20) { j.status = "pendente"; fila.set(id, j); }
  for (const imp of minhas) esvaziar(imp);
}, 15000);

process.on("SIGINT", () => { log("Encerrando."); process.exit(0); });
