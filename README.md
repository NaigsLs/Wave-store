# Wave Store 2.0

Aplicativo web de gestão da Wave Store, com identidade visual azul-escuro/preto/branco e uso otimizado para celular.

## Arquivos principais

- `index.html` — interface, navegação, estilo responsivo e atalhos do painel.
- `app.js` — autenticação Supabase, produtos/estoque, vendas, recebimentos, compras, despesas, investimentos, relatórios, promoções, reservas, devoluções, parcelas e repasses.
- `logo.PNG` — logotipo do aplicativo.
- `sql/2026-10-repasses-cartao.sql` — documentação da integração de taxa e repasses de cartão já aplicada no Supabase.
- `sql/INTEGRACAO-APP-SUPABASE.md` — mapa dos recursos integrados e pontos que ainda exigem validação.

## Recursos incluídos nesta versão

### Produtos e estoque
- Cadastro de produtos com código, categoria, nome, variação, cor, tamanho, código de barras, URL de foto, custo, preço e estoque inicial.
- Edição de campos permitidos do cadastro; o estoque inicial não é editável após o cadastro.
- Ativar/desativar produto sem apagar histórico.
- Pesquisa e filtro por texto e status.
- Disponibilidade estimada descontando reservas ativas quando a consulta de reservas está autorizada; o Supabase continua sendo a validação final contra saídas incompatíveis.

### Vendas e promoções
- Carrinho, seleção do vendedor, cliente opcional e finalização pela RPC segura existente.
- Promoções opcionais por quantidade/preço total, com escolha dos produtos participantes.
- Cadastro de promoções, edição de nome/quantidade/preço e ativação/desativação.
- Ajuste do preço unitário de item vendido via `editar_preco_item_venda` e aplicação de desconto por venda via `aplicar_desconto_venda`.
- O aplicativo aplica a promoção apenas quando o vendedor seleciona a quantidade de kits; produtos fora do kit mantêm o preço normal.

### Reservas
- Criar reserva com produto, cliente, telefone, quantidade, vencimento e observação.
- Consultar reservas, cancelar pela função existente ou finalizar como venda atribuindo um vendedor.
- As validações de disponibilidade e produto ativo continuam no Supabase.

### Recebimentos e parcelas
- Recebimentos normais via `receber_venda`, com validação do saldo e da taxa.
- Cadastro de calendário de parcelas via `criar_parcelas_venda`.
- Registro de pagamentos parciais de parcela via `receber_parcela`.
- Crédito mantém o valor líquido pendente de repasse; não é lançado antecipadamente como dinheiro no banco.

### Compras, despesas e investimentos
- Compra em lote via `registrar_compra_lote`, com entrada no estoque e saída da conta selecionada.
- Cadastro e consulta de despesas.
- Cadastro e resumo de investimentos por sócio.
- Histórico do caixa e relatórios existentes preservados.

### Repasses de cartão
- Lista de repasses da loja, valores brutos, taxa, valor líquido, previsão, status e data de recebimento.
- Confirmação por `confirmar_repasse_cartao`, somente depois de o dinheiro realmente entrar na conta bancária.
- A confirmação registra o movimento no banco e bloqueia duplicidade no Supabase.

### Devoluções
- Abertura, adição de itens e conclusão de devolução pelas RPCs `ws_abrir_devolucao`, `ws_adicionar_item_devolucao` e `ws_concluir_devolucao`.
- O aplicativo avisa se uma operação ficar pendente após falha intermediária para evitar repetição cega.

## Limitações e validação necessária

- A tela implementa **devoluções**, não o fluxo completo de troca. O banco possui validações para movimentos de troca, mas não identificamos na conversa uma RPC segura completa para abrir e concluir trocas; por segurança, o aplicativo não grava diretamente nessas tabelas.
- Não há ajuste manual de estoque pelo cadastro: entradas e saídas continuam seguindo compras e operações autorizadas no Supabase.
- A tela de promoções depende das permissões RLS/SQL já existentes para `promocoes` e `promocao_produtos`. Se a gravação estiver bloqueada, a interface mostra o erro e não contorna as proteções.
- O aplicativo foi validado por inspeção e verificação sintática de JavaScript. Esta entrega não executa testes de ponta a ponta contra o Supabase nem publica automaticamente no GitHub/Vercel.

## Supabase e publicação

As funções e políticas descritas no projeto precisam existir no Supabase de destino. Não execute automaticamente os arquivos SQL em produção sem conferir o schema, gatilhos e políticas atuais. A versão deve ser testada com sessões reais de ambos os sócios antes de publicar.
