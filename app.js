import {
    logout,
    watchAuth,
    getUserProfile,
    watchCollection,
    createRecord,
    updateRecord,
    deleteRecord,
    saveDailyRecord
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

const PROCESSES = [
    "📥 Recepción y registro", "📦 Organización de inventario", "🔎 Revisión y validación",
    "🔄 Movimientos y devoluciones", "📊 Reportes y datos", "🛡️ Auditoría y control"
];
const STATUSES = ["Pendiente", "Analizando", "En proceso", "En revisión", "Finalizado", "Bloqueado"];
const PRIORITIES = ["Urgente", "Alta", "Media", "Baja"];
const FREQUENCIES = ["No repetir", "Diario", "Semanal", "Mensual", "Programado", "Cuando ocurra"];
const INCIDENT_TYPES = ["Error", "Duplicado", "Diferencia", "Producto faltante", "Caja", "Devolución", "Otro"];
const INCIDENT_STATUSES = ["Detectada", "Analizando", "En corrección", "Resuelta"];

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

let activities = [];
let operations = [];
let incidents = [];
let currentUser = null;
let currentProfile = null;
let unsubs = [];
let plannerMode = "day";
let plannerDate = new Date();

function saveAll() {}

function esc(s = "") {
    return String(s).replace(/[&<>"']/g, m => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    } [m]));
}

function fmtDate(iso) {
    if (!iso) return "-";
    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date(iso + "T12:00:00"));
}

function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => t.classList.remove("show"), 2400);
}

function setOptions(id, arr) {
    $(id).innerHTML = arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

function statusBadge(status) {
    const map = {
        "Pendiente": "b-pending",
        "Analizando": "b-analysis",
        "En proceso": "b-process",
        "En revisión": "b-review",
        "Finalizado": "b-done",
        "Bloqueado": "b-blocked",
        "Detectada": "b-pending",
        "En corrección": "b-process",
        "Resuelta": "b-done"
    };
    return `<span class="badge ${map[status]||"b-analysis"}">${esc(status)}</span>`;
}

function priorityClass(p) {
    return "priority-" + ({
        Urgente: "urgent",
        Alta: "high",
        Media: "medium",
        Baja: "low"
    } [p] || "medium");
}

function renderDashboard() {
    const period = $("dashboardPeriod").value;
    const now = new Date(todayISO() + "T12:00:00");
    let records = operations.filter(r => {
        const d = new Date(r.date + "T12:00:00");
        if (period === "today") return r.date === todayISO();
        if (period === "week") {
            const start = new Date(now);
            start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            return d >= start && d <= end;
        }
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const sum = k => records.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    $("kpiProducts").textContent = sum("products").toLocaleString("es-MX");
    $("kpiBoxes").textContent = sum("boxes").toLocaleString("es-MX");
    $("kpiSku").textContent = sum("sku").toLocaleString("es-MX");
    $("kpiDiff").textContent = sum("diff").toLocaleString("es-MX");
    $("kpiFixed").textContent = sum("fixed").toLocaleString("es-MX");
    const comp = records.length ? Math.round(records.reduce((a, r) => a + (Number(r.completion) || 0), 0) / records.length) : 0;
    $("kpiCompliance").textContent = comp + "%";

    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    $("weeklyBars").innerHTML = days.map((label, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const total = activities.filter(a => a.date === iso).length;
        const done = activities.filter(a => a.date === iso && a.status === "Finalizado").length;
        const pct = total ? Math.round(done / total * 100) : 0;
        return `<div class="bar-col"><div class="bar"><span style="height:${pct}%"></span></div>${label}<br><b>${pct}%</b></div>`;
    }).join("");

    const counts = STATUSES.map(s => ({
        s,
        c: activities.filter(a => a.status === s).length
    })).filter(x => x.c);
    const max = Math.max(1, ...counts.map(x => x.c));
    $("statusSummary").innerHTML = counts.map(x => `<div class="status-row"><strong>${esc(x.s)}</strong><span>${x.c}</span><div class="status-meter"><span style="width:${x.c/max*100}%"></span></div></div>`).join("") || "<p>Sin actividades.</p>";

    const attention = activities.filter(a => (a.dueDate < todayISO() && a.status !== "Finalizado") || a.priority === "Urgente").slice(0, 6);
    $("attentionTable").innerHTML = attention.length ? attention.map(a => `<tr><td>${esc(a.title)}</td><td>${esc(a.process)}</td><td class="${priorityClass(a.priority)}">${esc(a.priority)}</td><td>${statusBadge(a.status)}</td><td>${fmtDate(a.dueDate)}</td></tr>`).join("") : `<tr><td colspan="5">No hay actividades críticas.</td></tr>`;
}

function renderActivities() {
    const q = $("activitySearch").value.toLowerCase();
    const st = $("filterStatus").value,
        pr = $("filterProcess").value,
        pi = $("filterPriority").value;
    const list = activities.filter(a => (!q || a.title.toLowerCase().includes(q)) && (!st || a.status === st) && (!pr || a.process === pr) && (!pi || a.priority === pi))
        .sort((a, b) => a.date.localeCompare(b.date));
    $("activitiesTable").innerHTML = list.length ? list.map(a => `<tr>
    <td><strong>${esc(a.title)}</strong><br><small>${esc(a.frequency)}</small></td>
    <td>${esc(a.process)}</td><td class="${priorityClass(a.priority)}">${esc(a.priority)}</td><td>${statusBadge(a.status)}</td>
    <td>${fmtDate(a.date)}</td>
    <td>
    <div class="progress"><span style="width:${Number(a.progress)||0}%"></span></div>
    <small>${Number(a.progress)||0}%</small></td>
    <td>
  <div class="row-actions">
    ${
      canEdit()
        ? `
          <button
            class="mini-btn"
            onclick="editActivity('${a.id}')">
            ✏️
          </button>
        `
        : ""
    }

    ${
      canDelete()
        ? `
          <button
            class="mini-btn"
            onclick="deleteActivity('${a.id}')">
            🗑️
          </button>
        `
        : ""
    }

  </div>
</td>
  </tr>`).join("") : `<tr><td colspan="7">No hay actividades.</td></tr>`;
}

function renderOperation() {
    $("operationTable").innerHTML = operations.slice().sort((a, b) => b.date.localeCompare(a.date)).map(r => `
        <tr><td>${fmtDate(r.date)}</td>
        <td><strong>${esc(r.workerName || "Sin responsable")}</strong></td>
        <td>${r.products}</td><td>${r.boxes}</td>
        <td>${r.sku}</td>
        <td>${r.diff}</td>
        <td>${r.fixed}</td>
        <td>${r.completion}%</td></tr>`).join("") || `<tr><td colspan="7">Aún no hay registros.</td></tr>`;
}

function renderIncidents() {
    $("incOpen").textContent = incidents.filter(i => ["Detectada", "Analizando"].includes(i.status)).length;
    $("incWorking").textContent = incidents.filter(i => i.status === "En corrección").length;
    $("incSolved").textContent = incidents.filter(i => i.status === "Resuelta").length;
    $("incidentsTable").innerHTML = incidents.slice().sort((a, b) => b.date.localeCompare(a.date)).map(i => `<tr><td><strong>${esc(i.title)}</strong></td><td>${esc(i.type)}</td><td>${esc(i.reference||"-")}</td><td class="${priorityClass(i.priority)}">${esc(i.priority)}</td><td>${statusBadge(i.status)}</td><td>${fmtDate(i.date)}</td><td><button class="mini-btn" onclick="deleteIncident('${i.id}')">🗑️</button></td></tr>`).join("") || `<tr><td colspan="7">Sin incidencias.</td></tr>`;
}

function dateISOFromDate(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString().slice(0, 10);
}

function renderPlanner() {
    const content = $("plannerContent");
    if (plannerMode === "day") {
        const iso = dateISOFromDate(plannerDate);
        $("plannerTitle").textContent = new Intl.DateTimeFormat("es-MX", {
            weekday: "long",
            day: "numeric",
            month: "long"
        }).format(plannerDate);
        const list = activities.filter(a => a.date === iso);
        content.innerHTML = `<div class="day-list">${list.length?list.map(a=>`<div class="day-task"><div class="time">${fmtDate(a.date)}</div><div><strong>${esc(a.title)}</strong><br><small>${esc(a.process)}</small></div>${statusBadge(a.status)}</div>`).join(""):"<p>No hay actividades para este día.</p>"}</div>`;
    } else if (plannerMode === "week") {
        const d = new Date(plannerDate);
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        $("plannerTitle").textContent = `${fmtDate(dateISOFromDate(monday))} — ${fmtDate(dateISOFromDate(sunday))}`;
        content.innerHTML = `<div class="week-grid">${Array.from({length:7},(_,i)=>{const x=new Date(monday);x.setDate(monday.getDate()+i);const iso=dateISOFromDate(x);const list=activities.filter(a=>a.date===iso);return `<div class="week-day"><h4>${new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric"}).format(x)} </h4>${list.map(a=>`<div class="mini-task">${esc(a.title)}<br><small>${esc(a.status)}</small></div>`).join("")}</div> `}).join("")}</div>`;
    } else {
        const y = plannerDate.getFullYear(),
            m = plannerDate.getMonth();
        $("plannerTitle").textContent = new Intl.DateTimeFormat("es-MX", {
            month: "long",
            year: "numeric"
        }).format(plannerDate);
        const first = new Date(y, m, 1),
            startOffset = (first.getDay() + 6) % 7,
            start = new Date(y, m, 1 - startOffset);
        const heads = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(h => `<div class="month-head">${h}</div>`).join("");
        const cells = Array.from({
            length: 42
        }, (_, i) => {
            const x = new Date(start);
            x.setDate(start.getDate() + i);
            const iso = dateISOFromDate(x);
            const list = activities.filter(a => a.date === iso);
            const cls = [x.getMonth() !== m ? "muted" : "", iso === todayISO() ? "today" : ""].join(" ");
            return `<div class="month-day ${cls}"><div class="month-num">${x.getDate()}</div>${list.slice(0,3).map(a=>`<div class="month-task">${esc(a.title)}</div>`).join("")}</div>`
        }).join("");
        content.innerHTML = `<div class="month-grid">${heads}${cells}</div>`;
    }
}

function openActivityModal(activity = null) {
    $("activityForm").reset();
    $("activityId").value = activity?.id || "";
    $("activityModalTitle").textContent = activity ? "Editar actividad" : "Nueva actividad";
    $("actTitle").value = activity?.title || "";
    $("actProcess").value = activity?.process || PROCESSES[0];
    $("actPriority").value = activity?.priority || "Media";
    $("actStatus").value = activity?.status || "Pendiente";
    $("actDate").value = activity?.date || todayISO();
    $("actDueDate").value = activity?.dueDate || todayISO();
    $("actFrequency").value = activity?.frequency || "No repetir";
    $("actProgress").value = activity?.progress || 0;
    $("actNotes").value = activity?.notes || "";
    $("activityModal").classList.remove("hidden");
}
window.editActivity = id => openActivityModal(activities.find(a => a.id === id));
window.deleteActivity = async id => {
    if (confirm("¿Eliminar esta actividad?")) {
        try {
            await deleteRecord("activities", id);
            showToast("Actividad eliminada");
        } catch (err) {
            console.error(err);
            showToast("No se pudo eliminar");
        }
    }
};
window.deleteIncident = async id => {
    if (confirm("¿Eliminar esta incidencia?")) {
        try {
            await deleteRecord("incidents", id);
            showToast("Incidencia eliminada");
        } catch (err) {
            console.error(err);
            showToast("No se pudo eliminar");
        }
    }
};


function roleName(role) {
    return {
        inventario: "📦 Inventario",
        sistemas: "💻 Sistemas",
        direccion: "👔 Dirección",
        super_admin: "🛡️ Super Admin"
    } [role] || "Usuario";
}

function canEdit() {
    return ["inventario", "sistemas", "super_admin"].includes(currentProfile?.role);
}

function canDelete() {
    return ["sistemas", "super_admin"].includes(currentProfile?.role);
}

function applyPermissions() {
    const role = currentProfile?.role;

    $("rolePill").textContent = roleName(role);

    if (role === "direccion") {
        $("quickTaskBtn").style.display = "none";
        $("newActivityBtn").style.display = "none";
        $("newIncidentBtn").style.display = "none";
        document.querySelector('.nav-item[data-view="operation"]')?.style.setProperty("display", "none");
        document.querySelector('.nav-item[data-view="incidents"]')?.style.setProperty("display", "none");
    }
}

async function initializeProtectedApp(user) {
    currentUser = user;
    currentProfile = await getUserProfile(user.uid);

    if (!currentProfile || currentProfile.active === false) {
        await logout();
        window.location.replace("./login.html");
        return;
    }

    document.querySelector(".user-card strong").textContent =
        currentProfile.name || user.email;

    document.querySelector(".user-card span").textContent =
        roleName(currentProfile.role);

    applyPermissions();

    unsubs.push(
        watchCollection("activities", data => {
            activities = data;
            renderAll();
        })
    );

    unsubs.push(
        watchCollection("dailyRecords", data => {
            operations = data;
            renderAll();
        })
    );

    unsubs.push(
        watchCollection("incidents", data => {
            incidents = data;
            renderAll();
        })
    );
}

function renderAll() {
    renderDashboard();
    renderActivities();
    renderOperation();
    renderIncidents();
    renderPlanner();
}

function getMonday(date) {

  const d = new Date(date);

  const day =
    d.getDay() === 0
      ? 6
      : d.getDay() - 1;

  d.setDate(
    d.getDate() - day
  );

  d.setHours(0, 0, 0, 0);

  return d;
}


function getSunday(date) {

  const monday =
    getMonday(date);

  const sunday =
    new Date(monday);

  sunday.setDate(
    monday.getDate() + 6
  );

  sunday.setHours(
    23,
    59,
    59,
    999
  );

  return sunday;
}

function exportOperationReport(records,fileName,sheetName) {

  if (!records.length) {
    showToast(
      "No existen registros para este periodo."
    );
    return;
  }
  const rows = records.map(r => ({
    Fecha:
      fmtDate(r.date),
    Responsable:
      r.workerName || "Sin responsable",

    "Productos escaneados": r.products || 0,

    "Cajas procesadas": r.boxes || 0,

    "SKU revisados": r.sku || 0,

    "Diferencias encontradas": r.diff || 0,

    "Errores corregidos": r.fixed || 0,

    "Porcentaje completado": `${r.completion || 0}%`,

    Observaciones:
      r.notes || ""

  }));


  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook =XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook,worksheet,sheetName);


  XLSX.writeFile(workbook, fileName);
}


function downloadWeeklyReport() {

  const today =
    new Date();

  const monday =
    getMonday(today);

  const sunday =
    getSunday(today);


  const records =
    operations.filter(r => {

      const date =
        new Date(
          `${r.date}T12:00:00`
        );

      return (
        date >= monday &&
        date <= sunday
      );

    });


  exportOperationReport(
    records,
    `reporte-inventario-semanal-${todayISO()}.xlsx`,
    "Reporte semanal"
  );
}

function downloadMonthlyReport() {

  const today =
    new Date();

  const month =
    today.getMonth();

  const year =
    today.getFullYear();


  const records =
    operations.filter(r => {

      const date =
        new Date(
          `${r.date}T12:00:00`
        );

      return (
        date.getMonth() === month &&
        date.getFullYear() === year
      );

    });


  exportOperationReport(
    records,
    `reporte-inventario-mensual-${year}-${String(
      month + 1
    ).padStart(2, "0")}.xlsx`,
    "Reporte mensual"
  );
}

document.addEventListener("DOMContentLoaded", () => {
    $("todayLabel").textContent = new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long"
    }).format(new Date());
    $("opDate").value = todayISO();
    $("opDate").max = todayISO();
    $("incDate").value = todayISO();
    setOptions("actProcess", PROCESSES);
    setOptions("actPriority", PRIORITIES);
    setOptions("actStatus", STATUSES);
    setOptions("actFrequency", FREQUENCIES);
    setOptions("incType", INCIDENT_TYPES);
    setOptions("incPriority", PRIORITIES);
    setOptions("incStatus", INCIDENT_STATUSES);
    $("filterStatus").innerHTML += STATUSES.map(v => `<option>${v}</option>`).join("");
    $("filterProcess").innerHTML += PROCESSES.map(v => `<option>${v}</option>`).join("");
    $("filterPriority").innerHTML += PRIORITIES.map(v => `<option>${v}</option>`).join("");

    document.querySelectorAll(".nav-item").forEach(btn => btn.onclick = () => {
        document.querySelectorAll(".nav-item,.view").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        $(btn.dataset.view).classList.add("active");
        $("pageTitle").textContent = btn.querySelector("span").textContent;
        $("sidebar").classList.remove("open");
    });
    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => document.querySelector(`.nav-item[data-view="${b.dataset.go}"]`).click());
    $("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

    $("quickTaskBtn").onclick = () => openActivityModal();
    $("newActivityBtn").onclick = () => openActivityModal();
    $("newIncidentBtn").onclick = () => $("incidentModal").classList.remove("hidden");
    document.querySelectorAll(".modal-close").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));
    document.querySelectorAll(".modal-backdrop").forEach(m => m.addEventListener("click", e => {
        if (e.target === m) m.classList.add("hidden")
    }));

    $("downloadWeeklyReport")
        .addEventListener("click",downloadWeeklyReport);


    $("downloadMonthlyReport")
        .addEventListener("click", downloadMonthlyReport
    );

    $("activityForm").onsubmit = async e => {
        e.preventDefault();
        const id = $("activityId").value;
        const item = {
            title: $("actTitle").value.trim(),
            process: $("actProcess").value,
            priority: $("actPriority").value,
            status: $("actStatus").value,
            date: $("actDate").value,
            dueDate: $("actDueDate").value,
            frequency: $("actFrequency").value,
            progress: Number($("actProgress").value) || 0,
            notes: $("actNotes").value.trim(),
            assignedTo: currentUser?.uid || "",
            assignedName: currentProfile?.name || currentUser?.email || "",
            createdBy: currentUser?.uid || ""
        };
        try {
            if (id) await updateRecord("activities", id, item);
            else await createRecord("activities", item);
            $("activityModal").classList.add("hidden");
            showToast(id ? "Actividad actualizada" : "Actividad creada");
        } catch (err) {
            console.error(err);
            showToast("No se pudo guardar la actividad");
        }
    };
    $("incidentForm").onsubmit = async e => {
        e.preventDefault();
        const item = {
            title: $("incTitle").value.trim(),
            type: $("incType").value,
            reference: $("incReference").value.trim(),
            priority: $("incPriority").value,
            status: $("incStatus").value,
            date: $("incDate").value,
            description: $("incDescription").value.trim(),
            createdBy: currentUser?.uid || ""
        };
        try {
            await createRecord("incidents", item);
            e.target.reset();
            $("incDate").value = todayISO();
            $("incidentModal").classList.add("hidden");
            showToast("Incidencia registrada");
        } catch (err) {
            console.error(err);
            showToast("No se pudo guardar la incidencia");
        }
    };
    $("operationForm").onsubmit = async e => {
      e.preventDefault();

      const d = $("opDate").value;
      if (d > todayISO()) {
        showToast(
            "No puedes registrar información en fechas futuras."
        );

        return;
        }

      const workerSelect = $("opWorker");

      const item = {
        date: d,

        // Persona a quien pertenece el trabajo
        workerId: workerSelect.value,  

        workerName:
          workerSelect.options[
            workerSelect.selectedIndex
          ].text,

        products:
          Number($("opProducts").value) || 0,

        boxes:
          Number($("opBoxes").value) || 0,

        sku:
          Number($("opSku").value) || 0,

        diff:
          Number($("opDiff").value) || 0,

        fixed:
          Number($("opFixed").value) || 0,

        completion:
          Number($("opCompletion").value) || 0,

        notes:
          $("opNotes").value.trim(),

        // Dilan es quien realmente capturó la información
        registeredBy:
          currentUser?.uid || "",

        registeredByName:
          currentProfile?.name ||
          currentUser?.email ||
          ""
      };

      try {

        await saveDailyRecord(item);

        showToast(
            "Registro guardado correctamente"
        );

          // Limpiar formulario
        $("operationForm").reset();

        // Volver a poner fecha actual
        $("opDate").value = todayISO();
        $("opDate").max = todayISO();

        } catch (err) {

        console.error(err);

        if (err.message === "DAILY_RECORD_EXISTS") {

            showToast(
            "Esta persona ya tiene un registro para esta fecha."
            );

            return;
        }

        showToast(
            "No se pudo guardar el registro"
        );
        }


    };
    ["activitySearch", "filterStatus", "filterProcess", "filterPriority"].forEach(id => $(id).addEventListener(id === "activitySearch" ? "input" : "change", renderActivities));
    $("dashboardPeriod").onchange = renderDashboard;

    document.querySelectorAll(".seg-btn").forEach(b => b.onclick = () => {
        document.querySelectorAll(".seg-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        plannerMode = b.dataset.planner;
        renderPlanner();
    });
    $("plannerPrev").onclick = () => {
        if (plannerMode === "day") plannerDate.setDate(plannerDate.getDate() - 1);
        else if (plannerMode === "week") plannerDate.setDate(plannerDate.getDate() - 7);
        else plannerDate.setMonth(plannerDate.getMonth() - 1);
        renderPlanner();
    };
    $("plannerNext").onclick = () => {
        if (plannerMode === "day") plannerDate.setDate(plannerDate.getDate() + 1);
        else if (plannerMode === "week") plannerDate.setDate(plannerDate.getDate() + 7);
        else plannerDate.setMonth(plannerDate.getMonth() + 1);
        renderPlanner();
    };
    $("plannerToday").onclick = () => {
        plannerDate = new Date();
        renderPlanner();
    };

    $("logoutBtn").onclick = async () => {
        try {
            await logout();
        } finally {
            window.location.replace("./login.html");
        }
    };

    watchAuth(async user => {
        unsubs.forEach(fn => fn());
        unsubs = [];

        if (!user) {
            window.location.replace("./login.html");
            return;
        }

        try {
            await initializeProtectedApp(user);
        } catch (error) {
            console.error("No se pudo inicializar el sistema:", error);
            await logout();
            window.location.replace("./login.html");
        }
    });

    renderAll();
});