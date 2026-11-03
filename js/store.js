// Camada de dados. Usa o Firebase quando FIREBASE_CONFIG está preenchido;
// senão, usa o armazenamento do navegador (modo demonstração).
// As duas versões têm a mesma interface, então o resto do sistema não sabe qual está rodando.
import { FIREBASE_CONFIG } from "./config.js";

export const novoId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const passa = (doc, filtro) => {
  if (!filtro) return true;
  const [campo, op, valor] = filtro;
  const v = doc[campo];
  if (op === "==") return v === valor;
  if (op === ">=") return v >= valor;
  if (op === "in") return valor.includes(v);
  return true;
};

// ---------------------------------------------------------------------------
//  Modo demonstração (localStorage + aviso entre abas)
// ---------------------------------------------------------------------------
function criarStoreLocal() {
  const P = "se4_"; // prefixo do modo demonstração (muda quando o cardápio inicial muda)
  const cache = {};
  const ouvintes = new Set();
  const ler = (col) => {
    if (!cache[col]) {
      try { cache[col] = JSON.parse(localStorage.getItem(P + col)) || {}; } catch { cache[col] = {}; }
    }
    return cache[col];
  };
  const gravar = (col) => {
    try { localStorage.setItem(P + col, JSON.stringify(cache[col])); } catch {}
    avisar(col);
  };
  const avisar = (col) => {
    for (const o of ouvintes) if (o.col === col) entregar(o);
  };
  const entregar = (o) => {
    const docs = Object.entries(ler(o.col)).map(([id, d]) => ({ id, ...d })).filter((d) => passa(d, o.filtro));
    o.cb(docs);
  };
  // Outra aba do mesmo navegador mudou algo: recarrega e avisa.
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(P)) return;
    const col = e.key.slice(P.length);
    delete cache[col];
    avisar(col);
  });
  let lojaCb = () => {};

  return {
    modo: "demo",
    async iniciar() {},
    aoMudarLoja(cb) { lojaCb = cb; cb({ email: "demonstracao" }); },
    async entrarLoja() { lojaCb({ email: "demonstracao" }); },
    async sairLoja() {},
    ouvir(col, cb, filtro) {
      const o = { col, cb, filtro };
      ouvintes.add(o);
      queueMicrotask(() => ouvintes.has(o) && entregar(o));
      return () => ouvintes.delete(o);
    },
    ouvirDoc(col, id, cb) {
      return this.ouvir(col, (docs) => cb(docs.find((d) => d.id === id) || null));
    },
    async obter(col, id) {
      const d = ler(col)[id];
      return d ? { id, ...structuredClone(d) } : null;
    },
    async listar(col) {
      return Object.entries(ler(col)).map(([id, d]) => ({ id, ...structuredClone(d) }));
    },
    // Busca única (não fica ouvindo): filtro = [campo, operador, valor] ou lista de filtros.
    async consultar(col, filtros) {
      const fs = Array.isArray(filtros[0]) ? filtros : [filtros];
      const ok = (d, [c, op, v]) => ({ "==": d[c] === v, ">=": d[c] >= v, "<=": d[c] <= v, ">": d[c] > v, "<": d[c] < v })[op];
      return Object.entries(ler(col)).map(([id, d]) => ({ id, ...structuredClone(d) })).filter((d) => fs.every((f) => ok(d, f)));
    },
    async salvar(col, id, dados) {
      ler(col)[id] = { ...(ler(col)[id] || {}), ...structuredClone(dados) };
      gravar(col);
    },
    async criar(col, dados) {
      const id = novoId();
      ler(col)[id] = structuredClone(dados);
      gravar(col);
      return id;
    },
    async apagar(col, id) {
      delete ler(col)[id];
      gravar(col);
    },
    // fn recebe o documento atual e devolve as mudanças (ou null para não mudar nada).
    async transacao(col, id, fn) {
      delete cache[col]; // garante a versão mais nova (outra aba pode ter mudado)
      const atual = ler(col)[id];
      const mud = fn(atual ? structuredClone(atual) : null);
      if (!mud) return null;
      ler(col)[id] = { ...(atual || {}), ...mud };
      gravar(col);
      return mud;
    },
    async adicionarItens(col, id, itens, extra = {}) {
      delete cache[col];
      const d = ler(col)[id];
      if (!d) throw new Error("Comanda não encontrada.");
      ler(col)[id] = { ...d, ...extra, itens: [...(d.itens || []), ...structuredClone(itens)] };
      gravar(col);
    },
    async lote(ops) {
      for (const op of ops) {
        if (op.tipo === "criar") ler(op.col)[op.id || novoId()] = structuredClone(op.dados);
        else if (op.tipo === "salvar") ler(op.col)[op.id] = { ...(ler(op.col)[op.id] || {}), ...structuredClone(op.dados) };
        else if (op.tipo === "apagar") delete ler(op.col)[op.id];
      }
      for (const c of new Set(ops.map((o) => o.col))) gravar(c);
    },
    async proximoNumero(dia) {
      delete cache.config;
      const c = ler("config");
      const n = (c.contador?.dia === dia ? c.contador.n || 0 : 0) + 1;
      c.contador = { dia, n };
      gravar("config");
      return n;
    },
  };
}

// ---------------------------------------------------------------------------
//  Modo online (Firebase Auth + Firestore)
// ---------------------------------------------------------------------------
function criarStoreFirebase() {
  const V = "10.12.2";
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  let fb, auth, db;

  const traduzir = (e) => {
    const c = e?.code || "";
    if (c.includes("missing-password")) return new Error("Digite a senha da loja.");
    if (c.includes("missing-email") || c.includes("invalid-email")) return new Error("Digite o e-mail da loja.");
    if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
      return new Error("E-mail ou senha da loja incorretos.");
    if (c.includes("too-many-requests")) return new Error("Muitas tentativas. Espere alguns minutos e tente de novo.");
    if (c.includes("unauthorized-domain")) return new Error("Este endereço não está autorizado no Firebase (Authentication › Domínios autorizados).");
    if (c.includes("permission-denied")) return new Error("Sem permissão. Entre com a conta da loja neste aparelho.");
    if (c.includes("network") || c.includes("unavailable") || c.includes("deadline")) return Object.assign(new Error("Sem conexão com a internet."), { offline: true });
    return new Error(e?.message || "Algo deu errado.");
  };
  // Transação precisa falar com o servidor; sem internet ela não termina. Desiste em 6 s.
  const comPrazo = (promessa) => Promise.race([promessa, new Promise((_, nao) => setTimeout(() => nao({ code: "unavailable" }), 6000))]);
  const tentar = async (fn) => { try { return await fn(); } catch (e) { throw traduzir(e); } };
  const ref = (col, id) => fb.doc(db, col, id);
  // Erro de permissão aparece no console; falta de internet só atrasa o envio.
  const semEsperar = (promessa) => promessa.catch((e) => { console.error(e); window.dispatchEvent(new CustomEvent("se-erro-gravacao", { detail: traduzir(e) })); });

  return {
    modo: "online",
    async iniciar() {
      const [app, a, f] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),
      ]);
      fb = { ...a, ...f };
      const appFb = app.initializeApp(FIREBASE_CONFIG);
      auth = a.getAuth(appFb);
      // Cache offline: se a internet cair, o garçom continua lançando e tudo sobe quando voltar.
      try {
        db = f.initializeFirestore(appFb, { ignoreUndefinedProperties: true, localCache: f.persistentLocalCache({ tabManager: f.persistentMultipleTabManager() }) });
      } catch {
        db = f.getFirestore(appFb);
      }
      // Para testes do desenvolvedor: endereço com ?emulador usa o Firebase local.
      if (new URLSearchParams(location.search).has("emulador")) {
        a.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
        f.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      }
    },
    aoMudarLoja(cb) {
      fb.onAuthStateChanged(auth, (u) => cb(u ? { email: u.email } : null));
    },
    entrarLoja: (email, senha) => tentar(() => fb.signInWithEmailAndPassword(auth, email.trim(), senha)),
    sairLoja: () => fb.signOut(auth),
    ouvir(col, cb, filtro, aoErro) {
      const q = filtro ? fb.query(fb.collection(db, col), fb.where(...filtro)) : fb.collection(db, col);
      return fb.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => {
        console.error(col, e);
        aoErro?.(traduzir(e));
      });
    },
    ouvirDoc(col, id, cb, aoErro) {
      return fb.onSnapshot(ref(col, id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), (e) => {
        console.error(col, id, e);
        aoErro?.(traduzir(e));
      });
    },
    obter: (col, id) => tentar(async () => {
      const s = await fb.getDoc(ref(col, id));
      return s.exists() ? { id: s.id, ...s.data() } : null;
    }),
    consultar: (col, filtros) => tentar(async () => {
      const fs = Array.isArray(filtros[0]) ? filtros : [filtros];
      const s = await fb.getDocs(fb.query(fb.collection(db, col), ...fs.map((f) => fb.where(...f))));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),
    listar: (col) => tentar(async () => {
      const s = await fb.getDocs(fb.collection(db, col));
      return s.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),
    // Gravações não esperam o servidor responder: o Firestore guarda no aparelho e envia
    // assim que tiver internet. A tela já mostra a mudança na hora.
    salvar: (col, id, dados) => tentar(() => { semEsperar(fb.setDoc(ref(col, id), dados, { merge: true })); }),
    criar: (col, dados) => tentar(() => {
      const r = fb.doc(fb.collection(db, col));
      semEsperar(fb.setDoc(r, dados));
      return r.id;
    }),
    apagar: (col, id) => tentar(() => fb.deleteDoc(ref(col, id))),
    // Junta itens na comanda sem precisar de internet na hora (fica na fila e sobe quando voltar).
    adicionarItens: (col, id, itens, extra = {}) => tentar(() => {
      semEsperar(fb.updateDoc(ref(col, id), { ...extra, itens: fb.arrayUnion(...itens) }));
    }),
    transacao: (col, id, fn) => tentar(() => comPrazo(fb.runTransaction(db, async (t) => {
      const s = await t.get(ref(col, id));
      const mud = fn(s.exists() ? s.data() : null);
      if (!mud) return null;
      t.set(ref(col, id), mud, { merge: true });
      return mud;
    }))),
    lote: (ops) => tentar(async () => {
      // O Firestore aceita até 500 operações por lote.
      for (let i = 0; i < ops.length; i += 450) {
        const b = fb.writeBatch(db);
        for (const op of ops.slice(i, i + 450)) {
          if (op.tipo === "criar") b.set(op.id ? ref(op.col, op.id) : fb.doc(fb.collection(db, op.col)), op.dados);
          else if (op.tipo === "salvar") b.set(ref(op.col, op.id), op.dados, { merge: true });
          else if (op.tipo === "apagar") b.delete(ref(op.col, op.id));
        }
        semEsperar(b.commit());
      }
    }),
    // Número do pedido/comanda: recomeça do 1 a cada dia.
    proximoNumero: (dia) => tentar(() => comPrazo(fb.runTransaction(db, async (t) => {
      const r = ref("config", "contador");
      const s = await t.get(r);
      const d = s.exists() ? s.data() : {};
      const n = (d.dia === dia ? d.n || 0 : 0) + 1;
      t.set(r, { dia, n });
      return n;
    }))),
  };
}

const configurado = Object.values(FIREBASE_CONFIG).every((v) => String(v || "").trim());
export const store = configurado ? criarStoreFirebase() : criarStoreLocal();
