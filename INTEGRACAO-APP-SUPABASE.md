# Mapa de integração Wave Store 2.0 ↔ Supabase

Este documento registra como o aplicativo usa o schema existente. Não é uma migração SQL e não altera o banco.

| Recurso no aplicativo | Tabelas / RPCs usadas | Observação |
|---|---|---|
| Login e loja | Auth, `socios` | A sessão autenticada determina o usuário. |
| Produtos | `produtos`, `movimentos_estoque` | Estoque inicial protegido; edição apenas dos campos autorizados. |
| Carrinho e promoções | `produtos`, `promocoes`, `promocao_produtos`, `finalizar_carrinho_com_vendedor` | O vendedor escolhe os kits; servidor valida total e estoque. A interface também edita preço de item via `editar_preco_item_venda` e aplica desconto via `aplicar_desconto_venda`. |
| Reservas | `reservas`, `criar_reserva_segura`, `cancelar_reserva`, `finalizar_venda_reserva` | Reservas ativas reduzem disponibilidade; o servidor valida novamente. |
| Compras | `registrar_compra_lote`, `compras_lotes`, `itens_compra_lote`, `movimentos_estoque`, `movimentos_caixa` | Compra registrada pela função transacional existente. |
| Recebimentos normais | `receber_venda`, `recebimentos`, `movimentos_caixa` | Crédito não entra no caixa bancário até confirmar o repasse. |
| Parcelas | `criar_parcelas_venda`, `parcelas_receber`, `pagamentos_parcelas`, `receber_parcela` | Pagamentos parciais são registrados pela RPC. |
| Devoluções | `ws_abrir_devolucao`, `ws_adicionar_item_devolucao`, `ws_concluir_devolucao`, `trocas_devolucoes`, `itens_troca_devolucao` | O fluxo exige itens da venda original e valida o reembolso no servidor. |
| Despesas e investimentos | `despesas`, `investimentos`, `socios` | RLS limita registros à loja e sócio autenticados. |
| Repasses | `repasses_cartao`, `confirmar_repasse_cartao` | RLS de consulta por loja; confirmação via RPC `SECURITY DEFINER`. |
| Caixa e relatórios | `movimentos_caixa`, `vendas`, `itens_venda`, demais tabelas consultadas nos relatórios | Relatórios refletem os registros visíveis ao usuário. |

## Antes da publicação

1. Validar os nomes e permissões das tabelas/RPCs no projeto Supabase de destino.
2. Testar login de cada sócio e garantir isolamento por loja.
3. Testar produto inativo, estoque reservado, promoção, reserva, recebimento normal, parcela, compra, devolução e repasse.
4. Não confirmar repasses fictícios e não usar vendas falsas no banco de produção.
5. O fluxo completo de troca ainda requer RPCs seguras específicas; o app não faz inserts diretos nas tabelas de troca.
