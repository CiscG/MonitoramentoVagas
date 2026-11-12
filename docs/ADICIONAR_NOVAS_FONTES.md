# Como adicionar fontes ao TecOps

## Princípios

1. Confirme na documentação oficial que há uma API ou feed público permitido. Não use endpoints internos/privados, não burle CAPTCHA e não cole tokens diretamente em URLs exportadas.
2. Registre limite de requisição, paginação, autenticação, termos de uso, formato dos campos e semântica de encerramento.
3. Se a API não estiver disponível, crie somente documentação e diagnóstico de indisponibilidade; **não produza vagas sintéticas**.

## Integração ao workflow A

1. Faça backup de `n8n/A-coleta.json`.
2. Adicione nó **HTTP Request** com endpoint verificado, autenticação nativa do n8n e retorno JSON; configure `Continue On Error` e tentativas limitadas.
3. Adicione um **Code** com validação estrita do envelope (formato, HTTP, array, título, URL), preservando campos da fonte.
4. Adicione **Wait** para respeitar a quota. Registre os campos `ok`, `jobs`, `error`, `statusCode` e `checkedAt`.
5. Acrescente a nova fonte à lista `sources` do nó **Normalizar coleta**. Configure um nome único de origem e mapeie dados originais para `toRow()` sem inventar campos ausentes.
6. Garanta que ela continue até **Normalizar coleta**, sem pular etapas A–E.
7. Ao criar validação por fonte em C, use somente endpoint/documentação comprovada. Exemplo: `GitHub issues` e `Himalayas jobs API`; outras fontes permanecem pendentes até haver contrato explícito de status.
8. Teste resposta bem-sucedida, array vazio, 404, 429, 500, timeout, duplicata e anúncio fechado. Verifique também que o histórico PostgreSQL não foi apagado.

## Campos mínimos de saída

```json
{
  "id": "origem-identificador-estavel",
  "cargo": "Título declarado",
  "empresa": "Não informada",
  "descricao": "Texto real da fonte",
  "fonte": "Nome da fonte",
  "link": "https://exemplo.org/anuncio/123",
  "source_url": "https://exemplo.org/anuncio/123",
  "application_url": "https://exemplo.org/anuncio/123",
  "publicadoEm": null,
  "expiraEm": null
}
```

O exemplo é **apenas um esquema ilustrativo**, não uma vaga real. Não copie URLs fictícias para produção. `source_url` representa a atribuição ao provedor; `application_url` só deve ser o link efetivamente publicado para candidatura (e pode ser nulo).

## Coletores auxiliares existentes

O repositório inclui funções para Greenhouse, Lever e Ashby em `collectors/job-board-collectors.cjs`. Atualmente elas não são chamadas pelos workflows A–H e `collectors/sources.json` não tem empresas cadastradas. Para usar uma integração: confirme nome/slug oficial do board da empresa, termos, endpoint documentado e resultado real; então escolha integração HTTP nativa no A ou um serviço Node.js de coleta configurado separadamente.

## Migração e extensibilidade

Não altere SQL para cada fonte sem necessidade: `jobs.source`, `external_id`, `source_url`, `job_publications` e `original_data` permitem novas origens. Se surgirem campos adicionais, crie uma migração SQL versionada com testes e preserve o original em `original_data`.

A publicação para o site não substitui a persistência transacional: mantenha PostgreSQL como fonte da verdade e o GitHub apenas como espelho de leitura.
