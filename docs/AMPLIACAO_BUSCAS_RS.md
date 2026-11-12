# Ampliação das buscas: remoto + híbrido/presencial no Rio Grande do Sul

## Objetivo

Manter a coleta de vagas remotas já existente e incluir oportunidades **híbridas ou presenciais com localização comprovada no RS**, sem exigir mudança no PostgreSQL, nos subworkflows C–F ou no envio do relatório.

## O que mudou

- **Workflow A — Coleta:** adicionadas quatro consultas REST Adzuna usando o endpoint público documentado `GET /v1/api/jobs/br/search/1`, com `where=Rio Grande do Sul` e `what` para desenvolvimento, estágios, QA/testes e integração de sistemas. Cada consulta pede 20 anúncios. Utiliza a mesma credencial Custom Auth Adzuna dos nós anteriores (`app_id` e `app_key`); **não insere segredos no JSON**.
- **Normalização:** preserva `location.area` retornada pela Adzuna, os nomes de cidades, `workplaceType`/modalidade quando explícitos. Não inventa modalidade quando ela não é identificável; evita usar menções institucionais genéricas a trabalho remoto.
- **Deduplicação em A:** quando buscas diferentes retornam o mesmo `id` da Adzuna, é produzido apenas um registro, com todas as buscas em `buscasCorrespondentes`. O E continua fazendo deduplicação histórica no PostgreSQL.
- **Workflow B — Filtragem:** mantém `Remoto` independentemente da cidade; restringe `Híbrido`, `Presencial` e modalidade não informada a localidade explicitamente identificada no RS (`location.area`, UF ou cidades gaúchas indicadas). Vagas sem localidade, ou declaradamente de outro estado, não entram como locais.
- **Workflow D — Classificação:** leva em conta a hierarquia geográfica da Adzuna na pontuação. Vagas híbridas do RS recebem até 12/15 em localização, e vagas remotas ou presenciais com local comprovado até 15/15; continua sendo compatibilidade estimada.
- **Workflow G — Perfil:** habilitado `rsOnlyForNonRemote:true`, `includeRemote:true` e `allowUnknownLocation:false`, sem criar novos agendamentos ou modificar as credenciais.

## Como instalar (n8n)

1. Faça backup das versões instaladas de A, B, D e G antes de atualizar. Os demais workflows podem permanecer intactos.
2. Mescle a branch no GitHub e importe os quatro arquivos JSON atualizados mantendo os IDs que G já referencia. Se criar cópias, altere os nós `Executar A/B/D` do G para os novos IDs.
3. Atribua a **mesma credencial HTTP Custom Auth Adzuna** aos quatro novos nós `Vagas Adzuna RS ...`. Confirme também que os três nós Adzuna anteriores possuem credencial. Nenhuma chave é fornecida pelo arquivo exportado.
4. Verifique a conexão PostgreSQL e o bootstrap `tecops_pipeline_state` antes de executar G. Não altere ou zere o histórico anterior.
5. Faça uma execução manual de G. Em A, observe os quatro nós de validação Adzuna RS e seus diagnósticos `ok`, `quantity` e `error`; em B, confira `filterStats.applied.rsOnlyForNonRemote`; em E, confira novas/repetidas; em G, confira o commit PostgreSQL.
6. Teste o site com o filtro de modalidade existente (Remoto/Híbrido/Presencial). Observe que uma localidade sem município/estado confirmado permanece de fora da coleta não remota.
7. Só depois de validar, reative as agendas de G.

## Consultas novas (sem credenciais)

| Consulta | `what` | `where` |
|---|---|---|
| Adzuna RS Desenvolvimento | `desenvolvedor` | `Rio Grande do Sul` |
| Adzuna RS Estágio | `estagio desenvolvimento` | `Rio Grande do Sul` |
| Adzuna RS QA | `qa testes` | `Rio Grande do Sul` |
| Adzuna RS Integração | `integracao sistemas` | `Rio Grande do Sul` |

Esses termos são consultas por texto, não uma garantia de que a API retornará vagas ou de que a classificação será correta. O filtro posterior é a etapa responsável por validar a localidade.

## Limitações e parâmetros

- **A Adzuna exige credenciais reais.** Sem elas, as quatro integrações retornam erro/diagnóstico, sem apresentar resultados falsos. Não foi possível executar chamadas autenticadas à conta do usuário.
- As consultas Adzuna já existentes continuam buscando vagas do Brasil e as da Himalayas continuam buscando remotas. Os feeds Github Backend BR e Frontend BR continuam ativos.
- Municípios não listados no B **ainda são aceitos** quando a vaga declara `RS` ou `Rio Grande do Sul` no campo de localização. Municípios informados isoladamente precisam constar na lista conhecida; cidades homônimas de outros estados podem exigir inspeção.
- `rsOnlyForNonRemote` pode ser desativado no perfil do G; não é recomendado para este objetivo.
- Não foi incluída uma fonte sem API oficial nem scraping privado. Aumentar frequência ou volume de Adzuna pode atingir as quotas da sua conta; respeite as limitações contratadas.
- Uma vaga com modalidade não informada, mas localização no RS, é retida para revisão; isso **não** significa que seja presencial ou híbrida confirmada.
- A etapa C determina situação do anúncio e não pode provar candidatura ativa para toda fonte.

## Testes

O teste `tests/workflow-rs-regional.test.cjs` cobre: correspondência e exclusão geográfica (inclusive outras UFs), preservação do remoto, quatro endpoints com credenciais do n8n, deduplicação entre consultas e pontuação de localidade no RS.

```bash
node --test tests/workflow-rs-regional.test.cjs
```

Referências: [Adzuna Search API](https://developer.adzuna.com/docs/search) e [Adzuna Overview](https://developer.adzuna.com/overview).

Não há alterações de esquema: `database/001_jobs.sql`, `database/002_pipeline_runtime.sql` e `database/003_audit_views.sql` continuam válidos.
