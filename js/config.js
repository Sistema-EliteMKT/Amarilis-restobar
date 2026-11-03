// =====================================================================
//  CONFIGURAÇÃO DO SISTEMA ELITE
//  Quase tudo (nome da loja, mesas, impressoras, cardápio, garçons,
//  motoboys) é mudado pelo próprio sistema em Caixa > Ajustes.
//  Aqui ficam só a conexão com o banco e a marca.
// =====================================================================

// 1) FIREBASE (banco de dados online, plano gratuito)
//    Enquanto estiver vazio, o sistema roda em MODO DEMONSTRAÇÃO:
//    os dados ficam só neste navegador (abas do mesmo computador se falam).
//    Veja o README.md para o passo a passo de como preencher.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAaGj0o4y41Gu4oaCPEa_uBbDozAwtp4xs",
  authDomain: "amarilis-restobar.firebaseapp.com",
  projectId: "amarilis-restobar",
  appId: "1:422008903328:web:608bdde7b78188334c5bc5",
};

// 2) MARCA DO SISTEMA (aparece em todas as telas e no fim de cada cupom)
export const MARCA = {
  sistema: "Sistema Elite",
  empresa: "Elite MKT",
  logo: "assets/elite-logo-128.png",
  site: "",          // ex.: "elitemkt.com.br" (aparece no rodapé, se preenchido)
  instagram: "@elitefilmsdigital",
};

// Horário de funcionamento do cardápio online, por dia da semana (0 = domingo). Muda em Caixa > Ajustes.
// PROVISÓRIO (igual ao da pizzaria): confirme o horário do restobar e ajuste em Caixa > Ajustes.
export const HORARIOS_PADRAO = {
  0: { ativo: true, de: "18:10", ate: "23:10" }, 1: { ativo: true, de: "18:10", ate: "22:45" }, 2: { ativo: true, de: "18:10", ate: "22:45" },
  3: { ativo: true, de: "18:10", ate: "22:45" }, 4: { ativo: true, de: "18:10", ate: "22:45" }, 5: { ativo: true, de: "18:10", ate: "23:10" },
  6: { ativo: true, de: "18:10", ate: "23:45" },
};

// 3) VALORES INICIAIS DA LOJA (usados só na primeira vez; depois, Caixa > Ajustes)
export const LOJA_INICIAL = {
  nome: "Amarílis Restobar",
  telefone: "(19) 98977-9257",
  endereco: "",
  logo: "assets/logo-cliente.png",
  logoClaro: "assets/logo-cliente-claro.png",
  slogan: "Porções, pratos, drinks e cervejas. Peça pelo app e receba em casa.",
  nMesas: 30,                 // muda em Caixa > Ajustes
  taxaServico: 10,            // % sugerido no fechamento da mesa (pode tirar na hora)
  meiaPorcaoMesa: false,      // meia porção na mesa (o cardápio do restobar não tem meia)
  meiaPorcaoDelivery: false,
  tempoEntregaMin: 40, tempoEntregaMax: 60,      // previsão para o cliente (minutos)
  tempoRetiradaMin: 20, tempoRetiradaMax: 30,
  descontoEquipe: 0,          // % de desconto padrão no consumo dos funcionários
  aceitaOnline: true,         // false: cardápio fechado para pedidos (o horário fica em horarios / modoOnline / excecaoHoje)
  horarios: HORARIOS_PADRAO,
  colunas: 48,                // 48 = bobina 80 mm · 32 = bobina 58 mm
  imprimirCancelamento: false, // true: cancelar item/comanda também imprime o aviso CANCELADO no setor
  cupons: [],                 // [{ codigo, pct, ativo }] cupons de desconto do cardápio online
  espacoItens: 1,             // linhas em branco entre os itens nos papéis da cozinha (0 = sem espaço)
  papelPorSetor: true,        // true: um papel para cada setor · false: um papel por impressora, dividido por setor
  // Uma Epson TM-T20X-II (bobina 80 mm). Se entrar outra impressora (ex.: cozinha), cadastre em Ajustes > Impressoras.
  impressoras: [
    { id: "imp1", nome: "Caixa (Epson TM-T20X-II)", tamanho: "medio", fonte: "arial", colunas: 48 },
  ],
  // 3 setores: Cozinha (porções, pratos, lanches e sobremesas) · Bar (drinks, caipirinhas, doses e sucos)
  // · Bebidas (cervejas, refrigerantes e águas: pegar e levar). Cada setor tem uma impressora para o salão (mesas) e outra para delivery/retirada.
  setores: [
    { id: "cozinha", nome: "Cozinha", impressora: "imp1", impressoraDelivery: "imp1" },
    { id: "bar", nome: "Bar", impressora: "imp1", impressoraDelivery: "imp1" },
    { id: "bebidas", nome: "Bebidas", impressora: "imp1", impressoraDelivery: "imp1" },
  ],
  // Observações rápidas (botões na janela do item), por setor. Editáveis em Ajustes.
  obsRapidas: {
    cozinha: ["Sem cebola", "Sem salada", "Ao ponto", "Bem passado", "Sem pimenta"],
    bar: ["Sem álcool", "Pouco gelo", "Sem gelo", "Pouco açúcar", "Sem açúcar"],
    bebidas: ["Bem gelada", "Copo com gelo", "Copo sem gelo", "Com limão"],
  },
  impressoraContaGarcom: "imp1", // conta pedida pelo garçom
  impressoraConta: "imp1",    // onde sai a conta da mesa, a via de entrega e o fechamento
  formasPagamento: ["Dinheiro", "Pix", "Crédito", "Débito", "Vale-refeição"],
};

// Usuários criados na primeira vez (troque os PINs em Caixa > Ajustes > Equipe).
export const EQUIPE_INICIAL = [
  { id: "admin", nome: "Administrador", papel: "admin", pin: "1234" },
  { id: "caixa", nome: "Caixa", papel: "caixa", pin: "1111" },
  { id: "garcom1", nome: "Garçom 1", papel: "garcom", pin: "2222" },
];
