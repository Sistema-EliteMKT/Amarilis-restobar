// Coloca o token do Focus NFe no config.json sem precisar editar o arquivo a mao.
// Uso: dois cliques em colocar-token-focus.bat (na mesma pasta do iniciar.bat), colar o token e Enter.
// Guarda uma copia do config.json antes de mudar. Nao mexe na senha nem nas impressoras.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const pasta = dirname(fileURLToPath(import.meta.url));
const arq = join(pasta, "config.json");
const sair = (msg) => { console.log("\n" + msg + "\n"); process.exit(1); };

if (!existsSync(arq)) sair(`Nao achei o config.json nesta pasta:\n  ${pasta}\nRode este arquivo na MESMA pasta do iniciar.bat.`);

// Le o config.json. Se a edicao a mao deixou o arquivo com erro (virgula, aspas),
// tenta consertar tirando as linhas "focus"/"nfce" coladas e virgulas sobrando.
let texto = readFileSync(arq, "utf8").replace(/^﻿/, "");
let cfg;
try { cfg = JSON.parse(texto); } catch (e1) {
  const limpo = texto.split(/\r?\n/).filter((l) => !/^\s*"(focus|nfce)"\s*:/.test(l)).join("\n").replace(/,(\s*[}\]])/g, "$1");
  try { cfg = JSON.parse(limpo); console.log("O config.json estava com erro de digitacao. Consertei (as linhas do focus/nfce serao colocadas de novo)."); }
  catch { sair(`O config.json esta com erro e nao consegui consertar sozinho:\n  ${e1.message}\nMande uma foto do config.json (tampe a senha) para a Elite MKT.`); }
}
if (!cfg.firebase || !cfg.impressoras) sair("Esse config.json nao parece ser o do agente (falta firebase ou impressoras).");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("\nToken do Focus NFe: Minhas Empresas > empresa do RESTOBAR (CNPJ 0002-06) > aba TOKENS > Homologacao.");
const bruto = await rl.question("Cole aqui o token de HOMOLOGACAO e aperte Enter: ");
rl.close();
const token = String(bruto || "").trim().replace(/^["']|["']$/g, "").trim();
if (!token) sair("Nenhum token colado. Nada foi mudado.");
if (/\s/.test(token) || token.length < 10) sair("Isso nao parece um token (tem espaco ou e curto demais). Nada foi mudado.");

const copia = join(pasta, `config.copia-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
copyFileSync(arq, copia);
cfg.focus = { ...(cfg.focus || {}), tokenHomologacao: token, tokenProducao: cfg.focus?.tokenProducao || "" };
const imps = Object.keys(cfg.impressoras);
cfg.nfce = { ...(cfg.nfce || {}), impressora: cfg.impressoras[cfg.nfce?.impressora] ? cfg.nfce.impressora : imps[0] };
writeFileSync(arq, JSON.stringify(cfg, null, 2) + "\n", "utf8");

console.log(`\nPronto! Token de homologacao colocado (termina em ...${token.slice(-4)}).`);
console.log(`A nota vai sair na impressora "${cfg.nfce.impressora}". Copia do arquivo antigo: ${copia}`);
console.log("\nAgora FECHE a janela preta do agente e abra o iniciar.bat de novo.");
console.log('Depois, no sistema, em Ajustes > Nota fiscal > Notas de hoje, clique em "Tentar de novo".\n');
