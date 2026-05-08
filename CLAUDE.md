# Mosaic Direct — Guia do Projeto

Este arquivo é lido automaticamente pelo Claude Code antes de qualquer ação. Contém os padrões, decisões e o "espírito" do projeto que precisam ser respeitados em qualquer iteração.

---

## O que é o projeto

Mockups HTML interativos do **portal Mosaic Direct** (agribusiness brasileiro). São protótipos navegáveis pra validar UX/fluxo com PO e time. Cada arquivo é um HTML único auto-contido (HTML + CSS + JS no mesmo arquivo). Hospedados no Vercel em `https://mosaic-direct.vercel.app`.

Não é código de produção. É **mockup pra validar fluxo** — código limpo, sem build, sem framework, sem dependências externas além de fontes/SVGs inline.

---

## Filosofia de trabalho

**Iterações pequenas, cirúrgicas, preservando o que funciona.** Quando o usuário pede uma mudança, mexe no mínimo necessário. Não reescreve do zero, não troca componente que tá funcionando, não "moderniza" silenciosamente.

**Reusar antes de criar.** Antes de fazer um componente novo (drawer, modal, popup, picker), procura nos outros arquivos se já existe um equivalente. O design system é compartilhado entre todas as telas. Se a V5 tem um drawer de roteiro, a próxima tela usa o mesmo padrão visual e estrutural — não inventa um novo.

**Evitar sobre-engenharia.** O usuário está iterando rápido com PO. Não introduz validação complexa, edge cases obscuros, ou "robustez" que ele não pediu. Mantém simples. Se uma feature tem 3 campos opcionais, faz 3 campos opcionais — não 3 + validação cruzada + tooltip explicativo + estado de erro animado.

**Filenames são imutáveis.** O time usa F5 nos links salvos. Renomear arquivo quebra o workflow. Mesmo que o nome esteja "errado" (ex: V5 que virou "versão final"), o filename continua `agendar-contrato-normal-v5.html`. Mudanças de naming acontecem só no conteúdo visual (títulos, hub, nav).

**Confirmar antes de mudar grande coisa.** Se a mudança envolve mexer em mais de 1 arquivo, ou substituir um componente inteiro, mostra o plano antes de aplicar. Pequenas correções (typo, ajuste de espaçamento, mudança de cor) pode aplicar direto.

---

## Arquivos do projeto

| Arquivo | Função | Não renomear |
|---|---|---|
| `index.html` | Hub público listando todas as telas | ✓ |
| `agendar-contrato-normal.html` | Versão base/inicial (tabela + modal) | ✓ |
| `agendar-contrato-normal-v2-cards.html` | V2 (cards + drawer) | ✓ |
| `agendar-contrato-normal-v3.html` | V3 (toggle cards/tabela) | ✓ |
| `agendar-contrato-normal-v5.html` | **Versão final** (multi-item, layout horizontal compacto) | ✓ |
| `criar-protocolo.html` | Fluxo de criação de protocolo | ✓ |
| `agendar-protocolo.html` | Fluxo de agendamento de protocolo | ✓ |

**Ordem mental:** V1 → V2 → V3 → V5 são iterações da MESMA tela (Agendar Contrato Normal). V5 é a recomendada. As outras existem só pra histórico/comparação. Mudanças novas vão na V5 e nas telas novas (Criar Protocolo / Agendar Protocolo).

---

## Design system

### Cores (CSS variables que TODOS os arquivos usam)

```css
--mosaic-green-900: #003e2a   /* texto importante, headers */
--mosaic-green-800: #00583d   /* botão primário, ênfase */
--mosaic-green-700: #006a4d   /* hover, focus, links */
--mosaic-yellow:    #f0c020   /* tag "Versão final", warnings, "in progress" */
--mosaic-orange:    #d56b1a   /* status orange */
--mosaic-red:       #b9202a   /* destrutivo, erro, validação falhada */
--mosaic-teal:      #2c8b78   /* acento secundário */
--bg-page:          #fafaf8   /* fundo geral */
--bg-card:          #ffffff   /* cards, modais */
--bg-section:       #f4f4f4   /* área de seção secundária */
--border-soft:      #e1e1e1
--border:           #cdcdcd
--border-strong:    /* cinza mais forte pra campos vazios não-validados */
--text-1:           #15201b   /* texto principal */
--text-2:           #3b4642   /* texto secundário */
--text-3:           #6b7570   /* texto terciário, labels */
```

**Não introduzir cores novas sem necessidade.** Se precisar de uma variação, derivar das existentes (`rgba` com alfa).

### Tipografia

**Manrope** (Google Fonts), pesos 400/500/600/700/800. Sempre carregar via `<link>` no `<head>`.

Hierarquia padrão:
- `page-title` (h1): 32-44px, weight 800, letter-spacing -0.015em
- Section heading: 22px, weight 800
- Card title: 18px, weight 800
- Body / table cell: 13-14px, weight 500-600
- Labels: 9-11px, uppercase, letter-spacing 0.06em, weight 700-800, color text-3
- Small/meta: 11-12px, weight 600

### Layout

- `max-width: 1320px` em containers principais
- `padding: 56px` lateral nas páginas (32px no mobile)
- Cards e modais sem `border-radius` (visual sharp/corporate)
- Footer fixo full-width (`position: fixed; left: 0; right: 0`) com sticky de stats + ações

### Componentes recorrentes (REUSAR, NÃO RECRIAR)

1. **Top-nav**: barra horizontal com Home, Produtos, Cotações, Contratos, Agendamento (com submenu), Faturamento, Documentos, Financeiro, Suporte. Item current marcado em verde.
2. **Side drawer** (right-side): pra seleção de contratos/protocolos/cooperados. 560px de largura, header com título + close, search inline, body com lista, footer com Cancelar / botão primário.
3. **Datepicker custom**: input readonly + botão calendário inline. Popup que se posiciona inteligentemente (flips up se não tem espaço below). Mesmo componente em todas as telas.
4. **Roteiro drawer**: drawer lateral com textarea grande pra editar roteiro. Botão "Adicionar roteiro" / preview do texto preenchido + ícone expand. **Pré-preenche com valor existente quando aberto.**
5. **Modais de confirmação**: header cinza com título + X, body branco com ícone + texto, botão destrutivo em vermelho ou primário em verde. Mesma estrutura em todas.
6. **Modal de sucesso**: ícone verde de check, título "Algo foi feito", 1-2 botões de próximo passo.
7. **Hint pulse**: animação sutil chamando atenção pro botão principal quando lista está vazia.
8. **Status dots**: bolinha cinza (incompleto) → amarela com `!` (em progresso) → verde com check (completo). Borda esquerda do card/linha tabela colorida pelo status.
9. **Frete badge**: pill compacta `CIF` (azul/teal) ou `FOB` (laranja/yellow). Tamanhos compactos (9-10px font).
10. **Saldo emphasis**: número grande em `--mosaic-green-800` weight 800 + unidade `t` pequena. Sempre alinhado à direita em tabelas.
11. **Menu flutuante "🧪 Protótipos"**: botão fixed bottom-left que abre painel listando todas as telas. Atual destacada em verde. Esc/click-outside fecha.

---

## Padrões de interação aprendidos

### Roteiro
- **Sempre opcional** (não obrigatório, mesmo em CIF) na versão final
- Botão "Adicionar roteiro" → abre drawer → ao salvar, botão mostra preview (até ~30 chars + …) e fica com borda sólida + ícone verde
- Re-abrir o drawer já carrega o conteúdo salvo (não reseta)

### Inputs em linha
- **Mesma altura sempre** (32px é o padrão atual da V5). Se tem Volume + Data + Roteiro lado a lado, todos com 32px. `!important` se preciso pra superar CSS legado.
- Sufixos (`t` no Volume, `R$` no Preço) absolute positioned dentro do wrap.
- Date inputs sempre `readonly` + botão calendário (não tem digitação direta).

### Status / validação
- Linha "complete" quando todos os REQUIRED preenchidos (não os optional)
- Linha "progress" quando algum touched mas faltam required
- Linha "incomplete" quando vazia
- `show-validation` class no body só ativa o destaque vermelho ao tentar submeter com erro

### Tabelas
- Quando tem muitas colunas: agrupar info relacionada na mesma célula com `cell-stack` (primary + secondary stacked verticalmente)
- Saldo sempre destacado (16px bold green) com vigência/info secundária menor
- Sem cabeçalho duplo / grupos coloridos (foi tentado uma vez, ficou ruim, voltou ao simples)
- Border-left de 3-4px na linha indicando status

### Cards (V5/multi-item)
- Header (nível contrato): UMA linha horizontal com Contrato + Ref + Vigência + contador
- Item rows: UMA linha horizontal com Item + Frete + Produto + Embalagem + Rota + Saldo
- Inputs em linha separada abaixo (32px altura)
- **Sem toggle Lista/Grid** na V5 — só lista. Esse toggle existiu na V3 e foi removido.

### Cooperado picker (Criar Protocolo)
- Drawer lateral com 6 cooperados de exemplo: AGUINADO GOMES, BETO DOS SANTOS, CARLOS ALVES, JORGE DOS ANJOS, RENATO CESAR, TEREZA AKEMI
- Search por nome/CPF-CNPJ/fazenda
- Radio select, "Selecionar" no rodapé
- Botão "Cadastrar Cooperado" no canto direito da action-row → modal com 2 seções (Dados + Endereço) → mini-modal de sucesso

### Copy padrão (português, tom corporate-direto)
- Modais de confirmação destrutiva: "Você está prestes a [ação]. Tem certeza?"
- Modais de envio: "Você está prestes a [ação] N items. Pronto para continuar?" — Voltar / Confirmar
- Sucesso: "Seus [items] foram [ação]!" — botão de próximo passo
- Validação: "Preencha todos os campos obrigatórios marcados com *"
- Hint vazio: "Comece selecionando [items]"
- Botão primário no rodapé: ação verbal direta ("Agendar", "Criar Protocolo(s)", "Cadastrar Cooperado")

---

## Anti-patterns (NÃO FAZER)

❌ Não criar componente novo se já existe um similar em outro arquivo. Sempre olhar primeiro como foi feito antes.
❌ Não introduzir framework, build step, ou dependência. Tudo é HTML/CSS/JS puro inline.
❌ Não mexer em arquivo que não foi pedido pra mexer. Se o usuário pede mudança na V5, não tocar na V3.
❌ Não renomear filenames. NUNCA.
❌ Não adicionar validação de regex/formato em CPF/CNPJ/IE/CEP. São protótipos — só checa se o campo tá vazio.
❌ Não introduzir loading states, skeleton screens, ou animações de transição além das que já existem (hover sutil, fade do popover, expand do drawer).
❌ Não fazer cabeçalho de tabela com 2 linhas / grupos coloridos com bordas verticais. Foi tentado e ficou pior.
❌ Não trocar a paleta. As cores são institucionais da Mosaic, fixas.
❌ Não adicionar tooltips explicativos sem pedido. O design fala por si.
❌ Não adicionar campos opcionais sem ter sido pedido (ex: "ah, talvez seja útil ter um campo de observação aqui"). Se não pediram, não tem.
❌ Não rodar `vercel --prod` manualmente. O deploy é automático via `git push` (via integração GitHub ↔ Vercel já configurada).

---

## Workflow de cada iteração

1. **Ler o pedido com cuidado.** Identificar EXATAMENTE quais arquivos mexer e quais NÃO mexer.
2. **Procurar padrão existente.** Se a mudança envolve um componente que pode existir em outro arquivo, ver lá primeiro.
3. **Mostrar plano se for grande.** Pra mudanças cirúrgicas (ajuste de cor, copy, espaçamento), aplica direto. Pra mudanças que tocam estrutura ou múltiplos arquivos, descreve o plano antes.
4. **Aplicar mudança preservando o resto.** Edita só o necessário. Não refatora "de passagem" código que tá funcionando.
5. **Validar.** HTML válido, JS sem erro de sintaxe (`node --check` no script extraído). Se mexeu em renderer, abrir o arquivo e ler a função inteira pra garantir que não quebrou.
6. **Commit + push.** Mensagem descritiva mas concisa em português: `fix(v5): roteiro pré-preenche ao reabrir drawer` ou `feat: adiciona tela agendar-protocolo`.
7. **Não rodar `vercel --prod`.** O Vercel detecta o push e atualiza sozinho em ~30s.
8. **Confirmar pro usuário.** "Pronto. Site atualizado em ~30s. F5 em mosaic-direct.vercel.app pra ver."

---

## Como receber pedidos novos

Quando o usuário pede algo:

- **Pedido vago ("melhora isso")**: pergunta o que especificamente incomoda. Não inventa.
- **Pedido contraditório com o que tá feito**: aponta a contradição com gentileza. Ex: "Você pediu pra remover X na rodada anterior, agora pra adicionar — quer mesmo trazer de volta?"
- **Pedido que sugere refactoring**: avalia se realmente precisa. Refactor "preventivo" não faz parte do escopo.
- **Pedido envolvendo nova tela**: pergunta se segue padrões existentes (provavelmente sim) e usa o briefing do PDF se houver. Reusa componentes.

---

## Memória do contexto histórico

- O projeto começou no chat web do Claude.ai. As primeiras 6 telas foram construídas lá.
- Migrou pro Claude Code (terminal local) quando o chat ficou muito longo.
- Existe esse `CLAUDE.md` justamente pra preservar continuidade de estilo entre sessões.
- O usuário (Victor) trabalha em ciclos curtos com PO. Ele aprova pequenas mudanças rapidamente. Não gosta de surpresas no design.
- Bug recorrente conhecido: **roteiro drawer não pré-preenche** em algumas situações — sempre verificar que `openRoteiroDrawer` carrega `state.rows[idx].roteiro` no textarea ao abrir.
- Bug recorrente: **alturas de input desiguais**. Datepicker readonly tem `padding/line-height` diferente do input number. Sempre forçar `height: 32px !important` quando misturar tipos.

---

## Em caso de dúvida

Pergunta pro usuário antes de adivinhar. É melhor 30 segundos de pergunta do que 10 minutos refazendo algo que ele não queria.
