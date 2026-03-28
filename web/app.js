const storageKey = "mediflow_demo_v1";

const defaultState = {
  roles: ["super_admin", "admin", "recepcion", "doctor", "laboratorio"],
  branches: [
    { id: "b1", code: "STO", name: "Sucursal Santo Domingo", active: true },
    { id: "b2", code: "SDE", name: "Sucursal Este", active: true }
  ],
  users: [{ id: crypto.randomUUID(), username: "root", role: "super_admin", branchId: "b1" }],
  studies: [
    { code: "LAB-ORINA", name: "Orina", price: 450, department: "LIS" },
    { code: "LAB-COPRO", name: "Coprológico", price: 650, department: "LIS" },
    { code: "LAB-HEMO", name: "Hemograma", price: 500, department: "LIS" },
    { code: "IMG-RXTX", name: "Rayos X Tórax", price: 1500, department: "PACS" }
  ],
  patients: [],
  invoices: [],
  orders: [],
  brand: {
    title: "MediFlow OSS",
    subtitle: "Hospital Core · LIS · PACS · Billing",
    logo: "https://dummyimage.com/40x40/2563eb/ffffff&text=M"
  }
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(storageKey);
  return raw ? JSON.parse(raw) : structuredClone(defaultState);
}
function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

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
    });
  });
}

function fillBranchSelects() {
  const options = state.branches
    .filter((b) => b.active)
    .map((b) => `<option value="${b.id}">${b.code} - ${b.name}</option>`)
    .join("");
  ["#patientBranch", "#searchBranch", "#newUserBranch"].forEach((s) => {
    $(s).innerHTML = options;
  });
}

function fillRoleSelect() {
  $("#newUserRole").innerHTML = state.roles.map((r) => `<option value="${r}">${r}</option>`).join("");
}

function renderStudies() {
  $("#studyOptions").innerHTML = state.studies
    .map(
      (s) => `
      <label>
        <input type="checkbox" data-study="${s.code}" />
        <strong>${s.name}</strong>
        <span>DOP ${s.price.toFixed(2)}</span>
      </label>`
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
function insurancePct(plan) {
  if (plan === "basic") return 0.4;
  if (plan === "premium") return 0.7;
  return 0;
}

function makeInvoiceNumber(branchId) {
  const used = new Set(
    state.invoices.filter((i) => i.branchId === branchId).map((i) => i.branchInvoiceNumber)
  );
  let n;
  do {
    n = Math.floor(Math.random() * 90000) + 1000;
  } while (used.has(String(n)));
  return String(n);
}

function makeTokens() {
  const barcode = "BC-" + Math.random().toString().slice(2, 14);
  const qr = "QR-" + crypto.randomUUID();
  return { barcode, qr };
}

function bindReception() {
  $("#patientLookup").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      $("#patientLookupResult").textContent = "";
      return;
    }
    const matches = state.patients.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.document || "").toLowerCase().includes(q)
    );
    $("#patientLookupResult").textContent = matches.length
      ? matches.slice(0, 5).map((m) => `${m.name} (${m.document || "MENOR"})`).join(" | ")
      : "Sin coincidencias";
  });

  $("#createInvoiceBtn").addEventListener("click", () => {
    const form = $("#patientForm");
    const name = form.name.value.trim();
    const dob = form.dob.value;
    const branchId = form.branch.value;
    let document = form.document.value.trim();

    if (!name || !dob || !branchId) {
      alert("Completa nombre, fecha y sucursal.");
      return;
    }
    if (!document) document = "MENOR";

    let patient = state.patients.find(
      (p) => p.name.toLowerCase() === name.toLowerCase() && (p.document || "") === document
    );
    if (!patient) {
      patient = { id: crypto.randomUUID(), name, dob, document };
      state.patients.push(patient);
    }

    const selectedCodes = $$("#studyOptions input:checked").map((i) => i.dataset.study);
    if (!selectedCodes.length) {
      alert("Selecciona al menos un estudio.");
      return;
    }
    const items = state.studies.filter((s) => selectedCodes.includes(s.code));
    const gross = items.reduce((sum, i) => sum + i.price, 0);
    const plan = $("#insurancePlan").value;
    const coverage = insurancePct(plan) * gross;
    const total = gross - coverage;
    const payment = Number($("#paymentNow").value || 0);
    const balance = Math.max(0, total - payment);

    const invoice = {
      id: crypto.randomUUID(),
      branchId,
      patientId: patient.id,
      branchInvoiceNumber: makeInvoiceNumber(branchId),
      insurancePlan: plan,
      gross,
      coverage,
      total,
      payment,
      balance,
      createdAt: new Date().toISOString()
    };
    state.invoices.push(invoice);

    const tokens = makeTokens();
    const order = {
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      branchId,
      patientId: patient.id,
      items: items.map((s) => ({
        code: s.code,
        name: s.name,
        department: s.department,
        status: "finalizado",
        result: `Resultado ${s.name}: dentro de parámetros.`
      })),
      barcode: tokens.barcode,
      qrToken: tokens.qr,
      createdAt: invoice.createdAt
    };
    state.orders.push(order);

    saveState();
    renderDashboard();

    const branch = state.branches.find((b) => b.id === branchId);
    $("#invoiceOutput").textContent = [
      `Factura ${invoice.branchInvoiceNumber} (${branch.code})`,
      `Paciente: ${patient.name} · Doc: ${patient.document}`,
      `Estudios: ${items.map((i) => i.name).join(", ")}`,
      `Subtotal: ${gross.toFixed(2)} | Cobertura: ${coverage.toFixed(2)} | Total: ${total.toFixed(2)}`,
      `Pagado: ${payment.toFixed(2)} | Pendiente: ${balance.toFixed(2)}`,
      `Barcode: ${order.barcode}`,
      `QR: ${order.qrToken}`
    ].join("\n");
  });
}

function formatOrder(order) {
  const invoice = state.invoices.find((i) => i.id === order.invoiceId);
  const patient = state.patients.find((p) => p.id === order.patientId);
  const branch = state.branches.find((b) => b.id === order.branchId);
  const blocked = invoice.balance > 0;
  const badge = blocked ? '<span class="badge danger">Bloqueado por deuda</span>' : '<span class="badge ok">Listo para entregar</span>';
  return `
    <article class="result-item">
      <div><strong>${patient.name}</strong> · Factura ${invoice.branchInvoiceNumber} (${branch.code}) ${badge}</div>
      <small>Barcode: ${order.barcode} · QR: ${order.qrToken}</small>
      <ul>${order.items.map((i) => `<li>${i.name}: ${i.result}</li>`).join("")}</ul>
      <button data-release="${order.id}">Intentar entregar</button>
    </article>`;
}

function bindResults() {
  $("#searchByInvoice").addEventListener("click", () => {
    const invoiceId = $("#searchInvoiceId").value.trim();
    const branchId = $("#searchBranch").value;
    const invoice = state.invoices.find(
      (i) => i.branchId === branchId && i.branchInvoiceNumber === invoiceId
    );
    if (!invoice) {
      $("#resultOutput").innerHTML = '<p class="badge warn">No se encontró la factura en esa sucursal.</p>';
      return;
    }
    const order = state.orders.find((o) => o.invoiceId === invoice.id);
    $("#resultOutput").innerHTML = order ? formatOrder(order) : "Sin orden";
    bindReleaseButtons();
  });

  $("#searchByName").addEventListener("click", () => {
    const q = $("#searchPatientName").value.trim().toLowerCase();
    if (!q) return;
    const patientIds = state.patients.filter((p) => p.name.toLowerCase().includes(q)).map((p) => p.id);
    const orders = state.orders
      .filter((o) => patientIds.includes(o.patientId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    $("#resultOutput").innerHTML = orders.length
      ? orders.map(formatOrder).join("")
      : '<p class="badge warn">Sin resultados para ese nombre.</p>';
    bindReleaseButtons();
  });

  $("#scanInput").addEventListener("change", () => {
    const token = $("#scanInput").value.trim();
    const order = state.orders.find((o) => o.barcode === token || o.qrToken === token);
    if (!order) return alert("Código no encontrado.");
    const invoice = state.invoices.find((i) => i.id === order.invoiceId);
    const patient = state.patients.find((p) => p.id === order.patientId);
    const text = `Paciente ${patient.name} · Factura ${invoice.branchInvoiceNumber}. Selecciona acción.`;
    $("#printDialogText").textContent = text;
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
  $("#previewBtn").addEventListener("click", () => alert("Vista previa abierta."));
  $("#printBtn").addEventListener("click", () => alert("Enviado a impresión."));
}

function bindReleaseButtons() {
  $$("button[data-release]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = state.orders.find((o) => o.id === btn.dataset.release);
      const invoice = state.invoices.find((i) => i.id === order.invoiceId);
      if (invoice.balance > 0) {
        alert(
          `⚠️ No se puede entregar. Saldo pendiente DOP ${invoice.balance.toFixed(
            2
          )}. Debe pagarse la totalidad.`
        );
      } else {
        alert("✅ Entrega autorizada.");
      }
    });
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
  $("#addBranch").addEventListener("click", () => {
    const name = $("#newBranchName").value.trim();
    const code = $("#newBranchCode").value.trim().toUpperCase();
    if (!name || !code) return;
    state.branches.push({ id: crypto.randomUUID(), name, code, active: true });
    saveState();
    fillBranchSelects();
    renderAdminLists();
  });

  $("#addRole").addEventListener("click", () => {
    const role = $("#newRoleName").value.trim().toLowerCase();
    if (!role || state.roles.includes(role)) return;
    state.roles.push(role);
    saveState();
    fillRoleSelect();
  });

  $("#addUser").addEventListener("click", () => {
    const username = $("#newUserName").value.trim();
    const role = $("#newUserRole").value;
    const branchId = $("#newUserBranch").value;
    if (!username) return;
    state.users.push({ id: crypto.randomUUID(), username, role, branchId });
    saveState();
    renderAdminLists();
  });

  $("#applyBrand").addEventListener("click", () => {
    state.brand.title = $("#brandTitleInput").value.trim() || state.brand.title;
    state.brand.subtitle = $("#brandSubInput").value.trim() || state.brand.subtitle;
    state.brand.logo = $("#brandLogoInput").value.trim() || state.brand.logo;
    saveState();
    applyBrand();
  });
}

function renderAdminLists() {
  $("#branchList").innerHTML = state.branches
    .map((b) => `<li>${b.code} · ${b.name}</li>`)
    .join("");
  $("#userList").innerHTML = state.users
    .map((u) => {
      const branch = state.branches.find((b) => b.id === u.branchId);
      return `<li>${u.username} · ${u.role} · ${branch?.code || "N/A"}</li>`;
    })
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

function bindPortal() {
  $("#portalSearch").addEventListener("click", () => {
    const token = $("#portalQr").value.trim();
    const order = state.orders.find((o) => o.qrToken === token);
    if (!order) {
      $("#portalOutput").innerHTML = '<p class="badge warn">QR inválido.</p>';
      return;
    }
    const invoice = state.invoices.find((i) => i.id === order.invoiceId);
    if (invoice.balance > 0) {
      $("#portalOutput").innerHTML = `<div class="card"><h3>Pago pendiente</h3><p>Para visualizar tus resultados debes pagar DOP ${invoice.balance.toFixed(
        2
      )}. Próximamente pago con tarjeta y PayPal.</p></div>`;
      return;
    }
    $("#portalOutput").innerHTML = `<div class="card"><h3>Resultados disponibles</h3><ul>${order.items
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
function renderDashboard() {
  const unpaid = state.invoices.filter((i) => i.balance > 0).length;
  const html = `
  <h2>Resumen operativo</h2>
  <div class="grid three">
    <div class="card"><h3>Pacientes</h3><strong>${state.patients.length}</strong></div>
    <div class="card"><h3>Facturas</h3><strong>${state.invoices.length}</strong></div>
    <div class="card"><h3>Pendientes de pago</h3><strong>${unpaid}</strong></div>
  </div>
  <div class="card">
    <h3>Últimas facturas</h3>
    <ul>
      ${state.invoices
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 6)
        .map((i) => {
          const p = state.patients.find((x) => x.id === i.patientId);
          const b = state.branches.find((x) => x.id === i.branchId);
          return `<li>${i.branchInvoiceNumber} (${b.code}) · ${p.name} · Balance DOP ${i.balance.toFixed(
            2
          )}</li>`;
        })
        .join("")}
    </ul>
  </div>`;
  $("#dashboard").innerHTML = html;
}

function boot() {
  initNav();
  bindAuth();
  fillBranchSelects();
  fillRoleSelect();
  renderStudies();
  bindReception();
  bindResults();
  bindAdmin();
  bindPortal();
  bindAudit();
  initSession();
  renderDashboard();
  renderAdminLists();
  applyBrand();
}

boot();
