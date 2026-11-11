# Histórico e deduplicação de vagas

## Qual armazenamento é usado?

O **TecOps atualmente utiliza \`data/vagas.json\`**, sem PostgreSQL conectado ao n8n. A migração para PostgreSQL é **opcional**, preparada para uma instalação futura: ela não ativa o banco automaticamente, não substitui os workflows e não expõe credenciais no GitHub Pages.

A partir desta implementação, \`n8n/monitor-vagas-workflow.json\` identifica vagas por:

1. Mesmo ID interno ou identificador externo **dentro da origem**;
2. Mesma URL canônica (remove UTM, trackers e fragmentos; mantém parâmetros úteis);
3. Mesmo par **empresa + cargo normalizados** e hash de descrição (com localidade compatível);
4. Para descrições editadas de republicações, par empresa/cargo/localidade e sobreposição **muito alta** de texto (comparação conservadora).

Apenas o nome da empresa e o título não são suficientes para juntar duas vagas. A assinatura da descrição é uma FNV-1a de 64 bits usada para comparação e **não** para segurança criptográfica.

A mesma vaga não volta a contar como \`nova\` ao ser publicada outra vez. Ela mantém \`id\` e \`primeiraIdentificacao\`, armazena URLs/IDs alternativos e, quando detectada, anota eventos em \`historicoPublicacoes\`. \`ultimaIdentificacao\` e \`last_seen_at\` podem avançar sem apagar a primeira captura.

### Histórico e relatórios

O JSON permanece compatível com o frontend, que lê **\`vagas\`** (até 400 cartões). As demais oportunidades ficam no array **\`historicoVagas\`** do mesmo arquivo; **\`totalHistorico\`** apresenta o total consolidado. Registros expirados não são removidos só por estarem antigos. A deduplicação é executada sobre ambos os arrays. Se o arquivo for removido ou sobrescrito por uma versão antiga do workflow, não há recuperação automática: faça backups.

O PostgreSQL inclui \`report_snapshots\` com cópia imutável de cada JSON importado (chave derivada de SHA-256). O banco também inclui \`job_publications\` para rastrear múltiplos IDs e links de uma mesma oportunidade, sem inflar o número de vagas. Isso **não recupera** históricos já perdidos antes da migração; importe ou restaure backups antigos se existirem.

## PostgreSQL opcional

Requisitos: PostgreSQL acessível, Node.js 18+ e permissão de criar tabelas e funções na base de destino.

\`\`\`bash
# Execute contra um banco previamente criado, após revisar o SQL:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/001_jobs.sql
cd database
npm install
npm test
cd ..
node database/import-jobs.cjs --dry-run
DATABASE_URL='postgresql://USUARIO:SENHA@HOST:5432/BANCO' node database/import-jobs.cjs
\`\`\`

É melhor **definir DATABASE_URL no ambiente** (por exemplo, \`export DATABASE_URL=...\`) e executar o último comando sem a URL literal para não deixar a senha no histórico do shell.

O importador lê **\`vagas\` + \`historicoVagas\`** e chama \`tecops_upsert_job\` em uma transação. A primeira importação cria registros; execuções posteriores atualizam os existentes ou reconhecem republicações. Para usar outro arquivo histórico:

\`\`\`bash
node database/import-jobs.cjs --file=./backups/vagas-2026-11-10.json
\`\`\`

Use \`--skip-snapshot\` se realmente quiser importar sem preservar o snapshot (não recomendado). O importador falha integralmente caso um registro inválido não possa ser persistido.

### Colunas e notas

A tabela \`jobs\` contém todos os 28 campos solicitados, mais colunas auxiliares de identidade: \`canonical_url\`, \`company_normalized\`, \`title_normalized\`, \`original_data\`, \`created_at\` e \`updated_at\`.

- Campos ausentes (salário, tipo de contrato, requisitos completos e score calculado exclusivamente no navegador) ficam **NULL**, não recebem valores inventados.
- Os valores de \`compatibility_score\` só são persistidos quando vierem do dado de origem. A pontuação do frontend continua calculada localmente com as preferências do candidato.
- O PostgreSQL **não está acoplado** ao n8n atual. Para torná-lo o banco principal, configure as credenciais do n8n, um nó de gravação pós-coleta e uma exportação compatível com \`data/vagas.json\`; faça isso após testar importação e concorrência.
- A validação de candidaturas atualiza apenas a lista \`vagas\`; ela preserva \`historicoVagas\` no JSON raiz.
- O esquema SQL foi projetado para implantação **nova**; se a sua base já possuir uma tabela \`jobs\` com colunas diferentes, planeje uma migração específica antes de aplicar o arquivo.

## Segurança e operação

Nunca comite URLs de banco com senha, tokens do GitHub nem dados pessoais. Proteja o PostgreSQL com permissões mínimas e backup, e **não disponibilize** diretamente as credenciais no site estático. Não rode ao mesmo tempo múltiplas rotinas de escrita no mesmo \`data/vagas.json\`: a API do GitHub pode retornar conflito 409/422, devendo-se reler o arquivo antes de tentar outra gravação.
