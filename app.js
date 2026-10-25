
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
        <h2>Produtos</h2>
        ${produtosError ? "<p>Erro ao carregar produtos.</p>" : ""}
        <div class="card">
          ${productList.length
            ? productList.map(p => `
              <div class="item">
                <strong>${safe(p.nome)}</strong>
                <div class="tiny muted">${safe(p.categoria)}</div>
                <div class="accent">${money(p.preco)}</div>
              </div>
            `).join("")
            : "<p>Nenhum produto cadastrado.</p>"}
        </div>
      `;

      document.getElementById("sell").innerHTML = `
        <h2>Vendas recentes</h2>
        ${vendasError ? "<p>Erro ao carregar vendas.</p>" : ""}
        <div class="card">
          ${salesList.length
            ? salesList.map(v => `
              <div class="item flex">
                <span>${safe(
                  new Date(v.criado_em).toLocaleDateString("pt-BR")
                )}</span>
                <strong>${money(v.valor_total)}</strong>
              </div>
            `).join("")
            : "<p>Nenhuma venda registrada.</p>"}
        </div>
        <p class="muted tiny">
          Cadastro de vendas será ativado na próxima etapa.
        </p>
      `;

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
