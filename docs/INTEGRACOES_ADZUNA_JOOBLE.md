# Corrigir Adzuna HTTP 401 e habilitar Jooble pelo gateway interno

## Estado das integrações

O workflow A tinha 7 consultas Adzuna via HTTP Custom Auth e 3 nós Jooble que fabricavam `HTTP 503` com mensagem de desativado. Esta versão substitui os 3 nós Jooble por requisições HTTP reais para um gateway **local, protegido por token**. A Adzuna mantém seu endpoint oficial: nenhuma alteração em código pode criar credenciais válidas se as antigas foram recusadas.

**Não execute o workflow A atualizado antes de configurar o gateway e as credenciais.** Não há vagas fictícias nem respostas de sucesso inventadas. As integrações só ficam funcionais após obter chaves válidas, executar o gateway e testar os nós em seu ambiente.

## A. Corrigir Adzuna

Documentação: https://developer.adzuna.com/overview

1. Acesse o [portal da Adzuna](https://developer.adzuna.com/) e confirme que a sua conta possui `app_id` e `app_key` ativos e autorização para o índice brasileiro `br`.
2. No n8n, abra **Credentials → HTTP Custom Auth** e crie/revise uma credencial chamada `Adzuna API`.
3. No corpo JSON da credencial (não no JSON do workflow), configure:
   ```json
   {"qs":{"app_id":"SEU_ID_REAL","app_key":"SUA_CHAVE_REAL"}}
   ```
4. Atribua essa credencial aos **sete** nós do workflow A cujo nome começa com `Vagas Adzuna`.
5. Execute **somente** um nó Adzuna. Verifique se o retorno HTTP é `200` e contém o array `results`.
6. Se continuar `401`, revise as chaves no portal e a autorização/ativação da conta. Não faça vários retries de `401` e não crie `app_id` ou `app_key` aleatórios.
7. Se retornar `429`, respeite as cotas e aguarde conforme `Retry-After`.

**Teste sem revelar senha:** na aba de output do nó, informe apenas o código HTTP e se existe `results`. Nunca compartilhe o conteúdo da credencial, cabeçalhos ou URLs com parâmetros secretos.

## B. Preparar credencial Jooble BR

Documentação: https://br.jooble.org/api/about

1. Solicite uma **chave da API do portal brasileiro** https://br.jooble.org/api/about. Não reutilize uma chave emitida para outra região.
2. No Ubuntu Server que hospeda o n8n Docker, crie uma rede privada compartilhada:
   ```bash
   sudo docker network inspect tecops-internal >/dev/null 2>&1 || sudo docker network create tecops-internal
   sudo docker network connect tecops-internal monitor-vagas-n8n
   ```
   A segunda linha falha caso o contêiner já esteja na rede; nesse caso, confirme com `sudo docker inspect monitor-vagas-n8n`. Se o contêiner n8n for recriado, a associação de rede poderá precisar ser repetida ou incluída no Compose que gerencia o n8n.
3. Dentro do clone do projeto:
   ```bash
   cd ~/MonitoramentoVagas/services/jooble-gateway
   cp .env.example .env
   chmod 600 .env
   openssl rand -hex 32
   ```
4. Edite `.env` com `nano .env`, atribuindo **a chave Jooble regional real** a `JOOBLE_BR_API_KEY` e o segredo aleatório produzido pelo comando anterior a `GATEWAY_SHARED_TOKEN`. Não publique o arquivo `.env` nem cole a chave no chat.
5. Inicie o gateway com Docker:
   ```bash
   sudo docker compose -f compose.yml up -d --build
   sudo docker ps --filter name=tecops-jooble-gateway
   sudo docker logs --tail=30 tecops-jooble-gateway
   ```
   O Compose usa `expose`, não `ports`: a porta `8787` fica acessível **somente aos contêineres conectados à rede privada**, não ao navegador nem à internet.
6. No n8n, crie uma credencial **Header Auth**, nome `TecOps Jooble gateway`:
   - **Name:** `X-TecOps-Token`
   - **Value:** o mesmo `GATEWAY_SHARED_TOKEN` que está no arquivo `.env`.
7. Associe a credencial aos três nós: `Vagas Jooble`, `Vagas Jooble BR Game Dev` e `Vagas Jooble BR Estagio`.
8. Execute **um único nó Jooble** manualmente. O sucesso exige `HTTP 200` e array `jobs`. Um `200` com `jobs:[]` significa consulta bem-sucedida sem resultados, não vagas encontradas.
9. Se houver `401` do gateway, o header interno está ausente/incorreto; se retornar `403` do upstream, confirme a chave regional; `429` indica cota ou limite; `502` indica falha de upstream. `ECONNREFUSED` indica gateway inacessível; revise rede Docker e contêiner.

### Segurança

- Não publique `8787` em portas de host (`ports`), não exponha `5432` do PostgreSQL por causa deste serviço.
- `services/jooble-gateway/.env` está ignorado pelo Git. No repositório existe apenas `.env.example`, com placeholders.
- O n8n guarda o token compartilhado como credencial **Header Auth**, não no JSON exportado.
- O serviço não aceita URL arbitrária; recebe apenas `keywords`, `location`, `page`, `ResultOnPage`, `radius`, tem tamanho máximo de body e timeout de 20 segundos. Não atua como proxy aberto.
- Restrinja acesso à rede Docker e ao diretório de credenciais. Usuários com permissão para usar Docker podem inspecionar variáveis de ambiente dos contêineres.
- Em produção, considere usar secrets montados em arquivo e um serviço de gerenciamento de credenciais; a configuração de `.env` atende a uma implantação residencial restrita.

## C. Como testar a coleta inteira

Depois de testar as APIs individualmente, atualize o arquivo `n8n/A-coleta.json` preservando o ID do workflow A usado pelo G. Não rode o agendador G enquanto estiver ajustando as credenciais.

1. Execute A manualmente e verifique `diagnostics`, especialmente `ok`, `quantity`, `statusCode` e `error` em Adzuna e Jooble.
2. Execute o G manualmente quando o PostgreSQL estiver disponível e o histórico inicializado, verificando B–E e o commit no PostgreSQL.
3. Confirme no site o campo `ultimaSincronizacao`, `diagnosticosFontes` e as vagas reais.
4. Não apague as vagas atuais quando alguma API retornar erro.
5. Reative o agendamento diário e semanal depois de confirmar os resultados.

### Exemplos de saída — **ilustrativos, não resultados de API reais**

- `{"source":"Jooble","ok":true,"statusCode":200,"count":0,"jobs":[]}`: consulta concluída, sem vagas retornadas.
- `{"source":"Adzuna","ok":false,"statusCode":401,"error":"...app_id/app_key..."}`: corrigir credencial da Adzuna.
- `{"source":"Jooble","ok":false,"statusCode":403,"error":"...chave regional..."}`: corrigir chave Jooble.

## D. Testes automatizados sem credenciais

```bash
node --test tests/jooble-gateway-auth.test.cjs
node --test tests/*.test.cjs
```

O teste injeta um cliente HTTP fictício no gateway **apenas para testar contrato e segurança**. Ele não afirma que a API respondeu nem que houve vagas coletadas. A integração real depende da conta Jooble e Adzuna no servidor.

O banco PostgreSQL não precisa de nova migração; a arquitetura A→B→C→D→E→G permanece preservada.
