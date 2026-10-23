# Aurus Prime V2 — como preparar o Firebase

A V2 roda num **projeto Firebase seu, separado** do sistema atual. O projeto do sistema
atual (`gen-lang-client-0404417776`) **não é alterado**: ele só é **lido** na migração.
Tudo abaixo é feito no [console do Firebase](https://console.firebase.google.com/), logado
com a conta dona dos projetos.

> O arquivo `firebase-applet-config.json` diz qual projeto a V2 usa (bloco principal) e onde
> está o sistema atual (bloco `legacy`).

---

## No projeto NOVO (o da V2)

### 1. Plano
O Storage (fotos, PDFs de NF/boleto, comprovantes) exige o plano **Blaze** (cartão
cadastrado). Dentro da cota gratuita a conta fica em zero.

### 2. Banco de dados
1. **Firestore Database → Criar banco de dados** (ou "Adicionar banco de dados" no seletor
   de bancos, se o projeto já tiver um).
2. **ID do banco:** `aurus-prime-v2` — exatamente assim. (Assim a V2 não se mistura com
   nenhum outro banco que esse projeto já tenha.)
3. Edição **Standard**, modo **produção**, local `southamerica-east1 (São Paulo)`.

### 3. Regras do banco
Com o banco **`aurus-prime-v2` selecionado** no topo da tela → aba **Regras** → apague o
conteúdo, cole o arquivo `firestore.rules` inteiro → **Publicar**.

### 4. Storage (arquivos)
1. **Storage → Começar** (cria o bucket, se ainda não existir).
2. Aba **Regras** → cole o arquivo **`storage.rules`** inteiro → **Publicar**. Se o console
   pedir permissão para as regras do Storage lerem o Firestore, clique em **Permitir**.
   (Se esse projeto já usa o Storage para outro sistema, me avise antes: aí as regras são
   acrescentadas, não substituídas.)

### 5. Login
1. **Authentication → Começar → Método de login**: ative **Google** e **E-mail/senha**.
2. **Authentication → Modelos**: idioma **português**.
3. **Authentication → Configurações → Domínios autorizados → Adicionar domínio**: o endereço
   onde a V2 abre (o da prévia no Google AI Studio e, depois de publicar, o do Cloud Run).

## No projeto ATUAL (`gen-lang-client-0404417776`) — só uma coisa

**Authentication → Configurações → Domínios autorizados → Adicionar domínio**: o mesmo
endereço da V2. É o que permite a tela de migração da V2 abrir o login do sistema atual para
ler os dados. Não mexa em mais nada nesse projeto.

---

## Primeiro acesso = administrador

Com o banco novo vazio, **a primeira pessoa que entrar vira Administrador**. Por isso, **o dono
deve ser o primeiro a entrar**, com **Entrar com Google**. Depois:

- e-mails dos domínios da empresa (mvgbalimentacao.com, grtbalimentacao.com,
  girassolalimentacao.com, aurusprime.com) entram como **Operador**;
- os usuários do sistema atual chegam como **convites** pela migração (com o papel que já tinham);
- quem entra com Google continua entrando com Google; quem usava senha cria uma nova no primeiro
  acesso ("Primeiro acesso? Criar senha") — senhas não passam de um projeto para outro;
- clientes do portal liberados chegam como **convites**: no portal novo, tocam em "Criar conta" com
  o mesmo e-mail e já entram liberados.

## Migração (Configurações → Dados → Migração do sistema antigo)

1. Peça para a equipe **entrar uma vez** na V2. É assim que carteiras, pedidos e comissões ficam
   ligados às pessoas certas (os logins mudam de um projeto para outro; a ligação é pelo e-mail).
2. **Conectar direto ao sistema antigo** → entre com a sua conta Google do sistema atual na janela
   que abrir → confira a prévia → **Importar**.
3. Pode repetir quantas vezes quiser, sem duplicar. No dia da troca, rode uma última vez — e rode
   de novo se alguém entrar pela primeira vez depois.

Os PDFs de NF/boleto guardados em pedaços no banco atual são copiados para o Storage novo. As fotos
e arquivos que já estavam no Storage do sistema atual continuam lá e abrem pelo link — por isso
**não apague o projeto atual** depois da troca (pode só parar de usar o app antigo).
