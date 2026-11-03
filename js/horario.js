// Horário de funcionamento do cardápio online (delivery e retirada).
// Vale o horário da semana; dá para abrir/fechar só por hoje, mudar a hora só de hoje, ou fechar até avisar.
import { hoje } from "./ui.js";
import { HORARIOS_PADRAO } from "./config.js";

export const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const min = (h) => { const [a, b] = String(h || "0:0").split(":"); return Number(a) * 60 + (Number(b) || 0); };

// Janela (de/até) de um dia da semana, ou null se não abre.
const janela = (tabela, dow) => { const h = tabela?.[dow]; return h && h.ativo !== false && h.de && h.ate ? { de: h.de, ate: h.ate } : null; };

// { aberto, texto, ate?, abre?, motivo? }  motivo: "fixo" (fechado até avisar) | "hoje" (mudado só por hoje)
export function statusOnline(lj, agora = new Date()) {
  const dia = hoje(agora.getTime());
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  if (lj.aceitaOnline === false || lj.modoOnline === "fechado") return { aberto: false, texto: "Fechado no momento", motivo: "fixo" };
  const ex = lj.excecaoHoje?.dia === dia ? lj.excecaoHoje : null;
  if (ex?.modo === "fechado") return { aberto: false, texto: "Fechado por hoje", motivo: "hoje" };
  if (ex?.modo === "aberto") return { aberto: true, texto: "Aberto agora", motivo: "hoje" };
  const tabela = lj.horarios || HORARIOS_PADRAO;
  let jan = janela(tabela, agora.getDay());
  if (ex && (ex.de || ex.ate)) jan = { de: ex.de || jan?.de || "00:00", ate: ex.ate || jan?.ate || "23:59" };
  const motivo = ex ? "hoje" : undefined;
  // Quem fecha depois da meia-noite: a janela de ontem ainda pode estar valendo.
  const ontem = janela(tabela, (agora.getDay() + 6) % 7);
  if (ontem && min(ontem.ate) <= min(ontem.de) && agoraMin < min(ontem.ate)) return { aberto: true, texto: `Aberto até ${ontem.ate}`, ate: ontem.ate };
  if (jan) {
    const a = min(jan.de), b = min(jan.ate);
    if (b <= a ? agoraMin >= a : agoraMin >= a && agoraMin < b) return { aberto: true, texto: `Aberto até ${jan.ate}`, ate: jan.ate, motivo };
    if (agoraMin < a) return { aberto: false, texto: `Fechado · abre hoje às ${jan.de}`, abre: jan.de, motivo };
  }
  for (let i = 1; i <= 7; i++) {
    const j = janela(tabela, (agora.getDay() + i) % 7);
    if (j) return { aberto: false, texto: `Fechado · abre ${i === 1 ? "amanhã" : DIAS_LONGO[(agora.getDay() + i) % 7]} às ${j.de}`, abre: j.de, motivo };
  }
  return { aberto: false, texto: "Fechado no momento", motivo };
}

// Previsão mostrada ao cliente: "40 a 60 min" (tipo: "entrega" ou "retirada").
export function previsao(lj, tipo) {
  const a = Number(lj[tipo === "entrega" ? "tempoEntregaMin" : "tempoRetiradaMin"]), b = Number(lj[tipo === "entrega" ? "tempoEntregaMax" : "tempoRetiradaMax"]);
  if (!(a > 0) && !(b > 0)) return "";
  return a > 0 && b > a ? `${a} a ${b} min` : `${a || b} min`;
}
