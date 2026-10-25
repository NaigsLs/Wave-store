

const SUPABASE_URL = "https://xanwtxykldbyxdhdtfbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_NAmaxDUR8yEknMHLb64JnQ_YEfNCX4p";

(async function () {
  const home = document.getElementById("home");
  const nav = document.getElementById("nav");
  const sections = ["home", "sell", "stock", "receive", "more"];

  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function money(n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      style: "currency", currency: "BRL"
    });
  }
  function cents(n) {
    return Math.round(Number(n || 0) * 100);
  }
  function message(text) {
    home.innerHTML = `<div class="card"><p>${safe(text)}</p></div>`;
  }
  function activateTab(tab) {
    sections.forEach(id =>
      document.getElementById(id)?.classList.toggle("hidden", id !== tab)
    );
    document.querySelectorAll("#nav button").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
  }

  message("Conectando ao Wave Store...");

  try {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );
    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    function showLogin(error = "") {
      nav.classList.add("hidden");
      sections.forEach(id =>
        document.getElementById(id)?.classList.add("hidden")
      );
      home.classList.remove("hidden");
      home.innerHTML = `
        <h2>Entrar no Wave Store</h2>
        <div class="card">
          <form id="loginForm">
            <label>E-mail</label>
            <input id="email" type="email" required autocomplete="username">
            <label>Senha</label>
            <input id="password" type="password" required autocomplete="current-password">
            <button type="submit">Entrar</button>
          </form>
          <p id="loginError" class="tiny"></p>
        </div>`;

      document.getElementById("loginError").textContent = error;

      document.getElementById("loginForm").onsubmit = async e => {
        e.preventDefault();
        const errorBox = document.getElementById("loginError");
        errorBox.textContent = "Entrando...";

        const { error: loginError } = await db.auth.signInWithPassword({
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
        message(socioError
          ? "Erro Supabase: " + socioError.message
          : "Sua conta ainda não tem acesso à loja."
        );
        return;
      }

      const stockSection = document.getElementById("stock");

      stockSection.innerHTML = `
        <h2>Estoque de produtos</h2>
        <div class="card">
          <h2>Adicionar produto</h2>
          <form id="produtoForm">
            <label>Código do produto</label>
            <input name="codigo" required placeholder="Ex.: CAM001">

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
            <input name="nome" required placeholder="Ex.: Camiseta Nike">

            <label>Variação (opcional)</label>
            <input name="variacao" placeholder="Ex.: Preto / G">

            <label>Preço de custo (R$)</label>
            <input name="custo" type="number" min="0" step="0.01" required>

            <label>Preço de venda (R$)</label>
            <input name="preco" type="number" min="0" step="0.01" required>

            <label>Quantidade inicial</label>
            <input name="estoque_inicial" type="number" min="0" step="1" required>

            <button type="submit">Salvar produto</button>
            <p id="produtoMensagem" class="tiny"></p>
          </form>
        </div>

        <h2>Produtos cadastrados</h2>
        <div class="card" id="listaProdutos">Carregando...</div>`;

      const listaProdutos = document.getElementById("listaProdutos");

      let productList = [];
      let saldos = {};
      let promocoes = [];
      let promoProdutos = [];

      const carrinho = new Map();
      const kitsSelecionados = new Map();

      async function carregarProdutos() {
        const { data, error } = await db
          .from("produtos")
          .select("id,codigo,nome,categoria,variacao,custo,preco,estoque_inicial")
          .eq("loja_id", socio.loja_id)
          .order("nome");

        if (error) {
          listaProdutos.textContent = "Erro: " + error.message;
          return false;
        }

        const { data: movimentos, error: erroMovimentos } = await db
          .from("movimentos_estoque")
          .select("produto_id,tipo,quantidade")
          .eq("loja_id", socio.loja_id);

        if (erroMovimentos) {
          listaProdutos.textContent =
            "Erro ao consultar estoque: " + erroMovimentos.message;
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
                ${safe(p.codigo)} • ${safe(p.categoria)}
                ${p.variacao ? " • " + safe(p.variacao) : ""}
              </div>
              <div class="accent">${money(p.preco)}</div>
              <small>Estoque disponível: ${saldos[p.id]} unidades</small>
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
      }

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
          <input id="vendaQuantidade" type="number" min="1" step="1" value="1">

          <button type="button" id="adicionarCarrinho">
            Adicionar produto
          </button>
          <p id="carrinhoAviso" class="tiny"></p>
        </div>

        <div class="card">
          <h3>Meu carrinho</h3>
          <div id="itensCarrinho">
            <p class="muted">Nenhum produto adicionado.</p>
          </div>
          <div id="promocoesCarrinho"></div>
          <p id="promoAviso" class="tiny muted"></p>
          <div id="totalCarrinho">
            <strong>Total: ${money(0)}</strong>
          </div>
        </div>

        <div class="card">
          <label>Cliente (opcional)</label>
          <input id="vendaCliente" placeholder="Nome do cliente">

          <label>Forma de pagamento</label>
          <select id="vendaPagamento">
            <option value="pendente">A definir / receber depois</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="debito">Cartão de débito</option>
            <option value="credito">Cartão de crédito</option>
            <option value="fiado">Fiado</option>
          </select>

          <p class="tiny muted">
            A venda será registrada como pendente.
            A forma de pagamento escolhida é apenas informativa nesta etapa.
            O recebimento deverá ser registrado separadamente
            para entrar no caixa.
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

      const vendaProduto = document.getElementById("vendaProduto");
      const vendaMensagem = document.getElementById("vendaMensagem");
      const carrinhoAviso = document.getElementById("carrinhoAviso");
      const finalizarBotao = document.getElementById("finalizarVenda");

      function carregarProdutosVenda() {
        vendaProduto.replaceChildren(
          new Option("Selecione um produto", "")
        );

        for (const p of productList) {
          vendaProduto.add(new Option(
            `${p.nome}${p.variacao ? " - " + p.variacao : ""} - ${money(p.preco)} (estoque: ${saldos[p.id]})`,
            p.id
          ));
        }
      }

      function itensPayload() {
        return [...carrinho].map(([produto_id, quantidade]) => ({
          produto_id,
          quantidade
        }));
      }

      function kitsPayload() {
        const kits = [];

        for (const [id, quantidadeKits] of kitsSelecionados) {
          const promo = promocoes.find(p => p.id === id);
          if (!promo || !quantidadeKits) continue;

          const elegiveis = productList.filter(p =>
            carrinho.has(p.id) &&
            promoProdutos.some(pp =>
              pp.promocao_id === id && pp.produto_id === p.id
            )
          );

          const restantes = new Map(
            elegiveis.map(p => [p.id, carrinho.get(p.id)])
          );

          for (let k = 0; k < quantidadeKits; k++) {
            let faltam = Number(promo.quantidade);
            const itens = [];

            for (const p of elegiveis) {
              const disponivel = restantes.get(p.id) || 0;
              const pegar = Math.min(disponivel, faltam);

              if (pegar > 0) {
                itens.push({
                  produto_id: p.id,
                  quantidade: pegar
                });
                restantes.set(p.id, disponivel - pegar);
                faltam -= pegar;
              }

              if (!faltam) break;
            }

            if (faltam) {
              throw new Error(
                "Quantidade insuficiente para formar os kits selecionados."
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

        const usados = new Map();

        for (const kit of kitsPayload()) {
          const promo = promocoes.find(p =>
            p.id === kit.promocao_id
          );

          let precoOriginal = 0;

          for (const item of kit.itens) {
            const p = productList.find(x =>
              x.id === item.produto_id
            );

            precoOriginal += cents(p.preco) * item.quantidade;
            usados.set(
              p.id,
              (usados.get(p.id) || 0) + item.quantidade
            );
          }

          if (cents(promo.preco_total) > precoOriginal) {
            throw new Error(
              "O valor da promoção é maior que o preço normal do kit."
            );
          }

          total += cents(promo.preco_total) - precoOriginal;
        }

        for (const [id, quantidade] of usados) {
          if (quantidade > carrinho.get(id)) {
            throw new Error(
              "O mesmo produto foi utilizado em mais de um kit."
            );
          }
        }

        return total / 100;
      }

      function renderCarrinho() {
        const container = document.getElementById("itensCarrinho");

        container.innerHTML = carrinho.size
          ? [...carrinho].map(([id, quantidade]) => {
              const p = productList.find(x => x.id === id);
              if (!p) return "";

              return `
                <div class="item">
                  <strong>
                    ${safe(p.nome)} ${safe(p.variacao || "")}
                  </strong>
                  <div class="tiny">
                    ${quantidade} × ${money(p.preco)} =
                    ${money(Number(p.preco) * quantidade)}
                  </div>
                  <button type="button" class="secondary"
                    data-remove="${safe(id)}">
                    Remover
                  </button>
                </div>`;
            }).join("")
          : '<p class="muted">Nenhum produto adicionado.</p>';

        container.querySelectorAll("[data-remove]").forEach(btn => {
          btn.onclick = () => {
            carrinho.delete(btn.dataset.remove);
            kitsSelecionados.clear();
            renderCarrinho();
          };
        });

        const promos = document.getElementById("promocoesCarrinho");

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
                (s, prod) => s + carrinho.get(prod.id), 0
              );

              const max = Math.floor(
                totalElegivel / Number(p.quantidade)
              );

              const atual = Math.min(
                kitsSelecionados.get(p.id) || 0, max
              );

              if (atual !== (kitsSelecionados.get(p.id) || 0)) {
                kitsSelecionados.set(p.id, atual);
              }

              return `
                <div class="item">
                  <strong>${safe(p.nome)}</strong>
                  <div class="tiny">
                    ${p.quantidade} unidades por
                    ${money(p.preco_total)} • kits possíveis: ${max}
                  </div>
                  <label>Quantidade de kits para aplicar</label>
                  <input type="number" min="0" max="${max}" step="1"
                    value="${atual}" data-promo="${safe(p.id)}">
                </div>`;
            }).join("")
          : '<p class="tiny muted">Nenhuma promoção ativa. Os produtos serão vendidos pelo preço normal.</p>';

        promos.querySelectorAll("[data-promo]").forEach(input => {
          input.onchange = () => {
            const q = Number(input.value);

            if (!Number.isInteger(q) ||
                q < 0 ||
                q > Number(input.max)) {
              carrinhoAviso.textContent =
                "Quantidade de kits inválida.";
              renderCarrinho();
              return;
            }

            kitsSelecionados.set(input.dataset.promo, q);
            renderCarrinho();
          };
        });

        try {
          const total = estimarTotal();
          document.getElementById("totalCarrinho").innerHTML =
            `<strong>Total estimado: ${money(total)}</strong>`;
          carrinhoAviso.textContent = "";
        } catch (err) {
          document.getElementById("totalCarrinho").textContent =
            "Não foi possível calcular o total.";
          carrinhoAviso.textContent = err.message;
        }
      }

      await carregarProdutos();
      carregarProdutosVenda();
      await carregarPromocoes();
      renderCarrinho();

      document.getElementById("adicionarCarrinho").onclick = () => {
        const id = vendaProduto.value;
        const quantidade = Number(
          document.getElementById("vendaQuantidade").value
        );

        if (!id || !Number.isInteger(quantidade) || quantidade < 1) {
          carrinhoAviso.textContent =
            "Selecione um produto e uma quantidade válida.";
          return;
        }

        const novoTotal = (carrinho.get(id) || 0) + quantidade;

        if (novoTotal > (saldos[id] || 0)) {
          carrinhoAviso.textContent =
            "Estoque insuficiente. Disponível: " +
            (saldos[id] || 0);
          return;
        }

        carrinho.set(id, novoTotal);
        document.getElementById("vendaQuantidade").value = "1";
        renderCarrinho();
      };

      document.getElementById("produtoForm").onsubmit = async e => {
        e.preventDefault();

        const form = e.currentTarget;
        const msg = document.getElementById("produtoMensagem");
        const botao = form.querySelector('button[type="submit"]');
        const campos = new FormData(form);

        botao.disabled = true;
        msg.textContent = "Salvando produto...";

        const produto = {
          loja_id: socio.loja_id,
          codigo: String(campos.get("codigo")).trim(),
          categoria: String(campos.get("categoria")).trim(),
          nome: String(campos.get("nome")).trim(),
          variacao: String(campos.get("variacao")).trim() || null,
          custo: Number(campos.get("custo")),
          preco: Number(campos.get("preco")),
          estoque_inicial: Number(campos.get("estoque_inicial"))
        };

        try {
          const { error } = await db
            .from("produtos")
            .insert(produto);

          if (error) {
            msg.textContent = "Erro: " + error.message;
            return;
          }

          form.reset();
          msg.textContent = "Produto cadastrado com sucesso!";

          if (await carregarProdutos()) {
            carregarProdutosVenda();
          }

          await carregarPainel();
        } catch (err) {
          msg.textContent = "Erro: " + err.message;
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
          "Registrar esta venda como PENDENTE? Nenhum pagamento será lançado automaticamente no caixa."
        )) {
          return;
        }

        finalizarBotao.disabled = true;
        vendaMensagem.textContent = "Registrando venda...";

        try {
          const { data: vendaId, error } = await db.rpc(
            "finalizar_carrinho",
            {
              p_itens: itensPayload(),
              p_kits: kits,
              p_cliente:
                document.getElementById("vendaCliente").value.trim() || null
            }
          );

          if (error) {
            vendaMensagem.textContent = error.code === "42501"
              ? "O novo carrinho ainda não foi liberado no Supabase. Nenhuma venda foi registrada."
              : "Não foi possível registrar a venda: " + error.message;
            return;
          }

          carrinho.clear();
          kitsSelecionados.clear();

          document.getElementById("vendaCliente").value = "";
          document.getElementById("vendaPagamento").value = "pendente";

          vendaMensagem.textContent =
            `Venda registrada como PENDENTE! Código: ${vendaId}. Registre o recebimento separadamente.`;

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
              <div class="num">${productList.length}</div>
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
          </p>`;
      }

      await carregarPainel();

      document.getElementById("receive").innerHTML = `
        <h2>A receber</h2>
        <div class="card">
          <p>Essa função será ativada na próxima etapa.</p>
        </div>`;

      document.getElementById("more").innerHTML = `
        <h2>Minha conta</h2>
        <div class="card">
          <p><strong>${safe(socio.nome)}</strong></p>
          <p class="muted">${safe(user.email)}</p>
          <button id="logout" class="secondary">
            Sair da conta
          </button>
        </div>`;

      document.getElementById("logout").onclick = async () => {
        await db.auth.signOut();
        showLogin();
      };

      nav.classList.remove("hidden");
      activateTab(tab);
    }

    document.querySelectorAll("#nav button").forEach(button => {
      button.onclick = () => activateTab(button.dataset.tab);
    });

    const { data: sessionData } = await db.auth.getSession();

    if (sessionData.session) {
      await showApp();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error(error);
    message("Erro ao conectar: " + error.message);
  }
})();
