const state = {
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
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Error de API");
  return body;
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
    });
  });
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
      (s) => `<label><input type="checkbox" data-study="${s.code}"/><strong>${s.name}</strong><span>DOP ${Number(
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
      const b = state.branches.find((x) => x.id === u.branch_id);
      return `<li>${u.username} · ${u.role_name} · ${b?.code || "N/A"}</li>`;
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
    <div class="card"><h3>Últimas facturas</h3><ul>
      ${state.stats.recent
        .map(
          (i) =>
            `<li>${i.branch_invoice_number} (${i.branch_code}) · ${i.patient_name} · Balance DOP ${Number(
              i.balance
            ).toFixed(2)}</li>`
        )
        .join("")}
    </ul></div>`;
}

async function refreshBootstrap() {
  const data = await api("/api/bootstrap");
  Object.assign(state, data);
  fillSelects();
  applyBrand();
  renderAdminLists();
  renderDashboard();
}

function formatOrderCard(order) {
  const blocked = Number(order.balance) > 0;
  const badge = blocked
    ? '<span class="badge danger">Bloqueado por deuda</span>'
    : '<span class="badge ok">Listo para entregar</span>';
  return `
  <article class="result-item">
    <div><strong>${order.patient.name}</strong> · Factura ${order.invoice_number} (${order.branch.code}) ${badge}</div>
    <small>Barcode: ${order.barcode} · QR: ${order.qr_token}</small>
    <ul>${order.items.map((i) => `<li>${i.name}: ${i.result}</li>`).join("")}</ul>
    <button data-release="${order.order_id}">Intentar entregar</button>
  </article>`;
}

function bindReception() {
  $("#patientLookup").addEventListener("input", async (e) => {
    const q = e.target.value.trim();
    if (!q) return ($("#patientLookupResult").textContent = "");
    const rows = await api(`/api/patients/search?q=${encodeURIComponent(q)}`);
    $("#patientLookupResult").textContent = rows.items.length
      ? rows.items.map((m) => `${m.name} (${m.document})`).join(" | ")
      : "Sin coincidencias";
  });

  $("#createInvoiceBtn").addEventListener("click", async () => {
    try {
      const form = $("#patientForm");
      const selectedCodes = $$("#studyOptions input:checked").map((i) => i.dataset.study);
      const payload = {
        name: form.name.value.trim(),
        dob: form.dob.value,
        document: form.document.value.trim(),
        branch_id: form.branch.value,
        study_codes: selectedCodes,
        insurance_plan: $("#insurancePlan").value,
        payment: Number($("#paymentNow").value || 0)
      };
      const created = await api("/api/invoices/create", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const fin = created.financial;
      $("#invoiceOutput").textContent = [
        `Factura ${created.invoice_number} (${created.branch.code})`,
        `Paciente: ${created.patient.name} · Doc: ${created.patient.document}`,
        `Estudios: ${created.items.map((i) => i.name).join(", ")}`,
        `Subtotal: ${fin.gross.toFixed(2)} | Cobertura: ${fin.coverage.toFixed(2)} | Total: ${fin.total.toFixed(2)}`,
        `Pagado: ${fin.payment.toFixed(2)} | Pendiente: ${fin.balance.toFixed(2)}`,
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
    const invoiceId = $("#searchInvoiceId").value.trim();
    const branchId = $("#searchBranch").value;
    const data = await api(
      `/api/results/by-invoice?branch_id=${encodeURIComponent(branchId)}&invoice_number=${encodeURIComponent(
        invoiceId
      )}`
    );
    $("#resultOutput").innerHTML = data.item
      ? formatOrderCard(data.item)
      : '<p class="badge warn">No se encontró la factura en esa sucursal.</p>';
    bindReleaseButtons();
  });

  $("#searchByName").addEventListener("click", async () => {
    const q = $("#searchPatientName").value.trim();
    if (!q) return;
    const data = await api(`/api/results/by-name?name=${encodeURIComponent(q)}`);
    $("#resultOutput").innerHTML = data.items.length
      ? data.items.map(formatOrderCard).join("")
      : '<p class="badge warn">Sin resultados para ese nombre.</p>';
    bindReleaseButtons();
  });

  $("#scanInput").addEventListener("change", async () => {
    const token = $("#scanInput").value.trim();
    const data = await api(`/api/results/by-token?token=${encodeURIComponent(token)}`);
    if (!data.item) return alert("Código no encontrado.");
    $("#printDialogText").textContent = `Paciente ${data.item.patient.name} · Factura ${data.item.invoice_number}. Selecciona acción.`;
    $("#printDialog").showModal();
  });

  $("#closeDialog").addEventListener("click", () => $("#printDialog").close());
  $("#previewBtn").addEventListener("click", () => alert("Vista previa abierta."));
  $("#printBtn").addEventListener("click", () => alert("Enviado a impresión."));
}

function bindReleaseButtons() {
  $$("button[data-release]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await api("/api/results/release-check", {
        method: "POST",
        body: JSON.stringify({ order_id: btn.dataset.release })
      });
      alert(result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`);
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
    await api("/api/admin/role", {
      method: "POST",
      body: JSON.stringify({ name: $("#newRoleName").value.trim() })
    });
    await refreshBootstrap();
  });

  $("#addUser").addEventListener("click", async () => {
    await api("/api/admin/user", {
      method: "POST",
      body: JSON.stringify({
        username: $("#newUserName").value.trim(),
        role: $("#newUserRole").value,
        branch_id: $("#newUserBranch").value
      })
    });
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
    const token = $("#portalQr").value.trim();
    const data = await api(`/api/results/by-token?token=${encodeURIComponent(token)}`);
    if (!data.item) {
      $("#portalOutput").innerHTML = '<p class="badge warn">QR inválido.</p>';
      return;
    }
    if (Number(data.item.balance) > 0) {
      $("#portalOutput").innerHTML = `<div class="card"><h3>Pago pendiente</h3><p>Para visualizar tus resultados debes pagar DOP ${Number(
        data.item.balance
      ).toFixed(2)}. Próximamente pago con tarjeta y PayPal.</p></div>`;
      return;
    }
    $("#portalOutput").innerHTML = `<div class="card"><h3>Resultados disponibles</h3><ul>${data.item.items
      .map((i) => `<li>${i.name}: ${i.result}</li>`)
      .join("")}</ul></div>`;
  });
}

async function boot() {
  initNav();
  bindReception();
  bindResults();
  bindAdmin();
  bindPortal();
  await refreshBootstrap();
}

boot().catch((e) => alert(`Error inicializando app: ${e.message}`));
