"use strict";

const SECTIONS = {
  action: "Plan d'action",
  acquisition: "Acquisition",
  marketing: "Marketing",
  equipe: "Équipe",
  finance: "Finance",
};
const PRIORITES = { urgent: "Urgent", nonurgent: "Non urgent", avoir: "À voir" };
const STATUTS = { afaire: "À faire", encours: "En cours", fait: "Fait" };
const COULEURS = ["#3b5bdb", "#2f9e44", "#e8890c", "#d6336c", "#7048e8", "#0c8599"];
const STORAGE_KEY = "projetview:v1";
const DAY = 86400000;

// ---------- État ----------
let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.projets) && Array.isArray(s.taches)) return s;
  } catch (e) { /* stockage indisponible ou corrompu */ }
  return { projets: [], taches: [], finance: {}, kpi: {} };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignoré */ }
}
const uid = () => Math.random().toString(36).slice(2, 10);
state.finance = state.finance || {};
state.kpi = state.kpi || {};

// ---------- Utilitaires ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const fmtDate = (s) => (s ? parseDate(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const eur = (n) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

function daysUntil(dateStr) {
  const d = parseDate(dateStr);
  return d ? Math.round((d - today()) / DAY) : null;
}
function dueInfo(t) {
  if (!t.deadline) return { cls: "", label: "Sans échéance" };
  const n = daysUntil(t.deadline);
  if (t.statut === "fait") return { cls: "", label: fmtDate(t.deadline) };
  if (n < 0) return { cls: "due-late", label: `En retard de ${-n} j (${fmtDate(t.deadline)})` };
  if (n === 0) return { cls: "due-soon", label: "Aujourd'hui" };
  if (n <= 7) return { cls: "due-soon", label: `Dans ${n} j (${fmtDate(t.deadline)})` };
  return { cls: "", label: fmtDate(t.deadline) };
}

// ---------- Calculs ----------
const tachesDe = (pid) => state.taches.filter((t) => t.projetId === pid);
const pct = (done, total) => (total ? Math.round((done / total) * 100) : null);

function sectionProgress(pid, section) {
  const ts = tachesDe(pid).filter((t) => t.section === section);
  return { total: ts.length, done: ts.filter((t) => t.statut === "fait").length, pct: pct(ts.filter((t) => t.statut === "fait").length, ts.length) };
}
function projectProgress(pid) {
  const vals = Object.keys(SECTIONS).map((s) => sectionProgress(pid, s).pct).filter((v) => v !== null);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}
function projectHealth(p) {
  const ouvertes = tachesDe(p.id).filter((t) => t.statut !== "fait");
  const retard = ouvertes.filter((t) => t.deadline && daysUntil(t.deadline) < 0).length;
  const urgentes = ouvertes.filter((t) => t.priorite === "urgent").length;
  const bientot = ouvertes.filter((t) => t.deadline && daysUntil(t.deadline) >= 0 && daysUntil(t.deadline) <= 7).length;
  let score = retard * 3 + urgentes * 2 + bientot;
  let horsCalendrier = false;
  if (p.deadline && p.creeLe) {
    const total = parseDate(p.deadline) - parseDate(p.creeLe);
    const ecoule = today() - parseDate(p.creeLe);
    if (total > 0 && Math.min(100, (ecoule / total) * 100) - projectProgress(p.id) > 15) { score += 2; horsCalendrier = true; }
  }
  const niveau = score >= 6 ? "bad" : score >= 2 ? "warn" : "ok";
  const label = { bad: "Critique", warn: "À surveiller", ok: "Sur la bonne voie" }[niveau];
  return { score, retard, urgentes, bientot, niveau, label, horsCalendrier };
}
function financeRows(pid) { return state.finance[pid] || []; }
function financeTotals(pid) {
  const r = financeRows(pid);
  const sum = (k) => r.reduce((a, x) => a + num(x[k]), 0);
  return { prevuRev: sum("prevuRevenu"), prevuDep: sum("prevuDepenses"), reelRev: sum("reelRevenu"), reelDep: sum("reelDepenses") };
}

// ---------- Rendu ----------
function bar(p, color) { return `<div class="bar" ${color ? `style="--c:${color}"` : ""}><i style="width:${p ?? 0}%"></i></div>`; }
function badgeNiveau(h) { return `<span class="badge b-${h.niveau}">${h.label}</span>`; }

function renderDashboard() {
  const projets = state.projets;
  if (!projets.length) {
    return `<div class="card empty"><h2>Bienvenue sur Projetview</h2>
      <p class="muted">Ajoutez votre premier projet pour suivre son avancement, ses tâches et ses finances.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-action="new-project">+ Nouveau projet</button>
      <button class="btn" data-action="demo">Charger un exemple</button></div></div>`;
  }
  const ouvertes = state.taches.filter((t) => t.statut !== "fait");
  const retard = ouvertes.filter((t) => t.deadline && daysUntil(t.deadline) < 0).length;
  const urgentes = ouvertes.filter((t) => t.priorite === "urgent").length;
  const semaine = ouvertes.filter((t) => t.deadline && daysUntil(t.deadline) >= 0 && daysUntil(t.deadline) <= 7).length;
  const avg = Math.round(projets.reduce((a, p) => a + projectProgress(p.id), 0) / projets.length);

  const classes = projets.map((p) => ({ p, h: projectHealth(p) })).sort((a, b) => b.h.score - a.h.score);
  const focus = classes.filter((x) => x.h.score > 0).slice(0, 5).map(({ p, h }) => {
    const raisons = [];
    if (h.retard) raisons.push(`${h.retard} en retard`);
    if (h.urgentes) raisons.push(`${h.urgentes} urgente${h.urgentes > 1 ? "s" : ""}`);
    if (h.bientot) raisons.push(`${h.bientot} à échéance sous 7 j`);
    if (h.horsCalendrier) raisons.push("en retard sur le calendrier du projet");
    return `<a class="focus-item" href="#/projet/${p.id}" style="--c:${p.couleur}">
      <div class="grow"><b>${esc(p.nom)}</b><div class="muted small">${raisons.join(" · ")}</div></div>
      ${badgeNiveau(h)}<span class="muted small">${projectProgress(p.id)} %</span></a>`;
  }).join("");

  const cartes = projets.map((p) => {
    const h = projectHealth(p);
    const lignes = Object.entries(SECTIONS).map(([k, nom]) => {
      const sp = sectionProgress(p.id, k);
      return `<div class="line"><span>${nom}</span>${bar(sp.pct, p.couleur)}<span class="muted">${sp.pct === null ? "–" : sp.pct + " %"}</span></div>`;
    }).join("");
    return `<a class="card project-card" href="#/projet/${p.id}" style="--c:${p.couleur}">
      <div class="row spread"><h3>${esc(p.nom)}</h3>${badgeNiveau(h)}</div>
      <div class="muted small">${esc(p.description)}${p.deadline ? ` · Objectif : ${fmtDate(p.deadline)}` : ""}</div>
      <div class="row spread" style="margin-top:12px"><b>${projectProgress(p.id)} %</b><span class="muted small">${tachesDe(p.id).filter((t) => t.statut !== "fait").length} tâche(s) ouverte(s)</span></div>
      ${bar(projectProgress(p.id), p.couleur)}
      <div class="mini-sections">${lignes}</div></a>`;
  }).join("");

  return `<div class="page-head"><h1>Tableau de bord</h1></div>
    <div class="stats">
      <div class="card stat"><b>${projets.length}</b><span class="muted">projets · ${avg} % en moyenne</span></div>
      <div class="card stat ${retard ? "bad" : "ok"}"><b>${retard}</b><span class="muted">tâches en retard</span></div>
      <div class="card stat ${urgentes ? "warn" : "ok"}"><b>${urgentes}</b><span class="muted">tâches urgentes ouvertes</span></div>
      <div class="card stat"><b>${semaine}</b><span class="muted">échéances sous 7 jours</span></div>
    </div>
    <h2 class="section-title">Où avancer en priorité</h2>
    <div class="focus-list">${focus || `<div class="card muted">Rien d'urgent : tous les projets sont sur la bonne voie.</div>`}</div>
    <h2 class="section-title">Projets</h2><div class="grid">${cartes}</div>`;
}

let ui = { tab: "tout", prio: "", statut: "" };

function renderProject(id) {
  const p = state.projets.find((x) => x.id === id);
  if (!p) return `<div class="card empty"><p>Projet introuvable.</p><a class="btn" href="#/">Retour</a></div>`;
  const h = projectHealth(p);
  const cartes = Object.entries(SECTIONS).map(([k, nom]) => {
    const sp = sectionProgress(p.id, k);
    let detail = sp.total ? `${sp.done}/${sp.total} tâches` : "Aucune tâche";
    let valeur = sp.pct === null ? "–" : sp.pct + " %";
    if (k === "finance") {
      const t = financeTotals(p.id);
      if (t.prevuRev) { valeur = pct(t.reelRev, t.prevuRev) + " %"; detail = `CA réel / prévu · ${detail}`; }
    }
    const kpi = state.kpi[p.id + ":" + k];
    if (kpi && num(kpi.objectif)) detail += ` · ${esc(kpi.libelle || "objectif")} : ${num(kpi.actuel)}/${num(kpi.objectif)}`;
    return `<div class="card" data-action="tab" data-tab="${k}"><div class="muted small">${nom}</div><div class="pct">${valeur}</div>${bar(k === "finance" && financeTotals(p.id).prevuRev ? Math.min(100, pct(financeTotals(p.id).reelRev, financeTotals(p.id).prevuRev)) : sp.pct, p.couleur)}<div class="muted small" style="margin-top:6px">${detail}</div></div>`;
  }).join("");

  const tabs = [["tout", "Toutes les tâches"], ...Object.entries(SECTIONS)]
    .map(([k, n]) => `<button class="tab ${ui.tab === k ? "active" : ""}" data-action="tab" data-tab="${k}">${n}</button>`).join("");

  let corps = "";
  if (ui.tab === "finance") corps += renderFinance(p);
  if (ui.tab !== "tout" && ui.tab !== "finance") corps += renderKpi(p, ui.tab);
  corps += renderTasks(p);

  return `<div class="page-head">
      <div><a class="muted small" href="#/">← Tableau de bord</a>
        <h1 style="color:${p.couleur}">${esc(p.nom)}</h1>
        <div class="muted">${esc(p.description)}${p.deadline ? ` · Objectif : ${fmtDate(p.deadline)}` : ""}</div></div>
      <div class="row">${badgeNiveau(h)}<b>${projectProgress(p.id)} %</b>
        <button class="btn small" data-action="edit-project" data-id="${p.id}">Modifier</button>
        <button class="btn small danger" data-action="delete-project" data-id="${p.id}">Supprimer</button></div>
    </div>
    ${bar(projectProgress(p.id), p.couleur)}
    <div class="section-cards">${cartes}</div>
    <div class="tabs">${tabs}</div>${corps}`;
}

function renderKpi(p, section) {
  const key = p.id + ":" + section;
  const k = state.kpi[key] || {};
  return `<div class="card" style="margin-bottom:12px"><div class="kpi">
    <b>Indicateur clé – ${SECTIONS[section]}</b><span></span>
    <input placeholder="Libellé (ex. clients signés)" value="${esc(k.libelle)}" data-kpi="${key}" data-field="libelle">
    <span class="row"><input type="number" style="width:90px" placeholder="Actuel" value="${esc(k.actuel)}" data-kpi="${key}" data-field="actuel">
    / <input type="number" style="width:90px" placeholder="Objectif" value="${esc(k.objectif)}" data-kpi="${key}" data-field="objectif"></span>
    </div></div>`;
}

function renderTasks(p) {
  let ts = tachesDe(p.id);
  if (ui.tab !== "tout") ts = ts.filter((t) => t.section === ui.tab);
  if (ui.prio) ts = ts.filter((t) => t.priorite === ui.prio);
  if (ui.statut) ts = ts.filter((t) => t.statut === ui.statut);
  const ordreP = { urgent: 0, nonurgent: 1, avoir: 2 };
  ts.sort((a, b) => (a.statut === "fait") - (b.statut === "fait") || ordreP[a.priorite] - ordreP[b.priorite] || (a.deadline || "9999").localeCompare(b.deadline || "9999"));
  const opt = (o, cur, all) => `<option value="">${all}</option>` + Object.entries(o).map(([k, v]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${v}</option>`).join("");
  const liste = ts.map((t) => {
    const d = dueInfo(t);
    return `<div class="task ${t.statut === "fait" ? "done" : ""}">
      <input type="checkbox" ${t.statut === "fait" ? "checked" : ""} data-action="toggle" data-id="${t.id}" aria-label="Terminée">
      <span class="t-title">${esc(t.titre)}</span>
      ${ui.tab === "tout" ? `<span class="muted small">${SECTIONS[t.section]}</span>` : ""}
      <span class="badge b-${t.priorite}">${PRIORITES[t.priorite]}</span>
      ${t.statut === "encours" ? `<span class="badge b-info">En cours</span>` : ""}
      <span class="small ${d.cls}">${d.label}</span>
      <button class="btn small" data-action="edit-task" data-id="${t.id}">Modifier</button>
      <button class="btn small danger" data-action="delete-task" data-id="${t.id}" aria-label="Supprimer">✕</button></div>`;
  }).join("");
  return `<div class="row spread" style="margin-bottom:10px"><div class="filters" style="margin:0">
      <select data-filter="prio">${opt(PRIORITES, ui.prio, "Toutes priorités")}</select>
      <select data-filter="statut">${opt(STATUTS, ui.statut, "Tous statuts")}</select></div>
      <button class="btn primary" data-action="new-task">+ Tâche</button></div>
    <div class="tasks">${liste || `<div class="card muted">Aucune tâche ici.</div>`}</div>`;
}

function renderFinance(p) {
  const rows = financeRows(p.id);
  const t = financeTotals(p.id);
  const res = (r, d) => r - d;
  const cls = (n) => (n >= 0 ? "pos" : "neg");
  const lignes = rows.map((r, i) => {
    const pr = num(r.prevuRevenu) - num(r.prevuDepenses), rr = num(r.reelRevenu) - num(r.reelDepenses);
    const inp = (f) => `<input type="number" value="${esc(r[f])}" data-fin="${i}" data-field="${f}">`;
    return `<tr><td><input class="month" type="month" value="${esc(r.mois)}" data-fin="${i}" data-field="mois"></td>
      <td>${inp("prevuRevenu")}</td><td>${inp("prevuDepenses")}</td><td class="${cls(pr)}">${eur(pr)}</td>
      <td>${inp("reelRevenu")}</td><td>${inp("reelDepenses")}</td><td class="${cls(rr)}">${eur(rr)}</td>
      <td class="${cls(rr - pr)}">${eur(rr - pr)}</td>
      <td><button class="btn small danger" data-action="delete-fin" data-i="${i}" aria-label="Supprimer">✕</button></td></tr>`;
  }).join("");
  const pT = res(t.prevuRev, t.prevuDep), rT = res(t.reelRev, t.reelDep);
  return `<div class="card" style="margin-bottom:12px">
    <div class="row spread"><h3>Finance : prévisions vs réel</h3><button class="btn small" data-action="new-fin">+ Mois</button></div>
    ${rows.length ? `${financeChart(rows)}<div class="scroll"><table>
      <thead><tr><th>Mois</th><th>Revenus prévus</th><th>Dépenses prévues</th><th>Résultat prévu</th><th>Revenus réels</th><th>Dépenses réelles</th><th>Résultat réel</th><th>Écart</th><th></th></tr></thead>
      <tbody>${lignes}</tbody>
      <tfoot><tr><th>Total</th><th>${eur(t.prevuRev)}</th><th>${eur(t.prevuDep)}</th><th class="${cls(pT)}">${eur(pT)}</th><th>${eur(t.reelRev)}</th><th>${eur(t.reelDep)}</th><th class="${cls(rT)}">${eur(rT)}</th><th class="${cls(rT - pT)}">${eur(rT - pT)}</th><th></th></tr></tfoot>
    </table></div>` : `<p class="muted">Ajoutez un mois pour saisir vos prévisions et le réel.</p>`}</div>`;
}

function financeChart(rows) {
  const data = rows.map((r) => ({ m: r.mois || "?", prevu: num(r.prevuRevenu) - num(r.prevuDepenses), reel: num(r.reelRevenu) - num(r.reelDepenses) }));
  const max = Math.max(1, ...data.flatMap((d) => [Math.abs(d.prevu), Math.abs(d.reel)]));
  const W = Math.max(320, data.length * 80), H = 170, mid = 85, sc = 65 / max, bw = 22;
  const bars = data.map((d, i) => {
    const x = i * 80 + 14;
    const b = (v, dx, color) => `<rect x="${x + dx}" y="${v >= 0 ? mid - v * sc : mid}" width="${bw}" height="${Math.max(1, Math.abs(v) * sc)}" fill="${color}" rx="2"><title>${eur(v)}</title></rect>`;
    return `${b(d.prevu, 0, "var(--info)")}${b(d.reel, bw + 4, "var(--ok)")}<text x="${x + bw}" y="${H - 6}" text-anchor="middle">${esc(d.m)}</text>`;
  }).join("");
  return `<div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Résultat mensuel prévu et réel"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="var(--line)"/>${bars}</svg></div>
    <div class="legend"><span><i style="background:var(--info)"></i>Résultat prévu</span><span><i style="background:var(--ok)"></i>Résultat réel</span></div>`;
}

function render() {
  const m = location.hash.match(/^#\/projet\/(\w+)/);
  $("#app").innerHTML = m ? renderProject(m[1]) : renderDashboard();
}

// ---------- Modales ----------
const modal = $("#modal");
function openModal(html, onSubmit) {
  modal.innerHTML = `<form method="dialog">${html}<div class="row spread"><button type="button" class="btn" data-close>Annuler</button><button class="btn primary" value="ok">Enregistrer</button></div></form>`;
  modal.querySelector("[data-close]").onclick = () => modal.close();
  modal.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    onSubmit(Object.fromEntries(new FormData(e.target)));
    modal.close(); save(); render();
  };
  modal.showModal();
}
const selectHtml = (name, opts, cur) => `<select name="${name}">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${v}</option>`).join("")}</select>`;

function projectModal(p) {
  const cur = p ? p.couleur : COULEURS[state.projets.length % COULEURS.length];
  openModal(`<h2>${p ? "Modifier" : "Nouveau"} projet</h2>
    <label>Nom<input name="nom" required value="${esc(p?.nom)}"></label>
    <label>Description<textarea name="description" rows="2">${esc(p?.description)}</textarea></label>
    <label>Date objectif (lancement / échéance)<input type="date" name="deadline" value="${esc(p?.deadline)}"></label>
    <label>Couleur<select name="couleur">${COULEURS.map((c) => `<option value="${c}" style="color:${c}" ${c === cur ? "selected" : ""}>● ${c}</option>`).join("")}</select></label>`,
  (f) => {
    if (p) Object.assign(p, f);
    else { const id = uid(); state.projets.push({ id, ...f, creeLe: today().toISOString().slice(0, 10) }); location.hash = "#/projet/" + id; }
  });
}

function taskModal(projetId, t) {
  openModal(`<h2>${t ? "Modifier" : "Nouvelle"} tâche</h2>
    <label>Titre<input name="titre" required value="${esc(t?.titre)}"></label>
    <label>Domaine${selectHtml("section", SECTIONS, t?.section || (ui.tab in SECTIONS ? ui.tab : "action"))}</label>
    <label>Priorité${selectHtml("priorite", PRIORITES, t?.priorite || "nonurgent")}</label>
    <label>Statut${selectHtml("statut", STATUTS, t?.statut || "afaire")}</label>
    <label>Deadline<input type="date" name="deadline" value="${esc(t?.deadline)}"></label>`,
  (f) => { if (t) Object.assign(t, f); else state.taches.push({ id: uid(), projetId, ...f }); });
}

// ---------- Événements ----------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  const pid = (location.hash.match(/^#\/projet\/(\w+)/) || [])[1];
  const fin = () => (state.finance[pid] = state.finance[pid] || []);
  if (a === "new-project") projectModal();
  else if (a === "demo") { loadDemo(); render(); }
  else if (a === "export") exportData();
  else if (a === "tab") { ui.tab = el.dataset.tab; render(); }
  else if (a === "edit-project") projectModal(state.projets.find((p) => p.id === el.dataset.id));
  else if (a === "delete-project") {
    if (confirm("Supprimer ce projet et toutes ses tâches ?")) {
      state.projets = state.projets.filter((p) => p.id !== el.dataset.id);
      state.taches = state.taches.filter((t) => t.projetId !== el.dataset.id);
      delete state.finance[el.dataset.id];
      save(); location.hash = "#/"; render();
    }
  }
  else if (a === "new-task") taskModal(pid);
  else if (a === "edit-task") taskModal(pid, state.taches.find((t) => t.id === el.dataset.id));
  else if (a === "delete-task") { state.taches = state.taches.filter((t) => t.id !== el.dataset.id); save(); render(); }
  else if (a === "toggle") return; // géré par 'change'
  else if (a === "new-fin") {
    const rows = fin();
    const last = rows.length ? rows[rows.length - 1].mois : "";
    let mois = today().toISOString().slice(0, 7);
    if (last) { const [y, m] = last.split("-").map(Number); mois = new Date(y, m, 1).toISOString().slice(0, 7); }
    rows.push({ mois, prevuRevenu: "", prevuDepenses: "", reelRevenu: "", reelDepenses: "" });
    save(); render();
  }
  else if (a === "delete-fin") { fin().splice(Number(el.dataset.i), 1); save(); render(); }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  const pid = (location.hash.match(/^#\/projet\/(\w+)/) || [])[1];
  if (el.dataset.action === "toggle") {
    const t = state.taches.find((x) => x.id === el.dataset.id);
    if (t) { t.statut = el.checked ? "fait" : "afaire"; save(); render(); }
  } else if (el.dataset.filter) { ui[el.dataset.filter] = el.value; render(); }
  else if (el.dataset.fin !== undefined) {
    const row = financeRows(pid)[Number(el.dataset.fin)];
    if (row) { row[el.dataset.field] = el.value; save(); render(); }
  } else if (el.dataset.kpi) {
    (state.kpi[el.dataset.kpi] = state.kpi[el.dataset.kpi] || {})[el.dataset.field] = el.value;
    save(); render();
  } else if (el.id === "import-file") importData(el.files[0]);
});

window.addEventListener("hashchange", () => { ui = { tab: "tout", prio: "", statut: "" }; render(); window.scrollTo(0, 0); });

// ---------- Export / import / démo ----------
function exportData() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = `projetview-${today().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(file) {
  if (!file) return;
  file.text().then((txt) => {
    try {
      const s = JSON.parse(txt);
      if (!Array.isArray(s.projets) || !Array.isArray(s.taches)) throw new Error("format");
      if (!confirm("Remplacer toutes les données actuelles par ce fichier ?")) return;
      state = { finance: {}, kpi: {}, ...s };
      save(); location.hash = "#/"; render();
    } catch (err) { alert("Fichier invalide."); }
  });
  $("#import-file").value = "";
}
function loadDemo() {
  const d = (n) => new Date(today().getTime() + n * DAY).toISOString().slice(0, 10);
  const p1 = { id: uid(), nom: "Boutique en ligne", description: "E-commerce de produits artisanaux", couleur: COULEURS[0], deadline: d(60), creeLe: d(-30) };
  const p2 = { id: uid(), nom: "Application de coaching", description: "SaaS pour coachs indépendants", couleur: COULEURS[1], deadline: d(120), creeLe: d(-10) };
  state.projets.push(p1, p2);
  const T = (p, section, titre, priorite, statut, off) => state.taches.push({ id: uid(), projetId: p.id, section, titre, priorite, statut, deadline: off === null ? "" : d(off) });
  T(p1, "action", "Finaliser le catalogue produits", "urgent", "encours", 3);
  T(p1, "action", "Choisir le transporteur", "nonurgent", "fait", -5);
  T(p1, "acquisition", "Lancer la campagne d'ambassadeurs", "urgent", "afaire", -2);
  T(p1, "marketing", "Créer la newsletter de lancement", "nonurgent", "afaire", 14);
  T(p1, "equipe", "Recruter un freelance photo", "avoir", "afaire", null);
  T(p1, "finance", "Ouvrir le compte pro", "urgent", "fait", -12);
  T(p2, "action", "Maquette de l'application", "urgent", "encours", 10);
  T(p2, "acquisition", "Interviewer 10 coachs", "nonurgent", "encours", 20);
  T(p2, "marketing", "Landing page + liste d'attente", "nonurgent", "afaire", 30);
  state.kpi[p1.id + ":acquisition"] = { libelle: "clients", actuel: 12, objectif: 100 };
  state.finance[p1.id] = [
    { mois: d(-60).slice(0, 7), prevuRevenu: 1000, prevuDepenses: 1500, reelRevenu: 600, reelDepenses: 1400 },
    { mois: d(-30).slice(0, 7), prevuRevenu: 2500, prevuDepenses: 1500, reelRevenu: 2900, reelDepenses: 1600 },
    { mois: d(0).slice(0, 7), prevuRevenu: 4000, prevuDepenses: 1800, reelRevenu: 1500, reelDepenses: 900 },
  ];
  save();
}

render();
