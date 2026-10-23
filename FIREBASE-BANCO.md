# Aurus Prime 2.0 (Opção B) — como preparar o Firebase

O sistema novo usa o **mesmo projeto Firebase** do sistema atual
(`gen-lang-client-0404417776`), mas grava num **banco de dados novo e separado**,
chamado **`aurus-prime-v2`**. O banco antigo não é alterado — ele só é lido na
migração. Faça os passos abaixo uma vez, no
[console do Firebase](https://console.firebase.google.com/), logado com a conta
dona do projeto.

## 1. Criar o banco `aurus-prime-v2`

1. Menu **Firestore Database**.
2. No seletor de bancos (no alto da página), clique em **Criar banco de dados**
   (ou "Adicionar banco de dados").
3. **ID do banco:** `aurus-prime-v2` — exatamente assim, em minúsculas.
4. Edição **Standard**, modo **produção**, local `southamerica-east1 (São Paulo)`
   (ou o mesmo local do banco atual). Confirme.

## 2. Publicar as regras do banco

1. Ainda em **Firestore Database**, selecione o banco **`aurus-prime-v2`**
   no seletor (as regras são de cada banco — não mexa nas do banco antigo).
2. Aba **Regras**: apague o conteúdo, cole o arquivo `firestore.rules` inteiro e
   clique em **Publicar**.
3. Índices: nada a fazer. (O arquivo `firestore.indexes.json` só desliga a
   indexação de listas grandes, como os itens do pedido; é opcional.)

## 3. Acrescentar as regras de arquivos (Storage) — sem apagar nada

O Storage (fotos e documentos) é o **mesmo** do sistema atual, então aqui a regra é
**acrescentar, nunca substituir**:

1. Menu **Storage** → aba **Regras**. Copie tudo o que está lá e guarde num bloco de
   notas (backup).
2. Procure a linha `match /b/{bucket}/o {`. Logo **abaixo** dela, cole o conteúdo do
   arquivo **`storage-acrescentar.rules`** inteiro. Não apague nenhuma linha que já
   existia.
3. Clique em **Publicar**. Se o console pedir permissão para as regras do Storage
   lerem o Firestore, clique em **Permitir**. (Se aparecer erro, o console não
   publica nada e o sistema atual continua como estava.)

Isso é seguro para o sistema atual porque, no Storage, uma regra só **libera**; ela
nunca tira o que outra regra já liberava. E o bloco só trata das pastas do sistema
novo. (O arquivo `storage.rules` completo é para depois que o sistema atual for
desligado.)

## 4. Ativar os tipos de login

**Authentication → Método de login**: **Google** e **E-mail/senha** precisam estar ativos. O sistema atual já
usa os dois, então provavelmente não há nada a fazer aqui (não desative nenhum).

Quem entra com e-mail e senha recebe um e-mail de confirmação e só acessa depois
de clicar no link (isso impede alguém de se cadastrar com o e-mail de outra pessoa).
Dica: em **Authentication → Modelos**, escolha o idioma **português**.

## 5. Autorizar o endereço do sistema

**Authentication → Configurações → Domínios autorizados → Adicionar domínio**:
inclua o endereço onde o sistema novo vai rodar (o endereço que aparece no navegador
ao abrir o app no AI Studio e, depois de publicar, o do Cloud Run). Só **adicione**:
não remova os domínios que já estão lá, porque o sistema atual usa eles. Sem isso, o
login com Google do app novo mostra "Este endereço não está autorizado no Firebase".

## 6. Primeiro acesso = administrador

Com o banco novo vazio, **a primeira pessoa que entrar vira Administrador** (e o
sistema anota que já tem administrador). Por isso, **o dono deve ser o primeiro a
entrar**, com **Entrar com Google**. Depois disso:

- e-mails dos domínios da empresa (mvgbalimentacao.com, grtbalimentacao.com,
  girassolalimentacao.com, aurusprime.com — lista em Configurações) entram como
  **Operador**;
- qualquer outro e-mail só entra com **convite** (Configurações → Usuários), já com
  o papel escolhido;
- clientes do portal se cadastram sozinhos e ficam **aguardando liberação**.

## Observações

- O arquivo `firebase-applet-config.json` diz qual projeto e qual banco usar
  (`firestoreDatabaseId: "aurus-prime-v2"`; `legacyFirestoreDatabaseId` = banco antigo).
