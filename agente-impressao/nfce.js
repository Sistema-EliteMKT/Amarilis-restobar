// Emissão de NFC-e pelo Focus NFe. Funções puras (montar o JSON) + chamadas HTTP.
// O token do Focus fica só no config.json do caixa (nunca no repositório).
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Horário de Brasília (sem horário de verão), no formato que a SEFAZ espera.
const agoraBrasil = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19) + "-03:00";
const so = (v) => String(v || "").replace(/\D/g, "");

// Monta o JSON da NFC-e a partir de um documento de "pagamentos" (com itensFiscais e pagamentos).
// Desconto e serviço são rateados entre os itens para a soma bater com o que foi pago.
export function montarNFCe(pag, fiscal) {
  const itens = pag.itensFiscais || [];
  if (!itens.length) throw new Error("pagamento sem itens fiscais");
  const bruto = r2(itens.reduce((t, i) => t + i.vTotal, 0));
  // Tudo o que foi cobrado além dos itens (serviço, taxa de entrega) entra como outras despesas, e o desconto abate:
  // assim os itens fecham com o total pago (a SEFAZ recusa nota em que os pagamentos passam do total).
  const ajuste = r2((pag.total != null ? pag.total : bruto + (pag.servico || 0) - (pag.desconto || 0)) - bruto);
  let sobra = ajuste;
  const det = itens.map((i, n) => {
    const ult = n === itens.length - 1;
    const parte = ult ? sobra : r2(bruto ? (ajuste * i.vTotal) / bruto : 0);
    sobra = r2(sobra - parte);
    const it = {
      numero_item: n + 1, codigo_produto: String(i.cod || n + 1).slice(0, 60), descricao: String(i.desc).slice(0, 120),
      codigo_ncm: so(i.ncm) || "19059090", cfop: so(i.cfop) || "5102",
      unidade_comercial: i.unidade || "UN", quantidade_comercial: i.qtd, valor_unitario_comercial: r2(i.vUnit),
      unidade_tributavel: i.unidade || "UN", quantidade_tributavel: i.qtd, valor_unitario_tributavel: r2(i.vUnit),
      valor_bruto: r2(i.vTotal), icms_origem: String(i.origem ?? "0"), icms_situacao_tributaria: String(i.csosn || "102"),
      inclui_no_total: 1,
    };
    if (parte > 0) it.valor_outras_despesas = parte;
    else if (parte < 0) it.valor_desconto = r2(-parte);
    return it;
  });
  // Pagamentos líquidos: o troco sai do dinheiro.
  let troco = r2(pag.troco || 0);
  const formas = (pag.pagamentos || []).map((x) => {
    let v = r2(x.valor);
    if (x.forma === "Dinheiro" && troco > 0) { const t = Math.min(troco, v); v = r2(v - t); troco = r2(troco - t); }
    const f = { forma_pagamento: x.tPag || "99", valor_pagamento: v };
    if (f.forma_pagamento === "99") f.descricao_pagamento = String(x.forma || "Outros").slice(0, 60);
    return f;
  }).filter((f) => f.valor_pagamento > 0);
  const nota = {
    natureza_operacao: "Venda ao Consumidor", data_emissao: agoraBrasil(), // hora do envio: a SEFAZ recusa nota com horário de emissão atrasado
    presenca_comprador: 1, modalidade_frete: 9, local_destino: 1, consumidor_final: 1,
    cnpj_emitente: so(fiscal.cnpj), itens: det, formas_pagamento: formas,
  };
  const doc = so(pag.cpf); // o campo "cpf" do pagamento aceita CPF (11) ou CNPJ (14)
  if (doc.length === 11) nota.cpf_destinatario = doc;
  else if (doc.length === 14) nota.cnpj_destinatario = doc;
  return nota;
}

export function focus(cfg) {
  const amb = cfg.ambiente === "producao" ? "producao" : "homologacao";
  const base = amb === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
  const token = amb === "producao" ? cfg.focus?.tokenProducao : cfg.focus?.tokenHomologacao;
  const auth = "Basic " + Buffer.from(`${token || ""}:`).toString("base64");
  const chamar = async (metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, { method: metodo, headers: { Authorization: auth, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(30000) });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { mensagem: txt }; }
    return { http: r.status, ...j };
  };
  return {
    ambiente: amb, base, temToken: !!token,
    enviar: (ref, nota) => chamar("POST", `/v2/nfce?ref=${encodeURIComponent(ref)}`, nota),
    consultar: (ref) => chamar("GET", `/v2/nfce/${encodeURIComponent(ref)}`),
    cancelar: (ref, justificativa) => chamar("DELETE", `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa }),
    inutilizar: (corpo) => chamar("POST", "/v2/nfce/inutilizacoes", corpo),
  };
}
