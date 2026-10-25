
const SUPABASE_URL = "https://xanwtxykldbyxdhdtfbj.supabase.co";
const SUPABASE_KEY = "sb_publishable_NAmaxDUR8yEknMHLb64JnQ_YEfNCX4p";

(async function () {
  const home = document.getElementById("home");
  const nav = document.getElementById("nav");
  const sections = ["home", "sell", "stock", "receive", "more"];

  function message(text) {
    home.innerHTML = `<div class="card"><p>${text}</p></div>`;
  }

  message("Conectando ao Wave Store...");

  try {
    const { createClient } = await import(
      "https://esm.sh/@supabase/supabase-js@2"
    );

    const db = createClient(SUPABASE_URL, SUPABASE_KEY);

    function showLogin(error = "") {
      nav.classList.add("hidden");
      sections.forEach(id => {
        document.getElementById(id).classList.add("hidden");
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
        </div>
      `;

      document.getElementById("loginError").textContent = error;

      document.getElementById("loginForm").onsubmit = async e => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const errorBox = document.getElementById("loginError");

        errorBox.textContent = "Entrando...";

        const { error } = await db.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          errorBox.textContent =
            "Não foi possível entrar. Confira e-mail e senha.";
          return;
        }

        await showApp();
      };
    }

    function activateTab(tab) {
      sections.forEach(id => {
        document.getElementById(id)
          .classList.toggle("hidden", id !== tab);
      });

      document.querySelectorAll("#nav button").forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.tab === tab
        );
      });
    }

    function safe(value) {
      return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c]));
    }

    async function showApp() {
      const { data: authData } = await db.auth.getUser();
      const user = authData.user;

      if (!user) {
        showLogin();
        return;
      }

      const { data: socio, error } = await db
        .from("socios")
        .select("nome,loja_id")
        .eq("usuario_id", user.id)
        .limit(1)
        .maybeSingle();

      if (error || !socio) {
  console.error("Erro ao consultar sócio:", error);

  message(
    error
      ? "Erro Supabase: " + error.message
      : "Usuário conectado, mas não foi encontrado na tabela de sócios."
  );

  nav.classList.add("hidden");
  return;
}

      const { data: produtos, error: produtosError } = await db
        .from("produtos")
        .select("id,nome,categoria,preco,estoque_inicial")
        .eq("loja_id", socio.loja_id)
        .order("nome");

      const { data: vendas, error: vendasError } = await db
        .from("vendas")
        .select("id,valor_total,criado_em")
        .eq("loja_id", socio.loja_id)
        .order("criado_em", { ascending: false })
        .limit(20);

      const money = n => Number(n || 0).toLocaleString(
        "pt-BR", { style: "currency", currency: "BRL" }
      );

      const productList = produtos || [];
      const salesList = vendas || [];

      home.innerHTML = `
        <h2>Olá, ${safe(socio.nome)}!</h2>
        <div class="grid">
          <div class="card">
            <small>Produtos cadastrados</small>
            <div class="num">${productList.length}</div>
          </div>
          <div class="card">
            <small>Vendas recentes</small>
            <div class="num">${salesList.length}</div>
          </div>
        </div>
        <p class="muted tiny">
          Dados consultados diretamente no Supabase.
        </p>
      `;

      
document.getElementById("stock").innerHTML = `
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
  <div class="card" id="listaProdutos">
    Carregando...
  </div>
`;

const listaProdutos = document.getElementById("listaProdutos");

async function carregarProdutos() {
  const { data, error } = await db
    .from("produtos")
    .select("id,codigo,nome,categoria,variacao,preco,estoque_inicial")
    .eq("loja_id", socio.loja_id)
    .order("nome");

  if (error) {
    listaProdutos.textContent = "Erro: " + error.message;
    return;
  }

  
const { data: movimentos, error: erroMovimentos } = await db
  .from("movimentos_estoque")
  .select("produto_id,tipo,quantidade")
  .eq("loja_id", socio.loja_id);

if (erroMovimentos) {
  listaProdutos.textContent =
    "Erro ao consultar estoque: " + erroMovimentos.message;
  return;
}

const saldos = {};

for (const p of data) {
  saldos[p.id] = Number(p.estoque_inicial || 0);
}

for (const m of movimentos || []) {
  if (saldos[m.produto_id] === undefined) continue;

  if (m.tipo === "entrada") {
    saldos[m.produto_id] += Number(m.quantidade);
  } else if (m.tipo === "saida") {
    saldos[m.produto_id] -= Number(m.quantidade);
  }
}


await carregarProdutos();

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
    const { error } = await db.from("produtos").insert(produto);

    if (error) {
      msg.textContent = "Erro: " + error.message;
      return;
    }

    form.reset();
    msg.textContent = "Produto cadastrado com sucesso!";
    await carregarProdutos();
  } finally {
    botao.disabled = false;
  }
};


      
document.getElementById("sell").innerHTML = `
  <h2>Registrar venda</h2>
  <div class="card">
    <form id="vendaForm">
      <label>Produto</label>
      <select id="vendaProduto" required>
        <option value="">Selecione um produto</option>
      </select>

      <label>Quantidade</label>
      <input id="vendaQuantidade"
        type="number" min="1" step="1"
        value="1" required>

      <label>Cliente (opcional)</label>
      <input id="vendaCliente"
        placeholder="Nome do cliente">

      <button type="submit">Finalizar venda</button>
      <p id="vendaMensagem" class="tiny"></p>
    </form>
  </div>
  <p class="muted tiny">
    O vendedor será identificado automaticamente
    pela conta conectada.
  </p>
`;

const vendaProduto = document.getElementById("vendaProduto");

async function carregarProdutosVenda() {
  const { data, error } = await db
    .from("produtos")
    .select("id,nome,variacao,preco")
    .eq("loja_id", socio.loja_id)
    .order("nome");

  if (error) {
    document.getElementById("vendaMensagem")
      .textContent = "Erro: " + error.message;
    return;
  }

  vendaProduto.replaceChildren(
    new Option("Selecione um produto", "")
  );

  for (const p of data || []) {
    const descricao =
      `${p.nome}${p.variacao ? " - " + p.variacao : ""} - ` +
      Number(p.preco).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });

    vendaProduto.add(new Option(descricao, p.id));
  }
}

await carregarProdutosVenda();

document.getElementById("vendaForm").onsubmit = async e => {
  e.preventDefault();

  const botao = e.currentTarget.querySelector("button");
  const mensagem = document.getElementById("vendaMensagem");
  const produtoId = vendaProduto.value;
  const quantidade = Number(
    document.getElementById("vendaQuantidade").value
  );
  const cliente = document.getElementById("vendaCliente").value;

  if (!produtoId || !Number.isInteger(quantidade) || quantidade < 1) {
    mensagem.textContent = "Selecione um produto e uma quantidade válida.";
    return;
  }

  botao.disabled = true;
  mensagem.textContent = "Registrando venda...";

  try {
    const { error } = await db.rpc("registrar_venda", {
      p_produto_id: produtoId,
      p_quantidade: quantidade,
      p_cliente: cliente
    });

    if (error) {
      mensagem.textContent = "Erro: " + error.message;
      return;
    }

    mensagem.textContent = "Venda registrada com sucesso!";
    document.getElementById("vendaQuantidade").value = "1";
    document.getElementById("vendaCliente").value = "";

    // Atualiza o painel, as vendas e o estoque.
    await showApp();
    activateTab("sell");
    document.getElementById("vendaMensagem").textContent =
      "Venda registrada com sucesso!";
  } catch (erro) {
    mensagem.textContent = "Erro ao registrar: " + erro.message;
  } finally {
    botao.disabled = false;
  }
};


      document.getElementById("receive").innerHTML = `
        <h2>A receber</h2>
        <div class="card">
          <p>Essa função será ativada na próxima etapa.</p>
        </div>
      `;

      document.getElementById("more").innerHTML = `
        <h2>Minha conta</h2>
        <div class="card">
          <p><strong>${safe(socio.nome)}</strong></p>
          <p class="muted">${safe(user.email)}</p>
          <button id="logout" class="secondary">Sair da conta</button>
        </div>
      `;

      document.getElementById("logout").onclick = async () => {
        await db.auth.signOut();
        showLogin();
      };

      nav.classList.remove("hidden");
      activateTab("home");
    }

    document.querySelectorAll("#nav button").forEach(button => {
      button.onclick = () => activateTab(button.dataset.tab);
    });

    const { data } = await db.auth.getSession();

    if (data.session) {
      await showApp();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error(error);
    message("Erro ao conectar. Confira a internet e a configuração.");
  }
})();
