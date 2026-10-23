# MVGB Agro — Aurus Prime V2

**Banco Firebase (Firestore) reestruturado · visual claro (verde-campo)**

Versão remasterizada do sistema MVGB Agro / Aurus Prime: gado (lotes, animais, ração, custos e fiscal),
abate e desossa, estoque por lote e validade, vendas e intercompany, separação e expedição, clientes e
ranking, tabelas de preço, financeiro (contas a receber e a pagar, fluxo de caixa, comissões), equinos,
portal do cliente, vendedores externos, relatórios, treinamento e migração dos dados do sistema atual.

Roda num **projeto Firebase próprio**, separado do sistema atual, no banco `aurus-prime-v2`. O projeto do
sistema atual (`gen-lang-client-0404417776`) não é alterado: ele só é **lido** na migração.

---

## Como subir sem afetar o sistema atual

- A V2 entra no AI Studio como um **app novo**, ligada a outro projeto Firebase. O app atual continua no ar, igual,
  até o dia da troca.
- No projeto do sistema atual só se **adiciona** o endereço da V2 em *Domínios autorizados* (para a migração ler os
  dados). Nada é gravado nem alterado lá.
- Não altere o app atual no AI Studio durante a preparação (abrir e usar normalmente pode).

## 1. Preparar o Firebase (uma vez)

Siga **[FIREBASE-BANCO.md](./FIREBASE-BANCO.md)**. Em resumo, no projeto da V2:

1. Plano Blaze (exigido pelo Storage; dentro da cota gratuita custa zero).
2. Firestore → criar o banco **`aurus-prime-v2`** e publicar `firestore.rules` nele.
3. Storage → publicar `storage.rules`.
4. Authentication: Google e E-mail/senha ligados; endereço da V2 em **Domínios autorizados** (nos dois projetos).

O arquivo `firebase-applet-config.json` tem a configuração do projeto da V2 e, no bloco `legacy`, a do sistema
atual (fonte da migração).

## 2. Colocar no Google AI Studio

1. Crie um repositório no GitHub (pode ser privado) e envie **o conteúdo desta pasta** para ele.
2. No [Google AI Studio](https://aistudio.google.com) → **Build** → no campo de mensagem, clique em **+** →
   **Import from GitHub** → escolha o repositório.
3. O arquivo `firebase-applet-config.json` já aponta para o projeto da V2 e para o banco `aurus-prime-v2`. Não peça
   ao assistente do AI Studio para "configurar o Firebase": isso pode criar outro projeto ou banco.
4. Se o AI Studio não listar o repositório privado, deixe-o público só durante a importação e volte para privado.
5. Para a equipe usar: **Deploy** (Cloud Run) e adicione o endereço gerado em *Authorized domains*.

> Para rodar no seu computador: `npm install` e depois `npm run dev` (abre em http://localhost:3000).

## 3. Primeiro acesso e usuários

A equipe entra com **Entrar com Google**, usando a conta do e-mail da empresa. Quem não usa conta Google
(vendedor externo, por exemplo) entra com e-mail e senha: no primeiro acesso, clica em **Primeiro acesso? Criar
senha** e confirma o e-mail pelo link que o sistema envia.

- O **primeiro usuário** que entrar vira **Administrador**.
- E-mails dos domínios corporativos (`mvgbalimentacao.com`, `grtbalimentacao.com`, `girassolalimentacao.com`,
  `aurusprime.com`) entram como **Operador**. Ajuste o papel em **Configurações → Usuários e acessos**.
- Outros e-mails só entram com **convite**, em **Configurações → Usuários e acessos** ou
  **Comercial → Vendedores externos**.
- **Clientes novos**: o vendedor faz o **pré-cadastro** (Clientes → Pré-cadastrar cliente, com limite e condição
  sugeridos) e o **financeiro libera** (com limite, condição e forma de pagamento) ou **bloqueia** com motivo, em
  Clientes → Pré-cadastros. Vendedor não cadastra cliente direto.
- Quem entrava pelo Google continua pelo Google. Quem usava senha cria uma nova no primeiro acesso ("Primeiro
  acesso? Criar senha"): senhas não passam de um projeto Firebase para outro.
- Clientes do portal se cadastram em `…/#/portal` e aguardam aprovação em **Comercial → Portal do cliente**. Ou a
  equipe **convida** (Portal do cliente → Contas → Convidar cliente): no primeiro acesso com aquele e-mail a conta já
  entra liberada. Os preços do portal seguem a tabela de preço do cliente, e a aprovação do pedido confere os preços
  de novo.

## 4. Trazer os dados do sistema atual

Em **Configurações → Dados → Migração do sistema antigo**:

- **Conexão direta (recomendado)**: abre uma janela de login do Google do sistema atual (entre com a sua conta de
  administrador de lá) e lê todas as coleções. O endereço da V2 precisa estar nos *Domínios autorizados* do projeto
  atual.
- **Arquivo de backup (.json)**: alternativa, gerado no sistema atual em *Configurações → Backup* (não traz os PDFs).

Antes da importação final, peça para a equipe **entrar uma vez** na V2: os logins mudam de um projeto para outro, e
é pelo e-mail que a migração liga carteiras, pedidos e comissões a cada pessoa. Clientes do portal liberados chegam
como convites (no portal novo, "Criar conta" com o mesmo e-mail e já entram liberados).

O assistente mostra uma prévia com contagens e avisos antes de gravar. Pode repetir sem duplicar nada, mas faça a
importação final no dia da troca (e de novo se alguém entrar pela primeira vez depois).

O que a migração traz (versão atual do sistema antigo, inclusive pré-cadastros, convites do portal e sub-lotes):
- **Estoque com histórico**: cada peça chega com o saldo atual, e as baixas e estornos do *registro de baixas* do
  sistema antigo viram histórico ligado aos pedidos. Pedidos migrados com baixa registrada devolvem o estoque se
  forem cancelados no sistema novo. Baixas anteriores ao registro ficam embutidas no peso de entrada.
- **PDFs de NF e boleto** guardados em pedaços no banco antigo são copiados para o pedido (só pela conexão direta;
  o arquivo de backup não traz os PDFs).
- O assistente mostra avisos do que não pôde ser aproveitado (ex.: convite de cliente que não existe mais).

## 5. Dia da troca

1. Escolha um horário sem movimento (fim do dia ou fim de semana) e avise a equipe.
2. Rode a migração uma última vez (pega tudo o que entrou no sistema atual até ali).
3. Passe o endereço novo para a equipe. A partir daí, ninguém lança mais nada no sistema atual.
4. Deixe o app atual no ar por algumas semanas só para consulta. Depois pode parar de usá-lo, mas **não apague o
   projeto atual**: as fotos e arquivos antigos continuam abrindo de lá.

## 6. Testes

```
npm install
npm test     # regras de negócio e migração (50 testes)
```

## Estrutura

```
src/shared/      telas e regras (iguais nas duas opções)
  domain/        modelo de dados, rótulos, cálculos (DRE do lote, frete, Pix, pesagem)
  ops/           operações de negócio (vendas, estoque FIFO, abate, desossa, financeiro…)
  modules/       telas por área
  migration/     conversão do sistema antigo
src/shell/       visual desta opção (barra superior, login, painel)
src/backend/     ligação com o Firebase (e leitor do banco antigo)
firestore.rules  regras de acesso por perfil
```
