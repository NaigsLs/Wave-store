
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

  function dataBR(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleString("pt-BR");
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
    let atualizarInvestimentos = null;
    let atualizarPainel = null;
    let abrirMenuMais = null;

    function showLogin(error = "") {
      atualizarRecebimentos = null;
      atualizarInvestimentos = null;
      atualizarPainel = null;
      abrirMenuMais = null;

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
            <input
              id="email"
              type="email"
              required
              autocomplete="username"
            >

            <label>Senha</label>
            <input
              id="password"
              type="password"
              required
              autocomplete="current-password"
            >

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

      // ======================================
      // ESTOQUE
      // ======================================

      const stockSection = document.getElementById("stock");

      stockSection.innerHTML = `
        <h2>Estoque de produtos</h2>

        <div class="card">
          <h3>Adicionar produto</h3>

          <form id="produtoForm">
            <label>Código do produto</label>
            <input
              name="codigo"
              required
              placeholder="Ex.: CAM001"
            >

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
            <input
              name="nome"
              required
              placeholder="Ex.: Camiseta Nike"
            >

            <label>Variação (opcional)</label>
            <input
              name="variacao"
              placeholder="Ex.: Preto / G"
            >

            <label>Preço de custo (R$)</label>
            <input
              name="custo"
              type="number"
              min="0"
              step="0.01"
              required
            >

            <label>Preço de venda (R$)</label>
            <input
              name="preco"
              type="number"
              min="0"
              step="0.01"
              required
            >

            <label>Quantidade inicial</label>
            <input
              name="estoque_inicial"
              type="number"
              min="0"
              step="1"
              required
            >

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

                <div class="accent">${money(p.preco)}</div>

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

          document.getElementById("promoAviso").textContent =
            "Não foi possível carregar as promoções: " +
            (pe || ppe).message;

          return;
        }

        promocoes = ps || [];
        promoProdutos = pp || [];

        document.getElementById("promoAviso").textContent = "";
      }

      // ======================================
      // VENDAS E CARRINHO
      // ======================================

      const sellSection = document.getElementById("sell");

      sellSection.innerHTML = `
        <h2>Registrar venda</h2>

        <div class="card">
          <h3>Adicionar ao carrinho</h3>

          <label>Produto</label>
          <select id="vendaProduto">
            <option value="">Selecione um produto</option>
          </select>

          <label>Quantidade</label>
          <input
            id="vendaQuantidade"
            type="number"
            min="1"
            step="1"
            value="1"
          >

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
          <input
            id="vendaCliente"
            placeholder="Nome do cliente"
          >

          <label>Forma de pagamento prevista</label>
          <select id="vendaPagamento">
            <option value="pendente">
              A definir / receber depois
            </option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="debito">Cartão de débito</option>
            <option value="credito">Cartão de crédito</option>
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

              const pegar = Math.min(disponivel, faltam);

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

                  <button
                    type="button"
                    class="secondary"
                    data-remove="${safe(id)}"
                  >
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

                  <input
                    type="number"
                    min="0"
                    max="${max}"
                    step="1"
                    value="${atual}"
                    data-promo="${safe(p.id)}"
                  >
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

      // ======================================
      // CAIXA - CONSULTA FINANCEIRA
      // ======================================

      async function buscarMovimentosCaixa() {
        const todos = [];
        const tamanhoPagina = 1000;
        let inicio = 0;

        while (true) {
          const { data, error } = await db
            .from("movimentos_caixa")
            .select(
              "id,tipo,conta,valor,descricao,criado_em"
            )
            .eq("loja_id", socio.loja_id)
            .order("criado_em", {
              ascending: false
            })
            .order("id", {
              ascending: false
            })
            .range(inicio, inicio + tamanhoPagina - 1);

          if (error) throw error;

          todos.push(...(data || []));

          if (!data || data.length < tamanhoPagina) {
            break;
          }

          inicio += tamanhoPagina;
        }

        return todos;
      }

      function calcularSaldosCaixa(movimentos) {
        const resultado = {
          banco: 0,
          dinheiro: 0,
          transferencias: 0
        };

        for (const m of movimentos) {
          const valor = cents(m.valor);

          if (
            m.conta !== "banco" &&
            m.conta !== "dinheiro"
          ) {
            continue;
          }

          if (m.tipo === "entrada") {
            resultado[m.conta] += valor;
          } else if (m.tipo === "saida") {
            resultado[m.conta] -= valor;
          } else if (m.tipo === "transferencia") {
            resultado.transferencias += 1;
          }
        }

        return resultado;
      }

      // ======================================
      // PAINEL INICIAL
      // ======================================

      async function carregarPainel() {
        home.innerHTML = `
          <h2>Olá, ${safe(socio.nome)}!</h2>

          <div class="card">
            Consultando saldos e vendas...
          </div>`;

        const [
          resultadoVendas,
          resultadoCaixa
        ] = await Promise.allSettled([
          db
            .from("vendas")
            .select("id")
            .eq("loja_id", socio.loja_id)
            .order("criado_em", {
              ascending: false
            })
            .limit(20),

          buscarMovimentosCaixa()
        ]);

        const vendas =
          resultadoVendas.status === "fulfilled"
            ? resultadoVendas.value
            : { data: null, error: { message: "Falha na consulta" } };

        let saldoBanco = "—";
        let saldoDinheiro = "—";
        let avisoCaixa = "";
        let avisoTransferencia = "";

        if (resultadoCaixa.status === "fulfilled") {
          const resumo = calcularSaldosCaixa(
            resultadoCaixa.value
          );

          saldoBanco = money(resumo.banco / 100);
          saldoDinheiro = money(resumo.dinheiro / 100);

          if (resumo.transferencias > 0) {
            avisoTransferencia =
              "Existem movimentos de transferência. " +
              "Eles precisam ser conferidos para garantir " +
              "que os saldos estejam completos.";
          }
        } else {
          avisoCaixa =
            "Não foi possível consultar o caixa: " +
            resultadoCaixa.reason.message;
        }

        home.innerHTML = `
          <h2>Olá, ${safe(socio.nome)}!</h2>

          <h3>Resumo financeiro</h3>

          <div class="grid">
            <div class="card">
              <small>Saldo bancário</small>
              <div class="num">${saldoBanco}</div>
            </div>

            <div class="card">
              <small>Dinheiro físico</small>
              <div class="num">${saldoDinheiro}</div>
            </div>
          </div>

          ${avisoCaixa
            ? `<p class="tiny">${safe(avisoCaixa)}</p>`
            : ""}

          ${avisoTransferencia
            ? `<p class="tiny">${safe(avisoTransferencia)}</p>`
            : ""}

          <div class="card">
            <button
              type="button"
              class="secondary"
              id="atualizarPainel"
            >
              Atualizar saldos
            </button>
          </div>

          <h3>Resumo da loja</h3>

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
                ${vendas.error
                  ? "—"
                  : (vendas.data || []).length}
              </div>
            </div>
          </div>

          <p class="muted tiny">
            Os saldos representam os lançamentos registrados
            no sistema, não uma consulta direta ao banco.
            Vendas recentes: até 20 registros.
          </p>`;

        document.getElementById("atualizarPainel")
          .onclick = carregarPainel;
      }

      atualizarPainel = carregarPainel;

      // ======================================
      // INICIALIZAÇÃO DE ESTOQUE E VENDAS
      // ======================================

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
      // RECEBIMENTOS
      // ======================================

      const receiveSection =
        document.getElementById("receive");

      receiveSection.innerHTML = `
        <h2>Recebimentos</h2>

        <div class="card">
          <button
            type="button"
            id="atualizarRecebimentos"
            class="secondary"
          >
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

          <p
            id="vendaSelecionadaInfo"
            class="tiny muted"
          >
            Selecione uma venda na lista.
          </p>

          <form id="recebimentoForm">
            <label>Valor recebido (R$)</label>
            <input
              id="recebimentoValor"
              type="number"
              min="0.01"
              step="0.01"
              required
            >

            <label>Forma de pagamento</label>
            <select id="recebimentoForma" required>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Cartão de débito</option>
              <option value="credito">Cartão de crédito</option>
            </select>

            <label>Taxa da operadora (R$)</label>
            <input
              id="recebimentoTaxa"
              type="number"
              min="0"
              step="0.01"
              value="0"
              required
            >

            <p class="tiny muted">
              Registre dinheiro e Pix somente
              após confirmar o pagamento.
              Registre débito somente quando
              o valor estiver disponível no banco.
              Crédito não aumenta o saldo bancário
              automaticamente; o repasse da operadora
              será controlado separadamente.
            </p>

            <button
              type="submit"
              id="salvarRecebimento"
              disabled
            >
              Registrar pagamento
            </button>

            <p id="recebimentoMensagem" class="tiny"></p>
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
                ${safe(dataBR(v.criado_em))}
                • ${safe(v.situacao)}
              </p>

              <p>
                Total da venda:
                <strong>${money(v.valor_total)}</strong>
              </p>

              <button
                type="button"
                class="secondary"
                data-venda="${safe(v.id)}"
              >
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
                .select("id,valor_total,situacao")
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
                  (soma, p) => soma + cents(p.valor),
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
              saldoSelecionadoCentavos = saldoCentavos;

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
                  Total: ${money(totalCentavos / 100)}
                </p>

                <p>
                  Já recebido: ${money(pagoCentavos / 100)}
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

      atualizarRecebimentos = carregarRecebimentos;

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

          alert("Pagamento registrado com sucesso!");

        } catch (err) {
          recebimentoMensagem.textContent =
            "Erro: " + err.message;

          salvarRecebimento.disabled = false;
        }
      };

      // ======================================
      // MAIS OPÇÕES - TELAS SEPARADAS
      // ======================================

      const moreSection = document.getElementById("more");

      moreSection.innerHTML = `
        <div id="menuMais">
          <h2>Mais opções</h2>

          <div class="card">
            <button type="button" data-abrir="despesas">
              Despesas
            </button>
          </div>

          <div class="card">
            <button type="button" data-abrir="investimentos">
              Investimentos dos sócios
            </button>
          </div>

          <div class="card">
            <button type="button" data-abrir="historico">
              Histórico do caixa
            </button>
          </div>

          <div class="card">
            <button type="button" data-abrir="relatorios">
              Relatórios e lucros
            </button>
          </div>

          <div class="card">
            <button type="button" data-abrir="conta">
              Minha conta
            </button>
          </div>
        </div>

        <div id="paginaMais" class="hidden">
          <button
            type="button"
            id="voltarMenuMais"
            class="secondary"
          >
            ← Voltar para Mais opções
          </button>

          <div id="conteudoMais"></div>
        </div>`;

      const menuMais =
        document.getElementById("menuMais");

      const paginaMais =
        document.getElementById("paginaMais");

      const conteudoMais =
        document.getElementById("conteudoMais");

      function voltarMais() {
        paginaMais.classList.add("hidden");
        menuMais.classList.remove("hidden");
        conteudoMais.innerHTML = "";
      }

      abrirMenuMais = voltarMais;

      document.getElementById("voltarMenuMais")
        .onclick = voltarMais;

      async function abrirPaginaMais(pagina) {
        menuMais.classList.add("hidden");
        paginaMais.classList.remove("hidden");

        conteudoMais.innerHTML = `
          <div class="card">Carregando...</div>`;

        if (pagina === "despesas") {
          montarPaginaDespesas();
        } else if (pagina === "investimentos") {
          montarPaginaInvestimentos();
          await carregarInvestimentos();
        } else if (pagina === "historico") {
          montarPaginaHistorico();
          await carregarHistorico();
        } else if (pagina === "relatorios") {
          montarPaginaRelatorios();
        } else if (pagina === "conta") {
          montarPaginaConta();
        }

        paginaMais.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      moreSection
        .querySelectorAll("[data-abrir]")
        .forEach(botao => {
          botao.onclick = () =>
            abrirPaginaMais(botao.dataset.abrir);
        });

      // ======================================
      // DESPESAS
      // ======================================

      function montarPaginaDespesas() {
        conteudoMais.innerHTML = `
          <h2>Despesas</h2>

          <div class="card">
            <h3>Registrar despesa</h3>

            <p class="tiny muted">
              Responsável:
              <strong>${safe(socio.nome)}</strong>
            </p>

            <form id="despesaForm">
              <label>Descrição da despesa</label>
              <input
                id="despesaDescricao"
                required
                maxlength="200"
                placeholder="Ex.: Embalagens"
              >

              <label>Categoria</label>
              <select id="despesaCategoria" required>
                <option value="">Selecione</option>
                <option value="Embalagens">Embalagens</option>
                <option value="Transporte">Transporte</option>
                <option value="Marketing">Marketing</option>
                <option value="Aluguel">Aluguel</option>
                <option value="Internet">Internet</option>
                <option value="Energia">Energia</option>
                <option value="Taxas">Taxas</option>
                <option value="Outros">Outros</option>
              </select>

              <label>Valor pago (R$)</label>
              <input
                id="despesaValor"
                type="number"
                min="0.01"
                step="0.01"
                required
              >

              <label>Conta utilizada</label>
              <select id="despesaConta" required>
                <option value="banco">Banco</option>
                <option value="dinheiro">Dinheiro físico</option>
              </select>

              <p class="tiny muted">
                Registre somente despesas já pagas.
                O valor será descontado automaticamente
                da conta escolhida.
              </p>

              <button
                type="submit"
                id="salvarDespesa"
              >
                Registrar despesa
              </button>

              <p id="despesaMensagem" class="tiny"></p>
            </form>
          </div>

          <div class="card">
            <h3>Despesas recentes</h3>

            <button
              type="button"
              class="secondary"
              id="atualizarDespesas"
            >
              Atualizar despesas
            </button>

            <div id="listaDespesas">
              Carregando...
            </div>
          </div>`;

        document.getElementById("atualizarDespesas")
          .onclick = carregarDespesas;

        document.getElementById("despesaForm")
          .onsubmit = registrarDespesa;

        carregarDespesas();
      }

      async function carregarDespesas() {
        const lista = document.getElementById(
          "listaDespesas"
        );

        if (!lista) return;

        lista.textContent = "Consultando despesas...";

        const { data, error } = await db
          .from("despesas")
          .select(
            "id,descricao,categoria,valor,conta,criado_em"
          )
          .eq("loja_id", socio.loja_id)
          .order("criado_em", {
            ascending: false
          })
          .limit(100);

        if (!document.getElementById("listaDespesas")) {
          return;
        }

        if (error) {
          lista.textContent =
            "Erro ao consultar despesas: " +
            error.message;
          return;
        }

        if (!data?.length) {
          lista.innerHTML =
            "<p>Nenhuma despesa registrada.</p>";
          return;
        }

        const total = data.reduce(
          (soma, d) => soma + cents(d.valor),
          0
        );

        lista.innerHTML = `
          <p class="tiny muted">
            Últimas ${data.length} despesas
          </p>

          <p>
            <strong>
              Total listado: ${money(total / 100)}
            </strong>
          </p>

          ${data.map(d => `
            <div class="item">
              <strong>${safe(d.descricao)}</strong>

              <div class="tiny muted">
                ${safe(d.categoria)}
                • ${d.conta === "banco"
                  ? "Banco"
                  : "Dinheiro"}
                • ${safe(dataBR(d.criado_em))}
              </div>

              <div class="accent">
                ${money(d.valor)}
              </div>
            </div>
          `).join("")}
        `;
      }

      async function registrarDespesa(e) {
        e.preventDefault();

        const form = e.currentTarget;
        const botao =
          document.getElementById("salvarDespesa");

        const mensagem =
          document.getElementById("despesaMensagem");

        const descricao =
          document.getElementById("despesaDescricao")
            .value.trim();

        const categoria =
          document.getElementById("despesaCategoria")
            .value;

        const conta =
          document.getElementById("despesaConta")
            .value;

        const valor = Number(
          document.getElementById("despesaValor").value
        );

        const valorCentavos = cents(valor);

        if (
          !descricao ||
          !categoria ||
          !["banco", "dinheiro"].includes(conta) ||
          !Number.isFinite(valor) ||
          valorCentavos <= 0
        ) {
          mensagem.textContent =
            "Preencha os dados com um valor válido.";
          return;
        }

        if (!confirm(
          `Confirmar despesa de ${money(
            valorCentavos / 100
          )} na conta ${conta}?`
        )) {
          return;
        }

        botao.disabled = true;
        mensagem.textContent = "Registrando despesa...";

        try {
          const { error } = await db
            .from("despesas")
            .insert({
              loja_id: socio.loja_id,
              socio_id: user.id,
              descricao,
              categoria,
              valor: valorCentavos / 100,
              conta
            });

          if (error) {
            mensagem.textContent =
              "Erro ao registrar despesa: " +
              error.message;
            return;
          }

          form.reset();

          mensagem.textContent =
            "Despesa registrada com sucesso!";

          await carregarDespesas();
          await carregarPainel();

        } catch (err) {
          mensagem.textContent =
            "Erro: " + err.message;
        } finally {
          botao.disabled = false;
        }
      }

      // ======================================
      // INVESTIMENTOS DOS SÓCIOS
      // ======================================

      function montarPaginaInvestimentos() {
        conteudoMais.innerHTML = `
          <h2>Investimentos dos sócios</h2>

          <div class="card">
            <h3>Registrar investimento</h3>

            <p class="tiny muted">
              Sócio responsável:
              <strong>${safe(socio.nome)}</strong>
            </p>

            <form id="investimentoForm">
              <label>Valor investido (R$)</label>
              <input
                id="investimentoValor"
                type="number"
                min="0.01"
                step="0.01"
                required
              >

              <label>Conta que recebeu o dinheiro</label>
              <select id="investimentoConta" required>
                <option value="banco">Banco</option>
                <option value="dinheiro">Dinheiro</option>
              </select>

              <label>Forma do investimento</label>
              <select id="investimentoForma" required>
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">
                  Transferência
                </option>
                <option value="cartao">Cartão</option>
              </select>

              <label>Observação (opcional)</label>
              <input
                id="investimentoObservacao"
                placeholder="Ex.: Capital inicial da loja"
              >

              <p class="tiny muted">
                Registre somente dinheiro que já entrou
                na conta escolhida. O valor será lançado
                automaticamente no caixa e não será
                considerado faturamento de vendas.
              </p>

              <button
                type="submit"
                id="salvarInvestimento"
              >
                Registrar investimento
              </button>

              <p
                id="investimentoMensagem"
                class="tiny"
              ></p>
            </form>
          </div>

          <div class="card">
            <h3>Total investido por sócio</h3>

            <button
              type="button"
              id="atualizarInvestimentos"
              class="secondary"
            >
              Atualizar investimentos
            </button>

            <div id="resumoInvestimentos">
              Carregando...
            </div>
          </div>`;

        document.getElementById(
          "atualizarInvestimentos"
        ).onclick = carregarInvestimentos;

        document.getElementById(
          "investimentoForm"
        ).onsubmit = registrarInvestimento;
      }

      async function carregarInvestimentos() {
        const resumo = document.getElementById(
          "resumoInvestimentos"
        );

        if (!resumo) return;

        resumo.textContent =
          "Consultando investimentos...";

        const [
          { data: socios, error: erroSocios },
          { data: investimentos, error: erroInvestimentos }
        ] = await Promise.all([
          db.from("socios")
            .select("usuario_id,nome")
            .eq("loja_id", socio.loja_id),

          db.from("investimentos")
            .select("socio_id,valor")
            .eq("loja_id", socio.loja_id)
        ]);

        if (!document.getElementById(
          "resumoInvestimentos"
        )) {
          return;
        }

        if (erroSocios || erroInvestimentos) {
          resumo.textContent =
            "Erro ao consultar investimentos: " +
            (erroSocios || erroInvestimentos).message;
          return;
        }

        const totais = new Map();

        for (const s of socios || []) {
          totais.set(s.usuario_id, {
            nome: s.nome,
            totalCentavos: 0
          });
        }

        for (const investimento of investimentos || []) {
          const registro = totais.get(
            investimento.socio_id
          );

          if (registro) {
            registro.totalCentavos += cents(
              investimento.valor
            );
          }
        }

        const registros = [...totais.values()];

        const totalGeral = registros.reduce(
          (soma, item) => soma + item.totalCentavos,
          0
        );

        resumo.innerHTML = registros.map(item => `
          <div class="item">
            <strong>${safe(item.nome)}</strong>

            <div class="accent">
              ${money(item.totalCentavos / 100)}
            </div>
          </div>
        `).join("") + `
          <div class="item">
            <strong>Total investido na loja</strong>

            <div class="accent">
              ${money(totalGeral / 100)}
            </div>
          </div>
        `;
      }

      atualizarInvestimentos = carregarInvestimentos;

      async function registrarInvestimento(e) {
        e.preventDefault();

        const form = e.currentTarget;

        const botao = document.getElementById(
          "salvarInvestimento"
        );

        const mensagem = document.getElementById(
          "investimentoMensagem"
        );

        const valor = Number(
          document.getElementById(
            "investimentoValor"
          ).value
        );

        const valorCentavos = cents(valor);

        const conta = document.getElementById(
          "investimentoConta"
        ).value;

        const forma = document.getElementById(
          "investimentoForma"
        ).value;

        const observacao = document.getElementById(
          "investimentoObservacao"
        ).value.trim();

        if (
          !Number.isFinite(valor) ||
          valorCentavos <= 0
        ) {
          mensagem.textContent =
            "Informe um valor válido maior que zero.";
          return;
        }

        if (!confirm(
          `Confirmar investimento de ${money(
            valorCentavos / 100
          )} realizado por ${socio.nome} na conta ${conta}?`
        )) {
          return;
        }

        botao.disabled = true;

        mensagem.textContent =
          "Registrando investimento...";

        try {
          const { error } = await db
            .from("investimentos")
            .insert({
              loja_id: socio.loja_id,
              socio_id: user.id,
              valor: valorCentavos / 100,
              conta,
              forma,
              observacao: observacao || null
            });

          if (error) {
            mensagem.textContent =
              "Erro ao registrar: " + error.message;
            return;
          }

          form.reset();

          mensagem.textContent =
            "Investimento registrado com sucesso!";

          await carregarInvestimentos();
          await carregarPainel();

        } catch (err) {
          mensagem.textContent =
            "Erro: " + err.message;
        } finally {
          botao.disabled = false;
        }
      }

      // ======================================
      // HISTÓRICO DO CAIXA
      // ======================================

      function montarPaginaHistorico() {
        conteudoMais.innerHTML = `
          <h2>Histórico do caixa</h2>

          <div class="card">
            <label>Filtrar por conta</label>
            <select id="filtroContaCaixa">
              <option value="todas">Todas as contas</option>
              <option value="banco">Banco</option>
              <option value="dinheiro">Dinheiro físico</option>
            </select>

            <button
              type="button"
              id="atualizarHistorico"
              class="secondary"
            >
              Atualizar histórico
            </button>

            <p id="historicoAviso" class="tiny muted"></p>
          </div>

          <div id="listaHistorico">
            <div class="card">Carregando...</div>
          </div>`;

        document.getElementById("atualizarHistorico")
          .onclick = carregarHistorico;

        document.getElementById("filtroContaCaixa")
          .onchange = carregarHistorico;
      }

      async function carregarHistorico() {
        const lista = document.getElementById(
          "listaHistorico"
        );

        const aviso = document.getElementById(
          "historicoAviso"
        );

        if (!lista || !aviso) return;

        lista.innerHTML = `
          <div class="card">
            Consultando movimentações...
          </div>`;

        try {
          const movimentos =
            await buscarMovimentosCaixa();

          if (!document.getElementById(
            "listaHistorico"
          )) {
            return;
          }

          const filtro = document.getElementById(
            "filtroContaCaixa"
          ).value;

          const filtrados = movimentos.filter(m =>
            filtro === "todas" || m.conta === filtro
          );

          const resumo =
            calcularSaldosCaixa(movimentos);

          const exibidos = filtrados.slice(0, 100);

          aviso.textContent =
            `Exibindo ${exibidos.length} de ` +
            `${filtrados.length} movimentações.`;

          lista.innerHTML = `
            <div class="card">
              <h3>Saldos registrados</h3>

              <p>
                Banco:
                <strong>
                  ${money(resumo.banco / 100)}
                </strong>
              </p>

              <p>
                Dinheiro físico:
                <strong>
                  ${money(resumo.dinheiro / 100)}
                </strong>
              </p>
            </div>

            <div class="card">
              <h3>Movimentações recentes</h3>

              ${exibidos.length
                ? exibidos.map(m => `
                  <div class="item">
                    <strong>
                      ${m.tipo === "entrada"
                        ? "Entrada"
                        : m.tipo === "saida"
                          ? "Saída"
                          : "Transferência"}
                    </strong>

                    <div class="tiny muted">
                      ${m.conta === "banco"
                        ? "Banco"
                        : "Dinheiro físico"}
                      • ${safe(dataBR(m.criado_em))}
                    </div>

                    <p class="tiny">
                      ${safe(m.descricao || "Sem descrição")}
                    </p>

                    <div class="accent">
                      ${m.tipo === "entrada"
                        ? "+"
                        : m.tipo === "saida"
                          ? "−"
                          : ""}
                      ${money(Math.abs(Number(m.valor)))}
                    </div>
                  </div>
                `).join("")
                : "<p>Nenhuma movimentação encontrada.</p>"
              }
            </div>
          `;

        } catch (err) {
          aviso.textContent =
            "Erro ao consultar o caixa: " +
            err.message;

          lista.innerHTML = "";
        }
      }

      // ======================================
      // RELATÓRIOS
      // ======================================

      function montarPaginaRelatorios() {
        conteudoMais.innerHTML = `
          <h2>Relatórios e lucros</h2>

          <div class="card">
            <h3>Em desenvolvimento</h3>

            <p>
              Nesta tela vamos colocar:
            </p>

            <p>• Faturamento por período</p>
            <p>• Vendas de Gian e Leo</p>
            <p>• Custo das mercadorias vendidas</p>
            <p>• Despesas da loja</p>
            <p>• Lucro da operação</p>

            <p class="tiny muted">
              Ainda não há cálculo de lucro nesta versão.
              O saldo do caixa não representa o lucro,
              pois inclui investimentos e outras movimentações.
            </p>
          </div>`;
      }

      // ======================================
      // MINHA CONTA
      // ======================================

      function montarPaginaConta() {
        conteudoMais.innerHTML = `
          <h2>Minha conta</h2>

          <div class="card">
            <h3>Dados do sócio</h3>

            <p>
              <strong>${safe(socio.nome)}</strong>
            </p>

            <p class="muted">
              ${safe(user.email)}
            </p>

            <button
              type="button"
              id="logout"
              class="secondary"
            >
              Sair da conta
            </button>
          </div>`;

        document.getElementById("logout")
          .onclick = async () => {
            const { error } = await db.auth.signOut();

            if (error) {
              alert(
                "Não foi possível sair: " +
                error.message
              );
              return;
            }

            showLogin();
          };
      }

      // ======================================
      // FINALIZAÇÃO DA TELA
      // ======================================

      await carregarRecebimentos();
      await carregarPainel();

      nav.classList.remove("hidden");
      activateTab(tab);
    }

    // ======================================
    // NAVEGAÇÃO PRINCIPAL
    // ======================================

    document.querySelectorAll("#nav button")
      .forEach(button => {
        button.onclick = async () => {
          const tab = button.dataset.tab;

          activateTab(tab);

          if (
            tab === "home" &&
            atualizarPainel
          ) {
            await atualizarPainel();
          }

          if (
            tab === "receive" &&
            atualizarRecebimentos
          ) {
            await atualizarRecebimentos();
          }

          if (
            tab === "more" &&
            abrirMenuMais
          ) {
            abrirMenuMais();
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
