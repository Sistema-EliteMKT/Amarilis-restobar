// Entrada do sistema: escolhe a tela pelo endereço e cuida do login (conta da loja + PIN da pessoa).
import { store } from "./store.js";
import { MARCA } from "./config.js";
import { $, $$, esc, toast, erro, rodapeMarca, fecharSheet, fecharTudo } from "./ui.js";
import { D, conectar, modoLeve, aoMudar, loja, semearSePreciso } from "./regras.js";
import { iniciarEstacao } from "./estacao.js";
import { temInternet, aoMudarRede, vigiarRede } from "./rede.js";
import { telaCardapio } from "./telas/cardapio.js";
import { telaGarcom } from "./telas/garcom.js";
import { telaCaixa } from "./telas/caixa.js";

const app = $("#app");
const K = "se_pessoa";
let desmontar = () => {};
let contaLoja = null;
let pararPin = null;

const pessoaSalva = () => { try { return localStorage.getItem(K); } catch { return null; } };
const salvarPessoa = (id) => { try { id ? localStorage.setItem(K, id) : localStorage.removeItem(K); } catch {} };
const montar = (fn) => { desmontar(); pararPin?.(); pararPin = null; fecharTudo(); app.innerHTML = ""; desmontar = fn() || (() => {}); };

function rota() {
  const h = location.hash.replace(/^#\/?/, "");
  if (h.startsWith("cardapio")) return iniciarCardapio();
  marcaDoApp(false);
  iniciarEquipe(h);
}

// ------------------------------------------------------------- Cliente
// Quem instala pelo cardápio leva o app do cardápio (nome e ícone do restaurante), não o "Sistema Elite" da equipe.
function marcaDoApp(cliente) {
  const set = (sel, attr, v) => document.querySelector(sel)?.setAttribute(attr, v);
  set('link[rel="manifest"]', "href", cliente ? "manifest-cardapio.webmanifest" : "manifest.webmanifest");
  set('link[rel="apple-touch-icon"]', "href", cliente ? "assets/amarilis-apple-touch.png" : "assets/apple-touch-icon.png");
  set('link[rel="icon"]', "href", cliente ? "assets/amarilis-192.png" : "assets/elite-logo-128.png");
  set('meta[name="theme-color"]', "content", cliente ? "#C61042" : "#111111");
  set('meta[name="apple-mobile-web-app-title"]', "content", cliente ? "Amarílis" : "Sistema Elite");
}

function iniciarCardapio() {
  marcaDoApp(true);
  document.body.className = "cliente";
  document.title = `${loja().nome} · Cardápio`;
  conectar({ publico: true });
  montar(() => telaCardapio(app));
}

// --------------------------------------------------------------- Equipe
function iniciarEquipe(h) {
  document.body.className = "equipe";
  document.title = `${MARCA.sistema}`;
  if (!contaLoja) return telaLoginLoja();
  const id = pessoaSalva();
  const pessoa = id && D.usuarios.find((u) => u.id === id && u.ativo !== false);
  if (!pessoa) return telaPin();
  const sair = () => { salvarPessoa(null); rota(); };
  modoLeve(pessoa.papel === "garcom");
  if (pessoa.papel === "garcom" || h.startsWith("garcom")) {
    document.body.className = "equipe garcom";
    const voltar = pessoa.papel !== "garcom" ? () => { location.hash = "#/"; } : sair;
    return montar(() => telaGarcom(app, pessoa, voltar));
  }
  document.body.className = "equipe caixa";
  montar(() => telaCaixa(app, pessoa, { sair, modoGarcom: () => { location.hash = "#/garcom"; } }));
}

function telaLoginLoja() {
  montar(() => {
    app.innerHTML = `<div class="login"><div class="login-in">
      <img class="login-marca" src="${esc(MARCA.logo)}" alt="" width="64" height="64">
      <h1>${esc(MARCA.sistema)}</h1><p class="muted">Entre com a conta da loja. Isso é feito uma vez em cada aparelho.</p>
      <label class="f" for="le">E-mail da loja</label><input class="in" id="le" type="email" autocomplete="username">
      <label class="f" for="ls">Senha</label><input class="in" id="ls" type="password" autocomplete="current-password">
      <div class="err" id="lerr"></div>
      <button class="btn pri cheio" id="lok">Entrar</button>
      <a class="link-cli" href="#/cardapio">Ver cardápio do cliente</a>
      ${rodapeMarca()}</div></div>`;
    const ir = async () => {
      $("#lerr").textContent = "";
      if (!$("#le").value.trim()) { $("#lerr").textContent = "Digite o e-mail da loja."; return $("#le").focus(); }
      if (!$("#ls").value) { $("#lerr").textContent = "Digite a senha da loja."; return $("#ls").focus(); }
      $("#lok").disabled = true;
      try { await store.entrarLoja($("#le").value, $("#ls").value); } catch (e) { $("#lerr").textContent = e.message; $("#lok").disabled = false; }
    };
    $("#lok").onclick = ir;
    // Atenção: handler on* que devolve false cancela a tecla; por isso usamos if.
    $("#ls").onkeydown = (e) => { if (e.key === "Enter") ir(); };
    $("#le").onkeydown = (e) => { if (e.key === "Enter") $("#ls").focus(); };
  });
}

function telaPin() {
  montar(() => {
    let pin = "";
    const des = () => {
      const salvo = pessoaSalva();
      if (salvo && D.usuarios.some((u) => u.id === salvo && u.ativo !== false)) return queueMicrotask(rota);
      const lj = loja();
      app.innerHTML = `<div class="login"><div class="login-in">
        ${lj.logo ? `<img class="login-loja" src="${esc(lj.logo)}" alt="${esc(lj.nome)}">` : `<h1>${esc(lj.nome)}</h1>`}
        <p class="muted">Digite seu PIN</p>
        <div class="pin-pontos">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < pin.length ? "on" : ""} ${i > 3 ? "opc" : ""}"></i>`).join("")}</div>
        <div class="teclado">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) => k === "" ? "<span></span>" : `<button data-k="${k}">${k}</button>`).join("")}</div>
        <button class="btn pri cheio" id="pok" ${pin.length >= 4 ? "" : "disabled"}>Entrar</button>
        ${store.modo === "demo" ? `<p class="demo-aviso">Modo demonstração · PINs: Administrador 1234 · Caixa 1111 · Garçom 2222</p>` : ""}
        <a class="link-cli" href="#/cardapio">Ver cardápio do cliente</a>
        ${rodapeMarca()}</div></div>`;
      $$("[data-k]").forEach((b) => (b.onclick = () => tecla(b.dataset.k)));
      $("#pok").onclick = entrar;
    };
    const tecla = (k) => {
      if (k === "⌫") pin = pin.slice(0, -1);
      else if (pin.length < 6) pin += k;
      des();
      if (pin.length >= 4 && D.usuarios.some((u) => u.pin === pin && u.ativo !== false && u.pin.length === pin.length)) entrar();
    };
    const entrar = () => {
      const u = D.usuarios.find((x) => x.pin === pin && x.ativo !== false);
      if (!u) { toast("PIN não encontrado", "ruim"); pin = ""; return des(); }
      salvarPessoa(u.id);
      toast(`Olá, ${u.nome}!`);
      rota();
    };
    const teclado = (e) => {
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("⌫");
      else if (e.key === "Enter" && pin.length >= 4) entrar();
    };
    document.addEventListener("keydown", teclado);
    des();
    // A equipe pode chegar do banco depois da tela abrir.
    pararPin = aoMudar(des);
    return () => document.removeEventListener("keydown", teclado);
  });
}

// ---------------------------------------------------------------- Início
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharSheet(); });
$("#scrim").onclick = fecharSheet;

(async () => {
  try {
    await store.iniciar();
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login-in"><h1>Sem conexão</h1><p>Não deu para carregar o sistema. Confira a internet e recarregue a página.</p></div></div>`;
    return console.error(e);
  }
  let primeiroLogin = true;
  store.aoMudarLoja(async (u) => {
    contaLoja = u;
    if (u && !location.hash.startsWith("#/cardapio")) {
      try { if (await semearSePreciso()) toast("Sistema preparado com o cardápio inicial ✓"); } catch (e) { erro(e); }
      conectar();
      iniciarEstacao();
    }
    if (primeiroLogin || !location.hash.startsWith("#/cardapio")) rota();
    primeiroLogin = false;
  });
  window.addEventListener("hashchange", () => {
    // Saindo do cardápio para a área da equipe, liga as listas completas.
    if (!location.hash.startsWith("#/cardapio") && contaLoja) conectar();
    rota();
  });
  // Pessoa desativada ou PIN trocado em outro aparelho: volta para o PIN.
  aoMudar(() => {
    if (!contaLoja || location.hash.startsWith("#/cardapio") || pararPin || !D.usuarios.length) return;
    const id = pessoaSalva();
    if (id && !D.usuarios.some((u) => u.id === id && u.ativo !== false)) { salvarPessoa(null); rota(); }
  });
  // Aviso de internet: sem rede, tudo fica guardado no aparelho e sobe quando voltar.
  const faixa = document.createElement("div");
  faixa.className = "sem-rede";
  faixa.setAttribute("role", "status");
  faixa.textContent = "Sem internet. Pode continuar lançando: os pedidos ficam guardados neste aparelho e vão para o caixa (e para as impressoras) quando a internet voltar.";
  document.body.appendChild(faixa);
  const rede = () => faixa.classList.toggle("on", !temInternet());
  aoMudarRede((on) => { rede(); if (on) toast("Internet de volta. Enviando o que ficou guardado…", "bom"); });
  vigiarRede();
  rede();
  window.addEventListener("se-erro-gravacao", (e) => { if (!e.detail?.offline) erro(e.detail); });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
