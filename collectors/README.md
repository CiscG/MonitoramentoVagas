# Coletores modulares de vagas públicas

`job-board-collectors.cjs` fornece conectores independentes para:

- **Greenhouse**: API pública oficial do Job Board (`boards-api.greenhouse.io`). Configure o token público do board.
- **Lever**: API pública de postings documentada (`api.lever.co`). Configure o slug do board.
- **Ashby**: Public Job Posting API documentada (`api.ashbyhq.com`). Configure o nome público do board.
- **Gupy, Workable, Sólides e páginas oficiais**: somente URL pública informada explicitamente; o conector lê metadados JSON-LD `JobPosting` presentes na página. Não tenta adivinhar endpoints nem fazer crawling indiscriminado.
- **LinkedIn Jobs e Indeed**: desabilitados por padrão. Integre somente API/feed oficial ou parceiro autorizado; não há scraping, bypass de autenticação ou CAPTCHA.

Cada conector normaliza cargo, empresa, localidade, modalidade, descrição, requisitos, data, URL de candidatura e origem (`fonte`). `collectAll` executa fontes em paralelo, isola falhas, retorna diagnóstico por fonte e mantém os resultados das fontes que responderam. Quando uma fonte falha ou não há resultados, a saída sinaliza `fallbackUsed`; o consumidor deve preservar os dados anteriores e/ou combinar com os coletores já existentes (por exemplo, issues do GitHub e Himalayas), sem apagar a lista histórica.

## Configuração

Copie `sources.example.json` para `sources.json` fora do site público, substitua os exemplos por tokens/URLs públicos reais e não adicione credenciais privadas. Board tokens/slug não são credenciais, mas não coloque tokens de API pagos, cookies ou segredos neste arquivo.

## Uso em Node.js 18+

```bash
node collectors/run-job-board-collectors.js
node collectors/run-job-board-collectors.js --write-to-data
```

A saída JSON inclui `vagas`, `diagnostics`, `fallbackUsed` e `total`. Com `--write-to-data`, o script mescla os resultados no histórico `data/vagas.json` preservando a lista atual e mantendo deduplicação por URL.

## Integração ao workflow n8n

O workflow n8n atual ainda é responsável por coletar as fontes existentes e publicar o JSON para o GitHub. Para integrar os novos coletores de forma segura:

1. Em um ambiente Node com acesso ao repositório, execute o script `collectors/run-job-board-collectors.js` com `--write-to-data`.
2. Verifique a saída JSON e confirme que cada item possui `cargo`, `empresa`, `local`, `modalidade`, `descricao`, `link` e `fonte`.
3. Adicione no n8n um nó `Execute Command` (ou `Code`/`HTTP Request` equivalente) que invoque `node collectors/run-job-board-collectors.js --write-to-data`.
4. Conecte esse nó antes do passo de `Consolidar historico`/`Publicar vagas.json`, de modo que o JSON final seja validado e publicado apenas após a coleta modular.
5. Mantenha o workflow atual como fallback: se o coletor modular falhar, o fluxo legado continua ativo e a publicação anterior permanece intacta.

As chamadas Greenhouse, Lever e Ashby usam somente as interfaces públicas documentadas. Páginas Gupy/Workable/Sólides sem JSON-LD compatível retornam zero vagas; configure feeds ou integrações oficialmente autorizadas quando disponíveis. O conector não contorna proteção técnica e não promete busca global quando a plataforma não a oferece.

## Teste rápido sem rede

Injete `fetchImpl` nos coletores para mockar respostas e testar normalização, URLs, erros isolados e deduplicação. Não faça varredura de board tokens nem requisições em massa a plataformas.
