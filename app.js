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
      let estoqueDisponivel = {};
      let promocoes = [];
      let promoProdutos = [];

      // Vendedores cadastrados na mesma loja.
      const { data: vendedores, error: erroVendedores } = await db
        .from("socios")
        .select("usuario_id,nome")
        .eq("loja_id", socio.loja_id)
        .order("nome");

      if (erroVendedores || !vendedores?.length) {
        nav.classList.add("hidden");
        message(
          "Não foi possível carregar os vendedores: " +
          (erroVendedores?.message || "Nenhum sócio encontrado.")
        );
        return;
      }

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
            <input name="variacao" placeholder="Ex.: Preto / G">

            <div class="grid">
              <div>
                <label>Cor (opcional)</label>
                <input name="cor" placeholder="Ex.: Preto">
              </div>
              <div>
                <label>Tamanho (opcional)</label>
                <input name="tamanho" placeholder="Ex.: M / 38">
              </div>
            </div>

            <label>Código de barras (opcional)</label>
            <input name="codigo_barras" placeholder="EAN / código de barras">

            <label>URL da foto (opcional)</label>
            <input name="foto_url" type="url" placeholder="https://...">

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

            <label>Quantidade inicial (somente no cadastro)</label>
            <input name="estoque_inicial" type="number" min="0" step="1" required>
            <p class="tiny muted">Depois de cadastrar, ajuste o estoque por compras e movimentações. O estoque inicial não pode ser editado.</p>

            <button type="submit">Salvar produto</button>
            <p id="produtoMensagem" class="tiny"></p>
          </form>
        </div>

        <h2>Produtos cadastrados</h2>
        <div class="card">
          <label>Pesquisar produtos</label>
          <input id="buscarProduto" placeholder="Nome, código, cor, tamanho ou código de barras">
          <label>Mostrar</label>
          <select id="filtroStatusProduto"><option value="todos">Todos os produtos</option><option value="ativos">Somente ativos</option><option value="inativos">Somente inativos</option></select>
        </div>
        <div class="card" id="listaProdutos">
          Carregando...
        </div>`;

      const listaProdutos =
        document.getElementById("listaProdutos");

      async function carregarProdutos() {
        const { data, error } = await db
          .from("produtos")
          .select(
            "id,codigo,nome,categoria,variacao,custo,preco,estoque_inicial,cor,tamanho,codigo_barras,foto_url,ativo"
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
          listaProdutos.textContent = "Erro ao consultar estoque: " + erroMovimentos.message;
          return false;
        }

        const { data: reservasAtivas, error: erroReservas } = await db
          .from("reservas")
          .select("produto_id,quantidade,vencimento,status")
          .eq("loja_id", socio.loja_id)
          .eq("status", "ativa");
        if (erroReservas) {
          const avisoCarrinho = document.getElementById("carrinhoAviso");
          if (avisoCarrinho) avisoCarrinho.textContent = "Aviso: não foi possível consultar reservas para calcular disponibilidade. O Supabase continuará validando e bloqueando saídas incompatíveis.";
        }

        productList = data || [];
        saldos = {};
        estoqueDisponivel = {};
        const reservadoPorProduto = {};
        const agora = Date.now();
        for (const r of (erroReservas ? [] : reservasAtivas) || []) {
          if (r.vencimento && new Date(r.vencimento).getTime() <= agora) continue;
          reservadoPorProduto[r.produto_id] = (reservadoPorProduto[r.produto_id] || 0) + Number(r.quantidade || 0);
        }
        for (const p of productList) saldos[p.id] = Number(p.estoque_inicial || 0);
        for (const m of movimentos || []) {
          if (saldos[m.produto_id] === undefined) continue;
          if (m.tipo === "entrada") saldos[m.produto_id] += Number(m.quantidade);
          if (m.tipo === "saida") saldos[m.produto_id] -= Number(m.quantidade);
        }
        for (const p of productList) estoqueDisponivel[p.id] = Math.max(0, saldos[p.id] - (reservadoPorProduto[p.id] || 0));

        listaProdutos.innerHTML = productList.length
          ? productList.map(p => `
              <div class="item" data-product-item="${safe(p.id)}" data-search="${safe([p.nome,p.codigo,p.categoria,p.variacao,p.cor,p.tamanho,p.codigo_barras].filter(Boolean).join(" ").toLowerCase())}" data-status="${p.ativo === false ? "inativo" : "ativo"}">
                <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
                  <strong>${safe(p.nome)}</strong>
                  <span class="pill">${p.ativo === false ? "Inativo" : "Ativo"}</span>
                </div>
                <div class="tiny muted">${safe(p.codigo)} • ${safe(p.categoria)}${p.variacao ? " • " + safe(p.variacao) : ""}${p.cor ? " • " + safe(p.cor) : ""}${p.tamanho ? " • " + safe(p.tamanho) : ""}</div>
                <div class="grid">
                  <div><small>Custo</small><div>${money(p.custo)}</div></div>
                  <div><small>Preço de venda</small><div class="accent">${money(p.preco)}</div></div>
                </div>
                <small>Estoque total: ${saldos[p.id] ?? 0} • Disponível para venda: ${estoqueDisponivel[p.id] ?? saldos[p.id] ?? 0}</small>
                <div class="grid" style="margin-top:10px">
                  <button type="button" class="secondary" data-editar-produto="${safe(p.id)}">Editar cadastro</button>
                  <button type="button" class="secondary" data-ativar-produto="${safe(p.id)}">${p.ativo === false ? "Ativar" : "Desativar"}</button>
                </div>
                <div id="editarProduto-${safe(p.id)}"></div>
              </div>
            `).join("")
          : "<p>Nenhum produto cadastrado.</p>";

        const aplicarFiltroProdutos = () => {
          const termo = (document.getElementById("buscarProduto")?.value || "").trim().toLowerCase();
          const status = document.getElementById("filtroStatusProduto")?.value || "todos";
          listaProdutos.querySelectorAll("[data-product-item]").forEach(item => {
            const correspondeTexto = item.dataset.search.includes(termo);
            const correspondeStatus = status === "todos" || item.dataset.status === (status === "ativos" ? "ativo" : "inativo");
            item.classList.toggle("hidden", !(correspondeTexto && correspondeStatus));
          });
        };
        document.getElementById("buscarProduto")?.addEventListener("input", aplicarFiltroProdutos);
        document.getElementById("filtroStatusProduto")?.addEventListener("change", aplicarFiltroProdutos);
        aplicarFiltroProdutos();

        listaProdutos.querySelectorAll("[data-editar-produto]").forEach(btn => {
          btn.onclick = () => abrirEditorProduto(btn.dataset.editarProduto);
        });
        listaProdutos.querySelectorAll("[data-ativar-produto]").forEach(btn => {
          btn.onclick = async () => {
            const produto = productList.find(x => x.id === btn.dataset.ativarProduto);
            if (!produto) return;
            const novoAtivo = produto.ativo === false;
            if (!confirm(`${novoAtivo ? "Ativar" : "Desativar"} ${produto.nome}?`)) return;
            btn.disabled = true;
            const { error } = await db.from("produtos").update({ ativo: novoAtivo }).eq("id", produto.id).eq("loja_id", socio.loja_id);
            if (error) alert("Não foi possível atualizar o produto: " + error.message);
            else { await carregarProdutos(); carregarProdutosVenda(); await carregarPainel(); }
          };
        });

        return true;
      }

      async function abrirEditorProduto(id) {
        const p = productList.find(x => x.id === id);
        const alvo = document.getElementById(`editarProduto-${id}`);
        if (!p || !alvo) return;
        alvo.innerHTML = `
          <div class="card" style="margin-top:12px">
            <h3>Editar produto</h3>
            <form id="formEditarProduto-${safe(id)}">
              <label>Código</label><input name="codigo" required value="${safe(p.codigo)}">
              <label>Categoria</label><input name="categoria" required value="${safe(p.categoria)}">
              <label>Nome</label><input name="nome" required value="${safe(p.nome)}">
              <label>Variação</label><input name="variacao" value="${safe(p.variacao || "")}">
              <div class="grid"><div><label>Cor</label><input name="cor" value="${safe(p.cor || "")}"></div><div><label>Tamanho</label><input name="tamanho" value="${safe(p.tamanho || "")}"></div></div>
              <label>Código de barras</label><input name="codigo_barras" value="${safe(p.codigo_barras || "")}">
              <label>Foto (URL)</label><input name="foto_url" type="url" value="${safe(p.foto_url || "")}">
              <div class="grid"><div><label>Custo (R$)</label><input name="custo" type="number" min="0" step="0.01" required value="${Number(p.custo || 0)}"></div><div><label>Preço (R$)</label><input name="preco" type="number" min="0" step="0.01" required value="${Number(p.preco || 0)}"></div></div>
              <p class="tiny muted">O estoque inicial é protegido e não pode ser alterado aqui.</p>
              <button type="submit">Salvar alterações</button>
              <button type="button" class="secondary" data-cancelar-edicao>Cancelar</button>
              <p class="tiny" data-editor-msg></p>
            </form>
          </div>`;
        const form = alvo.querySelector("form");
        form.querySelector("[data-cancelar-edicao]").onclick = () => { alvo.innerHTML = ""; };
        form.onsubmit = async e => {
          e.preventDefault();
          const fd = new FormData(form);
          const dados = {
            codigo: String(fd.get("codigo")).trim(), categoria: String(fd.get("categoria")).trim(),
            nome: String(fd.get("nome")).trim(), variacao: String(fd.get("variacao")).trim() || null,
            cor: String(fd.get("cor")).trim() || null, tamanho: String(fd.get("tamanho")).trim() || null,
            codigo_barras: String(fd.get("codigo_barras")).trim() || null, foto_url: String(fd.get("foto_url")).trim() || null,
            custo: Number(fd.get("custo")), preco: Number(fd.get("preco"))
          };
          const msg = form.querySelector("[data-editor-msg]");
          const botao = form.querySelector('button[type="submit"]');
          if (!dados.codigo || !dados.nome || !Number.isFinite(dados.custo) || !Number.isFinite(dados.preco) || dados.custo < 0 || dados.preco < 0) { msg.textContent = "Confira os campos e valores."; return; }
          botao.disabled = true; msg.textContent = "Salvando...";
          const { error } = await db.from("produtos").update(dados).eq("id", id).eq("loja_id", socio.loja_id);
          if (error) { msg.textContent = "Erro: " + error.message; botao.disabled = false; return; }
          await carregarProdutos(); carregarProdutosVenda(); await carregarPainel();
        };
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
          <h3>Vendedor responsável</h3>
          <label for="vendaVendedor">Quem realizou a venda?</label>
          <select id="vendaVendedor" required>
            ${vendedores.map(v => `
              <option value="${safe(v.usuario_id)}"
                ${v.usuario_id === user.id ? "selected" : ""}>
                ${safe(v.nome)}
              </option>
            `).join("")}
          </select>
          <p class="tiny muted">
            Selecione Gian ou Leo conforme quem realizou a venda.
          </p>
        </div>

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
          A venda será atribuída ao vendedor selecionado acima.
          A conta conectada continua responsável pela autenticação.
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

        for (const p of productList.filter(x => x.ativo !== false)) {
          vendaProduto.add(
            new Option(
              `${p.nome}${p.variacao
                ? " - " + p.variacao
                : ""} - ${money(p.preco)} (disponível: ${estoqueDisponivel[p.id] ?? saldos[p.id]})`,
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
            : {
                data: null,
                error: { message: "Falha na consulta" }
              };

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
            document.getElementById(
              "vendaQuantidade"
            ).value
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

          if (novoTotal > (estoqueDisponivel[id] ?? saldos[id] ?? 0)) {
            carrinhoAviso.textContent =
              "Estoque disponível insuficiente após reservas. Disponível: " +
              (estoqueDisponivel[id] ?? saldos[id] ?? 0);
            return;
          }

          carrinho.set(id, novoTotal);

          document.getElementById(
            "vendaQuantidade"
          ).value = "1";

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
            variacao: String(campos.get("variacao")).trim() || null,
            cor: String(campos.get("cor")).trim() || null,
            tamanho: String(campos.get("tamanho")).trim() || null,
            codigo_barras: String(campos.get("codigo_barras")).trim() || null,
            foto_url: String(campos.get("foto_url")).trim() || null,
            ativo: true,
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

        const vendedorId = document.getElementById("vendaVendedor").value;
        const vendedorSelecionado = vendedores.find(
          v => v.usuario_id === vendedorId
        );

        if (!vendedorSelecionado) {
          vendaMensagem.textContent = "Selecione um vendedor válido.";
          return;
        }

        if (!confirm(
          `Registrar esta venda para ${vendedorSelecionado.nome} como PENDENTE? ` +
          "Nenhum pagamento será lançado automaticamente no caixa."
        )) {
          return;
        }

        finalizarBotao.disabled = true;
        vendaMensagem.textContent =
          "Registrando venda...";

        try {
          const { data: vendaId, error } =
            await db.rpc("finalizar_carrinho_com_vendedor", {
              p_itens: itensPayload(),
              p_kits: kits,
              p_cliente:
                document.getElementById(
                  "vendaCliente"
                ).value.trim() || null,
              p_vendedor_id: vendedorId
            });

          if (error) {
            vendaMensagem.textContent =
              "Não foi possível registrar a venda: " +
              error.message;
            return;
          }

          carrinho.clear();
          kitsSelecionados.clear();

          document.getElementById(
            "vendaCliente"
          ).value = "";

          document.getElementById(
            "vendaPagamento"
          ).value = "pendente";

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

        document.getElementById(
          "vendaSelecionadaInfo"
        ).textContent =
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
                ${safe(
                  v.cliente || "Cliente não informado"
                )}
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
            <button type="button" data-abrir="compras">Compras de mercadorias</button>
          </div>
          <div class="card">
            <button type="button" data-abrir="promocoes">Promoções e kits</button>
          </div>
          <div class="card">
            <button type="button" data-abrir="ajustesVenda">Ajustes de preços e descontos</button>
          </div>
          <div class="card">
            <button type="button" data-abrir="reservas">Reservas de produtos</button>
          </div>
          <div class="card">
            <button type="button" data-abrir="devolucoes">Trocas e devoluções</button>
          </div>
          <div class="card">
            <button type="button" data-abrir="parcelas">Parcelas a receber</button>
          </div>

          <div class="card">
            <button type="button" data-abrir="repasses">
              💳 Repasses de cartão
            </button>
          </div>

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

        if (pagina === "compras") {
          montarPaginaCompras();
          await carregarHistoricoCompras();
        } else if (pagina === "promocoes") {
          montarPaginaPromocoes();
          await carregarPromocoesAdmin();
        } else if (pagina === "ajustesVenda") {
          montarPaginaAjustesVenda();
          await carregarVendasAjustes();
        } else if (pagina === "reservas") {
          montarPaginaReservas();
          await carregarReservas();
        } else if (pagina === "devolucoes") {
          montarPaginaDevolucoes();
        } else if (pagina === "parcelas") {
          montarPaginaParcelas();
          await carregarParcelas();
        } else if (pagina === "repasses") {
          montarPaginaRepasses();
          await carregarRepasses();
        } else if (pagina === "despesas") {
          montarPaginaDespesas();
        } else if (pagina === "investimentos") {
          montarPaginaInvestimentos();
          await carregarInvestimentos();
        } else if (pagina === "historico") {
          montarPaginaHistorico();
          await carregarHistorico();
        } else if (pagina === "relatorios") {
          montarPaginaRelatorios();
          await carregarRelatorios();
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
      // PROMOÇÕES E KITS
      // ======================================
      function montarPaginaPromocoes() {
        conteudoMais.innerHTML = `
          <h2>Promoções e kits</h2>
          <div class="card">
            <h3>Criar promoção</h3>
            <form id="promoAdminForm">
              <label>Nome da promoção</label><input id="promoNome" required maxlength="120" placeholder="Ex.: 3 camisetas por R$ 120">
              <div class="grid"><div><label>Quantidade por kit</label><input id="promoQuantidade" type="number" min="1" step="1" value="3" required></div><div><label>Preço total do kit (R$)</label><input id="promoPreco" type="number" min="0.01" step="0.01" required value="120"></div></div>
              <label>Produtos que participam</label><div id="promoProdutosSelecao"></div>
              <p class="tiny muted">A promoção só será aplicada quando o vendedor selecionar a quantidade de kits no carrinho. Produtos não usados no kit continuam pelo preço normal.</p>
              <button type="submit">Criar promoção</button><p id="promoAdminMsg" class="tiny"></p>
            </form>
          </div>
          <div class="card"><h3>Promoções cadastradas</h3><button type="button" class="secondary" id="atualizarPromocoesAdmin">Atualizar</button><div id="listaPromocoesAdmin">Carregando...</div></div>`;
        document.getElementById("promoProdutosSelecao").innerHTML = productList.filter(p => p.ativo !== false).map(p => `<label style="display:flex;gap:10px;align-items:center"><input style="width:auto;min-height:0" type="checkbox" value="${safe(p.id)}" data-promo-produto> ${safe(p.nome)} ${p.variacao ? "• " + safe(p.variacao) : ""} (${money(p.preco)})</label>`).join("") || '<p class="tiny muted">Cadastre produtos ativos primeiro.</p>';
        document.getElementById("promoAdminForm").onsubmit = criarPromocaoAdmin;
        document.getElementById("atualizarPromocoesAdmin").onclick = carregarPromocoesAdmin;
      }

      async function carregarPromocoesAdmin() {
        const alvo = document.getElementById("listaPromocoesAdmin");
        if (!alvo) return;
        alvo.textContent = "Consultando promoções...";
        const { data, error } = await db.from("promocoes").select("id,nome,quantidade,preco_total,ativa").eq("loja_id", socio.loja_id).order("nome");
        if (!document.getElementById("listaPromocoesAdmin")) return;
        if (error) { alvo.textContent = "Erro ao consultar promoções: " + error.message; return; }
        if (!data?.length) { alvo.innerHTML = '<p>Nenhuma promoção cadastrada.</p>'; return; }
        alvo.innerHTML = data.map(p => `<div class="item"><strong>${safe(p.nome)}</strong><p class="tiny muted">${p.quantidade} unidade(s) por ${money(p.preco_total)} • ${p.ativa ? "Ativa" : "Inativa"}</p><div class="grid"><button type="button" class="secondary" data-editar-promo="${safe(p.id)}">Editar nome/valor</button><button type="button" class="secondary" data-toggle-promo="${safe(p.id)}" data-ativa="${p.ativa ? "true" : "false"}">${p.ativa ? "Desativar" : "Ativar"}</button></div><div id="editorPromo-${safe(p.id)}"></div></div>`).join("");
        alvo.querySelectorAll("[data-editar-promo]").forEach(btn => btn.onclick = () => {
          const p = data.find(x => x.id === btn.dataset.editarPromo); const box = document.getElementById(`editorPromo-${p.id}`); if (!p || !box) return;
          box.innerHTML = `<form class="card" data-form-editar-promo="${safe(p.id)}"><label>Nome</label><input name="nome" required value="${safe(p.nome)}"><label>Quantidade por kit</label><input name="quantidade" type="number" min="1" step="1" required value="${Number(p.quantidade)}"><label>Preço total (R$)</label><input name="preco_total" type="number" min="0.01" step="0.01" required value="${Number(p.preco_total)}"><button type="submit">Salvar promoção</button><button type="button" class="secondary" data-fechar-editor>Cancelar</button><p class="tiny" data-msg></p></form>`;
          const form = box.querySelector("form"); form.querySelector("[data-fechar-editor]").onclick = () => box.innerHTML = "";
          form.onsubmit = async e => { e.preventDefault(); const fd = new FormData(form); const nome = String(fd.get("nome")).trim(); const quantidade = Number(fd.get("quantidade")); const preco_total = Number(fd.get("preco_total")); const msg = form.querySelector("[data-msg]"); if (!nome || !Number.isInteger(quantidade) || quantidade < 1 || !Number.isFinite(preco_total) || preco_total <= 0) { msg.textContent = "Confira nome, quantidade e valor."; return; } const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; const { error: err } = await db.from("promocoes").update({ nome, quantidade, preco_total }).eq("id", p.id).eq("loja_id", socio.loja_id); if (err) { msg.textContent = "Não foi possível salvar: " + err.message; submit.disabled = false; return; } await carregarPromocoes(); await carregarPromocoesAdmin(); };
        });
        alvo.querySelectorAll("[data-toggle-promo]").forEach(btn => btn.onclick = async () => {
          const ativa = btn.dataset.ativa !== "true";
          btn.disabled = true;
          const { error: e } = await db.from("promocoes").update({ ativa }).eq("id", btn.dataset.togglePromo).eq("loja_id", socio.loja_id);
          if (e) { alert("Não foi possível alterar a promoção: " + e.message); btn.disabled = false; return; }
          await carregarPromocoes(); await carregarPromocoesAdmin();
        });
      }

      async function criarPromocaoAdmin(e) {
        e.preventDefault();
        const msg = document.getElementById("promoAdminMsg");
        const nome = document.getElementById("promoNome").value.trim();
        const quantidade = Number(document.getElementById("promoQuantidade").value);
        const preco_total = Number(document.getElementById("promoPreco").value);
        const produtos = [...document.querySelectorAll("[data-promo-produto]:checked")].map(x => x.value);
        if (!nome || !Number.isInteger(quantidade) || quantidade < 1 || !Number.isFinite(preco_total) || preco_total <= 0 || !produtos.length) { msg.textContent = "Informe nome, quantidade, preço e pelo menos um produto."; return; }
        if (!confirm(`Criar a promoção ${nome}: ${quantidade} unidade(s) por ${money(preco_total)}?`)) return;
        const form = document.getElementById("promoAdminForm");
        const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = "Criando promoção...";
        const { data, error } = await db.from("promocoes").insert({ loja_id: socio.loja_id, nome, quantidade, preco_total, ativa: true }).select("id").single();
        if (error) { msg.textContent = "Não foi possível criar: " + error.message; btn.disabled = false; return; }
        const vinculos = produtos.map(produto_id => ({ loja_id: socio.loja_id, promocao_id: data.id, produto_id }));
        const { error: erroVinculos } = await db.from("promocao_produtos").insert(vinculos);
        if (erroVinculos) { msg.textContent = "Promoção criada, mas não foi possível vincular os produtos. ID: " + data.id + ". Erro: " + erroVinculos.message; btn.disabled = false; await carregarPromocoesAdmin(); return; }
        form.reset(); document.getElementById("promoQuantidade").value = "3"; document.getElementById("promoPreco").value = "120";
        msg.textContent = "Promoção criada e produtos vinculados."; btn.disabled = false;
        await carregarPromocoes(); await carregarPromocoesAdmin();
      }

      // ======================================
      // AJUSTES DE PREÇO E DESCONTOS DE VENDA
      // ======================================
      function montarPaginaAjustesVenda() {
        conteudoMais.innerHTML = `<h2>Ajustes de preços e descontos</h2><p class="tiny muted">Os ajustes são enviados pelas RPCs seguras do Supabase. Confira a venda antes de aplicar qualquer alteração; o banco valida as regras e os totais.</p><div class="card"><label>Venda</label><select id="vendaParaAjuste"></select><button type="button" class="secondary" id="carregarItensAjuste">Carregar itens</button><p id="ajusteVendaMsg" class="tiny"></p><div id="itensParaAjuste"></div></div><div class="card"><h3>Aplicar desconto à venda</h3><form id="descontoVendaForm"><label>Tipo de desconto</label><select id="tipoDesconto"><option value="valor">Valor em reais (R$)</option><option value="percentual">Percentual (%)</option></select><label>Valor do desconto</label><input id="valorDesconto" type="number" min="0.01" step="0.01" required><p class="tiny muted">A função do Supabase valida o limite e recalcula os totais. Não aplique um desconto que já esteja incluído em uma promoção.</p><button type="submit">Aplicar desconto</button><p id="descontoVendaMsg" class="tiny"></p></form></div>`;
        document.getElementById("carregarItensAjuste").onclick = carregarItensParaAjuste;
        document.getElementById("descontoVendaForm").onsubmit = aplicarDescontoUI;
      }
      async function carregarVendasAjustes() {
        const sel = document.getElementById("vendaParaAjuste"); if (!sel) return;
        const { data, error } = await db.from("vendas").select("id,cliente,valor_total,situacao,criado_em").eq("loja_id", socio.loja_id).neq("situacao", "cancelado").order("criado_em", { ascending: false }).limit(100);
        if (!document.getElementById("vendaParaAjuste")) return;
        if (error) { sel.innerHTML = '<option value="">Erro ao consultar vendas</option>'; document.getElementById("ajusteVendaMsg").textContent = error.message; return; }
        sel.innerHTML = '<option value="">Selecione a venda</option>' + (data || []).map(v => `<option value="${safe(v.id)}">${safe(dataBR(v.criado_em))} • ${safe(v.cliente || "Cliente não informado")} • ${money(v.valor_total)} • ${safe(v.situacao)}</option>`).join("");
      }
      async function carregarItensParaAjuste() {
        const vendaId = document.getElementById("vendaParaAjuste").value; const area = document.getElementById("itensParaAjuste"); const msg = document.getElementById("ajusteVendaMsg");
        area.innerHTML = ""; if (!vendaId) { msg.textContent = "Selecione uma venda."; return; }
        msg.textContent = "Consultando itens...";
        const { data, error } = await db.from("itens_venda").select("id,produto_id,quantidade,preco_unitario").eq("venda_id", vendaId);
        if (error) { msg.textContent = "Erro ao consultar itens: " + error.message; return; }
        if (!data?.length) { msg.textContent = "Nenhum item encontrado nesta venda."; return; }
        area.innerHTML = `<h3>Itens da venda</h3>` + data.map(i => { const p = productList.find(x => x.id === i.produto_id); return `<div class="item"><strong>${safe(p?.nome || "Produto")} ${p?.variacao ? "• " + safe(p.variacao) : ""}</strong><p class="tiny muted">${i.quantidade} unidade(s) • preço atual ${money(i.preco_unitario)}</p><form data-form-preco-item="${safe(i.id)}"><label>Novo preço unitário (R$)</label><input name="preco" type="number" min="0" step="0.01" required value="${Number(i.preco_unitario)}"><button type="submit">Atualizar preço deste item</button><p class="tiny" data-msg></p></form></div>`; }).join("");
        area.querySelectorAll("[data-form-preco-item]").forEach(form => form.onsubmit = async e => { e.preventDefault(); const novo = Number(new FormData(form).get("preco")); const msg = form.querySelector("[data-msg]"); if (!Number.isFinite(novo) || novo < 0) { msg.textContent = "Preço inválido."; return; } if (!confirm(`Atualizar o preço unitário para ${money(novo)}?`)) return; const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; const { error: err } = await db.rpc("editar_preco_item_venda", { p_item_id: form.dataset.formPrecoItem, p_novo_preco: cents(novo)/100 }); if (err) { msg.textContent = "O Supabase recusou o ajuste: " + err.message; btn.disabled = false; return; } msg.textContent = "Preço atualizado."; await carregarItensParaAjuste(); await carregarPainel(); });
        msg.textContent = "Ajuste os preços dos itens ou aplique um desconto à venda.";
      }
      async function aplicarDescontoUI(e) {
        e.preventDefault(); const vendaId = document.getElementById("vendaParaAjuste").value; const tipo = document.getElementById("tipoDesconto").value; const valor = Number(document.getElementById("valorDesconto").value); const msg = document.getElementById("descontoVendaMsg");
        if (!vendaId || !Number.isFinite(valor) || valor <= 0) { msg.textContent = "Selecione a venda e informe um desconto válido."; return; }
        if (tipo === "percentual" && valor > 100) { msg.textContent = "O percentual não pode passar de 100%."; return; }
        if (!confirm(`Aplicar desconto ${tipo === "percentual" ? `${valor}%` : money(valor)} à venda selecionada?`)) return;
        const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = "Aplicando desconto...";
        const { error } = await db.rpc("aplicar_desconto_venda", { p_venda_id: vendaId, p_tipo: tipo, p_valor: valor });
        if (error) msg.textContent = "O Supabase recusou o desconto: " + error.message;
        else { msg.textContent = "Desconto aplicado com sucesso."; await carregarVendasAjustes(); await carregarPainel(); }
        btn.disabled = false;
      }

      // ======================================
      // RESERVAS SEGURAS
      // ======================================
      function montarPaginaReservas() {
        conteudoMais.innerHTML = `<h2>Reservas de produtos</h2><div class="card"><h3>Criar reserva</h3><form id="reservaForm"><label>Produto</label><select id="reservaProduto" required></select><label>Cliente</label><input id="reservaCliente" required maxlength="150"><label>Telefone (opcional)</label><input id="reservaTelefone" type="tel"><label>Quantidade</label><input id="reservaQuantidade" type="number" min="1" step="1" value="1" required><label>Vencimento (opcional)</label><input id="reservaVencimento" type="datetime-local"><label>Observação</label><textarea id="reservaObs" rows="2"></textarea><button type="submit">Criar reserva</button><p id="reservaMsg" class="tiny"></p></form></div><div class="card"><h3>Reservas da loja</h3><button type="button" class="secondary" id="atualizarReservas">Atualizar</button><div id="listaReservas">Carregando...</div></div>`;
        const sel = document.getElementById("reservaProduto"); sel.innerHTML = '<option value="">Selecione um produto</option>' + productList.filter(p => p.ativo !== false).map(p => `<option value="${safe(p.id)}">${safe(p.nome)} ${p.variacao ? "• " + safe(p.variacao) : ""} — disponível ${estoqueDisponivel[p.id] ?? saldos[p.id] ?? 0}</option>`).join("");
        document.getElementById("reservaForm").onsubmit = criarReservaUI;
        document.getElementById("atualizarReservas").onclick = carregarReservas;
      }
      async function carregarReservas() {
        const alvo = document.getElementById("listaReservas"); if (!alvo) return;
        alvo.textContent = "Consultando reservas...";
        const { data, error } = await db.from("reservas").select("id,produto_id,cliente,telefone,quantidade,vencimento,status,observacao").eq("loja_id", socio.loja_id).order("vencimento", { ascending: true }).limit(100);
        if (!document.getElementById("listaReservas")) return;
        if (error) { alvo.textContent = "Erro ao consultar reservas: " + error.message; return; }
        const rows = data || []; if (!rows.length) { alvo.innerHTML = "<p>Nenhuma reserva cadastrada.</p>"; return; }
        alvo.innerHTML = rows.map(r => { const prod = productList.find(p => p.id === r.produto_id); return `<div class="item"><strong>${safe(r.cliente)}</strong><p class="tiny muted">${safe(prod?.nome || "Produto")}${prod?.variacao ? " • " + safe(prod.variacao) : ""} • ${r.quantidade} unidade(s)</p><p class="tiny muted">Status: ${safe(r.status)} • Vencimento: ${safe(dataBR(r.vencimento))}</p>${r.telefone ? `<p class="tiny">${safe(r.telefone)}</p>` : ""}${r.observacao ? `<p class="tiny">${safe(r.observacao)}</p>` : ""}${r.status === "ativa" ? `<div class="grid"><button type="button" data-finalizar-reserva="${safe(r.id)}">Finalizar venda</button><button type="button" class="secondary" data-cancelar-reserva="${safe(r.id)}">Cancelar</button></div>` : ""}</div>`; }).join("");
        alvo.querySelectorAll("[data-cancelar-reserva]").forEach(btn => btn.onclick = async () => { if (!confirm("Cancelar esta reserva?")) return; btn.disabled = true; const { error: e } = await db.rpc("cancelar_reserva", { p_reserva_id: btn.dataset.cancelarReserva }); if (e) { alert("Erro ao cancelar: " + e.message); btn.disabled = false; return; } await carregarReservas(); });
        alvo.querySelectorAll("[data-finalizar-reserva]").forEach(btn => btn.onclick = async () => { const vendedor = vendedores.length === 1 ? vendedores[0] : vendedores.find(v => v.usuario_id === user.id) || vendedores[0]; if (!confirm(`Finalizar a venda desta reserva atribuindo a ${vendedor.nome}?`)) return; btn.disabled = true; const { error: e } = await db.rpc("finalizar_venda_reserva", { p_reserva_id: btn.dataset.finalizarReserva, p_vendedor_id: vendedor.usuario_id }); if (e) { alert("Erro ao finalizar reserva: " + e.message); btn.disabled = false; return; } alert("Venda da reserva finalizada."); await carregarReservas(); await carregarProdutos(); carregarProdutosVenda(); await carregarRecebimentos(); await carregarPainel(); });
      }
      async function criarReservaUI(e) {
        e.preventDefault(); const msg = document.getElementById("reservaMsg");
        const produto_id = document.getElementById("reservaProduto").value; const cliente = document.getElementById("reservaCliente").value.trim(); const telefone = document.getElementById("reservaTelefone").value.trim(); const quantidade = Number(document.getElementById("reservaQuantidade").value); const v = document.getElementById("reservaVencimento").value; const observacao = document.getElementById("reservaObs").value.trim();
        if (!produto_id || !cliente || !Number.isInteger(quantidade) || quantidade < 1) { msg.textContent = "Confira produto, cliente e quantidade."; return; }
        if (!confirm(`Criar reserva de ${quantidade} unidade(s) para ${cliente}? O estoque reservado ficará indisponível para outras vendas.`)) return;
        const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = "Criando reserva...";
        const { error } = await db.rpc("criar_reserva_segura", { p_produto_id: produto_id, p_cliente: cliente, p_quantidade: quantidade, p_telefone: telefone || null, p_vencimento: v ? new Date(v).toISOString() : null, p_observacao: observacao || null });
        if (error) msg.textContent = "Erro ao criar reserva: " + error.message;
        else { e.currentTarget.reset(); document.getElementById("reservaQuantidade").value = "1"; msg.textContent = "Reserva criada com sucesso."; await carregarReservas(); }
        btn.disabled = false;
      }

      // ======================================
      // TROCAS E DEVOLUÇÕES
      // ======================================
      function montarPaginaDevolucoes() {
        conteudoMais.innerHTML = `<h2>Devoluções</h2><p class="tiny muted">Este fluxo usa as funções seguras de devolução do Supabase. Trocas ainda precisam de uma função RPC segura específica; não fazemos gravações diretas nas tabelas de troca.</p><div class="card"><h3>Registrar devolução</h3><label>Venda original</label><select id="devolucaoVenda"><option value="">Carregando vendas...</option></select><button type="button" class="secondary" id="carregarItensDevolucao">Carregar itens da venda</button><p id="devolucaoMsg" class="tiny"></p><div id="itensDevolucao"></div><form id="devolucaoForm" class="hidden"><label>Motivo</label><input id="devolucaoMotivo" maxlength="200" placeholder="Ex.: Tamanho incorreto"><label>Observação</label><textarea id="devolucaoObs" rows="2"></textarea><label>Valor a reembolsar (R$)</label><input id="devolucaoValor" type="number" min="0" step="0.01" value="0" required><label>Forma de reembolso</label><select id="devolucaoForma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option></select><p class="tiny muted">Confirme apenas os itens realmente devolvidos. O reembolso não pode exceder o valor recebido nem o valor dos itens.</p><button type="submit">Concluir devolução</button></form></div>`;
        carregarVendasParaDevolucao();
        document.getElementById("carregarItensDevolucao").onclick = carregarItensVendaDevolucao;
        document.getElementById("devolucaoForm").onsubmit = processarDevolucaoUI;
      }
      async function carregarVendasParaDevolucao() {
        const sel = document.getElementById("devolucaoVenda"); if (!sel) return;
        const { data, error } = await db.from("vendas").select("id,cliente,valor_total,criado_em,situacao").eq("loja_id", socio.loja_id).neq("situacao", "cancelado").order("criado_em", { ascending: false }).limit(100);
        if (!document.getElementById("devolucaoVenda")) return;
        if (error) { sel.innerHTML = '<option value="">Erro ao consultar vendas</option>'; document.getElementById("devolucaoMsg").textContent = error.message; return; }
        sel.innerHTML = '<option value="">Selecione a venda</option>' + (data || []).map(v => `<option value="${safe(v.id)}">${safe(dataBR(v.criado_em))} • ${safe(v.cliente || "Cliente não informado")} • ${money(v.valor_total)} (${safe(v.situacao)})</option>`).join("");
      }
      async function carregarItensVendaDevolucao() {
        const vendaId = document.getElementById("devolucaoVenda").value; const msg = document.getElementById("devolucaoMsg"); const area = document.getElementById("itensDevolucao");
        document.getElementById("devolucaoForm").classList.add("hidden"); area.innerHTML = "";
        if (!vendaId) { msg.textContent = "Selecione uma venda."; return; }
        msg.textContent = "Consultando itens...";
        const { data, error } = await db.from("itens_venda").select("id,produto_id,quantidade,preco_unitario").eq("venda_id", vendaId);
        if (error) { msg.textContent = "Erro: " + error.message; return; }
        if (!data?.length) { msg.textContent = "A venda não possui itens encontrados."; return; }
        area.innerHTML = `<h3>Selecione os itens devolvidos</h3>` + data.map(i => { const p = productList.find(x => x.id === i.produto_id); return `<div class="item"><strong>${safe(p?.nome || "Produto")} ${p?.variacao ? "• " + safe(p.variacao) : ""}</strong><p class="tiny muted">Vendido: ${i.quantidade} • ${money(i.preco_unitario)} por unidade</p><label>Quantidade devolvida</label><input type="number" min="0" max="${i.quantidade}" step="1" value="0" data-devolucao-produto="${safe(i.produto_id)}" data-max="${i.quantidade}"></div>`; }).join("");
        document.getElementById("devolucaoForm").classList.remove("hidden"); msg.textContent = "Confira as quantidades antes de concluir.";
      }
      async function processarDevolucaoUI(e) {
        e.preventDefault(); const msg = document.getElementById("devolucaoMsg"); const vendaId = document.getElementById("devolucaoVenda").value;
        const itens = [...document.querySelectorAll("[data-devolucao-produto]")].map(x => ({ produto_id: x.dataset.devolucaoProduto, quantidade: Number(x.value), max: Number(x.dataset.max) })).filter(x => x.quantidade > 0);
        const valor = Number(document.getElementById("devolucaoValor").value); const forma = document.getElementById("devolucaoForma").value;
        if (!vendaId || !itens.length || itens.some(i => !Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > i.max) || !Number.isFinite(valor) || valor < 0 || cents(valor) !== Math.round(valor * 100)) { msg.textContent = "Selecione pelo menos um item e confira quantidades e reembolso."; return; }
        if (valor > 0 && !confirm(`Confirmar devolução e reembolso de ${money(valor)} por ${forma}?`)) return;
        if (valor === 0 && !confirm("Confirmar devolução dos itens sem reembolso em dinheiro?")) return;
        const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = "Abrindo devolução...";
        try {
          const { data: devolucaoId, error: erroAbertura } = await db.rpc("ws_abrir_devolucao", { p_venda_id: vendaId, p_motivo: document.getElementById("devolucaoMotivo").value.trim() || null, p_observacao: document.getElementById("devolucaoObs").value.trim() || null });
          if (erroAbertura) throw erroAbertura;
          for (const item of itens) { const { error } = await db.rpc("ws_adicionar_item_devolucao", { p_devolucao_id: devolucaoId, p_produto_id: item.produto_id, p_quantidade: item.quantidade }); if (error) throw new Error(`Devolução ${devolucaoId} criada, mas item não foi adicionado: ${error.message}. Não tente abrir outra sem conferir a pendente.`); }
          const { error: erroFinal } = await db.rpc("ws_concluir_devolucao", { p_devolucao_id: devolucaoId, p_valor_reembolso: cents(valor) / 100, p_forma_reembolso: valor > 0 ? forma : null });
          if (erroFinal) throw new Error(`Devolução ${devolucaoId} ficou pendente: ${erroFinal.message}. Confira o registro antes de repetir.`);
          msg.textContent = "Devolução concluída; estoque e eventual reembolso atualizados.";
          await carregarProdutos(); carregarProdutosVenda(); await carregarPainel();
          e.currentTarget.reset(); document.getElementById("itensDevolucao").innerHTML = ""; e.currentTarget.classList.add("hidden");
        } catch (err) { msg.textContent = "Atenção: " + err.message; }
        finally { btn.disabled = false; }
      }

      // ======================================
      // PARCELAS A RECEBER
      // ======================================
      function montarPaginaParcelas() {
        conteudoMais.innerHTML = `<h2>Parcelas a receber</h2><div class="card"><h3>Parcelar uma venda pendente</h3><label>Venda</label><select id="criarParcelasVenda"></select><div class="grid"><div><label>Número de parcelas</label><input id="numeroParcelas" type="number" min="2" max="36" step="1" value="3"></div><div><label>Primeiro vencimento</label><input id="primeiroVencimento" type="date" required></div></div><p class="tiny muted">As parcelas serão criadas pelo Supabase com base no total da venda. Não crie parcelas para uma venda que já tenha parcelas.</p><button type="button" id="botaoCriarParcelas">Criar parcelas</button><p id="parcelasMsg" class="tiny"></p></div><div class="card"><h3>Parcelas cadastradas</h3><button type="button" class="secondary" id="atualizarParcelas">Atualizar</button><div id="listaParcelas">Carregando...</div></div><div class="card"><h3>Registrar pagamento de parcela</h3><form id="receberParcelaForm"><label>Parcela</label><select id="parcelaSelecionada" required></select><label>Valor recebido (R$)</label><input id="valorParcela" type="number" min="0.01" step="0.01" required><label>Forma</label><select id="formaParcela"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="debito">Débito</option><option value="credito">Crédito</option></select><label>Taxa (R$)</label><input id="taxaParcela" type="number" min="0" step="0.01" value="0" required><button type="submit">Registrar pagamento</button><p id="receberParcelaMsg" class="tiny"></p></form></div>`;
        const today = new Date(); document.getElementById("primeiroVencimento").value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
        document.getElementById("atualizarParcelas").onclick = carregarParcelas;
        document.getElementById("botaoCriarParcelas").onclick = criarParcelasUI;
        document.getElementById("receberParcelaForm").onsubmit = receberParcelaUI;
      }
      async function carregarParcelas() {
        const alvo = document.getElementById("listaParcelas"); if (!alvo) return;
        alvo.textContent = "Consultando parcelas...";
        const [{ data: parcelas, error: ep }, { data: pagamentos, error: epp }, { data: vendas, error: ev }] = await Promise.all([
          db.from("parcelas_receber").select("id,venda_id,numero,valor,vencimento,loja_id").eq("loja_id", socio.loja_id).order("vencimento"),
          db.from("pagamentos_parcelas").select("parcela_id,valor").eq("loja_id", socio.loja_id),
          db.from("vendas").select("id,cliente,valor_total,situacao,criado_em").eq("loja_id", socio.loja_id).in("situacao", ["pendente", "parcial"]).order("criado_em", { ascending: false }).limit(200)
        ]);
        if (!document.getElementById("listaParcelas")) return;
        if (ep || epp || ev) { alvo.textContent = "Erro ao consultar parcelas: " + (ep || epp || ev).message; return; }
        const payMap = new Map(); for (const p of pagamentos || []) payMap.set(p.parcela_id, (payMap.get(p.parcela_id) || 0) + cents(p.valor));
        const vMap = new Map((vendas || []).map(v => [v.id, v]));
        const pendentes = (parcelas || []).filter(p => cents(p.valor) > (payMap.get(p.id) || 0));
        const sel = document.getElementById("parcelaSelecionada"); if (sel) sel.innerHTML = '<option value="">Selecione uma parcela pendente</option>' + pendentes.map(p => { const v = vMap.get(p.venda_id); const saldo = (cents(p.valor) - (payMap.get(p.id) || 0)) / 100; return `<option value="${safe(p.id)}" data-saldo="${saldo.toFixed(2)}">Parcela ${p.numero} • ${safe(v?.cliente || "Cliente")} • vence ${safe(p.vencimento)} • saldo ${money(saldo)}</option>`; }).join("");
        const saleSel = document.getElementById("criarParcelasVenda"); if (saleSel) {
          const existing = new Set((parcelas || []).map(p => p.venda_id));
          saleSel.innerHTML = '<option value="">Selecione uma venda sem parcelas</option>' + (vendas || []).filter(v => !existing.has(v.id)).map(v => `<option value="${safe(v.id)}">${safe(v.cliente || "Cliente")} • ${money(v.valor_total)} • ${safe(dataBR(v.criado_em))}</option>`).join("");
        }
        if (!(parcelas || []).length) { alvo.innerHTML = "<p>Nenhuma parcela cadastrada.</p>"; return; }
        alvo.innerHTML = (parcelas || []).map(p => { const v = vMap.get(p.venda_id); const pago = payMap.get(p.id) || 0; const saldo = cents(p.valor) - pago; return `<div class="item"><strong>${safe(v?.cliente || "Venda")}: parcela ${p.numero}</strong><p class="tiny muted">Vencimento ${safe(p.vencimento)} • Valor ${money(p.valor)} • Pago ${money(pago/100)} • Saldo ${money(Math.max(0,saldo)/100)}</p></div>`; }).join("");
      }
      async function criarParcelasUI() {
        const vendaId = document.getElementById("criarParcelasVenda").value; const numero = Number(document.getElementById("numeroParcelas").value); const dataInicio = document.getElementById("primeiroVencimento").value; const msg = document.getElementById("parcelasMsg");
        if (!vendaId || !Number.isInteger(numero) || numero < 2 || numero > 36 || !dataInicio) { msg.textContent = "Selecione uma venda, número de parcelas e vencimento válido."; return; }
        if (!confirm(`Criar ${numero} parcelas para esta venda, começando em ${dataInicio}?`)) return;
        const datas = []; const base = new Date(`${dataInicio}T12:00:00`);
        for (let i=0;i<numero;i++) {
          const ano = base.getFullYear(); const mesBase = base.getMonth(); const dia = base.getDate();
          const alvoMes = mesBase + i; const anoAlvo = ano + Math.floor(alvoMes / 12); const mesAlvo = ((alvoMes % 12) + 12) % 12;
          const ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate(); const d = new Date(anoAlvo, mesAlvo, Math.min(dia, ultimoDia), 12, 0, 0);
          datas.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
        }
        const btn = document.getElementById("botaoCriarParcelas"); btn.disabled = true; msg.textContent = "Criando parcelas...";
        const { error } = await db.rpc("criar_parcelas_venda", { p_venda_id: vendaId, p_vencimentos: datas });
        if (error) msg.textContent = "Não foi possível criar parcelas: " + error.message;
        else { msg.textContent = "Parcelas criadas."; await carregarParcelas(); }
        btn.disabled = false;
      }
      async function receberParcelaUI(e) {
        e.preventDefault(); const id = document.getElementById("parcelaSelecionada").value; const valor = Number(document.getElementById("valorParcela").value); const forma = document.getElementById("formaParcela").value; const taxa = Number(document.getElementById("taxaParcela").value); const msg = document.getElementById("receberParcelaMsg");
        if (!id || !Number.isFinite(valor) || valor <= 0 || !Number.isFinite(taxa) || taxa < 0 || taxa > valor) { msg.textContent = "Confira parcela, valor e taxa."; return; }
        if (!confirm(`Registrar recebimento de ${money(valor)} da parcela?`)) return;
        const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true; msg.textContent = "Registrando...";
        const { error } = await db.rpc("receber_parcela", { p_parcela_id: id, p_valor: cents(valor)/100, p_forma: forma, p_taxa: cents(taxa)/100 });
        if (error) msg.textContent = "Erro ao receber parcela: " + error.message;
        else { msg.textContent = "Pagamento de parcela registrado."; e.currentTarget.reset(); document.getElementById("taxaParcela").value = "0"; await carregarParcelas(); await carregarRecebimentos(); await carregarPainel(); }
        btn.disabled = false;
      }

      // ======================================
      // REPASSES DE CARTÃO
      // ======================================

      function montarPaginaRepasses() {
        conteudoMais.innerHTML = `
          <h2>Repasses de cartão</h2>

          <p class="muted">
            Acompanhe os valores previstos pelas operadoras e confirme
            quando o dinheiro realmente entrar na conta bancária.
          </p>

          <div class="grid">
            <div class="card">
              <small>Repasses pendentes</small>
              <div class="num" id="repassesTotalPendente">—</div>
            </div>
            <div class="card">
              <small>Repasses recebidos</small>
              <div class="num" id="repassesTotalRecebido">—</div>
            </div>
          </div>

          <div class="card">
            <div class="row" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
              <h3 style="margin:0">Histórico de repasses</h3>
              <button type="button" class="secondary" id="atualizarRepasses">Atualizar</button>
            </div>
            <p id="repassesAviso" class="tiny muted" aria-live="polite"></p>
            <div id="listaRepasses"></div>
          </div>`;

        document.getElementById("atualizarRepasses").onclick =
          carregarRepasses;
      }

      async function carregarRepasses() {
        const aviso = document.getElementById("repassesAviso");
        const lista = document.getElementById("listaRepasses");
        const totalPendente = document.getElementById("repassesTotalPendente");
        const totalRecebido = document.getElementById("repassesTotalRecebido");

        if (!aviso || !lista || !totalPendente || !totalRecebido) return;

        aviso.textContent = "Consultando repasses...";
        lista.innerHTML = "";
        totalPendente.textContent = "—";
        totalRecebido.textContent = "—";

        const { data: repasses, error } = await db
          .from("repasses_cartao")
          .select("id,recebimento_id,valor_bruto,taxa,valor_liquido,previsao_repasse,data_repasse,status,operadora,observacao,criado_em")
          .eq("loja_id", socio.loja_id)
          .order("criado_em", { ascending: false })
          .limit(200);

        if (error) {
          aviso.textContent =
            "Não foi possível carregar os repasses: " + error.message;
          lista.innerHTML = `
            <p class="tiny muted">
              Confira sua conexão e as permissões de consulta da loja.
            </p>`;
          return;
        }

        const registros = repasses || [];
        const pendentes = registros.filter(r => r.status === "pendente");
        const recebidos = registros.filter(r => r.status === "recebido");

        totalPendente.textContent = money(
          pendentes.reduce((s, r) => s + Number(r.valor_liquido || 0), 0)
        );
        totalRecebido.textContent = money(
          recebidos.reduce((s, r) => s + Number(r.valor_liquido || 0), 0)
        );

        if (!registros.length) {
          aviso.textContent = "Nenhum repasse de cartão encontrado.";
          lista.innerHTML = `
            <div class="item">
              <p>Quando houver um recebimento no crédito, o repasse pendente aparecerá aqui automaticamente.</p>
            </div>`;
          return;
        }

        aviso.textContent = `${registros.length} repasse(s) encontrado(s).`;
        lista.innerHTML = registros.map(r => {
          const recebido = r.status === "recebido";
          const cancelado = r.status === "cancelado";
          const statusLabel = recebido ? "Recebido" : cancelado ? "Cancelado" : (r.status || "Pendente");
          const previsao = r.previsao_repasse
            ? new Date(`${r.previsao_repasse}T12:00:00`).toLocaleDateString("pt-BR")
            : "Não informada";
          const dataRecebimento = r.data_repasse
            ? new Date(`${r.data_repasse}T12:00:00`).toLocaleDateString("pt-BR")
            : "—";

          return `
            <div class="item">
              <div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap">
                <strong>${safe(r.operadora || "Operadora não informada")}</strong>
                <span class="pill">${safe(statusLabel)}</span>
              </div>
              <p class="tiny muted">
                Criado em ${safe(dataBR(r.criado_em))}
              </p>
              <div class="grid">
                <div>
                  <small class="muted">Valor bruto</small>
                  <div><strong>${money(r.valor_bruto)}</strong></div>
                </div>
                <div>
                  <small class="muted">Taxa</small>
                  <div><strong>${money(r.taxa)}</strong></div>
                </div>
                <div>
                  <small class="muted">Valor líquido</small>
                  <div><strong class="accent">${money(r.valor_liquido)}</strong></div>
                </div>
                <div>
                  <small class="muted">Previsão</small>
                  <div><strong>${safe(previsao)}</strong></div>
                </div>
              </div>
              ${recebido ? `<p class="tiny muted">Recebido em: ${safe(dataRecebimento)}</p>` : ""}
              ${r.observacao ? `<p class="tiny muted">${safe(r.observacao)}</p>` : ""}
              ${r.status === "pendente" ? `
                <button type="button" data-confirmar-repasse="${safe(r.id)}">
                  Confirmar recebimento
                </button>
                <p class="tiny muted">Confirme somente depois de verificar que o valor entrou na conta bancária.</p>
              ` : ""}
            </div>`;
        }).join("");

        lista.querySelectorAll("[data-confirmar-repasse]").forEach(botao => {
          botao.onclick = async () => {
            const repasseId = botao.dataset.confirmarRepasse;
            if (!repasseId) return;

            const confirmado = window.confirm(
              "Confirma que este repasse já entrou na conta bancária? Essa ação registra a entrada no caixa e não deve ser repetida."
            );
            if (!confirmado) return;

            botao.disabled = true;
            botao.textContent = "Confirmando...";

            const { error: erroConfirmacao } = await db.rpc(
              "confirmar_repasse_cartao",
              { p_repasse_id: repasseId }
            );

            if (erroConfirmacao) {
              alert("Não foi possível confirmar o repasse: " + erroConfirmacao.message);
              botao.disabled = false;
              botao.textContent = "Confirmar recebimento";
              return;
            }

            alert("Repasse confirmado e entrada registrada no banco.");
            await carregarRepasses();
            await carregarPainel();
            if (typeof carregarHistorico === "function") {
              await carregarHistorico();
            }
          };
        });
      }

      // ======================================
      // COMPRAS DE MERCADORIAS
      // ======================================

      const itensCompra = new Map();

      function montarPaginaCompras() {
        itensCompra.clear();

        conteudoMais.innerHTML = `
          <h2>Compras de mercadorias</h2>

          <div class="card">
            <h3>Adicionar produtos à compra</h3>

            <p class="tiny muted">
              Responsável:
              <strong>${safe(socio.nome)}</strong>
            </p>

            <label>Produto</label>
            <select id="compraProduto">
              <option value="">Selecione um produto</option>
            </select>

            <label>Quantidade comprada</label>
            <input
              id="compraQuantidade"
              type="number"
              min="1"
              step="1"
              value="1"
            >

            <label>Custo unitário (R$)</label>
            <input
              id="compraCusto"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
            >

            <button
              type="button"
              id="adicionarItemCompra"
            >
              Adicionar à compra
            </button>

            <p id="compraAviso" class="tiny"></p>
          </div>

          <div class="card">
            <h3>Produtos desta compra</h3>

            <div id="listaItensCompra">
              Nenhum produto adicionado.
            </div>

            <h3 id="totalCompra">
              Total: ${money(0)}
            </h3>
          </div>

          <div class="card">
            <h3>Pagamento da compra</h3>

            <label>Conta utilizada</label>
            <select id="compraConta">
              <option value="banco">Banco</option>
              <option value="dinheiro">Dinheiro físico</option>
            </select>

            <label>Forma de pagamento</label>
            <select id="compraForma">
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">
                Transferência
              </option>
              <option value="cartao">Cartão</option>
            </select>

            <label>Observação (opcional)</label>
            <input
              id="compraObservacao"
              maxlength="200"
              placeholder="Ex.: Reposição de camisetas"
            >

            <p class="tiny muted">
              Registre apenas compras já pagas.
              O total será descontado uma única vez
              da conta escolhida e os produtos
              serão adicionados ao estoque.
            </p>

            <button
              type="button"
              id="salvarCompra"
            >
              Registrar compra
            </button>

            <p id="compraMensagem" class="tiny"></p>
          </div>

          <div class="card">
            <h3>Compras recentes</h3>

            <button
              type="button"
              id="atualizarCompras"
              class="secondary"
            >
              Atualizar histórico
            </button>

            <div id="historicoCompras">
              Carregando...
            </div>
          </div>`;

        const seletor =
          document.getElementById("compraProduto");

        for (const p of productList) {
          seletor.add(
            new Option(
              `${p.nome}${p.variacao
                ? " - " + p.variacao
                : ""} (${p.codigo})`,
              p.id
            )
          );
        }

        seletor.onchange = () => {
          const produto = productList.find(
            p => p.id === seletor.value
          );

          document.getElementById("compraCusto")
            .value = produto
              ? Number(produto.custo || 0).toFixed(2)
              : "";
        };

        document.getElementById("adicionarItemCompra")
          .onclick = adicionarItemCompra;

        document.getElementById("salvarCompra")
          .onclick = registrarCompra;

        document.getElementById("atualizarCompras")
          .onclick = carregarHistoricoCompras;

        renderItensCompra();
      }

      function totalCompraCentavos() {
        let total = 0;

        for (const item of itensCompra.values()) {
          total +=
            cents(item.custo_unitario) *
            item.quantidade;
        }

        return total;
      }

      function renderItensCompra() {
        const lista =
          document.getElementById("listaItensCompra");

        const total =
          document.getElementById("totalCompra");

        if (!lista || !total) return;

        lista.innerHTML = itensCompra.size
          ? [...itensCompra.values()].map(item => {
              const p = productList.find(
                x => x.id === item.produto_id
              );

              return `
                <div class="item">
                  <strong>
                    ${safe(p?.nome || "Produto")}
                    ${safe(p?.variacao || "")}
                  </strong>

                  <p class="tiny">
                    ${item.quantidade} ×
                    ${money(item.custo_unitario)}
                    = ${money(
                      item.quantidade *
                      item.custo_unitario
                    )}
                  </p>

                  <button
                    type="button"
                    class="secondary"
                    data-remover-compra="${safe(
                      item.produto_id
                    )}"
                  >
                    Remover
                  </button>
                </div>`;
            }).join("")
          : "<p>Nenhum produto adicionado.</p>";

        total.textContent =
          "Total da compra: " +
          money(totalCompraCentavos() / 100);

        lista
          .querySelectorAll("[data-remover-compra]")
          .forEach(botao => {
            botao.onclick = () => {
              itensCompra.delete(
                botao.dataset.removerCompra
              );

              renderItensCompra();
            };
          });
      }

      function adicionarItemCompra() {
        const aviso =
          document.getElementById("compraAviso");

        const produtoId =
          document.getElementById("compraProduto").value;

        const quantidade = Number(
          document.getElementById(
            "compraQuantidade"
          ).value
        );

        const custo = Number(
          document.getElementById("compraCusto").value
        );

        const custoCentavos = cents(custo);

        if (
          !produtoId ||
          !productList.some(p => p.id === produtoId) ||
          !Number.isInteger(quantidade) ||
          quantidade <= 0 ||
          !Number.isFinite(custo) ||
          custo < 0 ||
          custoCentavos < 0
        ) {
          aviso.textContent =
            "Selecione um produto e informe quantidade e custo válidos.";
          return;
        }

        const existente = itensCompra.get(produtoId);

        if (
          existente &&
          cents(existente.custo_unitario) !== custoCentavos
        ) {
          aviso.textContent =
            "Este produto já está na compra com outro custo. " +
            "Remova o item antes de alterar o custo.";
          return;
        }

        itensCompra.set(produtoId, {
          produto_id: produtoId,
          quantidade:
            (existente?.quantidade || 0) + quantidade,
          custo_unitario: custoCentavos / 100
        });

        document.getElementById(
          "compraQuantidade"
        ).value = "1";

        aviso.textContent =
          "Produto adicionado à compra.";

        renderItensCompra();
      }

      async function registrarCompra() {
        const mensagem =
          document.getElementById("compraMensagem");

        const botao =
          document.getElementById("salvarCompra");

        if (!itensCompra.size) {
          mensagem.textContent =
            "Adicione pelo menos um produto.";
          return;
        }

        const totalCentavos = totalCompraCentavos();

        if (totalCentavos <= 0) {
          mensagem.textContent =
            "O total da compra deve ser maior que zero.";
          return;
        }

        const conta =
          document.getElementById("compraConta").value;

        const forma =
          document.getElementById("compraForma").value;

        const observacao =
          document.getElementById(
            "compraObservacao"
          ).value.trim();

        if (
          !["banco", "dinheiro"].includes(conta) ||
          ![
            "pix",
            "dinheiro",
            "cartao",
            "transferencia"
          ].includes(forma)
        ) {
          mensagem.textContent =
            "Selecione uma conta e uma forma de pagamento válidas.";
          return;
        }

        if (!confirm(
          `Confirmar compra de ${money(
            totalCentavos / 100
          )} com ${itensCompra.size} produto(s)?\n\n` +
          `O valor será descontado da conta ${conta} ` +
          `e o estoque será atualizado.`
        )) {
          return;
        }

        botao.disabled = true;
        mensagem.textContent =
          "Registrando compra...";

        try {
          const payload = [...itensCompra.values()];

          const { data: compraId, error } =
            await db.rpc("registrar_compra_lote", {
              p_itens: payload,
              p_conta: conta,
              p_forma_pagamento: forma,
              p_observacao: observacao || null
            });

          if (error) {
            mensagem.textContent =
              "Erro ao registrar compra: " +
              error.message;
            return;
          }

          itensCompra.clear();
          renderItensCompra();

          document.getElementById(
            "compraObservacao"
          ).value = "";

          mensagem.textContent =
            "Compra registrada com sucesso! Código: " +
            compraId;

          if (await carregarProdutos()) {
            carregarProdutosVenda();
          }

          await carregarHistoricoCompras();
          await carregarPainel();

          alert(
            "Compra registrada com sucesso! " +
            "O estoque e o caixa foram atualizados."
          );

        } catch (err) {
          mensagem.textContent =
            "Erro: " + err.message;
        } finally {
          botao.disabled = false;
        }
      }

      async function carregarHistoricoCompras() {
        const lista =
          document.getElementById("historicoCompras");

        if (!lista) return;

        lista.textContent =
          "Consultando compras...";

        const { data: compras, error } = await db
          .from("compras_lotes")
          .select(
            "id,valor_total,conta,forma_pagamento,observacao,criado_em"
          )
          .eq("loja_id", socio.loja_id)
          .order("criado_em", {
            ascending: false
          })
          .limit(50);

        if (!document.getElementById(
          "historicoCompras"
        )) {
          return;
        }

        if (error) {
          lista.textContent =
            "Erro ao consultar compras: " +
            error.message;
          return;
        }

        if (!compras?.length) {
          lista.innerHTML =
            "<p>Nenhuma compra registrada.</p>";
          return;
        }

        const total = compras.reduce(
          (soma, c) => soma + cents(c.valor_total),
          0
        );

        lista.innerHTML = `
          <p class="tiny muted">
            Últimas ${compras.length} compras
          </p>

          <p>
            <strong>
              Total listado: ${money(total / 100)}
            </strong>
          </p>

          ${compras.map(c => `
            <div class="item">
              <strong>${money(c.valor_total)}</strong>

              <div class="tiny muted">
                ${c.conta === "banco"
                  ? "Banco"
                  : "Dinheiro físico"}
                • ${safe(c.forma_pagamento)}
                • ${safe(dataBR(c.criado_em))}
              </div>

              ${c.observacao
                ? `<p class="tiny">
                    ${safe(c.observacao)}
                  </p>`
                : ""}
            </div>
          `).join("")}
        `;
      }

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

        document.getElementById(
          "atualizarDespesas"
        ).onclick = carregarDespesas;

        document.getElementById(
          "despesaForm"
        ).onsubmit = registrarDespesa;

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

        if (!document.getElementById(
          "listaDespesas"
        )) {
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
          document.getElementById(
            "despesaDescricao"
          ).value.trim();

        const categoria =
          document.getElementById(
            "despesaCategoria"
          ).value;

        const conta =
          document.getElementById(
            "despesaConta"
          ).value;

        const valor = Number(
          document.getElementById(
            "despesaValor"
          ).value
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
        mensagem.textContent =
          "Registrando despesa...";

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
      // RELATÓRIOS E LUCROS
      // ======================================

      let geracaoRelatorio = 0;

      function dataLocalRelatorio(data) {
        const ano = data.getFullYear();
        const mes = String(
          data.getMonth() + 1
        ).padStart(2, "0");
        const dia = String(
          data.getDate()
        ).padStart(2, "0");

        return `${ano}-${mes}-${dia}`;
      }

      function inicioDiaRelatorio(valor) {
        const [ano, mes, dia] = valor
          .split("-")
          .map(Number);

        return new Date(ano, mes - 1, dia);
      }

      function nomeProdutoRelatorio(produto) {
        return [
          produto.nome,
          produto.variacao,
          produto.codigo
        ].filter(Boolean).join(" • ");
      }

      async function consultarTodasRelatorio(
        tabela,
        campos,
        configurar
      ) {
        const resultado = [];
        const tamanhoPagina = 1000;

        for (
          let inicio = 0;
          ;
          inicio += tamanhoPagina
        ) {
          let consulta = db
            .from(tabela)
            .select(campos);

          consulta = configurar(consulta);

          const { data, error } =
            await consulta.range(
              inicio,
              inicio + tamanhoPagina - 1
            );

          if (error) throw error;

          resultado.push(...(data || []));

          if (
            !data ||
            data.length < tamanhoPagina
          ) {
            break;
          }

          if (inicio >= 999000) {
            throw new Error(
              "Consulta muito grande. " +
              "Selecione um período menor."
            );
          }
        }

        return resultado;
      }

      function montarPaginaRelatorios() {
        const hoje = new Date();
        const inicio = new Date(hoje);

        inicio.setDate(
          inicio.getDate() - 29
        );

        conteudoMais.innerHTML = `
          <h2>Relatórios e lucros</h2>

          <div class="card">
            <h3>Selecionar período</h3>

            <label>Período</label>

            <select id="relPeriodo">
              <option value="hoje">Hoje</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30" selected>
                Últimos 30 dias
              </option>
              <option value="mes">Este mês</option>
              <option value="personalizado">
                Personalizado
              </option>
            </select>

            <label>Data inicial</label>
            <input
              id="relInicio"
              type="date"
              value="${dataLocalRelatorio(inicio)}"
            >

            <label>Data final</label>
            <input
              id="relFim"
              type="date"
              value="${dataLocalRelatorio(hoje)}"
            >

            <button
              type="button"
              id="relAtualizar"
            >
              Atualizar relatório
            </button>

            <p
              id="relAviso"
              class="tiny muted"
            ></p>
          </div>

          <div id="relResultado">
            <div class="card">
              Carregando relatórios...
            </div>
          </div>
        `;

        document.getElementById(
          "relPeriodo"
        ).onchange = () => {
          const periodo =
            document.getElementById(
              "relPeriodo"
            ).value;

          const agora = new Date();
          const comeco = new Date(agora);

          if (periodo === "hoje") {
            // Mesmo dia.
          } else if (periodo === "7") {
            comeco.setDate(
              comeco.getDate() - 6
            );
          } else if (periodo === "30") {
            comeco.setDate(
              comeco.getDate() - 29
            );
          } else if (periodo === "mes") {
            comeco.setDate(1);
          } else {
            return;
          }

          document.getElementById(
            "relInicio"
          ).value = dataLocalRelatorio(comeco);

          document.getElementById(
            "relFim"
          ).value = dataLocalRelatorio(agora);

          carregarRelatorios();
        };

        document.getElementById(
          "relAtualizar"
        ).onclick = carregarRelatorios;

        document.getElementById(
          "relInicio"
        ).onchange = () => {
          document.getElementById(
            "relPeriodo"
          ).value = "personalizado";
        };

        document.getElementById(
          "relFim"
        ).onchange = () => {
          document.getElementById(
            "relPeriodo"
          ).value = "personalizado";
        };
      }

      function barraRelatorio(
        nome,
        valor,
        maximo,
        descricao
      ) {
        const percentual = maximo > 0
          ? Math.max(
              0,
              Math.min(
                100,
                valor / maximo * 100
              )
            )
          : 0;

        return `
          <div class="item">
            <strong>${safe(nome)}</strong>

            <p class="tiny">
              ${safe(descricao)}
            </p>

            <div style="
              width:100%;
              height:12px;
              background:#e5e7eb;
              border-radius:8px;
              overflow:hidden;
            ">
              <div style="
                width:${percentual.toFixed(2)}%;
                height:100%;
                background:#2563eb;
                border-radius:8px;
              "></div>
            </div>
          </div>
        `;
      }

      async function carregarRelatorios() {
        const resultado =
          document.getElementById(
            "relResultado"
          );

        const aviso =
          document.getElementById(
            "relAviso"
          );

        if (!resultado || !aviso) return;

        const token = ++geracaoRelatorio;

        const inicio =
          document.getElementById(
            "relInicio"
          ).value;

        const fim =
          document.getElementById(
            "relFim"
          ).value;

        if (
          !inicio ||
          !fim ||
          inicio > fim
        ) {
          aviso.textContent =
            "Selecione um período válido.";
          return;
        }

        const dataInicial =
          inicioDiaRelatorio(inicio);

        const dataFinal =
          inicioDiaRelatorio(fim);

        dataFinal.setDate(
          dataFinal.getDate() + 1
        );

        const de = dataInicial.toISOString();
        const ate = dataFinal.toISOString();

        aviso.textContent =
          "Consultando dados...";

        resultado.innerHTML = `
          <div class="card">
            Calculando faturamento,
            despesas e lucros...
          </div>
        `;

        try {
          const [
            vendas,
            despesas,
            recebimentos,
            sociosLista
          ] = await Promise.all([
            consultarTodasRelatorio(
              "vendas",
              "id,vendedor_id,valor_total,situacao,criado_em",
              q => q
                .eq("loja_id", socio.loja_id)
                .gte("criado_em", de)
                .lt("criado_em", ate)
                .order("criado_em")
                .order("id")
            ),

            consultarTodasRelatorio(
              "despesas",
              "id,valor,categoria,criado_em",
              q => q
                .eq("loja_id", socio.loja_id)
                .gte("criado_em", de)
                .lt("criado_em", ate)
                .order("criado_em")
                .order("id")
            ),

            consultarTodasRelatorio(
              "recebimentos",
              "id,venda_id,valor,valor_liquido,forma,data_recebimento",
              q => q
                .eq("loja_id", socio.loja_id)
                .gte("data_recebimento", de)
                .lt("data_recebimento", ate)
                .order("data_recebimento")
                .order("id")
            ),

            consultarTodasRelatorio(
              "socios",
              "usuario_id,nome",
              q => q
                .eq("loja_id", socio.loja_id)
                .order("usuario_id")
            )
          ]);

          const vendasValidas =
            vendas.filter(
              v => String(
                v.situacao || ""
              ).toLowerCase() !== "cancelado"
            );

          const itens = [];

          const ids = vendasValidas.map(
            v => v.id
          );

          for (
            let i = 0;
            i < ids.length;
            i += 100
          ) {
            const lote = ids.slice(
              i,
              i + 100
            );

            const encontrados =
              await consultarTodasRelatorio(
                "itens_venda",
                "id,venda_id,produto_id,quantidade,preco_unitario,custo_unitario,valor_liquido_total,desconto_total",
                q => q
                  .in("venda_id", lote)
                  .order("id")
              );

            itens.push(...encontrados);
          }

          if (
            token !== geracaoRelatorio ||
            !document.getElementById(
              "relResultado"
            )
          ) {
            return;
          }

          // ==================================
          // RESUMO FINANCEIRO
          // ==================================

          const faturamento =
            vendasValidas.reduce(
              (soma, v) =>
                soma + cents(v.valor_total),
              0
            );

          const custoMercadorias =
            itens.reduce(
              (soma, item) =>
                soma +
                cents(item.custo_unitario) *
                Number(item.quantidade || 0),
              0
            );

          const totalDespesas =
            despesas.reduce(
              (soma, d) =>
                soma + cents(d.valor),
              0
            );

          const lucroBruto =
            faturamento - custoMercadorias;

          const lucroOperacional =
            lucroBruto - totalDespesas;

          const totalRecebido =
            recebimentos.reduce(
              (soma, r) =>
                soma + cents(r.valor),
              0
            );

          const recebidoLiquido =
            recebimentos.reduce(
              (soma, r) =>
                soma + cents(
                  r.valor_liquido == null
                    ? r.valor
                    : r.valor_liquido
                ),
              0
            );

          const taxasRecebimento =
            totalRecebido - recebidoLiquido;

          // ==================================
          // VENDAS POR SÓCIO
          // ==================================

          const porSocio = new Map();

          for (const s of sociosLista) {
            porSocio.set(s.usuario_id, {
              nome: s.nome,
              quantidade: 0,
              faturamento: 0
            });
          }

          for (const venda of vendasValidas) {
            if (
              !porSocio.has(venda.vendedor_id)
            ) {
              porSocio.set(
                venda.vendedor_id,
                {
                  nome:
                    "Vendedor não identificado",
                  quantidade: 0,
                  faturamento: 0
                }
              );
            }

            const registro =
              porSocio.get(
                venda.vendedor_id
              );

            registro.quantidade += 1;

            registro.faturamento +=
              cents(venda.valor_total);
          }

          // ==================================
          // RESULTADOS POR PRODUTO
          // ==================================

          const produtos = new Map();

          for (const p of productList) {
            produtos.set(p.id, {
              id: p.id,
              nome: p.nome,
              codigo: p.codigo,
              variacao: p.variacao,
              estoque: Number(
                saldos[p.id] || 0
              ),
              quantidade: 0,
              faturamento: 0,
              custo: 0
            });
          }

          const itensPorVenda = new Map();

          for (const item of itens) {
            if (
              !itensPorVenda.has(
                item.venda_id
              )
            ) {
              itensPorVenda.set(
                item.venda_id,
                []
              );
            }

            itensPorVenda
              .get(item.venda_id)
              .push(item);
          }

          const vendasPorId = new Map(
            vendasValidas.map(
              v => [v.id, v]
            )
          );

          for (const [
            vendaId,
            itensDaVenda
          ] of itensPorVenda) {
            const venda =
              vendasPorId.get(vendaId);

            if (!venda) continue;

            const totalVenda =
              cents(venda.valor_total);

            const valoresOriginais =
              itensDaVenda.map(item => {
                const quantidade =
                  Number(
                    item.quantidade || 0
                  );

                if (
                  item.valor_liquido_total != null
                ) {
                  return cents(
                    item.valor_liquido_total
                  );
                }

                return (
                  cents(
                    item.preco_unitario
                  ) * quantidade -
                  cents(
                    item.desconto_total
                  )
                );
              });

            const somaOriginal =
              valoresOriginais.reduce(
                (soma, valor) =>
                  soma + valor,
                0
              );

            let valorDistribuido = 0;

            for (
              let i = 0;
              i < itensDaVenda.length;
              i++
            ) {
              const item =
                itensDaVenda[i];

              const quantidade =
                Number(
                  item.quantidade || 0
                );

              if (
                !produtos.has(
                  item.produto_id
                )
              ) {
                produtos.set(
                  item.produto_id,
                  {
                    id: item.produto_id,
                    nome:
                      "Produto não encontrado",
                    codigo: "",
                    variacao: "",
                    estoque: 0,
                    quantidade: 0,
                    faturamento: 0,
                    custo: 0
                  }
                );
              }

              const p = produtos.get(
                item.produto_id
              );

              let valorItem;

              if (
                i ===
                itensDaVenda.length - 1
              ) {
                valorItem =
                  totalVenda -
                  valorDistribuido;
              } else if (
                somaOriginal > 0
              ) {
                valorItem = Math.round(
                  totalVenda *
                  valoresOriginais[i] /
                  somaOriginal
                );
              } else {
                valorItem = Math.round(
                  totalVenda /
                  itensDaVenda.length
                );
              }

              valorDistribuido += valorItem;

              p.quantidade += quantidade;

              p.faturamento += valorItem;

              p.custo +=
                cents(
                  item.custo_unitario
                ) * quantidade;
            }
          }

          const ranking =
            [...produtos.values()]
              .filter(
                p => p.quantidade > 0
              )
              .sort(
                (a, b) =>
                  b.quantidade -
                  a.quantidade
              );

          const maisLucrativos =
            [...ranking].sort(
              (a, b) =>
                (
                  b.faturamento -
                  b.custo
                ) -
                (
                  a.faturamento -
                  a.custo
                )
            );

          // ==================================
          // SUGESTÃO DE REPOSIÇÃO
          // ==================================

          const diasPeriodo = Math.max(
            1,
            Math.round(
              (
                dataFinal -
                dataInicial
              ) / 86400000
            )
          );

          const reposicao =
            ranking.map(p => {
              const mediaDiaria =
                p.quantidade /
                diasPeriodo;

              const cobertura =
                mediaDiaria > 0
                  ? p.estoque /
                    mediaDiaria
                  : Infinity;

              const estoqueAlvo =
                Math.ceil(
                  mediaDiaria * 14
                );

              const comprar =
                Math.max(
                  0,
                  estoqueAlvo -
                  p.estoque
                );

              let prioridade = "Baixa";

              if (cobertura <= 7) {
                prioridade = "Alta";
              } else if (
                cobertura <= 14
              ) {
                prioridade = "Média";
              }

              return {
                ...p,
                mediaDiaria,
                cobertura,
                comprar,
                prioridade
              };
            });

          const ordem = {
            Alta: 0,
            Média: 1,
            Baixa: 2
          };

          reposicao.sort(
            (a, b) =>
              ordem[a.prioridade] -
              ordem[b.prioridade] ||
              b.quantidade -
              a.quantidade
          );

          // ==================================
          // MONTAGEM DOS RESULTADOS
          // ==================================

          const cartao = (
            titulo,
            valor
          ) => `
            <div class="card">
              <small>
                ${safe(titulo)}
              </small>

              <div class="num">
                ${money(valor / 100)}
              </div>
            </div>
          `;

          const maxQuantidade =
            ranking[0]?.quantidade || 0;

          const maxLucro = Math.max(
            0,
            ...maisLucrativos.map(
              p =>
                p.faturamento -
                p.custo
            )
          );

          resultado.innerHTML = `
            <h3>Resumo financeiro</h3>

            <div class="grid">
              ${cartao(
                "Faturamento das vendas",
                faturamento
              )}

              ${cartao(
                "Custo das mercadorias vendidas",
                custoMercadorias
              )}

              ${cartao(
                "Lucro bruto estimado",
                lucroBruto
              )}

              ${cartao(
                "Despesas pagas",
                totalDespesas
              )}

              ${cartao(
                "Lucro operacional estimado",
                lucroOperacional
              )}

              ${cartao(
                "Pagamentos recebidos",
                totalRecebido
              )}

              ${cartao(
                "Recebimentos líquidos informados",
                recebidoLiquido
              )}

              ${cartao(
                "Taxas dos recebimentos",
                taxasRecebimento
              )}
            </div>

            <div class="card">
              <h3>Resultado do período</h3>

              <p>
                <strong>
                  ${vendasValidas.length}
                </strong>
                vendas não canceladas
              </p>

              <p class="tiny muted">
                O faturamento considera a data
                da venda, inclusive vendas
                pendentes. Os recebimentos
                consideram a data do pagamento.
              </p>

              <p class="tiny muted">
                Lucro estimado = faturamento
                menos custo das mercadorias
                vendidas e despesas registradas.
              </p>

              <p class="tiny muted">
                Investimentos dos sócios não
                são faturamento. Compras de
                estoque não são descontadas
                novamente como despesas.
              </p>

              <p class="tiny muted">
                Taxas de recebimento são
                mostradas separadamente e não
                são descontadas novamente
                do lucro, para evitar duplicidade
                com despesas cadastradas.
              </p>
            </div>

            <div class="card">
              <h3>Vendas por sócio</h3>

              ${
                [...porSocio.values()]
                  .map(s => `
                    <div class="item">
                      <strong>
                        ${safe(s.nome)}
                      </strong>

                      <p>
                        ${s.quantidade}
                        venda(s)
                      </p>

                      <div class="accent">
                        ${money(
                          s.faturamento / 100
                        )}
                      </div>
                    </div>
                  `).join("") ||
                "<p>Sem dados.</p>"
              }
            </div>

            <div class="card">
              <h3>Produtos mais vendidos</h3>

              <p class="tiny muted">
                Quantidade vendida
                no período selecionado.
              </p>

              ${
                ranking.length
                  ? ranking
                      .slice(0, 10)
                      .map(p =>
                        barraRelatorio(
                          nomeProdutoRelatorio(p),
                          p.quantidade,
                          maxQuantidade,
                          p.quantidade +
                          " unidade(s) • " +
                          money(
                            p.faturamento / 100
                          )
                        )
                      ).join("")
                  : "<p>Nenhuma venda no período.</p>"
              }
            </div>

            <div class="card">
              <h3>Produtos mais lucrativos</h3>

              <p class="tiny muted">
                Lucro bruto estimado
                por produto, considerando
                descontos das vendas.
              </p>

              ${
                maisLucrativos.length
                  ? maisLucrativos
                      .slice(0, 10)
                      .map(p => {
                        const lucro =
                          p.faturamento -
                          p.custo;

                        return barraRelatorio(
                          nomeProdutoRelatorio(p),
                          Math.max(0, lucro),
                          maxLucro,
                          "Lucro bruto: " +
                          money(lucro / 100)
                        );
                      }).join("")
                  : "<p>Nenhum produto vendido.</p>"
              }
            </div>

            <div class="card">
              <h3>Prioridade de reposição</h3>

              <p class="tiny muted">
                Estimativa baseada na
                quantidade vendida no período
                e no estoque disponível.
                O objetivo sugerido é manter
                aproximadamente 14 dias
                de vendas em estoque.
              </p>

              ${
                reposicao.length
                  ? reposicao
                      .slice(0, 20)
                      .map(p => `
                        <div class="item">
                          <strong>
                            ${safe(
                              nomeProdutoRelatorio(p)
                            )}
                          </strong>

                          <p>
                            Prioridade:
                            <strong>
                              ${safe(p.prioridade)}
                            </strong>
                          </p>

                          <p class="tiny">
                            Vendidos:
                            ${p.quantidade}
                            unidade(s)
                          </p>

                          <p class="tiny">
                            Estoque atual:
                            ${p.estoque}
                          </p>

                          <p class="tiny">
                            Cobertura estimada:
                            ${
                              Number.isFinite(
                                p.cobertura
                              )
                                ? Math.max(
                                    0,
                                    p.cobertura
                                  ).toFixed(1) +
                                  " dia(s)"
                                : "Sem estimativa"
                            }
                          </p>

                          <p>
                            <strong>
                              Sugestão de compra:
                              ${p.comprar}
                              unidade(s)
                            </strong>
                          </p>
                        </div>
                      `).join("")
                  : `
                    <p>
                      Ainda não há vendas
                      suficientes para
                      sugerir reposição.
                    </p>
                  `
              }

              <p class="tiny muted">
                As sugestões são estimativas,
                não compras automáticas.
                Confira demanda, fornecedor,
                tamanho, cor e orçamento
                antes de comprar.
              </p>
            </div>
          `;

          aviso.textContent =
            "Relatório atualizado com sucesso.";

        } catch (err) {
          if (
            token !== geracaoRelatorio
          ) {
            return;
          }

          aviso.textContent =
            "Erro ao gerar relatório: " +
            err.message;

          resultado.innerHTML = `
            <div class="card">
              <p>
                Não foi possível carregar
                os relatórios.
              </p>

              <p class="tiny muted">
                ${safe(err.message)}
              </p>
            </div>
          `;
        }
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
              <strong>
                ${safe(socio.nome)}
              </strong>
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
            const { error } =
              await db.auth.signOut();

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
      "Erro ao conectar: " +
      error.message
    );
  }
})();

      