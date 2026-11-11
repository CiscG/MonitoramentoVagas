# MonitoramentoVagas (TecOps) — n8n + GitHub Pages

## Pré-requisitos
- Ubuntu Server 26.04, Docker e n8n funcionando.
- Repositório GitHub **CiscG/MonitoramentoVagas** (ou adapte as URLs de ambos os nós GitHub no workflow).
- Token pessoal **fine-grained**, limitado ao repositório DevVagas, permissão **Contents: Read and write**. Nunca publique o token em arquivos do site.

## Publicar a página uma vez
1. Crie o repositório `MonitoramentoVagas` no GitHub.
2. Mantenha os arquivos `index.html`, `app.js`, `style.css` e `data/vagas.json` na raiz (a estrutura atual já está pronta para GitHub Pages).
3. Em Settings > Pages, escolha Deploy from a branch / main / (root).
4. Confira `https://ciscg.github.io/MonitoramentoVagas/` após o primeiro deploy.

## Importar workflow n8n
1. Abra o n8n > Workflows > Add workflow > Import from File (o nome exato pode variar por versão).
2. Importe `n8n/monitor-vagas-workflow.json`.
3. Crie credencial **GitHub API** no n8n, com seu usuário e token. Atribua a credencial aos nós `Ler arquivo atual GitHub` e `Publicar vagas.json`.
4. Confira se o nome da sua branch é `main`; se não for, altere o campo `branch` no último nó.
5. Execute manualmente primeiro, revise o resultado e depois publique/ative o workflow.
6. O gatilho está configurado a cada 60 minutos. Configure timezone do n8n como `America/Sao_Paulo`.

## Como funciona
- Fontes nacionais: issues abertas e recentes em `frontendbr/vagas` e `backend-br/vagas`.
- Remotas: API Himalayas, filtrando candidatura aberta a BR e nível de entrada.
- O n8n recupera o `data/vagas.json` anterior do GitHub, mescla vagas por ID e elimina repetidas.
- Retém até 400 vagas; descarta vagas antigas (mais de 90 dias da publicação) e vagas Himalayas expiradas pelo campo `expiryDate`.
- Publica quando há alteração de vagas; nenhum token está no frontend.

## Limitações e atenção
- O filtro júnior/estágio é heurístico, NÃO garante ausência de exigência de experiência.
- As issues do GitHub podem estar desatualizadas, mesmo abertas: confirme sempre no anúncio original.
- A API Himalayas é atualizada diariamente; buscas a cada hora não geram dados novos necessariamente. A API exige atribuição à fonte e `applicationLink` original, já presentes no site.
- Os endpoints de issues retornam os 100 anúncios mais recentes de cada repositório, sem paginação adicional.
- Se uma fonte falhar, a execução falha antes de publicar e os dados antigos continuam no GitHub.
- O `vagas.json` é o histórico persistido e público. Não salve dados pessoais nele.
- Se outro processo editar vagas.json entre a leitura e o PUT, o GitHub poderá responder 409/422; execute novamente após investigar.
- O workflow foi preparado para importação, mas não foi executado em uma instância real do n8n; teste e ajuste se sua versão exigir pequenas mudanças.

## Deduplicação e histórico

O workflow principal consolida vagas por identificador externo, URL canônica, empresa/cargo normalizados e hash da descrição. Republicações reconhecidas preservam a primeira identificação, em vez de contabilizar uma vaga nova. A listagem pública continua limitada a 400 registros em `vagas`; os excedentes são guardados em `historicoVagas` dentro de `data/vagas.json`. O segundo workflow, de validação, preserva esses dados adicionais.

**PostgreSQL não está conectado a este repositório atualmente.** A migração e o importador opcionais ficam em [database/README.md](database/README.md): incluem o esquema `jobs`, histórico de publicações e snapshots de relatórios, sem interferir na coleta atual. Recomenda-se manter cópias periódicas do JSON completo, inclusive do histórico; registros perdidos antes desta versão não podem ser recriados automaticamente.
