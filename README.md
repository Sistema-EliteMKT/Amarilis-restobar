# Sistema Elite · Amarílis Restobar

Sistema de pedidos do **Amarílis Restobar** (salão, delivery e retirada), desenvolvido pela **Elite MKT**.
Feito a partir do sistema da Pizzaria Amarílis, com banco de dados próprio (os dados das duas lojas não se misturam).

| Tela | Quem usa | Endereço |
|---|---|---|
| **Cardápio online** | Cliente, no celular | `.../#/cardapio` |
| **App do garçom** | Garçom, no celular ou tablet | `.../` (entra com PIN de garçom) |
| **Painel do caixa** | Caixa, no computador | `.../` (entra com PIN de caixa ou administrador) |
| **Agente de impressão** | Fica rodando no computador do caixa | pasta `agente-impressao/` |

## O que o sistema faz

- **Mesas e comandas.** O garçom cria a comanda como no app antigo: **identificação (número do cartão), atendente, cliente, nº de pessoas e mesa**. Pode ser uma comanda para a mesa inteira, ou uma para cada pessoa (com nome, se quiser). **Uma comanda aberta não abre de novo em outra mesa**: se a 120 já está na mesa 10 e alguém tenta lançar 120 na mesa 11, o sistema avisa e leva para a mesa 10. Funciona mesmo com dois garçons ao mesmo tempo. Dá para juntar comandas na hora de pagar, passar item de uma comanda para outra, trocar ou juntar mesas, e achar a comanda pelo número.
- **Impressão por setor (3 setores).** Cada setor ganha o seu papel: **Cozinha** (porções, pratos, panquecas, beirutes, batatas, pastéis e sobremesas) · **Bar** (drinks, caipirinhas, doses e sucos) · **Bebidas** (cervejas, refrigerantes e águas: pegar e levar).

  Hoje é **uma Epson TM-T20X-II** (bobina 80 mm) no caixa, que imprime tudo: setores, conta da mesa, via do delivery e fechamento. Se entrar outra impressora (ex.: na cozinha), cadastre em Ajustes e escolha, em cada setor, a impressora do salão e a do delivery.

  Item cancelado pode imprimir um aviso **CANCELADO** (liga em Ajustes).
- **Pratos do jantar para 1 ou 2 pessoas.** Cada prato tem um item **(1P)** e outro **(2P)**, cada um com o seu preço.
- **Opções e adicionais.** Opções para escolher já vêm cadastradas (molho rosê ou verde, queijo das fritas especiais, sabor do refrigerante, strogonoff de carne ou frango…). Adicionais de bacon e mussarela na batata recheada (R$ 4,90). Editar em Caixa > Cardápio.
- **Onde cada produto é vendido.** Cada produto pode ser **Mesa e delivery**, **Só mesa** (não aparece no cardápio online nem no pedido de entrega/retirada) ou **Só delivery/retirada** (não aparece para o garçom). Muda direto na lista do Cardápio.
- **Caixa.** Pedidos de telefone, balcão e delivery; pedidos do cardápio online chegam com **aviso sonoro**; conta da mesa com **taxa de serviço** (10%, pode tirar); desconto; pagamento dividido em várias formas; troco; relatório do dia e **fechamento impresso**.
- **Motoboys.** Cadastro, despacho do pedido para o motoboy, entregas do dia, taxas e dinheiro a acertar com cada um.
- **Cardápio editável.** Produtos, preços, opções (ex.: sabor do refrigerante), **esgotado** com um toque, taxas de entrega por bairro. Tudo pelo painel, sem mexer em código.
- **Equipe com PIN.** Garçom só vê as mesas; caixa vê o painel; administrador vê também os Ajustes.
- **Marca Elite.** "Sistema Elite · desenvolvido por Elite MKT" aparece em todas as telas e no fim de cada cupom. A logo da loja aparece em destaque.

> **Nota fiscal (NFC-e): ainda não ligada.** No teste, a loja continua emitindo nota como faz hoje. Veja o fim deste manual.

---

## 1. Testar agora (modo demonstração)

Com `js/config.js` sem as chaves do Firebase, o sistema roda em **modo demonstração**: tudo fica salvo só no navegador. Abas do mesmo computador se falam (garçom numa aba e caixa em outra), mas outro aparelho não vê os pedidos.

PINs iniciais: **Administrador 1234 · Caixa 1111 · Garçom 2222** (troque em Ajustes > Equipe).

## 2. Ligar o banco de dados (Firebase, grátis, cerca de 15 minutos)

É isso que faz celular do garçom, computador do caixa e cardápio do cliente verem os mesmos pedidos.

1. Entre em <https://console.firebase.google.com> com a conta Google da Elite e clique em **Criar projeto** (`amarilis-restobar`; **não use o projeto da pizzaria**). Pode desativar o Google Analytics.
2. **Authentication** → *Começar* → *Método de login* → ative **E-mail/senha**.
3. Ainda em **Authentication** → aba *Usuários* → **Adicionar usuário**: crie a **conta da loja** (ex.: `restobar@elitemkt.com.br` + uma senha forte). Ela é usada uma vez em cada aparelho.
4. **Authentication** → *Configurações* → *Ações do usuário* → **desmarque "Ativar criação (inscrição)"**. Assim ninguém cria conta sozinho.
5. **Firestore Database** → *Criar banco de dados* → modo **produção** → região `southamerica-east1 (São Paulo)`.
6. Na aba **Regras** do Firestore, apague tudo, cole o conteúdo de [`firestore.rules`](firestore.rules) e clique em **Publicar**.
7. ⚙️ **Configurações do projeto** → *Seus apps* → ícone **Web `</>`** → registre o app. Copie `apiKey`, `authDomain`, `projectId` e `appId` para `FIREBASE_CONFIG` em [`js/config.js`](js/config.js).

> Essas chaves podem ficar no código: elas não são senha. Quem protege os dados são as regras do passo 6 e a conta da loja.

No **primeiro acesso** com a conta da loja, o sistema grava sozinho o cardápio inicial (122 produtos do cardápio do restobar), os 3 setores, as impressoras e a equipe.

## 3. Colocar no ar (grátis)

**GitHub Pages** (grátis, o repositório é público):

1. No GitHub: repositório `Amarilis-restobar` → *Settings* → *Pages* → *Build and deployment*: **Deploy from a branch**, branch **`main`**, pasta **`/ (root)`** → *Save*.
2. Em 1 ou 2 minutos o sistema fica em `https://sistema-elitemkt.github.io/amarilis-restobar/`.
3. No Firebase → Authentication → Configurações → **Domínios autorizados**, confira se `sistema-elitemkt.github.io` está na lista.

- Cardápio do cliente: `https://sistema-elitemkt.github.io/amarilis-restobar/#/cardapio` (link e QR Code em Caixa > Ajustes).
- **Domínio próprio depois:** crie o arquivo `CNAME` com o domínio, aponte o DNS para o GitHub Pages e adicione o domínio em *Domínios autorizados* no Firebase.
- **Regras do banco:** sempre que `firestore.rules` mudar, cole o conteúdo de novo no console do Firebase (Firestore → Regras → Publicar).

## 4. Instalar nos aparelhos

- **Garçom (celular/tablet):** abra o endereço → entre com a conta da loja → PIN. No Android, menu ⋮ → **Instalar app**. No iPhone, Compartilhar → **Adicionar à Tela de Início**.
- **Caixa (computador):** abra no Chrome → conta da loja → PIN de caixa. Deixe o som do computador ligado (aviso de pedido online).

## 5. Impressoras

Antes de tudo, descubra como cada impressora térmica está ligada:

- **Na rede (cabo ou Wi-Fi):** imprima a página de configuração da impressora (normalmente segure o botão de avanço ao ligar) e anote o **IP** (ex.: `192.168.0.51`).
- **No USB do computador (Windows):** instale o driver do fabricante (Elgin, Epson, Bematech…). Depois, em *Configurações → Impressoras → [impressora] → Propriedades da impressora → Compartilhamento*, marque **Compartilhar** e dê um nome curto, sem espaço (ex.: `COZINHA`, `BAR`).

### Impressora do restobar

**Epson TM-T20X-II** (modelo M352B), térmica de 80 mm (**48 colunas**), no computador do caixa (`imp1`).

- **Se ela estiver no USB:**
  1. Instale o driver da Epson (procure "TM-T20X-II driver" no site da Epson) e confira se aparece em *Configurações → Impressoras*.
  2. *Propriedades da impressora → Compartilhamento*: marque **Compartilhar** com o nome **`CAIXA`**.
  3. No `config.json` do agente: `"imp1": { "tipo": "windows", "compartilhamento": "CAIXA", "colunas": 48, "comandos": "escpos" }`.
- **Se ela tiver cabo de rede:**
  1. Desligue, segure o botão **Feed** e ligue: sai a página de configuração com o **IP**.
  2. Fixe esse IP no roteador (reserva de DHCP) para ele não mudar.
  3. No `config.json`: `"imp1": { "tipo": "rede", "ip": "IP_DA_EPSON", "porta": 9100, "colunas": 48, "comandos": "escpos" }`.

A Epson já fala ESC/POS: deixe `"comandos": "escpos"`.

4. Imprima o **teste** de cada uma em Caixa > Impressão.
   - **Saiu certo:** pronto.
   - **Não saiu nada:** confira o nome do compartilhamento. Se o driver do fabricante não deixar passar os comandos, troque o driver dessa impressora para **"Generic / Text Only"** (Windows → Propriedades da impressora → Avançado → Driver) e teste de novo.

Se alguma delas for a versão com **cabo de rede**, use `{ "tipo": "rede", "ip": "...", "porta": 9100 }` no lugar do compartilhamento. É até mais simples.

### Opção A: Agente de impressão (recomendado; sai sozinho e em cada impressora)

1. Instale o **Node.js LTS** no computador do caixa (<https://nodejs.org>).
2. Copie a pasta `agente-impressao` para o computador (ex.: `C:\SistemaElite\agente-impressao`).
3. Copie `config.exemplo.json` para **`config.json`** e preencha:
   - `firebase`: as mesmas 4 chaves do `js/config.js`;
   - `email` / `senha`: a conta da loja;
   - `impressoras`: uma entrada para cada impressora do sistema (`imp1`, `imp2`… iguais às de Caixa > Ajustes):
     - rede: `{ "tipo": "rede", "ip": "192.168.0.51", "porta": 9100 }`
     - USB compartilhada no Windows: `{ "tipo": "windows", "compartilhamento": "COZINHA" }`
     - `"colunas": 48` para bobina 80 mm, ou `32` para 58 mm.
     - `"comandos": "escpos"` (padrão) ou `"escbema"` para Bematech no modo da marca.
   - `acentos`: `"sem-acentos"` (funciona em qualquer impressora). Se quiser acento, teste `"cp860"` ou `"cp850"`.
   - `tamanho` (opcional): letra dos itens e títulos. `"grande"` (dupla), `"medio"` (só mais alta) ou `"pequeno"` (normal, em negrito).
   - `fonte` (opcional): `"A"` (normal) ou `"B"` (compacta, ainda menor).
4. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele instala o que precisa. A janela mostra cada cupom impresso.
5. Para abrir sozinho quando o computador ligar: aperte `Win + R`, digite `shell:startup` e coloque ali um **atalho** para o `iniciar.bat`.
6. No painel: **Caixa > Impressão > Imprimir teste** em cada impressora.

Se uma impressora estiver sem papel ou desligada, o cupom fica marcado com **Erro** e o agente tenta de novo a cada 15 segundos. Também dá para **Reimprimir** qualquer cupom do dia na aba Impressão.

### Opção B: Imprimir pelo navegador (mais simples, uma impressora)

Em **Caixa > Impressão**, marque *"Este computador imprime os cupons"* e as impressoras. Para não abrir janela de confirmação a cada cupom, crie um atalho do Chrome com:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://SEU-ENDERECO.web.app
```

Nesse modo os cupons saem na **impressora padrão** do Windows, por isso serve para uma impressora só. Para as duas impressoras separadas por setor, use o agente.

## 6. Ajustes que a loja faz sozinha (Caixa > Ajustes, com PIN de administrador)

- Nome, telefone, endereço, número de mesas, taxa de serviço, formas de pagamento, cardápio online ligado/desligado.
- **Impressoras e setores:** qual setor sai em qual impressora, onde sai a conta, largura da bobina, papel separado por setor.
- **Equipe:** criar garçom, caixa e administrador com PIN; desativar quem saiu.
- Na aba **Cardápio**: produtos, preços, esgotado, categorias (e para qual setor imprimem), bordas, taxas de entrega.

## Trocar a marca/logo

- Logo da **Elite MKT**: `assets/elite-logo.png` (original, fundo transparente) e `assets/elite-logo-128.png` (rodapé, login e ícone da aba). Ícones do app: `assets/icon-*.png`.
- Logo da loja: `assets/logo-cliente.png` (fundo claro) e `assets/logo-cliente-claro.png` (para o fundo vermelho do cardápio).

## Nota fiscal (NFC-e): próximo passo

Para emitir NFC-e pelo sistema, a loja precisa de:

1. **Certificado digital A1** (arquivo .pfx) do CNPJ.
2. **Inscrição estadual** com NFC-e habilitada na SEFAZ-SP e o **CSC** (código de segurança do contribuinte) com o ID.
3. Do contador, para cada produto: **NCM, CFOP, CST/CSOSN** e o **regime tributário** (Simples Nacional, etc.).
4. Contratar um **emissor por API** (ex.: Focus NFe, PlugNotas, Nuvem Fiscal). O sistema manda a venda para ele e ele fala com a SEFAZ.

O CPF na nota já é guardado no recebimento. A emissão entra no fechamento da conta quando esses itens estiverem prontos.

## Estrutura

```
index.html, css/, assets/      telas e marca
js/config.js                   Firebase, marca e valores iniciais da loja
js/cardapio-inicial.js         cardápio inicial do restobar (do PDF)
js/store.js                    banco (Firebase ou demonstração)
js/regras.js                   comandas, pedidos, pagamentos, cupons, fila de impressão
js/telas/                      cardápio, garçom, caixa, gestão, pagamento
agente-impressao/              programa que imprime nas térmicas (ESC/POS)
firestore.rules                regras de segurança do banco
```

---
**Sistema Elite** · desenvolvido por Elite MKT
