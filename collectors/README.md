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

```js
const { collectAll } = require('./job-board-collectors.cjs');
const config = require('./sources.json');
const { jobs, diagnostics, fallbackUsed } = await collectAll(config);
console.log({ jobs, diagnostics, fallbackUsed });
```

As chamadas Greenhouse, Lever e Ashby usam apenas as interfaces públicas documentadas. Páginas Gupy/Workable/Sólides sem JSON-LD compatível retornam zero vagas; configure feeds ou integrações oficialmente autorizadas quando disponíveis. O conector não contorna proteção técnica e não promete busca global quando a plataforma não a oferece.

## Ligação ao n8n existente

Este repositório armazena um workflow n8n importável, mas não há execução de código local do repositório dentro do workflow atual. Para usar este módulo em produção, execute-o em um serviço Node autorizado acessível ao n8n ou empacote-o no ambiente do n8n e chame-o por um sub-workflow/HTTP Request. Não importe as páginas para GitHub Pages como se o navegador fosse o coletor. Preserve o passo de merge/histórico e publique somente após validar o resultado. O workflow legado continua sendo fallback até a integração e os testes na instância n8n.

## Teste rápido sem rede

Injete `fetchImpl` nos coletores para mockar respostas e testar normalização, URLs, erros isolados e deduplicação. Não faça varredura de board tokens nem requisições em massa a plataformas.
