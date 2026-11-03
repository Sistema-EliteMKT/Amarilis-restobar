// Impressão pelo navegador (alternativa ao agente de impressão).
// Transforma as linhas do cupom em uma página de bobina e chama a impressão.
// Com o Chrome aberto em modo quiosque (--kiosk-printing) sai direto, sem janela.
import { esc } from "./ui.js";

export function htmlCupom(linhas, colunas = 48) {
  const mm = colunas <= 32 ? 58 : 80;
  const corpo = linhas.map((l) => {
    if (l.sep) return `<div class="sep"></div>`;
    const cls = [l.b && "b", l.g && "g", l.c && "c"].filter(Boolean).join(" ");
    if (l.d != null) return `<div class="${cls} lr"><span>${esc(l.e ?? l.t)}</span><span>${esc(l.d)}</span></div>`;
    return `<div class="${cls}">${esc(l.t) || "&nbsp;"}</div>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${mm}mm auto;margin:0}
    body{margin:0;padding:3mm 3mm 8mm;width:${mm - 6}mm;font:600 13px/1.35 Arial,"Liberation Sans",Helvetica,sans-serif;color:#000;white-space:pre-wrap;word-break:break-word}
    .b{font-weight:700}.g{font-size:17px}.lr{display:flex;justify-content:space-between;gap:8px;white-space:normal}.c{text-align:center}.sep{border-top:1px dashed #000;margin:4px 0}
  </style></head><body>${corpo}</body></html>`;
}

let fila = Promise.resolve();
export function imprimirNoNavegador(linhas, colunas) {
  // Uma impressão por vez: o navegador não lida bem com várias janelas ao mesmo tempo.
  fila = fila.then(() => new Promise((res) => {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.srcdoc = htmlCupom(linhas, colunas);
    f.onload = () => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.error(e); }
        setTimeout(() => { f.remove(); res(); }, 800);
      }, 150);
    };
  }));
  return fila;
}
