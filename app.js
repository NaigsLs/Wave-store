
const SUPABASE_URL = "https://xanwtxykldbyxdhdtfbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_NAmaxDUR8yEknMHLb64JnQ_YEfNCX4p";

(async function () {
  const home = document.getElementById("home");
  const nav = document.getElementById("nav");
  const sections = ["home", "sell", "stock", "receive", "more"];

  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function money(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function cents(n) {
    return Math.round(Number(n || 0) * 100);
  }

  function message(text) {
    home.innerHTML = `<div class="card"><p>${safe(text)}</p></div>`;
  }

  function activateTab(tab) {
    sections.forEach(id => {
      document.getElementById(id)?.classList.toggle(
        "hidden",
        id !== tab
      );
    });

    document.querySelectorAll("#nav button").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });
  }

  message("Conectando ao Wave Store...");

  try {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );

    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    let atualizarRecebimentos = null;

    function showLogin(error = "") {
      atualizarRecebimentos = null;
      nav.classList.add("hidden");

      sections.forEach(id => {
        document.getElementById(id)?.classList.add("hidden");
      });

      home.classList.remove("hidden");

      home.innerHTML = `
        <h2>Entrar no Wave Store</h2>
        <div class="card">
          <form id="loginForm">
            <label>E-mail</label>
            <input id="email" type="email" required
              autocomplete="username">

            <label>Senha</label>
            <input id="password" type="password" required
              autocomplete="current-password">

            <button type="submit">Entrar</button>
          </form>
          <p id="loginError" class="tiny"></p>
        </div>`;

      document.getElementById("loginError").textContent = error;

      document.getElementById("loginForm").onsubmit = async e => {
        e.preventDefault();

        const errorBox = document.getElementById("loginError");
        errorBox.textContent = "Entrando...";

        const { error: loginError } =
          await db.auth.signInWithPassword({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value
          });

        if (loginError) {
          errorBox.textContent =
            "Não foi possível entrar. Confira e-mail e senha.";
          return;
        }

        await showApp();
      };
    }

    async function showApp(tab = "home") {
      const { data: authData, error: authError } =
        await db.auth.getUser();

      const user = authData?.user;

      if (authError || !user) {
        showLogin();
        return;
      }

      const { data: socio, error: socioError } = await db
        .from("socios")
        .select("nome,loja_id")
        .eq("usuario_id", user.id)
        .limit(1)
        .maybeSingle();

      if (socioError || !socio) {
        nav.classList.add("hidden");

        message(
          socioError
            ? "Erro Supabase: " + socioError.message
            : "Sua conta ainda não tem acesso à loja."
        );
        return;
      }

      let productList = [];
      let saldos = {};
      let promocoes = [];
      let promoProdutos = [];

      const carrinho = new Map();
      const kitsSelecionados = new Map();

      const stockSection = document.getElementById("stock");

      stockSection.innerHTML = `
        <h2>Estoque de produtos</h2>

        <div class="card">
          <h2>Adicionar produto</h2>

          <form id="produtoForm">
            <label>Código do produto</label>
            <input name="codigo" required
              placeholder="Ex.: CAM001">

            <label>Categoria</label>
            <select name="categoria" required>
              <option value="">Selecione</option>
              <option>Camiseta</option>
              <option>Tênis</option>
              <option>Perfume</option>
              <option>Conjunto</option>
              <option>Bermuda</option>
              <option>Outro</option>
            </select>

            <label>Nome do produto</label>
            <input name="nome" required
              placeholder="Ex.: Camiseta Nike">

            <label>Variação (opcional)</label>
            <input name="variacao"
              placeholder="Ex.: Preto / G">

            <label>Preço de custo (R$)</label>
            <input name="custo" type="number"
              min="0" step="0.01" required>

            <label>Preço de venda (R$)</label>
            <input name="preco" type="number"
              min="0" step="0.01" required>

            <label>Quantidade inicial</label>
            <input name="estoque_inicial" type="number"
              min="0" step="1" required>

            <button type="submit">Salvar produto</button>
            <p id="produtoMensagem" class="tiny"></p>
          </form>
        </div>

        <h2>Produtos cadastrados</h2>
        <div class="card" id="listaProdutos">
          Carregando...
        </div>`;

      const listaProdutos =
        document.getElementById("listaProdutos");

      async function carregarProdutos() {
        const { data, error } = await db
          .from("produtos")
          .select(
            "id,codigo,nome,categoria,variacao,custo,preco,estoque_inicial"
          )
          .eq("loja_id", socio.loja_id)
          .order("nome");

        if (error) {
          listaProdutos.textContent = "Erro: " + error.message;
          return false;
        }

        const { data: movimentos, error: erroMovimentos } =
          await db
            .from("movimentos_estoque")
            .select("produto_id,tipo,quantidade")
            .eq("loja_id", socio.loja_id);

        if (erroMovimentos) {
          listaProdutos.textContent =
            "Erro ao consultar estoque: " +
            erroMovimentos.message;
          return false;
        }

        productList = data || [];
        saldos = {};

        for (const p of productList) {
          saldos[p.id] = Number(p.estoque_inicial || 0);
        }

        for (const m of movimentos || []) {
          if (saldos[m.produto_id] === undefined) continue;

          if (m.tipo === "entrada") {
            saldos[m.produto_id] += Number(m.quantidade);
          }

          if (m.tipo === "saida") {
            saldos[m.produto_id] -= Number(m.quantidade);
          }
        }

        listaProdutos.innerHTML = productList.length
          ? productList.map(p => `
              <div class="item">
                <strong>${safe(p.nome)}</strong>

                <div class="tiny muted">
                  ${safe(p.codigo)}
                  • ${safe(p.categoria)}
                  ${p.variacao
                    ? " • " + safe(p.variacao)
                    : ""}
                </div>

                <div class="accent">
                  ${money(p.preco)}
                </div>

                <small>
                  Estoque disponível:
                  ${saldos[p.id]} unidades
                </small>
              </div>
            `).join("")
          : "<p>Nenhum produto cadastrado.</p>";

        return true;
      }

      async function carregarPromocoes() {
        const { data: ps, error: pe } = await db
          .from("promocoes")
          .select("id,nome,quantidade,preco_total,ativa")
          .eq("loja_id", socio.loja_id)
          .eq("ativa", true);

        const { data: pp, error: ppe } = await db
          .from("promocao_produtos")
          .select("promocao_id,produto_id")
          .eq("loja_id", socio.loja_id);

        if (pe || ppe) {
          promocoes = [];
          promoProdutos = [];

          document.getElementById("promoAviso")
            .textContent =
              "Não foi possível carregar as promoções: " +
              (pe || ppe).message;

          return;
        }

        promocoes = ps || [];
        promoProdutos = pp || [];

        document.getElementById("promoAviso")
          .textContent = "";
      }

      const sellSection = document.getElementById("sell");

      sellSection.innerHTML = `
        <h2>Registrar venda</h2>

        <div class="card">
          <h3>Adicionar ao carrinho</h3>

          <label>Produto</label>
          <select id="vendaProduto">
            <option value="">
              Selecione um produto
            </option>
          </select>

          <label>Quantidade</label>
          <input id="vendaQuantidade"
            type="number" min="1" step="1" value="1">

          <button type="button" id="adicionarCarrinho">
            Adicionar produto
          </button>

          <p id="carrinhoAviso" class="tiny"></p>
        </div>

        <div class="card">
          <h3>Meu carrinho</h3>

          <div id="itensCarrinho">
            <p class="muted">
              Nenhum produto adicionado.
            </p>
          </div>

          <div id="promocoesCarrinho"></div>
          <p id="promoAviso" class="tiny muted"></p>

          <div id="totalCarrinho">
            <strong>Total: ${money(0)}</strong>
          </div>
        </div>

        <div class="card">
          <label>Cliente (opcional)</label>
          <input id="vendaCliente"
            placeholder="Nome do cliente">

          <label>Forma de pagamento prevista</label>
          <select id="vendaPagamento">
            <option value="pendente">
              A definir / receber depois
            </option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="debito">
              Cartão de débito
            </option>
            <option value="credito">
              Cartão de crédito
            </option>
            <option value="fiado">Fiado</option>
          </select>

          <p class="tiny muted">
            A venda será registrada como pendente.
            A forma de pagamento prevista não será salva.
            Depois de finalizar, abra Recebimentos
            para registrar o pagamento confirmado.
          </p>

          <button type="button" id="finalizarVenda">
            Finalizar carrinho
          </button>

          <p id="vendaMensagem" class="tiny"></p>
        </div>

        <p class="muted tiny">
          Vendedor: ${safe(socio.nome)}.
          Identificado automaticamente pela conta conectada.
        </p>`;

      const vendaProduto =
        document.getElementById("vendaProduto");

      const vendaMensagem =
        document.getElementById("vendaMensagem");

      const carrinhoAviso =
        document.getElementById("carrinhoAviso");

      const finalizarBotao =
        document.getElementById("finalizarVenda");

      function carregarProdutosVenda() {
        vendaProduto.replaceChildren(
          new Option("Selecione um produto", "")
        );

        for (const p of productList) {
          vendaProduto.add(
            new Option(
              `${p.nome}${p.variacao
                ? " - " + p.variacao
                : ""} - ${money(p.preco)} (estoque: ${saldos[p.id]})`,
              p.id
            )
          );
        }
      }

      function itensPayload() {
        return [...carrinho].map(
          ([produto_id, quantidade]) => ({
            produto_id,
            quantidade
          })
        );
      }

      function kitsPayload() {
        const kits = [];

        // Controla o uso de cada produto entre
        // todas as promoções selecionadas.
        const restantesGerais = new Map(carrinho);

        for (const [id, quantidadeKits] of kitsSelecionados) {
          const promo = promocoes.find(p => p.id === id);

          if (!promo || !quantidadeKits) continue;

          const elegiveis = productList.filter(p =>
            carrinho.has(p.id) &&
            promoProdutos.some(pp =>
              pp.promocao_id === id &&
              pp.produto_id === p.id
            )
          );

          for (let k = 0; k < quantidadeKits; k++) {
            let faltam = Number(promo.quantidade);
            const itens = [];

            for (const p of elegiveis) {
              const disponivel =
                restantesGerais.get(p.id) || 0;

              const pegar = Math.min(
                disponivel,
                faltam
              );

              if (pegar > 0) {
                itens.push({
                  produto_id: p.id,
                  quantidade: pegar
                });

                restantesGerais.set(
                  p.id,
                  disponivel - pegar
                );

                faltam -= pegar;
              }

              if (!faltam) break;
            }

            if (faltam) {
              throw new Error(
                "Não há produtos elegíveis suficientes " +
                "para todos os kits selecionados."
              );
            }

            kits.push({
              promocao_id: id,
              itens
            });
          }
        }

        return kits;
      }

      function estimarTotal() {
        let total = 0;

        for (const [id, quantidade] of carrinho) {
          const p = productList.find(x => x.id === id);
          total += cents(p?.preco) * quantidade;
        }

        for (const kit of kitsPayload()) {
          const promo = promocoes.find(
            p => p.id === kit.promocao_id
          );

          let precoOriginal = 0;

          for (const item of kit.itens) {
            const p = productList.find(
              x => x.id === item.produto_id
            );

            precoOriginal +=
              cents(p.preco) * item.quantidade;
          }

          if (cents(promo.preco_total) > precoOriginal) {
            throw new Error(
              "O valor da promoção é maior que " +
              "o preço normal do kit."
            );
          }

          total +=
            cents(promo.preco_total) - precoOriginal;
        }

        return total / 100;
      }

      function renderCarrinho() {
        const container =
          document.getElementById("itensCarrinho");

        container.innerHTML = carrinho.size
          ? [...carrinho].map(([id, quantidade]) => {
              const p = productList.find(x => x.id === id);

              if (!p) return "";

              return `
                <div class="item">
                  <strong>
                    ${safe(p.nome)}
                    ${safe(p.variacao || "")}
                  </strong>

                  <div class="tiny">
                    ${quantidade} × ${money(p.preco)}
                    = ${money(Number(p.preco) * quantidade)}
                  </div>

                  <button type="button" class="secondary"
                    data-remove="${safe(id)}">
                    Remover
                  </button>
                </div>`;
            }).join("")
          : `<p class="muted">
              Nenhum produto adicionado.
            </p>`;

        container
          .querySelectorAll("[data-remove]")
          .forEach(btn => {
            btn.onclick = () => {
              carrinho.delete(btn.dataset.remove);
              kitsSelecionados.clear();
              renderCarrinho();
            };
          });

        const promos =
          document.getElementById("promocoesCarrinho");

        promos.innerHTML = promocoes.length
          ? `<h3>Promoções (opcional)</h3>` +
            promocoes.map(p => {
              const elegiveis = productList.filter(prod =>
                carrinho.has(prod.id) &&
                promoProdutos.some(pp =>
                  pp.promocao_id === p.id &&
                  pp.produto_id === prod.id
                )
              );

              const totalElegivel = elegiveis.reduce(
                (s, prod) => s + carrinho.get(prod.id),
                0
              );

              const max = Math.floor(
                totalElegivel / Number(p.quantidade)
              );

              const atual = Math.min(
                kitsSelecionados.get(p.id) || 0,
                max
              );

              if (
                atual !== (kitsSelecionados.get(p.id) || 0)
              ) {
                kitsSelecionados.set(p.id, atual);
              }

              return `
                <div class="item">
                  <strong>${safe(p.nome)}</strong>

                  <div class="tiny">
                    ${p.quantidade} unidades por
                    ${money(p.preco_total)}
                    • kits possíveis: ${max}
                  </div>

                  <label>
                    Quantidade de kits para aplicar
                  </label>

                  <input type="number"
                    min="0" max="${max}" step="1"
                    value="${atual}"
                    data-promo="${safe(p.id)}">
                </div>`;
            }).join("")
          : `<p class="tiny muted">
              Nenhuma promoção ativa.
              Os produtos serão vendidos pelo preço normal.
            </p>`;

        promos
          .querySelectorAll("[data-promo]")
          .forEach(input => {
            input.onchange = () => {
              const q = Number(input.value);

              if (
                !Number.isInteger(q) ||
                q < 0 ||
                q > Number(input.max)
              ) {
                carrinhoAviso.textContent =
                  "Quantidade de kits inválida.";
                renderCarrinho();
                return;
              }

              kitsSelecionados.set(
                input.dataset.promo,
                q
              );

              renderCarrinho();
            };
          });

        try {
          const total = estimarTotal();

          document.getElementById("totalCarrinho")
            .innerHTML = `
              <strong>
                Total estimado: ${money(total)}
              </strong>`;

          carrinhoAviso.textContent = "";
          finalizarBotao.disabled = false;
        } catch (err) {
          document.getElementById("totalCarrinho")
            .textContent =
              "Não foi possível calcular o total.";

          carrinhoAviso.textContent = err.message;
          finalizarBotao.disabled = true;
        }
      }

      async function carregarPainel() {
        const { data: vendas, error } = await db
          .from("vendas")
          .select("id")
          .eq("loja_id", socio.loja_id)
          .order("criado_em", { ascending: false })
          .limit(20);

        home.innerHTML = `
          <h2>Olá, ${safe(socio.nome)}!</h2>

          <div class="grid">
            <div class="card">
              <small>Produtos cadastrados</small>
              <div class="num">
                ${productList.length}
              </div>
            </div>

            <div class="card">
              <small>Vendas recentes</small>
              <div class="num">
                ${error ? "—" : (vendas || []).length}
              </div>
            </div>
          </div>

          <p class="muted tiny">
            Dados consultados diretamente no Supabase.
            Vendas recentes: até 20 registros.
          </p>`;
      }

      await carregarProdutos();
      carregarProdutosVenda();
      await carregarPromocoes();
      renderCarrinho();

      document.getElementById("adicionarCarrinho")
        .onclick = () => {
          const id = vendaProduto.value;

          const quantidade = Number(
            document.getElementById("vendaQuantidade").value
          );

          if (
            !id ||
            !Number.isInteger(quantidade) ||
            quantidade < 1
          ) {
            carrinhoAviso.textContent =
              "Selecione um produto e uma quantidade válida.";
            return;
          }

          const novoTotal =
            (carrinho.get(id) || 0) + quantidade;

          if (novoTotal > (saldos[id] || 0)) {
            carrinhoAviso.textContent =
              "Estoque insuficiente. Disponível: " +
              (saldos[id] || 0);
            return;
          }

          carrinho.set(id, novoTotal);

          document.getElementById("vendaQuantidade")
            .value = "1";

          renderCarrinho();
        };

      document.getElementById("produtoForm")
        .onsubmit = async e => {
          e.preventDefault();

          const form = e.currentTarget;
          const msg =
            document.getElementById("produtoMensagem");

          const botao =
            form.querySelector('button[type="submit"]');

          const campos = new FormData(form);

          botao.disabled = true;
          msg.textContent = "Salvando produto...";

          const produto = {
            loja_id: socio.loja_id,
            codigo: String(
              campos.get("codigo")
            ).trim(),
            categoria: String(
              campos.get("categoria")
            ).trim(),
            nome: String(
              campos.get("nome")
            ).trim(),
            variacao: String(
              campos.get("variacao")
            ).trim() || null,
            custo: Number(campos.get("custo")),
            preco: Number(campos.get("preco")),
            estoque_inicial: Number(
              campos.get("estoque_inicial")
            )
          };

          try {
            const { error } = await db
              .from("produtos")
              .insert(produto);

            if (error) {
              msg.textContent =
                "Erro: " + error.message;
              return;
            }

            form.reset();

            msg.textContent =
              "Produto cadastrado com sucesso!";

            if (await carregarProdutos()) {
              carregarProdutosVenda();
            }

            await carregarPainel();

          } catch (err) {
            msg.textContent =
              "Erro: " + err.message;
          } finally {
            botao.disabled = false;
          }
        };

      finalizarBotao.onclick = async () => {
        if (!carrinho.size) {
          vendaMensagem.textContent =
            "Adicione um produto ao carrinho.";
          return;
        }

        let kits;

        try {
          kits = kitsPayload();
          estimarTotal();
        } catch (err) {
          vendaMensagem.textContent = err.message;
          return;
        }

        if (!confirm(
          "Registrar esta venda como PENDENTE? " +
          "Nenhum pagamento será lançado automaticamente no caixa."
        )) {
          return;
        }

        finalizarBotao.disabled = true;
        vendaMensagem.textContent =
          "Registrando venda...";

        try {
          const { data: vendaId, error } =
            await db.rpc("finalizar_carrinho", {
              p_itens: itensPayload(),
              p_kits: kits,
              p_cliente:
                document.getElementById("vendaCliente")
                  .value.trim() || null
            });

          if (error) {
            vendaMensagem.textContent =
              "Não foi possível registrar a venda: " +
              error.message;
            return;
          }

          carrinho.clear();
          kitsSelecionados.clear();

          document.getElementById("vendaCliente")
            .value = "";

          document.getElementById("vendaPagamento")
            .value = "pendente";

          vendaMensagem.textContent =
            "Venda registrada como PENDENTE! " +
            "Código: " + vendaId +
            ". Abra Recebimentos para registrar o pagamento.";

          if (await carregarProdutos()) {
            carregarProdutosVenda();
          }

          await carregarPromocoes();
          renderCarrinho();
          await carregarPainel();

        } catch (err) {
          vendaMensagem.textContent =
            "Erro ao registrar: " + err.message;
        } finally {
          finalizarBotao.disabled = false;
        }
      };

      // ======================================
      // ABA RECEBIMENTOS
      // ======================================

      const receiveSection =
        document.getElementById("receive");

      receiveSection.innerHTML = `
        <h2>Recebimentos</h2>

        <div class="card">
          <button type="button"
            id="atualizarRecebimentos"
            class="secondary">
            Atualizar vendas
          </button>

          <p id="recebimentosAviso" class="tiny"></p>
        </div>

        <div id="listaRecebimentos">
          <div class="card">
            Carregando vendas...
          </div>
        </div>

        <div class="card">
          <h3>Registrar pagamento</h3>

          <p id="vendaSelecionadaInfo"
            class="tiny muted">
            Selecione uma venda na lista.
          </p>

          <form id="recebimentoForm">
            <label>Valor recebido (R$)</label>
            <input id="recebimentoValor"
              type="number"
              min="0.01"
              step="0.01"
              required>

            <label>Forma de pagamento</label>
            <select id="recebimentoForma" required>
              <option value="dinheiro">
                Dinheiro
              </option>
              <option value="pix">Pix</option>
              <option value="debito">
                Cartão de débito
              </option>
              <option value="credito">
                Cartão de crédito
              </option>
            </select>

            <label>Taxa da operadora (R$)</label>
            <input id="recebimentoTaxa"
              type="number"
              min="0"
              step="0.01"
              value="0"
              required>

            <p class="tiny muted">
              Registre dinheiro e Pix somente
              após confirmar o pagamento.
              Registre débito somente quando
              o valor estiver disponível no banco.
              Crédito não aumenta o saldo bancário
              automaticamente; o repasse da operadora
              será controlado separadamente.
            </p>

            <button type="submit"
              id="salvarRecebimento"
              disabled>
              Registrar pagamento
            </button>

            <p id="recebimentoMensagem"
              class="tiny"></p>
          </form>
        </div>`;

      let vendaSelecionada = null;
      let saldoSelecionadoCentavos = 0;

      const listaRecebimentos =
        document.getElementById("listaRecebimentos");

      const recebimentosAviso =
        document.getElementById("recebimentosAviso");

      const recebimentoMensagem =
        document.getElementById("recebimentoMensagem");

      const salvarRecebimento =
        document.getElementById("salvarRecebimento");

      async function carregarRecebimentos() {
        vendaSelecionada = null;
        saldoSelecionadoCentavos = 0;
        salvarRecebimento.disabled = true;

        document.getElementById("vendaSelecionadaInfo")
          .textContent =
            "Selecione uma venda na lista.";

        recebimentosAviso.textContent =
          "Consultando vendas...";

        listaRecebimentos.innerHTML = "";

        const { data: vendas, error } = await db
          .from("vendas")
          .select(
            "id,cliente,valor_total,situacao,criado_em"
          )
          .eq("loja_id", socio.loja_id)
          .in("situacao", ["pendente", "parcial"])
          .order("criado_em", {
            ascending: false
          })
          .limit(100);

        if (error) {
          recebimentosAviso.textContent =
            "Erro ao consultar vendas: " +
            error.message;
          return;
        }

        if (!vendas?.length) {
          recebimentosAviso.textContent = "";

          listaRecebimentos.innerHTML = `
            <div class="card">
              <p>
                Não há vendas pendentes
                ou parcialmente pagas.
              </p>
            </div>`;
          return;
        }

        recebimentosAviso.textContent =
          "Selecione uma venda para consultar o saldo atualizado.";

        listaRecebimentos.innerHTML =
          vendas.map(v => `
            <div class="card">
              <strong>
                ${safe(v.cliente || "Cliente não informado")}
              </strong>

              <p class="tiny muted">
                ${safe(
                  new Date(v.criado_em)
                    .toLocaleString("pt-BR")
                )}
                • ${safe(v.situacao)}
              </p>

              <p>
                Total da venda:
                <strong>
                  ${money(v.valor_total)}
                </strong>
              </p>

              <button type="button"
                class="secondary"
                data-venda="${safe(v.id)}">
                Consultar saldo / Receber
              </button>
            </div>
          `).join("");

        listaRecebimentos
          .querySelectorAll("[data-venda]")
          .forEach(botao => {
            botao.onclick = async () => {
              const id = botao.dataset.venda;
              const venda = vendas.find(
                v => v.id === id
              );

              if (!venda) return;

              vendaSelecionada = null;
              salvarRecebimento.disabled = true;

              recebimentoMensagem.textContent =
                "Conferindo o saldo da venda...";

              const {
                data: parcelas,
                error: erroParcelas
              } = await db
                .from("parcelas_receber")
                .select("id")
                .eq("loja_id", socio.loja_id)
                .eq("venda_id", id)
                .limit(1);

              if (erroParcelas) {
                recebimentoMensagem.textContent =
                  "Não foi possível verificar as parcelas: " +
                  erroParcelas.message;
                return;
              }

              if (parcelas?.length) {
                recebimentoMensagem.textContent =
                  "Esta venda possui parcelas cadastradas. " +
                  "O recebimento deverá ser feito " +
                  "pela função específica de parcelas.";
                return;
              }

              const {
                data: vendaAtual,
                error: erroVenda
              } = await db
                .from("vendas")
                .select(
                  "id,valor_total,situacao"
                )
                .eq("loja_id", socio.loja_id)
                .eq("id", id)
                .single();

              if (erroVenda || !vendaAtual) {
                recebimentoMensagem.textContent =
                  "Não foi possível consultar a venda atualizada.";
                return;
              }

              if (
                !["pendente", "parcial"]
                  .includes(vendaAtual.situacao)
              ) {
                recebimentoMensagem.textContent =
                  "Esta venda já não está disponível para recebimento.";
                return;
              }

              const {
                data: pagamentos,
                error: erroPagamentos
              } = await db
                .from("recebimentos")
                .select("valor")
                .eq("loja_id", socio.loja_id)
                .eq("venda_id", id)
                .limit(1000);

              if (erroPagamentos) {
                recebimentoMensagem.textContent =
                  "Erro ao consultar pagamentos: " +
                  erroPagamentos.message;
                return;
              }

              if (pagamentos.length === 1000) {
                recebimentoMensagem.textContent =
                  "Esta venda possui muitos recebimentos. " +
                  "Confira o saldo antes de registrar outro.";
                return;
              }

              const totalCentavos =
                cents(vendaAtual.valor_total);

              const pagoCentavos =
                pagamentos.reduce(
                  (soma, p) =>
                    soma + cents(p.valor),
                  0
                );

              const saldoCentavos =
                totalCentavos - pagoCentavos;

              if (saldoCentavos <= 0) {
                recebimentoMensagem.textContent =
                  "Esta venda não possui saldo pendente.";
                return;
              }

              vendaSelecionada = id;
              saldoSelecionadoCentavos =
                saldoCentavos;

              document.getElementById(
                "vendaSelecionadaInfo"
              ).innerHTML = `
                <strong>
                  ${safe(
                    venda.cliente ||
                    "Cliente não informado"
                  )}
                </strong>

                <p>
                  Total:
                  ${money(totalCentavos / 100)}
                </p>

                <p>
                  Já recebido:
                  ${money(pagoCentavos / 100)}
                </p>

                <p>
                  <strong>
                    Falta receber:
                    ${money(saldoCentavos / 100)}
                  </strong>
                </p>`;

              document.getElementById(
                "recebimentoValor"
              ).value =
                (saldoCentavos / 100).toFixed(2);

              document.getElementById(
                "recebimentoTaxa"
              ).value = "0";

              recebimentoMensagem.textContent = "";
              salvarRecebimento.disabled = false;

              document.getElementById(
                "recebimentoForm"
              ).scrollIntoView({
                behavior: "smooth",
                block: "start"
              });
            };
          });
      }

      atualizarRecebimentos =
        carregarRecebimentos;

      document.getElementById(
        "atualizarRecebimentos"
      ).onclick = carregarRecebimentos;

      document.getElementById(
        "recebimentoForm"
      ).onsubmit = async e => {
        e.preventDefault();

        if (!vendaSelecionada) {
          recebimentoMensagem.textContent =
            "Selecione uma venda primeiro.";
          return;
        }

        const valor = Number(
          document.getElementById(
            "recebimentoValor"
          ).value
        );

        const taxa = Number(
          document.getElementById(
            "recebimentoTaxa"
          ).value
        );

        const forma =
          document.getElementById(
            "recebimentoForma"
          ).value;

        const valorCentavos = cents(valor);
        const taxaCentavos = cents(taxa);

        if (
          !Number.isFinite(valor) ||
          !Number.isFinite(taxa) ||
          valorCentavos <= 0 ||
          taxaCentavos < 0 ||
          taxaCentavos > valorCentavos ||
          valorCentavos > saldoSelecionadoCentavos
        ) {
          recebimentoMensagem.textContent =
            "Confira o valor, a taxa e o saldo pendente.";
          return;
        }

        if (!confirm(
          `Confirmar recebimento de ${money(valor)} ` +
          `em ${forma}?`
        )) {
          return;
        }

        salvarRecebimento.disabled = true;

        recebimentoMensagem.textContent =
          "Registrando pagamento...";

        try {
          const { error } = await db.rpc(
            "receber_venda",
            {
              p_venda_id: vendaSelecionada,
              p_valor: valorCentavos / 100,
              p_forma: forma,
              p_taxa: taxaCentavos / 100
            }
          );

          if (error) {
            recebimentoMensagem.textContent =
              "Pagamento não confirmado: " +
              error.message;

            salvarRecebimento.disabled = false;
            return;
          }

          await carregarRecebimentos();
          await carregarPainel();

          recebimentoMensagem.textContent =
            "Pagamento registrado com sucesso!";

          alert(
            "Pagamento registrado com sucesso!"
          );

        } catch (err) {
          recebimentoMensagem.textContent =
            "Erro: " + err.message;

          salvarRecebimento.disabled = false;
        }
      };

      await carregarRecebimentos();
      await carregarPainel();

      // ======================================
      // MINHA CONTA
      // ======================================

      document.getElementById("more").innerHTML = `
        <h2>Minha conta</h2>

        <div class="card">
          <p>
            <strong>${safe(socio.nome)}</strong>
          </p>

          <p class="muted">
            ${safe(user.email)}
          </p>

          <button id="logout" class="secondary">
            Sair da conta
          </button>
        </div>`;

      document.getElementById("logout")
        .onclick = async () => {
          await db.auth.signOut();
          showLogin();
        };

      nav.classList.remove("hidden");
      activateTab(tab);
    }

    document.querySelectorAll("#nav button")
      .forEach(button => {
        button.onclick = async () => {
          const tab = button.dataset.tab;

          activateTab(tab);

          if (
            tab === "receive" &&
            atualizarRecebimentos
          ) {
            await atualizarRecebimentos();
          }
        };
      });

    const { data: sessionData } =
      await db.auth.getSession();

    if (sessionData.session) {
      await showApp();
    } else {
      showLogin();
    }

  } catch (error) {
    console.error(error);

    message(
      "Erro ao conectar: " + error.message
    );
  }
})();
