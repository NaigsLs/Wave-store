# Wave Store 2.0

Aplicativo web de gestão da Wave Store.

## Arquivos principais

- `index.html` — estrutura da interface, navegação e atalhos do painel.
- `app.js` — autenticação Supabase, estoque, vendas, caixa, compras, despesas, investimentos, relatórios e repasses.
- `logo.PNG` — logotipo do aplicativo.
- `sql/2026-10-repasses-cartao.sql` — registro das alterações SQL para taxa e repasses de cartão realizadas durante a sessão.

## Nova tela: Repasses de cartão

A tela fica em **Mais opções → Repasses de cartão** e também pode ser aberta pelo atalho do painel. Ela consulta os repasses da loja autenticada, mostra valores brutos, taxas, líquidos, previsão e situação, e permite confirmar repasses pendentes por meio da função RPC `confirmar_repasse_cartao`.

A confirmação só deve ser usada depois que o dinheiro realmente entrar na conta bancária. A função do Supabase valida a situação do repasse e evita uma segunda confirmação.

## Supabase

A integração pressupõe que existam a tabela `public.repasses_cartao`, a política RLS `ws_repasses_consulta`, a função `public.confirmar_repasse_cartao(uuid)` e os campos referenciados no SQL de integração.

O arquivo SQL documenta as funções e os gatilhos aplicados durante a sessão. Como essas alterações já foram executadas e testadas no ambiente atual, não execute o arquivo automaticamente em outro ambiente sem conferir o schema e os nomes das colunas primeiro.

## Publicação

Publique os arquivos deste projeto no repositório GitHub conectado ao Vercel. Depois da publicação, valide login, consulta de repasses e confirmação com uma sessão autenticada de cada sócio.

> A validação da interface foi feita por inspeção do código e verificação sintática de JavaScript. A confirmação real de funcionamento no navegador/ambiente publicado ainda precisa ser testada após a implantação.
