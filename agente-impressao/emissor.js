// Emissor de NFC-e do agente: pega os recebimentos novos, envia ao Focus NFe e imprime o DANFE com QR code.
// Só emite se a emissão estiver ligada em Ajustes > Nota fiscal (config/fiscal.emitir) e só para
// recebimentos criados depois de ligar (config/fiscal.emitirDesde): nunca mexe no que já passou.
import { collection, query, where, onSnapshot, doc, runTransaction, updateDoc } from "firebase/firestore";
import { montarNFCe, focus } from "./nfce.js";
import { imprimir } from "./impressora.js";

const brl = (n) => Number(n || 0).toFixed(2).replace(".", ",");
const dh = (t) => new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export function linhasDanfe(pag, nfce, f, homolog) {
  const L = (t, o = {}) => ({ t, ...o });
  const chave = String(nfce.chave || "").replace(/^NFe/, "");
  const urlConsulta = nfce.urlConsulta || "";
  const total = (pag.itensFiscais || []).reduce((t, i) => t + i.vTotal, 0) + (pag.servico || 0) - (pag.desconto || 0);
  return [
    ...(homolog ? [L("** EMITIDA EM HOMOLOGAÇÃO **", { b: true, c: true }), L("SEM VALOR FISCAL", { b: true, c: true }), { sep: true }] : []),
    L(f.fantasia || f.razaoSocial || "", { b: true, c: true, g: true }),
    L(f.razaoSocial || "", { c: true }),
    L(`CNPJ ${String(f.cnpj || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}  IE ${f.ie || ""}`, { c: true }),
    L(`${f.logradouro || ""}, ${f.numero || ""} - ${f.bairro || ""}`, { c: true }),
    L(`${f.cidade || ""}-${f.uf || ""}`, { c: true }),
    { sep: true },
    L("DANFE NFC-e", { b: true, c: true }),
    L("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", { c: true }),
    { sep: true },
    ...(pag.itensFiscais || []).map((i) => ({ e: `${i.qtd}x ${i.desc}`, d: brl(i.vTotal), t: `${i.qtd}x ${i.desc}` })),
    { sep: true },
    ...(pag.servico ? [{ e: "Serviço", d: brl(pag.servico), t: "Serviço" }] : []),
    ...(pag.desconto ? [{ e: "Desconto", d: `-${brl(pag.desconto)}`, t: "Desconto" }] : []),
    { e: "TOTAL R$", d: brl(total), b: true, t: "TOTAL" },
    ...(pag.pagamentos || []).map((x) => ({ e: x.forma, d: brl(x.valor), t: x.forma })),
    ...(pag.troco ? [{ e: "Troco", d: brl(pag.troco), t: "Troco" }] : []),
    { sep: true },
    L(`NFC-e nº ${nfce.numero}  Série ${nfce.serie}`, { b: true, c: true }),
    L(`Emissão ${dh(nfce.emitidaEm)}`, { c: true }),
    L(`Protocolo ${nfce.protocolo || ""}`, { c: true }),
    L("Chave de acesso", { b: true, c: true }),
    L(chave.replace(/(\d{4})(?=\d)/g, "$1 "), { c: true }),
    L(pag.cpf ? `Consumidor CPF ${String(pag.cpf).replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")}` : "CONSUMIDOR NÃO IDENTIFICADO", { c: true }),
    ...(nfce.qrcode ? [{ qr: nfce.qrcode }] : []),
    ...(urlConsulta ? [L("Consulte pela chave de acesso em:", { c: true }), L(urlConsulta, { c: true })] : []),
    L("Obrigado pela preferência!", { c: true }),
  ];
}

export function iniciarEmissor({ db, cfg, log, aoLimpar }) {
  let fiscal = null;
  const ocupado = new Set();
  const impDanfe = () => cfg.nfce?.impressora || Object.keys(cfg.impressoras)[0];

  async function imprimirDanfe(pag, nfce, homolog) {
    const nome = impDanfe(), imp = cfg.impressoras[nome];
    if (!imp) return log("NFC-e: sem impressora para o DANFE (config.json > nfce.impressora)");
    await imprimir({ impressora: nome, linhas: linhasDanfe(pag, nfce, fiscal, homolog) }, { ...imp, tamanho: imp.tamanho || "pequeno" }, cfg.acentos);
  }

  async function salvar(id, nfce) { await updateDoc(doc(db, "pagamentos", id), { nfce }); }

  async function emitir(id, pag) {
    if (ocupado.has(id)) return;
    ocupado.add(id);
    const ref = doc(db, "pagamentos", id);
    try {
      const pegou = await runTransaction(db, async (t) => {
        const s = await t.get(ref);
        if (!s.exists() || s.data().nfce?.status !== "pendente") return false;
        t.update(ref, { "nfce.status": "enviando" });
        return true;
      });
      if (!pegou) return;
      const fx = focus({ ambiente: fiscal.ambiente, focus: cfg.focus });
      if (!fx.temToken) throw Object.assign(new Error(`falta o token do Focus (${fx.ambiente}) no config.json`), { fatal: true });
      const nota = montarNFCe(pag, fiscal);
      let r = await fx.enviar(id, nota);
      for (let i = 0; i < 12 && (r.status === "processando_autorizacao" || (r.http === 201 && !r.status)); i++) { await espera(3000); r = await fx.consultar(id); }
      if (r.status === "autorizado") {
        const nfce = { status: "autorizado", ambiente: fx.ambiente, chave: r.chave_nfe, numero: r.numero, serie: r.serie, protocolo: r.protocolo, qrcode: r.qrcode_url, urlConsulta: r.url_consulta_nf,
          danfe: r.caminho_danfe ? fx.base + r.caminho_danfe : "", xml: r.caminho_xml_nota_fiscal ? fx.base + r.caminho_xml_nota_fiscal : "", emitidaEm: Date.now(), agente: true };
        await salvar(id, nfce);
        log(`NFC-e ${r.numero} autorizada (${fx.ambiente}) · pagamento ${id}`);
        await imprimirDanfe(pag, nfce, fx.ambiente !== "producao").catch((e) => log("NFC-e: erro ao imprimir o DANFE:", e.message));
      } else {
        const msg = r.mensagem_sefaz || r.mensagem || r.codigo || `resposta ${r.http}`;
        await salvar(id, { status: "erro", erro: String(msg).slice(0, 300), tentativas: (pag.nfce?.tentativas || 0) + 1, ambiente: fx.ambiente });
        log("NFC-e REJEITADA:", msg);
      }
    } catch (e) {
      const n = (pag.nfce?.tentativas || 0) + 1;
      log("NFC-e erro:", e.message, `(tentativa ${n})`);
      if (e.fatal || n >= 5) await salvar(id, { status: "erro", erro: e.message, tentativas: n }).catch(() => {});
      else { await salvar(id, { status: "pendente", tentativas: n, proxTentativa: Date.now() + 20000 }).catch(() => {}); setTimeout(checar, 21000); }
    } finally { ocupado.delete(id); }
  }

  async function cancelar(id, pag) {
    if (ocupado.has(id)) return;
    ocupado.add(id);
    try {
      const n = pag.nfce, fx = focus({ ambiente: n.ambiente || fiscal.ambiente, focus: cfg.focus });
      const motivo = String(n.cancelarMotivo || "").trim();
      if (motivo.length < 15) throw new Error("o motivo do cancelamento precisa ter pelo menos 15 letras");
      const r = await fx.cancelar(id, motivo);
      if (r.status === "cancelado") { await salvar(id, { ...n, status: "cancelado", canceladaEm: Date.now(), cancelarMotivo: motivo }); log("NFC-e cancelada:", n.numero); }
      else throw new Error(r.mensagem_sefaz || r.mensagem || "o Focus não cancelou");
    } catch (e) {
      log("NFC-e cancelamento falhou:", e.message);
      await salvar(id, { ...pag.nfce, status: "autorizado", erroCancelamento: e.message }).catch(() => {});
    } finally { ocupado.delete(id); }
  }

  let ultimos = [];
  const checar = () => {
    if (!fiscal?.emitir || !fiscal.emitirDesde) return;
    for (const [id, p] of ultimos) {
      const st = p.nfce?.status;
      if (st === "pendente" && (p.criadoEm || 0) >= fiscal.emitirDesde && Date.now() >= (p.nfce.proxTentativa || 0)) emitir(id, p);
      else if (st === "cancelar") cancelar(id, p);
    }
  };
  onSnapshot(doc(db, "config", "fiscal"), (s) => { fiscal = s.exists() ? s.data() : null; log(`NFC-e: emissão ${fiscal?.emitir ? "LIGADA" : "desligada"} (${fiscal?.ambiente || "homologacao"})`); checar(); }, (e) => log("NFC-e: erro ao ler config/fiscal:", e.message));
  onSnapshot(query(collection(db, "pagamentos"), where("nfce.status", "in", ["pendente", "cancelar"])), (snap) => { ultimos = snap.docs.map((d) => [d.id, d.data()]); checar(); }, (e) => log("NFC-e: erro ao ouvir pagamentos:", e.message));
}
