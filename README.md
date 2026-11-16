# Cutting Tracker

Aplicativo web pessoal para acompanhar o cutting de **16/11/2026 a 06/12/2026** (21 dias): alimentação, macros, hidratação, musculação, Muay Thai, checklist, evolução física, histórico e fechamento diário.

Tudo fica salvo **no próprio navegador** (IndexedDB). Não há login, servidor nem envio de dados a terceiros.

## Como usar

**Jeito mais rápido:** abra `cutting-tracker.html` (arquivo único) no Chrome, Edge ou Firefox do computador. Os dados ficam salvos no navegador para aquele arquivo; mantenha-o sempre na mesma pasta.

**No celular:** é preciso publicar o site (veja abaixo) e abrir o endereço. No Chrome/Safari use "Adicionar à tela inicial".

> Cada navegador/aparelho tem seus próprios dados. Para levar os dados de um lugar para outro, use **Configurações → Backup e exportação → Exportar backup** e depois **Restaurar backup** no outro.

## Publicar no workers.dev (Cloudflare)

O projeto já vem configurado (`wrangler.jsonc`): o Worker `cutting-tracker` serve só os arquivos estáticos de `dist/`, sem código no servidor. Os dados continuam no navegador de cada aparelho.

**Pelo seu computador (precisa do Node.js 20+):**

```bash
npm install
npx wrangler login      # abre o navegador para entrar na sua conta Cloudflare (grátis)
npm run deploy          # gera o site e publica
```

O endereço final fica `https://cutting-tracker.<seu-subdominio>.workers.dev`. Para atualizar, rode `npm run deploy` de novo.

**Automático pelo GitHub:** o workflow `.github/workflows/deploy.yml` publica a cada push na `main`. Ele precisa de dois secrets no repositório: `CLOUDFLARE_API_TOKEN` (token com o modelo "Edit Cloudflare Workers") e `CLOUDFLARE_ACCOUNT_ID`.

## Desenvolvimento

```bash
npm install
npm run dev          # servidor local
npm test             # testes (cálculos, regras, importação, backup)
npm run build        # site em dist/
npm run build:single # arquivo único em dist-single/index.html
```

Stack: React 19 + TypeScript + Vite, Dexie (IndexedDB), SheetJS (`@e965/xlsx`, redistribuição npm do SheetJS CE 0.20.3), ícones Lucide. Gráficos em SVG próprio.

## Arquitetura

```
src/lib/types.ts      modelo de dados (configurações, alimentos, refeições, água, treinos, Muay Thai, corpo, fotos, dia)
src/lib/db.ts         banco IndexedDB (Dexie) e inicialização
src/lib/defaults.ts   perfil, metas, rotina, treinos, plano alimentar, checklist e base TACO iniciais
src/lib/nutrition.ts  cálculo de calorias e macros
src/lib/day.ts        resumo de cada dia: plano, pendências, status de treino, checklist automático/manual
src/lib/alerts.ts     regras de acompanhamento (só sugerem, nunca alteram dieta/treino)
src/lib/importer.ts   leitura, validação, prévia e importação da planilha XLSX
src/lib/backup.ts     backup/restauração JSON (inclui fotos)
src/lib/reports.ts    relatórios Excel e CSV
src/pages/*           Dashboard, Treinos, Alimentação, Hidratação, Evolução, Histórico, Configurações
```

## Regras de dados

- Nada é marcado como feito só porque estava programado. Treino, Muay Thai, refeições e água dependem de registro real.
- Refeições sem registro ficam **pendentes**; pré-treino só é exigido em dia de musculação e pré-Muay só em dia de Muay Thai. Uma refeição pode ser marcada como "não fiz".
- Calorias acima da meta aparecem com o excedente real.
- Alimentos sem valores nutricionais (whey e farinha de aveia vêm assim, porque variam por marca) são registrados, mas o app avisa e **não estima** nada. Ao preencher o rótulo, você pode recalcular os registros antigos.
- Percentual de gordura só aparece se você informar uma medição.
- Checklist: itens automáticos marcam a partir dos registros (proteína, água, treino, Muay Thai, peso, refeições); você pode sobrepor manualmente. Itens opcionais não entram no percentual.
- Importação e restauração em modo "mesclar" nunca apagam nem sobrescrevem registros. "Substituir tudo" exige digitar SUBSTITUIR.

## Base nutricional inicial

Valores por 100 g transcritos da **TACO 4ª ed. (NEPA/UNICAMP, 2011)**: arroz branco cozido, ovo cozido e cru, banana prata e nanica, pão de forma integral, pão francês, aveia em flocos, brócolis, cenoura e abobrinha cozidos. Confira e ajuste se o rótulo do seu produto for diferente. O peso de 1 ovo, 1 banana e 1 fatia de pão é pedido no primeiro registro por unidade (não é presumido).

## Importação da planilha

Abas lidas: `LEIA_PRIMEIRO`, `ROTINA_SEMANAL`, `EXERCICIOS`, `DIETA_BASE`, `HOJE_16NOV`, `HIDRATACAO`, `CHECKLIST_DIARIO`, `REFERENCIA_ALIMENTOS`. Validada com o arquivo real do plano (layout com uma linha por item em DIETA_BASE, ROTINA_SEMANAL, EXERCICIOS e CHECKLIST_DIARIO). O leitor procura os cabeçalhos pelos nomes (com ou sem acento, em qualquer linha das 20 primeiras) e aceita variações como `3×8–12`, `06h30`, `20h30–21h30`, `2,5 L`, `2.500 kcal`, porções diferentes de 100 g checklists com datas em colunas ou em linhas e janelas de hidratação por horário (importadas como referência, nunca como consumo). A aba REFERENCIA_ALIMENTOS do plano só traz proteína aproximada, então é exibida para consulta e não vira valor nutricional. A aba HOJE_16NOV vira anotação do dia 16/11, sem contar como consumo. Tudo aparece em uma prévia antes de confirmar, junto com o conteúdo bruto das abas.

## Pendências conhecidas

- Não há sincronização entre aparelhos (por decisão de privacidade). Use backup/restauração.
- Sem modo offline instalável (service worker/PWA completo); o site precisa ser aberto pelo endereço ou pelo arquivo único.
