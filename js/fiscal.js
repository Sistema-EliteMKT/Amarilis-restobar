// Preparação da nota fiscal (NFC-e). A emissão em si entra depois (certificado A1, CSC e provedor);
// aqui ficam os dados que ela precisa: dados da empresa, tributação dos produtos e formas de pagamento.

// Valores comuns de bar e restaurante no Simples Nacional. O contador confirma e ajusta em Ajustes > Nota fiscal.
export const FISCAL_PADRAO = { ncm: "19059090", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" };

export const REGIMES = [["1", "Simples Nacional"], ["2", "Simples Nacional (excesso de sublimite)"], ["3", "Regime normal"]];

// Código do meio de pagamento na NFC-e (tPag).
const TPAG = [[/dinheiro/i, "01"], [/cheque/i, "02"], [/cr[eé]dito/i, "03"], [/d[eé]bito/i, "04"], [/pix/i, "17"], [/alimenta/i, "10"], [/refei/i, "11"], [/vale/i, "12"]];
export const tPagDe = (forma) => (TPAG.find(([re]) => re.test(forma || "")) || [0, "99"])[1];

// Tributação de um item: produto > categoria > padrão da loja > padrão geral.
// cfg = documento config/fiscal (só a equipe lê: tem CSC e dados da empresa).
export function fiscalDoItem(cfg, prod, cat) {
  const lim = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== "" && v != null));
  return { ...FISCAL_PADRAO, ...lim(cfg?.padrao), ...lim(cat?.fiscal), ...lim(prod?.fiscal) };
}

// O que ainda falta para poder emitir (mostrado em Ajustes).
export function faltaParaEmitir(f = {}) {
  const dig = (v) => String(v || "").replace(/\D/g, "");
  const falta = [];
  if (dig(f.cnpj).length !== 14) falta.push("CNPJ");
  if (!f.razaoSocial) falta.push("Razão social");
  if (!f.ie) falta.push("Inscrição estadual");
  if (!f.cidade || !f.uf || dig(f.cep).length !== 8 || !f.logradouro) falta.push("Endereço da empresa");
  if (!f.cscId || !f.csc) falta.push("CSC da SEFAZ");
  if (!f.certificadoOk) falta.push("Certificado digital A1");
  return falta;
}
