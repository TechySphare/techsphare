import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  addDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ================= GLOBAL STATE ================= */
let ADMIN_ROLE = "";
let ADMIN_EMAIL = "";
let pending = 0;
let contacted = 0;
let leadsChartInstance = null;
let statusChartInstance = null;

/* ================= DOM HELPER ================= */
const $ = id => document.getElementById(id);

/* ================= LOGIN ================= */
async function login() {
  const email = $("adminEmail").value.trim();
  const pass = $("adminPass").value.trim();
  if (!email || !pass) { showAlert1("⚠️ Enter email & password"); return; }

  try {
    const q = query(
      collection(db, "admins"),
      where("email", "==", email),
      where("password", "==", pass),
      where("active", "==", true)
    );
    const snap = await getDocs(q);
    if (snap.empty) { showAlert1("❌ Invalid login"); return; }

    const admin = snap.docs[0].data();
    ADMIN_ROLE = admin.role || "viewer";
    ADMIN_EMAIL = admin.email;

    sessionStorage.setItem("admin", "logged");
    sessionStorage.setItem("role", ADMIN_ROLE);
    sessionStorage.setItem("email", ADMIN_EMAIL);

    await logActivity("LOGIN");
    showDashboard();
  } catch (err) {
    console.error(err);
    showAlert1("❌ Login failed");
  }
}

/* ================= DASHBOARD CHARTS ================= */
function renderCharts(leadsArray) {
  if (!leadsArray || !leadsArray.length) return;

  // Leads per day (last 7 days)
  const days = [], counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString());
    counts.push(leadsArray.filter(l => {
      const c = l.createdAt?.toDate?.();
      return c && c.toDateString() === d.toDateString();
    }).length);
  }

  const ctx1 = $("leadsChart");
  if (leadsChartInstance) leadsChartInstance.destroy();
  leadsChartInstance = new Chart(ctx1, {
    type: "line",
    data: {
      labels: days,
      datasets: [{
        label: "Leads",
        data: counts,
        borderColor: "#00e6a8",
        backgroundColor: "rgba(0,230,168,.15)",
        fill: true,
        tension: 0.4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Status pie
  const pendingCount = leadsArray.filter(l => (l.status || "pending") === "pending").length;
  const contactedCount = leadsArray.filter(l => l.status === "contacted").length;

  const ctx2 = $("statusChart");
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: ["Pending", "Contacted"],
      datasets: [{ data: [pendingCount, contactedCount], backgroundColor: ["#ffc107", "#00e6a8"] }]
    },
    options: { responsive: true }
  });
}

/* ================= SESSION & DASHBOARD ================= */
function showDashboard() {
  $("loginCard").style.display = "none";
  $("dashboard").style.display = "block";
  $("roleLabel").textContent = ADMIN_ROLE.toUpperCase();

  renderProjects();
  applyRoleUI();
  renderLeads();
  renderActivityLogs();
  loadAdmins();
  renderDashboardExtras();
}

function logout() {
  logActivity("LOGOUT");
  sessionStorage.clear();
  location.reload();
}

// Auto-login
if (sessionStorage.getItem("admin") === "logged") {
  ADMIN_ROLE = sessionStorage.getItem("role");
  ADMIN_EMAIL = sessionStorage.getItem("email");
  showDashboard();
}

/* ================= ADMIN MANAGEMENT ================= */
async function addAdmin() {
  if (ADMIN_ROLE !== "super") return;

  const email = $("newAdminEmail").value.trim();
  const pass = $("newAdminPass").value.trim();
  const role = $("newAdminRole").value;

  if (!email || !pass) { showAlert1("⚠️ Email & password required"); return; }

  try {
    await addDoc(collection(db, "admins"), {
      email,
      password: pass,
      role,
      active: true,
      createdAt: serverTimestamp()
    });

    await logActivity("ADMIN_CREATED", { target: email });
    showAlert1("✅ Admin added");

    $("newAdminEmail").value = "";
    $("newAdminPass").value = "";

    loadAdmins();
  } catch (e) {
    console.error(e);
    showAlert1("❌ Failed to add admin");
  }
}

async function toggleAdminStatus(id, current) {
  if (ADMIN_ROLE !== "super") return;
  await updateDoc(doc(db, "admins", id), { active: !current });
  await logActivity("ADMIN_STATUS_CHANGED", { target: id, to: !current });
  loadAdmins();
}

async function deleteAdmin(id, email) {
  if (ADMIN_ROLE !== "super") return;
  if (!confirm(`Delete admin ${email}?`)) return;
  await deleteDoc(doc(db, "admins", id));
  await logActivity("ADMIN_DELETED", { target: email });
  loadAdmins();
}

async function loadAdmins() {
  const tbody = $("adminsBody");
  tbody.innerHTML = "";

  if (ADMIN_ROLE !== "super") {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Only super admins can view</td></tr>`;
    return;
  }

  try {
    const snap = await getDocs(collection(db, "admins"));
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="4" class="muted">No admins found</td></tr>`; return; }

    snap.forEach(d => {
      const a = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${a.email}</td>
        <td><span class="role-badge role-${a.role}">${a.role}</span></td>
        <td><span class="badge ${a.active ? "active" : "disabled"}">${a.active ? "Active" : "Disabled"}</span></td>
        <td class="admin-actions">
          <button onclick="toggleAdminStatus('${d.id}',${a.active})">${a.active ? "Disable" : "Enable"}</button>
          <button class="danger" onclick="deleteAdmin('${d.id}','${a.email}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="4" style="color:red">Failed to load admins</td></tr>`;
  }
}

/* ================= DASHBOARD EXTRAS ================= */
async function renderDashboardExtras() {
  const adminsSnap = await getDocs(collection(db, "admins"));
  const totalAdmins = adminsSnap.size;
  if (!document.querySelector(".stat-card.admins")) {
    const div = document.createElement("div");
    div.className = "stat-card admins";
    div.innerHTML = `<span>Total Admins</span><strong>${totalAdmins}</strong>`;
    document.querySelector(".analytics").appendChild(div);
  }

  // New leads today
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const leadsSnap = await getDocs(collection(db, "leads"));
  const newToday = leadsSnap.docs.filter(d => d.data().createdAt?.toDate?.() >= today).length;
}

/* ================= LEADS ================= */
async function renderLeads() {
  let todayCount = 0, monthCount = 0, lastLeadDate = null;
  const now = new Date();
  const todayStr = now.toDateString(), currentMonth = now.getMonth(), currentYear = now.getFullYear();

  $("loader").style.display = "block";
  const tbody = document.querySelector("#leadsTable tbody");
  tbody.innerHTML = "";
  pending = contacted = 0;

  try {
    const snap = await getDocs(collection(db, "leads"));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">No leads found</td></tr>`;
      $("leadCount").textContent = "0"; $("totalCount").textContent = "0";
      $("pendingCount").textContent = "0"; $("contactedCount").textContent = "0";
      return;
    }

    const leadsArray = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCharts(leadsArray);
    leadsArray.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    $("leadCount").textContent = leadsArray.length;
    $("totalCount").textContent = leadsArray.length;

    leadsArray.forEach(l => {
      const status = l.status || "pending";
      status === "pending" ? pending++ : contacted++;

      let action = "-";
      if (ADMIN_ROLE !== "viewer") {
        action = `<button class="action-btn" onclick="toggleStatus('${l.id}','${status}')">Mark ${status === "pending" ? "Contacted" : "Pending"}</button>`;
      }

      const created = l.createdAt?.toDate?.();
      if (created) {
        if (created.toDateString() === todayStr) todayCount++;
        if (created.getMonth() === currentMonth && created.getFullYear() === currentYear) monthCount++;
        if (!lastLeadDate || created > lastLeadDate) lastLeadDate = created;
      }

      $("todayCount").textContent = todayCount;
      $("monthCount").textContent = monthCount;
      const rate = leadsArray.length ? Math.round((contacted / leadsArray.length) * 100) : 0;
      $("conversionRate").textContent = rate + "%";
      $("lastLeadTime").textContent = lastLeadDate ? lastLeadDate.toLocaleString() : "-";

      const tr = document.createElement("tr");
      tr.classList.add("clickable");
      if (created && (Date.now() - created.getTime()) < 86400000) tr.classList.add("new-lead");

      tr.innerHTML = `
        <td>${l.name || ""}</td>
        <td>${l.email || ""}<button class="copy-btn" onclick="event.stopPropagation();copyText('${l.email}')">Copy</button></td>
        <td>${l.service || ""}</td>
        <td>${l.message || "-"}</td>
        <td><span class="status ${status}">${status.toUpperCase()}</span></td>
        <td>${action}</td>
        <td>${created ? created.toLocaleString() : ""}</td>
      `;

      tr.onclick = e => { if (!e.target.closest("button")) openLeadDetails(l.id); };
      tbody.appendChild(tr);
    });

    $("pendingCount").textContent = pending;
    $("contactedCount").textContent = contacted;

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" style="color:red">Failed to load leads</td></tr>`;
  } finally { $("loader").style.display = "none"; }
}

/* ================= PROJECTS ================= */
async function renderProjects() {
  const tbody = document.querySelector("#projectsTable tbody");
  tbody.innerHTML = "";

  const snap = await getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc")));
  if (snap.empty) { tbody.innerHTML = `<tr><td colspan="7" class="muted">No projects</td></tr>`; return; }

  snap.forEach(d => {
    const p = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.title}</td>
      <td>${p.clientName}</td>
      <td><span class="status ${p.status}">${p.status}</span></td>
      <td><div class="progress-bar"><div class="progress-fill" style="width:${p.progress}%"></div></div>${p.progress}%</td>
      <td>${p.deadline?.toDate?.().toLocaleDateString() || "-"}</td>
      <td>${p.assignedTo}</td>
      <td><button class="action-btn" onclick="deleteProject('${d.id}')">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteProject(id) {
  if (ADMIN_ROLE !== "super") return;
  if (!confirm("Delete project?")) return;
  await deleteDoc(doc(db, "projects", id));
  await logActivity("PROJECT_DELETED", { projectId: id });
  renderProjects();
}

/* ================= STATUS ================= */
async function toggleStatus(id, current) {
  if (ADMIN_ROLE === "viewer") return;
  const next = current === "pending" ? "contacted" : "pending";
  await updateDoc(doc(db, "leads", id), { status: next });
  await logActivity("STATUS_CHANGED", { leadId: id, from: current, to: next });
  showAlert1(`✔ Marked ${next.toUpperCase()}`);
  renderLeads();
}

/* ================= LEAD FILTER ================= */
function filterLeads() {
  const search = $("leadSearch").value.toLowerCase();
  const status = $("statusFilter").value;
  document.querySelectorAll("#leadsTable tbody tr").forEach(r => {
    const cells = r.querySelectorAll("td");
    if (cells.length === 0) return;
    const matchText = [...cells].slice(0, 4).some(td => td.textContent.toLowerCase().includes(search));
    const matchStatus = status === "all" || cells[4].textContent.toLowerCase() === status;
    r.style.display = matchText && matchStatus ? "" : "none";
  });
}

/* ================= ACTIVITY LOGS ================= */
async function renderActivityLogs() {
  if (ADMIN_ROLE !== "super") return;
  const tbody = $("logsTable").querySelector("tbody");
  tbody.innerHTML = "";

  try {
    const snap = await getDocs(collection(db, "activity_logs"));
    if (snap.empty) { tbody.innerHTML = `<tr><td colspan="8" class="muted">No activity logs</td></tr>`; return; }

    const logsArray = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    logsArray.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    logsArray.forEach(log => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${log.adminEmail || "-"}</td>
        <td>${log.role || "-"}</td>
        <td>${log.action || "-"}</td>
        <td>${log.leadId || "-"}</td>
        <td>${log.from || "-"}</td>
        <td>${log.to || "-"}</td>
        <td>${log.createdAt?.toDate?.().toLocaleString() || "-"}</td>
        <td>-</td>
      `;
      if (log.leadId) tr.onclick = e => { if (!e.target.closest("button")) openLeadDetails(log.leadId); };
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" style="color:red">Failed to load logs</td></tr>`;
  }
}

/* ================= LOG ACTIVITY ================= */
async function logActivity(action, data = {}) {
  try {
    await addDoc(collection(db, "activity_logs"), { adminEmail: ADMIN_EMAIL, role: ADMIN_ROLE, action, ...data, createdAt: serverTimestamp() });
  } catch (e) { console.error(e); }
}

/* ================= LEAD DETAILS ================= */
async function openLeadDetails(id) {
  const box = $("leadDetailBox");
  const content = $("leadDetailContent");
  if (!box || !content) return;

  box.classList.add("show");
  content.innerHTML = "Loading...";

  try {
    const snap = await getDoc(doc(db, "leads", id));
    if (!snap.exists()) { content.innerHTML = "Lead not found"; return; }

    const l = snap.data();
    content.innerHTML = `
      <strong>Name:</strong> ${l.name || "-"}<br>
      <strong>Email:</strong> ${l.email || "-"}<br>
      <strong>Service:</strong> ${l.service || "-"}<br>
      <strong>Status:</strong> ${(l.status || "pending").toUpperCase()}<br>
      <strong>Message:</strong><br>${l.message || "-"}
    `;
  } catch (e) {
    console.error(e);
    content.innerHTML = "Failed to load lead";
  }
}

/* ================= EXPORT CSV ================= */
async function exportCSV() {
  try {
    const snap = await getDocs(collection(db, "leads"));
    if (snap.empty) { showAlert1("No leads to export"); return; }

    const leadsArray = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    let csvContent = "Name,Email,Service,Message,Status,Created At\n";
    leadsArray.forEach(l => {
      const created = l.createdAt?.toDate?.().toLocaleString() || "";
      csvContent += `"${l.name || ""}","${l.email || ""}","${l.service || ""}","${l.message || ""}","${l.status || "pending"}","${created}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert1("✅ CSV exported successfully!");
  } catch (err) {
    console.error(err);
    showAlert1("❌ Failed to export CSV");
  }
}

/* ================= UTILS ================= */
function applyRoleUI() { document.querySelectorAll(".super-only").forEach(el => el.style.display = ADMIN_ROLE === "super" ? "block" : "none"); }
function showSection(id, btn) { document.querySelectorAll(".section").forEach(s => s.classList.remove("active")); $(id).classList.add("active"); document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active")); if(btn) btn.classList.add("active"); }
function showAlert1(msg) { const t=document.createElement("div"); t.textContent=msg; t.style.cssText="position:fixed;top:20px;right:20px;background:#111;color:#fff;padding:12px 18px;border-radius:10px;z-index:9999"; document.body.appendChild(t); setTimeout(()=>t.remove(),3000); }
window.closeLeadDetails = () => $("leadDetailBox").classList.remove("show");
function copyText(text) { navigator.clipboard.writeText(text); showAlert1("📋 Copied"); }
function toggleSidebar(){ document.querySelector(".sidebar")?.classList.toggle("open"); }
window.toggleSidebar = toggleSidebar;

/* ================= PROJECT ADD ================= */
async function addProject() {
  if (ADMIN_ROLE !== "super") return showAlert1("❌ Only super admin can add projects");

  const title = $("projTitle").value.trim();
  const clientName = $("projClient").value.trim();
  const clientEmail = $("projEmail").value.trim();
  const status = $("projStatus").value;
  const progress = parseInt($("projProgress").value) || 0;
  const deadline = $("projDeadline").value ? new Date($("projDeadline").value) : null;
  const notes = $("projNotes").value.trim();

  if (!title || !clientName || !clientEmail) return showAlert1("⚠️ Title, Client Name & Email required");

  try {
    await addDoc(collection(db, "projects"), { title, clientName, clientEmail, status, progress, deadline: deadline ? serverTimestamp() : null, notes, assignedTo: ADMIN_EMAIL, createdAt: serverTimestamp() });
    showAlert1("✅ Project added successfully!");
    $("projTitle").value = ""; $("projClient").value = ""; $("projEmail").value = ""; $("projStatus").value = "pending"; $("projProgress").value = ""; $("projDeadline").value = ""; $("projNotes").value = "";
    await logActivity("PROJECT_ADDED", { title });
    renderProjects();
  } catch (err) { console.error(err); showAlert1("❌ Failed to add project"); }
}

/* ================= EXPOSE ================= */
window.login=login; window.logout=logout; window.toggleStatus=toggleStatus; window.showSection=showSection; window.openLeadDetails=openLeadDetails; window.renderLeads=renderLeads; window.exportCSV=exportCSV; window.filterLeads=filterLeads; window.addAdmin=addAdmin; window.toggleAdminStatus=toggleAdminStatus; window.deleteAdmin=deleteAdmin; window.addProject=addProject; window.renderProjects=renderProjects; window.deleteProject=deleteProject;

console.log("✅ ADMIN PANEL - FULLY UPGRADED, READY TO COPY-PASTE");
