# Aurus Prime 2.0 — Opção B

**Banco Firebase (Firestore) reestruturado · visual claro (verde-campo)**

Versão remasterizada do sistema MVGB Agro / Aurus Prime: gado (lotes, animais, ração, custos e fiscal),
abate e desossa, estoque por lote e validade, vendas e intercompany, separação e expedição, clientes e
ranking, tabelas de preço, financeiro (contas a receber e a pagar, fluxo de caixa, comissões), equinos,
portal do cliente, vendedores externos, relatórios, treinamento e migração dos dados do sistema atual.

Usa o **mesmo projeto Firebase do sistema atual** (`gen-lang-client-0404417776`), mas grava num **banco novo e
separado** (`aurus-prime-v2`). O banco atual não é alterado.

---

## Como subir sem afetar o sistema atual

- O sistema novo entra no AI Studio como um **app novo**. O app atual continua no ar, igual, até o dia da troca.
- Ele grava num **banco novo** (`aurus-prime-v2`). O banco atual só é **lido** na migração.
- No Firebase, só três cuidados:
  1. regras do banco: publique **com o banco `aurus-prime-v2` selecionado**, nunca no banco atual;
  2. regras de arquivos (Storage): **acrescente** o bloco, não substitua (passo 3 do FIREBASE-BANCO.md);
  3. domínios autorizados: **adicione** o endereço novo, não remova nenhum.
- Não altere o app atual no AI Studio durante a preparação (abrir e usar normalmente pode).

## 1. Preparar o Firebase (uma vez)

Siga **[FIREBASE-BANCO.md](./FIREBASE-BANCO.md)**. Em resumo:

1. Firestore → criar o banco **`aurus-prime-v2`**.
2. Publicar `firestore.rules` **no banco novo** e **acrescentar** `storage-acrescentar.rules` às regras do Storage.
3. Authentication: Google e E-mail/senha ativos (já estão, no sistema atual); **adicione** o endereço do app novo
   em **Authorized domains**.

## 2. Colocar no Google AI Studio

1. Crie um repositório no GitHub (pode ser privado) e envie **o conteúdo desta pasta** para ele.
2. No [Google AI Studio](https://aistudio.google.com) → **Build** → no campo de mensagem, clique em **+** →
   **Import from GitHub** → escolha o repositório.
3. O arquivo `firebase-applet-config.json` já aponta para o projeto atual e para o banco `aurus-prime-v2`. Não peça ao
   assistente do AI Studio para "configurar o Firebase": isso pode criar outro banco.
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
- Os logins do sistema atual continuam valendo: quem entrava pelo Google continua pelo Google, e quem
  entrava com senha usa a mesma senha.
- Clientes do portal se cadastram em `…/#/portal` e aguardam aprovação em **Comercial → Portal do cliente**. Ou a
  equipe **convida** (Portal do cliente → Contas → Convidar cliente): no primeiro acesso com aquele e-mail a conta já
  entra liberada. Os preços do portal seguem a tabela de preço do cliente, e a aprovação do pedido confere os preços
  de novo.

## 4. Trazer os dados do sistema atual

Em **Configurações → Dados → Migração do sistema antigo**:

- **Conexão direta (recomendado)**: como é o mesmo projeto Firebase, basta estar logado com a conta de
  administrador do sistema atual. O assistente lê todas as coleções antigas.
- **Arquivo de backup (.json)**: alternativa, gerado no sistema atual em *Configurações → Backup*.

O assistente mostra uma prévia com contagens e avisos antes de gravar. Pode repetir sem duplicar nada, mas faça a
importação final **antes** da equipe começar a usar o sistema novo. Nesta opção os logins continuam os
mesmos: usuários antigos aceitam o convite automaticamente no primeiro acesso, e clientes do portal mantêm
a conta.

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
4. Deixe o app atual no ar por algumas semanas só para consulta. Depois dá para desligá-lo e trocar o Storage pelo
   `storage.rules` completo.

## 6. Testes

```
npm install
npm test     # regras de negócio e migração (47 testes)
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
