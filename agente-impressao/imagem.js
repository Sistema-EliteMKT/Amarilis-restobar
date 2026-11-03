// Impressão em imagem: desenha o cupom com fonte Arial (igual ao sistema antigo da loja)
// e manda para a impressora como figura (comando ESC/POS GS v 0). Usado quando a fonte é "arial".
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pasta = dirname(fileURLToPath(import.meta.url));
const FAMILIA = "CupomSans";
// No Windows usa a Arial do sistema; se não achar, a Liberation Sans (mesmas medidas da Arial) da pasta fontes.
const pares = [
  ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\arialbd.ttf"],
  [join(pasta, "fontes", "LiberationSans-Regular.ttf"), join(pasta, "fontes", "LiberationSans-Bold.ttf")],
];
const par = pares.find(([r, b]) => existsSync(r) && existsSync(b));
if (par) { GlobalFonts.registerFromPath(par[0], FAMILIA); GlobalFonts.registerFromPath(par[1], FAMILIA); }

// Tamanho da letra em pontos da impressora (203 dpi): texto normal e linha em destaque.
// Espaço entre as linhas (para riscar com caneta).
const MULT = { normal: 1, medio: 1.4, grande: 1.8 };
const TAMANHOS = { pequeno: [22, 28], medio: [26, 34], grande: [30, 42] };

export function cupomImagem(linhas, imp) {
  const W = Math.floor((Number(imp.larguraPx) || 576) / 8) * 8;
  const M = 6;
  const [normal, destaque] = TAMANHOS[imp.tamanho] || TAMANHOS.medio;
  const medidor = createCanvas(W, 10).getContext("2d");
  const fonte = (l) => `${l.b || l.g ? "bold " : ""}${l.g ? destaque : normal}px ${FAMILIA}`;
  const larg = (txt) => medidor.measureText(txt).width;

  // Quebra por palavra na largura disponível.
  const quebrar = (txt, max) => {
    const out = [];
    let linha = "";
    const recuo = /^\s*\d+x /.test(txt) ? "    " : (txt.match(/^\s*/)[0] || "");
    for (const palavra of String(txt).split(/(\s+)/)) {
      if (!palavra) continue;
      const tentativa = linha + palavra;
      if (larg(tentativa) > max && linha.trim()) { out.push(linha.replace(/\s+$/, "")); linha = recuo + palavra.replace(/^\s+/, ""); }
      else linha = tentativa;
    }
    if (linha.trim() || !out.length) out.push(linha);
    return out;
  };

  // 1ª passada: monta a lista do que desenhar e calcula a altura.
  const ops = [];
  let y = 4;
  for (const l of linhas) {
    if (l.sep) { ops.push({ sep: true, y: y + 6 }); y += 14; continue; }
    medidor.font = fonte(l);
    const alt = Math.round((l.g ? destaque : normal) * 1.25 * (MULT[imp.entrelinhas] || 1));
    if (l.d != null) {
      const dw = larg(String(l.d));
      const partes = quebrar(String(l.e ?? l.t), W - 2 * M - dw - 12);
      partes.forEach((t, i) => { ops.push({ l, t, y, dir: i === partes.length - 1 ? String(l.d) : null }); y += alt; });
    } else {
      for (const t of quebrar(String(l.t ?? ""), W - 2 * M)) { ops.push({ l, t, y }); y += alt; }
    }
  }
  const H = y + 8;

  // 2ª passada: desenha.
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000"; ctx.textBaseline = "top";
  for (const o of ops) {
    if (o.sep) { for (let x = M; x < W - M; x += 10) ctx.fillRect(x, o.y, 6, 2); continue; }
    ctx.font = fonte(o.l);
    // Contorno fino por cima: no papel térmico a Arial fina some; assim a letra sai mais cheia.
    ctx.strokeStyle = "#000"; ctx.lineWidth = o.l.b || o.l.g ? 1 : 0.8;
    const escrever = (t, x) => { ctx.fillText(t, x, o.y); ctx.strokeText(t, x, o.y); };
    if (o.l.c) { ctx.textAlign = "center"; escrever(o.t, W / 2); ctx.textAlign = "left"; }
    else escrever(o.t, M);
    if (o.dir) { ctx.textAlign = "right"; escrever(o.dir, W - M); ctx.textAlign = "left"; }
  }

  // Preto e branco + comando de imagem GS v 0, em faixas para não lotar a memória da impressora.
  const px = ctx.getImageData(0, 0, W, H).data;
  const bytesLinha = W / 8;
  const out = [];
  const FAIXA = 128;
  for (let y0 = 0; y0 < H; y0 += FAIXA) {
    const h = Math.min(FAIXA, H - y0);
    out.push(0x1d, 0x76, 0x30, 0x00, bytesLinha & 0xff, bytesLinha >> 8, h & 0xff, h >> 8);
    for (let yy = y0; yy < y0 + h; yy++) {
      for (let bx = 0; bx < bytesLinha; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const i = (yy * W + bx * 8 + bit) * 4;
          const lum = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
          if (lum < 185) byte |= 0x80 >> bit;
        }
        out.push(byte);
      }
    }
  }
  return { bytes: out, png: () => cv.toBuffer("image/png") };
}
