# Redesign da interface TecOps

## Objetivo

Transformar a página do GitHub Pages em um painel de oportunidades moderno, acessível e organizado, **sem alterar a coleta n8n, PostgreSQL ou o formato do JSON de vagas**.

## Interface

- Cabeçalho com identidade TecOps e atalhos para visão geral, oportunidades e filtros.
- Hero claro com proposta do painel e data real da última sincronização.
- Quatro indicadores derivados de `data/vagas.json`: oportunidades exibidas, remotas, híbridas/presenciais e estágios.
- Barra lateral de filtros com busca por título/empresa/stack, chips rápidos Remoto/Híbrido/Presencial, nível, fonte e localidade. Opções avançadas em seção recolhível (área, local prioritário, experiência, score e data).
- Resultados ordenáveis em grade responsiva. Cards compactos destacam empresa, fonte, cargo, local, modalidade, nível, score estimado e **situação da candidatura**.
- Detalhes adicionais recolhíveis: explicação de verificação, última consulta, requisitos de experiência, tecnologia e barra de compatibilidade.
- Estado de erro/carregamento, mensagem quando filtros retornam zero vagas, botão para limpar filtros.
- HTML semântico, controles rotulados, navegação por teclado, região de resultados com atualização acessível e suporte a movimento reduzido.
- Responsivo para desktop, tablet e celular. CSS sem dependência de CDN, fontes externas ou frameworks.

## Preservação

Todos os IDs e regras de filtragem anteriores foram preservados, incluindo a pesquisa textual, modalidade, nível, fonte, localidade, área, faixa de compatibilidade, requisitos de experiência, prioridade de perfil e ordenação. O JavaScript continua consumindo `./data/vagas.json` e atualiza os dados a cada cinco minutos.

O score continua sendo uma estimativa do frontend, não garantia de elegibilidade; vagas com `PENDING_VALIDATION` continuam sinalizadas como aguardando confirmação, não como candidaturas abertas.

**Esta atualização é apenas visual e de organização da interface.** Nenhuma modificação SQL ou dos workflows foi necessária.

## Publicação

1. Revise o Pull Request, especialmente a apresentação desktop e mobile.
2. Mescle o PR na branch `main` do repositório.
3. Aguarde o GitHub Pages atualizar `index.html`, `style.css` e `app.js`.
4. Acesse o endereço do site e realize atualização forçada do navegador (`Ctrl+Shift+R`) se o CSS anterior estiver em cache.
5. Teste todos os filtros, a visualização dos cards, a abertura segura dos anúncios e a renderização em celular.

## Testes

```bash
node --test tests/frontend-redesign.test.cjs
node --test tests/*.test.cjs
```

O novo teste verifica sintaxe do JavaScript, IDs dos controles, semântica HTML, preservação da lógica de filtros e condições básicas de responsividade/acessibilidade. Esses testes são estáticos: uma inspeção visual manual em navegadores continua recomendada.
