// Converte o cupom em comandos ESC/POS e envia para a impressora.
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { execFile } from "node:child_process";

// ------------------------------------------------------------------ ESC/POS
const ESC = 0x1b, GS = 0x1d;
const CP860 = { á: 0xa0, à: 0x85, â: 0x83, ã: 0x84, é: 0x82, ê: 0x88, í: 0xa1, ó: 0xa2, ô: 0x93, õ: 0x94, ú: 0xa3, ü: 0x81, ç: 0x87,
  Á: 0x86, À: 0x91, Â: 0x8f, Ã: 0x8e, É: 0x90, Ê: 0x89, Í: 0x8b, Ó: 0x9f, Ô: 0x8c, Õ: 0x99, Ú: 0x96, Ü: 0x9a, Ç: 0x80, º: 0xa7, ª: 0xa6 };
const CP850 = { á: 0xa0, à: 0x85, â: 0x83, ã: 0xc6, é: 0x82, ê: 0x88, í: 0xa1, ó: 0xa2, ô: 0x93, õ: 0xe4, ú: 0xa3, ü: 0x81, ç: 0x87,
  Á: 0xb5, À: 0xb7, Â: 0xb6, Ã: 0xc7, É: 0x90, Ê: 0xd2, Í: 0xd6, Ó: 0xe0, Ô: 0xe2, Õ: 0xe5, Ú: 0xe9, Ü: 0x9a, Ç: 0x80, º: 0xa7, ª: 0xa6 };
const PAGINAS = { cp860: { tabela: CP860, n: 3 }, cp850: { tabela: CP850, n: 2 } };

function texto(s, pagina) {
  const out = [];
  const tab = PAGINAS[pagina]?.tabela;
  for (const ch of String(s).replace(/[·•]/g, "-").replace(/[–—]/g, "-").replace(/[✓]/g, "OK")) {
    const c = ch.charCodeAt(0);
    if (c < 128) out.push(c);
    else if (tab && tab[ch] != null) out.push(tab[ch]);
    else {
      const simples = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out.push(...[...simples].map((x) => (x.charCodeAt(0) < 128 ? x.charCodeAt(0) : 0x3f)));
    }
  }
  return out;
}

// imp.comandos: "escpos" (padrão: Control iD Print iD, Epson, Elgin e Bematech no modo ESC/POS)
//               "escbema" (Bematech configurada no modo próprio da marca, ESC/Bema)
// imp.tamanho:  tamanho das linhas em destaque (itens e títulos)
//               "grande"  = letra dupla (larga e alta) · "medio" = só mais alta · "pequeno" = normal, em negrito
// imp.fonte:    "A" (normal, padrão) ou "B" (compacta, menor ainda) · só ESC/POS
// imp.corte:    "total" (padrão: separa o papel) · "parcial" (deixa uma pontinha) · "compat" (comando antigo ESC i) · "nenhum"
// imp.avanco:   linhas em branco antes do corte (padrão 4)
// Quebra o texto em linhas de até "max" letras, sem cortar palavra no meio.
// As linhas de continuação ganham recuo para ficar claro que é o mesmo item.
function quebrar(t, max) {
  t = String(t);
  if (max < 8 || t.length <= max) return [t];
  const recuo = /^\s*\d+x /.test(t) ? "   " : t.match(/^\s*/)[0];
  const out = [];
  let linha = "";
  for (const palavra of t.split(/(\s+)/)) {
    if (!palavra) continue;
    if ((linha + palavra).length > max && linha.trim()) {
      out.push(linha.replace(/\s+$/, ""));
      linha = recuo + palavra.replace(/^\s+/, "");
      while (linha.length > max) { out.push(linha.slice(0, max)); linha = recuo + linha.slice(max); }
    } else linha += palavra;
  }
  if (linha.trim()) out.push(linha);
  return out;
}

// Texto à esquerda e valor à direita (ex.: "1x Pizza ....... 74,00") na largura da impressora.
function ladoALado(esq, dir, max) {
  esq = String(esq); dir = String(dir);
  const linhas = quebrar(esq, Math.max(8, max - dir.length - 1));
  const ult = linhas.pop();
  linhas.push(ult + " ".repeat(Math.max(1, max - ult.length - dir.length)) + dir);
  return linhas;
}

// estilo (tamanho/fonte) escolhido no sistema, em Impressoras, vale mais que o config.json
export function escpos(linhas, imp, acentosPadrao = "sem-acentos") {
  const pagina = imp.acentos || acentosPadrao;
  const largura = imp.colunas || 48;
  const fonteB = imp.fonte === "B";
  const colunas = fonteB ? Math.round(largura * 4 / 3) : largura; // fonte compacta cabe ~1/3 a mais
  const bema = imp.comandos === "escbema";
  const negrito = (on) => (bema ? [ESC, on ? 0x45 : 0x46] : [ESC, 0x45, on ? 1 : 0]);
  const tam = imp.tamanho || "medio";
  const grande = (on) => {
    const larga = on && tam === "grande", alta = on && tam !== "pequeno";
    return bema ? [ESC, 0x57, larga ? 1 : 0, ESC, 0x64, alta ? 1 : 0] : [GS, 0x21, (larga ? 0x10 : 0) | (alta ? 0x01 : 0)];
  };
  const b = [ESC, 0x40]; // inicia
  if (!bema && fonteB) b.push(ESC, 0x4d, 1); // fonte compacta
  if (PAGINAS[pagina] && !bema) b.push(ESC, 0x74, PAGINAS[pagina].n);
  const esp = { medio: 44, grande: 60 }[imp.entrelinhas]; // ESC 3 n: altura da linha em pontos (o normal é 30)
  if (esp) b.push(ESC, 0x33, esp);
  for (const l of linhas) {
    if (l.sep) { b.push(...texto("-".repeat(colunas), pagina), 0x0a); continue; }
    b.push(ESC, 0x61, l.c ? 1 : 0); // alinhamento
    b.push(...negrito(l.b), ...grande(l.g));
    const max = l.g && tam === "grande" ? Math.floor(colunas / 2) : colunas; // letra larga ocupa o dobro
    for (const parte of l.d != null ? ladoALado(l.e ?? l.t, l.d, max) : quebrar(l.t, max)) b.push(...texto(parte, pagina), 0x0a);
  }
  b.push(ESC, 0x61, 0, ...negrito(false), ...grande(false));
  b.push(...fimDeCupom(imp));
  return Buffer.from(b);
}

// Avança o papel e corta (igual para texto e imagem).
function fimDeCupom(imp) {
  const bema = imp.comandos === "escbema";
  const b = [...Array(Number(imp.avanco ?? 4)).fill(0x0a)];
  const corte = imp.corte === false ? "nenhum" : imp.corte || "total";
  if (corte !== "nenhum") {
    if (bema) b.push(ESC, corte === "parcial" ? 0x6d : 0x77);          // ESC m parcial · ESC w total
    else if (corte === "compat") b.push(ESC, 0x69);                     // ESC i (impressoras antigas)
    else b.push(GS, 0x56, corte === "parcial" ? 0x42 : 0x41, 0x03);     // GS V: avança e corta
  }
  if (imp.bip && !bema) b.push(ESC, 0x42, 2, 2);
  return b;
}

// Fonte "arial": desenha o cupom como imagem (igual ao sistema antigo). Só no modo ESC/POS.
async function cupomEmImagem(linhas, imp, acentosPadrao) {
  let cupomImagem;
  try { ({ cupomImagem } = await import("./imagem.js")); }
  catch (e) {
    // Faltou instalar a parte de desenho: imprime em texto para não parar a cozinha.
    console.log("Aviso: fonte Arial indisponível (rode o iniciar.bat de novo com internet). Imprimindo em texto.", e.message);
    return escpos(linhas, { ...imp, fonte: "A" }, acentosPadrao);
  }
  const larguraPx = imp.larguraPx || ((Number(imp.colunas) || 48) <= 32 ? 384 : 576);
  const { bytes } = cupomImagem(linhas, { ...imp, larguraPx });
  return Buffer.from([ESC, 0x40, ESC, 0x61, 0, ...bytes, ...fimDeCupom(imp)]);
}

// ------------------------------------------------------------------ envio
function enviarRede(imp, dados) {
  return new Promise((ok, falha) => {
    const s = connect({ host: imp.ip, port: imp.porta || 9100 }, () => s.end(dados));
    s.setTimeout(8000, () => { s.destroy(); falha(new Error(`sem resposta de ${imp.ip}`)); });
    s.on("close", (erro) => !erro && ok());
    s.on("error", falha);
  });
}

function enviarWindows(imp, dados) {
  // Impressora compartilhada no Windows (ex.: nome de compartilhamento "COZINHA").
  const arq = join(tmpdir(), `cupom-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  writeFileSync(arq, dados);
  const destino = imp.compartilhamento.startsWith("\\\\") ? imp.compartilhamento : `\\\\localhost\\${imp.compartilhamento}`;
  return new Promise((ok, falha) => {
    execFile("cmd", ["/c", "copy", "/b", arq, destino], { windowsHide: true }, (erro, saida, err) => {
      try { unlinkSync(arq); } catch {}
      erro ? falha(new Error((err || saida || erro.message).trim())) : ok();
    });
  });
}

function enviarArquivo(imp, dados) {
  writeFileSync(imp.caminho, dados); // ex.: /dev/usb/lp0 no Linux
}

export async function imprimir(job, imp, acentosPadrao) {
  if (!imp) throw new Error(`impressora "${job.impressora}" não está no config.json`);
  const dados = imp.fonte === "arial" && imp.comandos !== "escbema" ? await cupomEmImagem(job.linhas, imp, acentosPadrao) : escpos(job.linhas, imp, acentosPadrao);
  if (imp.tipo === "rede") return enviarRede(imp, dados);
  if (imp.tipo === "windows") return enviarWindows(imp, dados);
  if (imp.tipo === "arquivo") return enviarArquivo(imp, dados);
  if (imp.tipo === "teste") {
    console.log("\n" + job.linhas.map((l) => (l.sep ? "-".repeat(imp.colunas || 48) : l.t)).join("\n") + "\n");
    return;
  }
  throw new Error(`tipo "${imp.tipo}" desconhecido (use rede, windows, arquivo ou teste)`);
}
