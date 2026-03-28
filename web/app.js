const state = {
  token: localStorage.getItem("session_token") || "",
  me: null,
  roles: [],
  branches: [],
  studies: [],
  users: [],
  brand: { title: "MediFlow OSS", subtitle: "", logo: "" },
  stats: { patients: 0, invoices: 0, unpaid: 0, recent: [] }
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers["X-Session-Token"] = state.token;
  const res = await fetch(url, { ...options, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Error API");
  return body;
}

function hasPerm(perm) {
  return state.me?.permissions?.includes(perm) || state.me?.role === "super_admin";
}

function showLogin(visible) {
  $("#loginScreen").classList.toggle("hidden", !visible);
  $("#appHeader").classList.toggle("hidden", visible);
  $("#appMain").classList.toggle("hidden", visible);
}

function initNav() {
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      $$(".view").forEach((v) => v.classList.remove("active"));
      $("#" + view).classList.add("active");
      if (view === "dashboard") renderDashboard();
      if (view === "audit") loadAudit();
    });
  });
}

function applyPermissions() {
  $("#adminTab").classList.toggle("hidden", !hasPerm("admin:manage"));
  $("#auditTab").classList.toggle("hidden", !hasPerm("audit:view"));
}

function fillSelects() {
  const branchOptions = state.branches
    .filter((b) => b.active)
    .map((b) => `<option value="${b.id}">${b.code} - ${b.name}</option>`)
    .join("");
  ["#patientBranch", "#searchBranch", "#newUserBranch"].forEach((s) => ($(s).innerHTML = branchOptions));

  $("#newUserRole").innerHTML = state.roles.map((r) => `<option value="${r}">${r}</option>`).join("");
  $("#studyOptions").innerHTML = state.studies
    .map(
      (s) => `<label><input type="checkbox" data-study="${s.code}"><strong>${s.name}</strong><span>DOP ${Number(
        s.price
      ).toFixed(2)}</span></label>`
    )
    .join("");
}

function applyBrand() {
  $("#brandTitle").textContent = state.brand.title;
  $("#brandSubtitle").textContent = state.brand.subtitle;
  $("#brandLogo").src = state.brand.logo;
  $("#brandTitleInput").value = state.brand.title;
  $("#brandSubInput").value = state.brand.subtitle;
  $("#brandLogoInput").value = state.brand.logo;
}

function renderAdminLists() {
  $("#branchList").innerHTML = state.branches.map((b) => `<li>${b.code} · ${b.name}</li>`).join("");
  $("#userList").innerHTML = state.users
    .map((u) => {
      const branch = state.branches.find((b) => b.id === u.branch_id);
      return `<li>${u.username} · ${u.role_name} · ${branch?.code || "N/A"}</li>`;
    })
    .join("");
}

function renderDashboard() {
  $("#dashboard").innerHTML = `
    <h2>Resumen operativo</h2>
    <div class="grid three">
      <div class="card"><h3>Pacientes</h3><strong>${state.stats.patients}</strong></div>
      <div class="card"><h3>Facturas</h3><strong>${state.stats.invoices}</strong></div>
      <div class="card"><h3>Pendientes de pago</h3><strong>${state.stats.unpaid}</strong></div>
    </div>
    <div class="card"><h3>Últimas facturas</h3><ul>${state.stats.recent
      .map((i) => `<li>${i.branch_invoice_number} (${i.branch_code}) · ${i.patient_name} · Balance DOP ${Number(i.balance).toFixed(2)}</li>`)
      .join("")}</ul></div>`;
}

function orderCard(order) {
  const blocked = Number(order.balance) > 0;
  return `
  <article class="result-item">
    <div><strong>${order.patient.name}</strong> · Factura ${order.invoice_number} (${order.branch.code})
      ${blocked ? '<span class="badge danger">Bloqueado</span>' : '<span class="badge ok">Entregable</span>'}
    </div>
    <small>Barcode: ${order.barcode} · QR: ${order.qr_token}</small>
    <ul>${order.items.map((i) => `<li>${i.name}: ${i.result}</li>`).join("")}</ul>
    <div class="grid two">
      <button data-release="${order.order_id}">Intentar entregar</button>
      <button data-pay-invoice="${order.invoice_id}" ${hasPerm("payments:register") ? "" : "disabled"}>Registrar pago</button>
    </div>
  </article>`;
}

async function refreshBootstrap() {
  const data = await api("/api/bootstrap");
  state.roles = data.roles;
  state.branches = data.branches;
  state.studies = data.studies;
  state.users = data.users;
  state.brand = data.brand;
  state.stats = data.stats;
  state.me = data.me;
  $("#sessionRole").textContent = `Usuario: ${state.me.username} · Rol: ${state.me.role}`;
  fillSelects();
  applyBrand();
  renderAdminLists();
  renderDashboard();
  applyPermissions();
}

function bindAuth() {
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const body = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: $("#loginUser").value.trim(), password: $("#loginPass").value })
      });
      state.token = body.token;
      localStorage.setItem("session_token", state.token);
      state.me = body.user;
      showLogin(false);
      $("#loginMsg").textContent = "";
      await refreshBootstrap();
      if (state.me.must_change_password) {
        alert("Debes cambiar la contraseña temporal desde Admin > reset de usuario (pendiente UI avanzada).");
      }
    } catch (err) {
      $("#loginMsg").textContent = err.message;
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // ignore
    }
    state.token = "";
    state.me = null;
    localStorage.removeItem("session_token");
    showLogin(true);
  });
}

function bindReception() {
  $("#patientLookup").addEventListener("input", async (e) => {
    const q = e.target.value.trim();
    if (!q) return ($("#patientLookupResult").textContent = "");
    const result = await api(`/api/patients/search?q=${encodeURIComponent(q)}`);
    $("#patientLookupResult").textContent = result.items.length
      ? result.items.map((i) => `${i.name} (${i.document})`).join(" | ")
      : "Sin coincidencias";
  });

  $("#createInvoiceBtn").addEventListener("click", async () => {
    try {
      const form = $("#patientForm");
      const selected = $$("#studyOptions input:checked").map((i) => i.dataset.study);
      const created = await api("/api/invoices/create", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.value.trim(),
          dob: form.dob.value,
          document: form.document.value.trim(),
          branch_id: form.branch.value,
          study_codes: selected,
          insurance_plan: $("#insurancePlan").value,
          payment: Number($("#paymentNow").value || 0)
        })
      });
      const f = created.financial;
      $("#invoiceOutput").textContent = [
        `Factura ${created.invoice_number} (${created.branch.code})`,
        `Paciente: ${created.patient.name} · Doc: ${created.patient.document}`,
        `Estudios: ${created.items.map((i) => i.name).join(", ")}`,
        `Total: ${f.total.toFixed(2)} · Pagado: ${f.payment.toFixed(2)} · Balance: ${f.balance.toFixed(2)}`,
        `Barcode: ${created.barcode}`,
        `QR: ${created.qr_token}`
      ].join("\n");
      await refreshBootstrap();
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindResults() {
  $("#searchByInvoice").addEventListener("click", async () => {
    const data = await api(
      `/api/results/by-invoice?branch_id=${encodeURIComponent($("#searchBranch").value)}&invoice_number=${encodeURIComponent(
        $("#searchInvoiceId").value.trim()
      )}`
    );
    $("#resultOutput").innerHTML = data.item ? orderCard(data.item) : '<p class="badge warn">No encontrado.</p>';
    bindResultActions();
  });

  $("#searchByName").addEventListener("click", async () => {
    const data = await api(`/api/results/by-name?name=${encodeURIComponent($("#searchPatientName").value.trim())}`);
    $("#resultOutput").innerHTML = data.items.length
      ? data.items.map(orderCard).join("")
      : '<p class="badge warn">Sin resultados</p>';
    bindResultActions();
  });

  $("#scanInput").addEventListener("change", async () => {
    const data = await api(`/api/results/by-token?token=${encodeURIComponent($("#scanInput").value.trim())}`);
    if (!data.item) return alert("Código no encontrado.");
    $("#printDialogText").textContent = `Paciente ${data.item.patient.name} · Factura ${data.item.invoice_number}`;
    $("#printDialog").showModal();
  });

  $("#closeDialog").addEventListener("click", () => $("#printDialog").close());
  $("#previewBtn").addEventListener("click", () => alert("Vista previa"));
  $("#printBtn").addEventListener("click", () => alert("Impresión enviada"));
}

function bindResultActions() {
  $$('button[data-release]').forEach((b) => {
    b.onclick = async () => {
      const r = await api('/api/results/release-check', {
        method: 'POST',
        body: JSON.stringify({ order_id: b.dataset.release })
      });
      alert(r.ok ? `✅ ${r.message}` : `⚠️ ${r.message}`);
    };
  });
  $$('button[data-pay-invoice]').forEach((b) => {
    b.onclick = async () => {
      const amount = Number(prompt('Monto a pagar', '0') || 0);
      if (!amount || amount <= 0) return;
      const method = (prompt('Método: cash/card/paypal', 'cash') || 'cash').toLowerCase();
      const r = await api('/api/invoices/pay', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: b.dataset.payInvoice, amount, method })
      });
      alert(`Pago aplicado. Balance actual: ${Number(r.balance).toFixed(2)}`);
      await refreshBootstrap();
    };
  });
}

function bindAdmin() {
  $("#addBranch").addEventListener("click", async () => {
    await api("/api/admin/branch", {
      method: "POST",
      body: JSON.stringify({ name: $("#newBranchName").value.trim(), code: $("#newBranchCode").value.trim() })
    });
    await refreshBootstrap();
  });

  $("#addRole").addEventListener("click", async () => {
    const perms = $("#newRolePerms").value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    await api("/api/admin/role", {
      method: "POST",
      body: JSON.stringify({ name: $("#newRoleName").value.trim(), permissions: perms })
    });
    await refreshBootstrap();
  });

  $("#addUser").addEventListener("click", async () => {
    const r = await api("/api/admin/user", {
      method: "POST",
      body: JSON.stringify({
        username: $("#newUserName").value.trim(),
        role: $("#newUserRole").value,
        branch_id: $("#newUserBranch").value,
        temp_password: $("#newUserPass").value.trim() || "Temp1234!"
      })
    });
    alert(`Usuario creado. Clave temporal: ${r.temp_password}`);
    await refreshBootstrap();
  });

  $("#applyBrand").addEventListener("click", async () => {
    await api("/api/admin/branding", {
      method: "POST",
      body: JSON.stringify({
        title: $("#brandTitleInput").value,
        subtitle: $("#brandSubInput").value,
        logo: $("#brandLogoInput").value
      })
    });
    await refreshBootstrap();
  });
}

function bindPortal() {
  $("#portalSearch").addEventListener("click", async () => {
    const data = await api(`/api/results/by-token?token=${encodeURIComponent($("#portalQr").value.trim())}`);
    if (!data.item) return ($("#portalOutput").innerHTML = '<p class="badge warn">QR inválido</p>');
    if (Number(data.item.balance) > 0) {
      $("#portalOutput").innerHTML = `<div class="card"><h3>Pago pendiente</h3><p>Debe pagar DOP ${Number(
        data.item.balance
      ).toFixed(2)} antes de retirar resultado.</p></div>`;
      return;
    }
    $("#portalOutput").innerHTML = `<div class="card"><h3>Resultados</h3><ul>${data.item.items
      .map((i) => `<li>${i.name}: ${i.result}</li>`)
      .join("")}</ul></div>`;
  });
}

async function loadAudit() {
  if (!hasPerm("audit:view")) return;
  const data = await api("/api/audit/recent");
  $("#auditOutput").innerHTML = data.items
    .map((i) => `<article class="result-item"><b>${i.action}</b><br><small>${i.created_at}</small><pre>${i.payload || "{}"}</pre></article>`)
    .join("");
}

function bindAudit() {
  $("#refreshAudit").addEventListener("click", loadAudit);
}

async function initSession() {
  if (!state.token) return showLogin(true);
  try {
    const me = await api("/api/auth/me");
    if (!me.authenticated) throw new Error("Sesión inválida");
    showLogin(false);
    await refreshBootstrap();
  } catch {
    state.token = "";
    localStorage.removeItem("session_token");
    showLogin(true);
  }
}

function boot() {
  initNav();
  bindAuth();
  bindReception();
  bindResults();
  bindAdmin();
  bindPortal();
  bindAudit();
  initSession();
}

boot();
