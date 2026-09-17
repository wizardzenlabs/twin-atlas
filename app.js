"use strict";

const SUPABASE_URL = "https://vulatrsmawpewesjroco.supabase.co";
const SUPABASE_KEY = "sb_publishable_Wk48PUKkOO21o_p4gUq5ow_ehueh_S7";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","Washington D.C."];
const STATUS_LABELS = { wishlist: "wishlist", planned: "planned", booked: "booked", been: "been there" };

let state = { destinations: [] };
let loading = true;
let bannerMsg = "";

// ---- view-only ui state (never persisted) ----
let tab = "all";
let statusFilter = "all";
let searchQuery = "";
let letsDoOnly = false;
let expanded = new Set();
let expandedLinks = new Set();
let modalState = null; // {mode:'add'|'edit', draft:{...}}

function uid(){ return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

function tiktokIcon(){
  return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82c-.87-.85-1.4-2-1.56-3.32h-3.03v13.2c0 1.66-1.35 3-3 3-1.66 0-3-1.34-3-3s1.34-3 3-3c.29 0 .57.05.83.13V9.66c-.27-.04-.55-.06-.83-.06-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6V9.01c1.28.9 2.83 1.43 4.5 1.43V7.4c-1.05 0-2.02-.36-2.9-.99-.35-.24-.68-.5-1.01-.79z"/></svg>';
}

function rowToObj(r){
  return {
    id: r.id, region: r.region, place: r.place, city: r.city || "",
    activities: r.activities || "", tiktokLinks: r.tiktok_links || [],
    timeframeMonth: r.timeframe_month || "", timeframeYear: r.timeframe_year || "",
    timeframeNote: r.timeframe_note || "", bestSeason: r.best_season || "",
    status: r.status || "wishlist", priority: r.priority || 3, budget: r.budget || "",
    letsDoThis: !!r.lets_do_this, comments: r.comments || [], createdAt: r.created_at || 0
  };
}
function objToRow(d){
  return {
    id: d.id, region: d.region, place: d.place, city: d.city,
    activities: d.activities, tiktok_links: d.tiktokLinks,
    timeframe_month: d.timeframeMonth, timeframe_year: d.timeframeYear,
    timeframe_note: d.timeframeNote, best_season: d.bestSeason,
    status: d.status, priority: d.priority, budget: d.budget,
    lets_do_this: d.letsDoThis, comments: d.comments, created_at: d.createdAt
  };
}

function showError(msg){
  bannerMsg = msg;
  renderBanner();
}

async function loadAll(showLoading){
  if(showLoading){ loading = true; renderBoard(); }
  const { data, error } = await db.from("destinations").select("*").order("created_at", { ascending: true });
  loading = false;
  if(error){ showError("couldn't load the board — check your connection and refresh."); return; }
  state.destinations = (data || []).map(rowToObj);
  renderBoard();
}

async function addDestination(data){
  const row = Object.assign({
    id: uid(), createdAt: Date.now(), comments: [], tiktokLinks: [], priority: 3,
    status: "wishlist", letsDoThis: false, timeframeMonth: "", timeframeYear: "", timeframeNote: ""
  }, data);
  state.destinations.push(row);
  renderBoard();
  const { error } = await db.from("destinations").insert(objToRow(row));
  if(error) showError("couldn't save that idea — try again.");
}
async function updateDestination(id, data){
  const d = state.destinations.find(x => x.id === id);
  if(!d) return;
  Object.assign(d, data);
  renderBoard();
  const { error } = await db.from("destinations").update(objToRow(d)).eq("id", id);
  if(error) showError("couldn't save that change — try again.");
}
async function deleteDestination(id){
  state.destinations = state.destinations.filter(x => x.id !== id);
  renderBoard();
  const { error } = await db.from("destinations").delete().eq("id", id);
  if(error) showError("couldn't delete that — try again.");
}
async function toggleLetsDo(id){
  const d = state.destinations.find(x => x.id === id);
  if(!d) return;
  d.letsDoThis = !d.letsDoThis;
  renderBoard();
  const { error } = await db.from("destinations").update({ lets_do_this: d.letsDoThis }).eq("id", id);
  if(error) showError("couldn't save that — try again.");
}
async function addComment(id, author, text){
  const d = state.destinations.find(x => x.id === id);
  if(!d) return;
  d.comments = d.comments || [];
  d.comments.push({ id: uid(), author: author || "someone", text, ts: Date.now() });
  renderBoard();
  try{ localStorage.setItem("twinatlas_name", author || ""); }catch(e){}
  const { error } = await db.from("destinations").update({ comments: d.comments }).eq("id", id);
  if(error) showError("couldn't save that comment — try again.");
}

function dateKey(d){
  const y = Number(d.timeframeYear);
  if(!y) return Infinity;
  const m = Number(d.timeframeMonth) || 6;
  return y * 12 + m;
}
function timeframeLabel(d){
  const m = d.timeframeMonth ? MONTHS[Number(d.timeframeMonth) - 1] : "";
  const y = d.timeframeYear ? String(d.timeframeYear) : "";
  const dateStr = [m, y].filter(Boolean).join(" ");
  const note = (d.timeframeNote || "").trim();
  if(dateStr && note) return dateStr + " — " + note;
  return dateStr || note;
}

// ---------- rendering ----------
const app = document.getElementById("app");

function renderBanner(){
  const el = document.getElementById("banner");
  if(!el) return;
  if(bannerMsg){
    el.hidden = false;
    el.innerHTML = escapeHtml(bannerMsg);
  }else{
    el.hidden = true;
    el.innerHTML = "";
  }
}

function renderShell(){
  app.innerHTML =
    '<div class="banner" id="banner" hidden></div>' +
    '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">✦</span> Twin Atlas</div>' +
      '<div style="display:flex; gap:8px;">' +
        '<button class="icon-btn" id="refreshBtn" title="refresh">⟳ refresh</button>' +
        '<button class="add-btn" id="openAddBtn">+ add an idea</button>' +
      '</div>' +
    '</header>' +
    '<div class="controls">' +
      '<div class="tabs" id="tabs">' +
        '<button class="tab" data-tab="all">all</button>' +
        '<button class="tab" data-tab="domestic">domestic</button>' +
        '<button class="tab" data-tab="international">international</button>' +
      '</div>' +
      '<input id="searchInput" type="search" placeholder="search place, city, activity…">' +
      '<div class="status-chips" id="statusChips">' +
        '<button class="chip" data-status="all">all</button>' +
        '<button class="chip" data-status="wishlist">wishlist</button>' +
        '<button class="chip" data-status="planned">planned</button>' +
        '<button class="chip" data-status="booked">booked</button>' +
        '<button class="chip" data-status="been">been there</button>' +
      '</div>' +
      '<label class="lets-do-toggle"><input type="checkbox" id="letsDoOnly"> let’s-do-this only</label>' +
    '</div>' +
    '<main class="board" id="board"></main>' +
    '<footer class="credit">a brainstorm board, not a booking site — add ideas whenever inspiration hits.</footer>' +
    '<button class="fab" id="fabAddBtn" aria-label="add an idea">+</button>';

  document.getElementById("refreshBtn").addEventListener("click", () => loadAll(true));
  document.getElementById("openAddBtn").addEventListener("click", () => openModal("add"));
  document.getElementById("fabAddBtn").addEventListener("click", () => openModal("add"));
  document.getElementById("tabs").addEventListener("click", e => {
    const btn = e.target.closest("[data-tab]");
    if(!btn) return;
    tab = btn.dataset.tab;
    syncControlStates();
    renderBoard();
  });
  document.getElementById("statusChips").addEventListener("click", e => {
    const btn = e.target.closest("[data-status]");
    if(!btn) return;
    statusFilter = btn.dataset.status;
    syncControlStates();
    renderBoard();
  });
  document.getElementById("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value;
    renderBoard();
  });
  document.getElementById("letsDoOnly").addEventListener("change", e => {
    letsDoOnly = e.target.checked;
    renderBoard();
  });
  syncControlStates();
  renderBanner();
}

function syncControlStates(){
  document.querySelectorAll("#tabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("#statusChips .chip").forEach(b => b.classList.toggle("active", b.dataset.status === statusFilter));
}

function filteredDestinations(){
  const q = searchQuery.trim().toLowerCase();
  return state.destinations.filter(d => {
    if(tab !== "all" && d.region !== tab) return false;
    if(statusFilter !== "all" && d.status !== statusFilter) return false;
    if(letsDoOnly && !d.letsDoThis) return false;
    if(q){
      const hay = [d.place, d.city, d.activities].join(" ").toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort((a,b) => {
    if(a.letsDoThis !== b.letsDoThis) return (b.letsDoThis ? 1 : 0) - (a.letsDoThis ? 1 : 0);
    const ak = dateKey(a), bk = dateKey(b);
    if(ak !== bk) return ak - bk;
    return (b.priority - a.priority) || (b.createdAt - a.createdAt);
  });
}

function renderBoard(){
  const boardEl = document.getElementById("board");
  if(!boardEl) return;
  if(loading){
    boardEl.innerHTML = '<div class="empty-state"><h3>loading…</h3></div>';
    return;
  }
  const list = filteredDestinations();
  if(list.length === 0){
    boardEl.innerHTML = '<div class="empty-state"><h3>nothing here yet</h3><p>add your first trip idea to start the board.</p></div>';
    return;
  }
  boardEl.innerHTML = list.map(renderCard).join("");
  boardEl.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", onCardAction);
  });
  boardEl.querySelectorAll(".comment-form").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const id = form.dataset.id;
      const author = form.querySelector(".author").value.trim();
      const text = form.querySelector(".text").value.trim();
      if(!text) return;
      addComment(id, author, text);
      expanded.add(id);
    });
  });
}

function renderCard(d){
  const isOpen = expanded.has(d.id);
  const comments = d.comments || [];
  const allLinks = d.tiktokLinks || [];
  const linksOpen = expandedLinks.has(d.id);
  const linksToShow = linksOpen ? allLinks : allLinks.slice(0, 3);
  const hiddenLinkCount = allLinks.length - linksToShow.length;
  const links = linksToShow.map(l =>
    '<a class="tiktok-link" href="' + escapeAttr(l.url) + '" target="_blank" rel="noopener">' + tiktokIcon() +
    '<span class="label">' + escapeHtml(l.label || l.url) + '</span></a>'
  ).join("") + (
    hiddenLinkCount > 0 ? '<button class="comments-toggle" data-action="toggle-links" data-id="' + d.id + '">+ ' + hiddenLinkCount + ' more link' + (hiddenLinkCount === 1 ? "" : "s") + '</button>' :
    (linksOpen && allLinks.length > 3 ? '<button class="comments-toggle" data-action="toggle-links" data-id="' + d.id + '">show fewer</button>' : "")
  );
  const priorityDots = [1,2,3,4,5].map(n => '<span class="priority-dot ' + (n <= (d.priority||0) ? "on" : "") + '"></span>').join("");
  const metaBits = [];
  const tfLabel = timeframeLabel(d);
  if(tfLabel) metaBits.push('<span><b>when:</b> ' + escapeHtml(tfLabel) + '</span>');
  if(d.bestSeason) metaBits.push('<span><b>best season:</b> ' + escapeHtml(d.bestSeason) + '</span>');
  if(d.budget) metaBits.push('<span><b>budget:</b> ' + escapeHtml(d.budget) + '</span>');

  let savedName = "";
  try{ savedName = localStorage.getItem("twinatlas_name") || ""; }catch(e){}

  return '<article class="card">' +
    '<div class="card-top">' +
      '<div class="card-place">' +
        '<span class="region-badge">' + (d.region === "domestic" ? "domestic" : "international") + '</span>' +
        '<h3>' + escapeHtml(d.place || "somewhere") + '</h3>' +
        (d.city ? '<span class="city">' + escapeHtml(d.city) + '</span>' : "") +
      '</div>' +
      '<button class="star-toggle ' + (d.letsDoThis ? "active" : "") + '" title="let’s actually do this" data-action="toggle" data-id="' + d.id + '">★</button>' +
    '</div>' +
    '<div class="badges">' +
      '<span class="badge status-' + d.status + '">' + STATUS_LABELS[d.status] + '</span>' +
      '<div class="priority-row">' + priorityDots + '</div>' +
    '</div>' +
    (d.activities ? '<p class="activities">' + escapeHtml(d.activities) + '</p>' : "") +
    (metaBits.length ? '<div class="meta-row">' + metaBits.join("") + '</div>' : "") +
    (links ? '<div class="tiktok-links">' + links + '</div>' : "") +
    '<div class="card-actions">' +
      '<button class="icon-btn" data-action="edit" data-id="' + d.id + '">edit</button>' +
      '<button class="icon-btn danger" data-action="delete" data-id="' + d.id + '">delete</button>' +
    '</div>' +
    '<div class="comments">' +
      '<button class="comments-toggle" data-action="toggle-comments" data-id="' + d.id + '">' + (isOpen ? "hide" : "show") + ' ' + comments.length + ' comment' + (comments.length === 1 ? "" : "s") + '</button>' +
      (isOpen ? (
        '<div class="comment-list">' +
        comments.map(c => '<div class="comment"><span class="who">' + escapeHtml(c.author) + ':</span> ' + escapeHtml(c.text) + '</div>').join("") +
        '</div>' +
        '<form class="comment-form" data-id="' + d.id + '">' +
          '<input class="author" type="text" placeholder="name" value="' + escapeAttr(savedName) + '">' +
          '<input class="text" type="text" placeholder="say something…" required>' +
          '<button type="submit">add</button>' +
        '</form>'
      ) : "") +
    '</div>' +
  '</article>';
}

function onCardAction(e){
  const el = e.currentTarget;
  const action = el.dataset.action;
  const id = el.dataset.id;
  if(action === "toggle"){
    toggleLetsDo(id);
  }else if(action === "edit"){
    openModal("edit", id);
  }else if(action === "delete"){
    if(confirm("remove this idea from the board?")) deleteDestination(id);
  }else if(action === "toggle-comments"){
    if(expanded.has(id)) expanded.delete(id); else expanded.add(id);
    renderBoard();
  }else if(action === "toggle-links"){
    if(expandedLinks.has(id)) expandedLinks.delete(id); else expandedLinks.add(id);
    renderBoard();
  }
}

// ---------- modal ----------
const modalRoot = document.createElement("div");
document.body.appendChild(modalRoot);

function openModal(mode, id){
  let draft;
  if(mode === "edit"){
    const d = state.destinations.find(x => x.id === id);
    if(!d) return;
    draft = JSON.parse(JSON.stringify(d));
  }else{
    draft = { id: null, region: "domestic", place: "", city: "", activities: "", tiktokLinks: [], timeframeMonth: "", timeframeYear: "", timeframeNote: "", bestSeason: "", status: "wishlist", priority: 3, budget: "", letsDoThis: false };
  }
  modalState = { mode, draft };
  renderModal();
}
function closeModal(){
  modalState = null;
  modalRoot.innerHTML = "";
}

function starPickerHtml(priority){
  return [1,2,3,4,5].map(n => '<button type="button" class="' + (n <= priority ? "on" : "") + '" data-star="' + n + '">★</button>').join("");
}
function linkRowHtml(link, idx){
  return '<div class="link-row" data-idx="' + idx + '">' +
    '<input type="url" class="link-url" placeholder="tiktok link" value="' + escapeAttr(link.url || "") + '">' +
    '<input type="text" class="link-label" placeholder="note" value="' + escapeAttr(link.label || "") + '">' +
    '<button type="button" class="remove-link" title="remove link">×</button>' +
  '</div>';
}

function renderModal(){
  if(!modalState){ modalRoot.innerHTML = ""; return; }
  const { mode, draft } = modalState;
  const stateOptions = Object.keys(STATUS_LABELS).map(k => '<option value="' + k + '" ' + (draft.status === k ? "selected" : "") + '>' + STATUS_LABELS[k] + '</option>').join("");

  modalRoot.innerHTML =
    '<div class="overlay" id="overlay">' +
      '<div class="modal">' +
        '<div class="modal-head"><h2>' + (mode === "edit" ? "edit idea" : "add a trip idea") + '</h2><button class="modal-close" id="modalClose">&times;</button></div>' +
        '<div class="modal-body">' +
          '<div class="field"><label>region</label><div class="region-toggle" id="regionToggle">' +
            '<button type="button" data-region="domestic" class="' + (draft.region === "domestic" ? "active" : "") + '">domestic (US)</button>' +
            '<button type="button" data-region="international" class="' + (draft.region === "international" ? "active" : "") + '">international</button>' +
          '</div></div>' +
          '<div class="row2">' +
            '<div class="field"><label>state / country</label>' +
              '<input type="text" id="fPlace" list="stateList" value="' + escapeAttr(draft.place) + '" placeholder="' + (draft.region === "domestic" ? "e.g. Tennessee" : "e.g. Japan") + '">' +
              '<datalist id="stateList">' + US_STATES.map(s => '<option value="' + s + '">').join("") + '</datalist>' +
            '</div>' +
            '<div class="field"><label>city (optional)</label><input type="text" id="fCity" value="' + escapeAttr(draft.city) + '" placeholder="e.g. Gatlinburg"></div>' +
          '</div>' +
          '<div class="field"><label>what do we want to do</label><textarea id="fActivities" placeholder="cabin exploring, hiking, kayaking…">' + escapeHtml(draft.activities) + '</textarea></div>' +
          '<div class="field"><label>tiktok links</label><div class="link-rows" id="linkRows">' +
            (draft.tiktokLinks.length ? draft.tiktokLinks.map(linkRowHtml).join("") : linkRowHtml({url:"",label:""}, 0)) +
          '</div><button type="button" class="add-link-btn" id="addLinkBtn">+ add another link</button></div>' +
          '<div class="row2">' +
            '<div class="field"><label>trip month (optional)</label><select id="fMonth">' +
              '<option value="">no month</option>' +
              MONTHS.map((m,i) => '<option value="' + (i+1) + '" ' + (String(draft.timeframeMonth) === String(i+1) ? "selected" : "") + '>' + m + '</option>').join("") +
            '</select></div>' +
            '<div class="field"><label>trip year (optional)</label><input type="text" inputmode="numeric" id="fYear" value="' + escapeAttr(draft.timeframeYear) + '" placeholder="e.g. 2026"></div>' +
          '</div>' +
          '<div class="row2">' +
            '<div class="field"><label>note (optional)</label><input type="text" id="fTimeframeNote" value="' + escapeAttr(draft.timeframeNote) + '" placeholder="e.g. someday, after the wedding"></div>' +
            '<div class="field"><label>best season (optional)</label><input type="text" id="fSeason" value="' + escapeAttr(draft.bestSeason) + '" placeholder="e.g. spring"></div>' +
          '</div>' +
          '<div class="row2">' +
            '<div class="field"><label>status</label><select id="fStatus">' + stateOptions + '</select></div>' +
            '<div class="field"><label>budget estimate (optional)</label><input type="text" id="fBudget" value="' + escapeAttr(draft.budget) + '" placeholder="e.g. $600-900"></div>' +
          '</div>' +
          '<div class="field"><label>priority</label><div class="star-picker" id="starPicker">' + starPickerHtml(draft.priority) + '</div></div>' +
          '<label class="checkbox-field"><input type="checkbox" id="fLetsDo" ' + (draft.letsDoThis ? "checked" : "") + '> let’s actually do this one</label>' +
          '<div class="modal-footer">' +
            '<div>' + (mode === "edit" ? '<button type="button" class="btn-danger" id="modalDelete">delete</button>' : "") + '</div>' +
            '<div style="display:flex; gap:10px;">' +
              '<button type="button" class="btn-ghost" id="modalCancel">cancel</button>' +
              '<button type="button" class="btn-primary" id="modalSave">save</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("overlay").addEventListener("click", e => { if(e.target.id === "overlay") closeModal(); });
  document.getElementById("regionToggle").addEventListener("click", e => {
    const btn = e.target.closest("[data-region]");
    if(!btn) return;
    draft.region = btn.dataset.region;
    renderModal();
  });
  document.getElementById("starPicker").addEventListener("click", e => {
    const btn = e.target.closest("[data-star]");
    if(!btn) return;
    draft.priority = Number(btn.dataset.star);
    renderModal();
  });
  document.getElementById("addLinkBtn").addEventListener("click", () => {
    const rows = document.getElementById("linkRows");
    const idx = rows.children.length;
    rows.insertAdjacentHTML("beforeend", linkRowHtml({url:"",label:""}, idx));
    bindLinkRow(rows.lastElementChild);
  });
  document.querySelectorAll("#linkRows .link-row").forEach(bindLinkRow);
  if(mode === "edit"){
    document.getElementById("modalDelete").addEventListener("click", () => {
      if(confirm("remove this idea from the board?")){
        deleteDestination(draft.id);
        closeModal();
      }
    });
  }
  document.getElementById("modalSave").addEventListener("click", () => {
    const links = Array.from(document.querySelectorAll("#linkRows .link-row")).map(row => ({
      url: row.querySelector(".link-url").value.trim(),
      label: row.querySelector(".link-label").value.trim()
    })).filter(l => l.url);
    const data = {
      region: draft.region,
      place: document.getElementById("fPlace").value.trim(),
      city: document.getElementById("fCity").value.trim(),
      activities: document.getElementById("fActivities").value.trim(),
      tiktokLinks: links,
      timeframeMonth: document.getElementById("fMonth").value,
      timeframeYear: document.getElementById("fYear").value.trim(),
      timeframeNote: document.getElementById("fTimeframeNote").value.trim(),
      bestSeason: document.getElementById("fSeason").value.trim(),
      status: document.getElementById("fStatus").value,
      budget: document.getElementById("fBudget").value.trim(),
      priority: draft.priority,
      letsDoThis: document.getElementById("fLetsDo").checked
    };
    if(!data.place){ alert("give it a state or country name first."); return; }
    if(mode === "edit"){ updateDestination(draft.id, data); } else { addDestination(data); }
    closeModal();
  });
}

function bindLinkRow(row){
  row.querySelector(".remove-link").addEventListener("click", () => {
    if(document.querySelectorAll("#linkRows .link-row").length > 1){ row.remove(); }
    else{ row.querySelector(".link-url").value = ""; row.querySelector(".link-label").value = ""; }
  });
}

renderShell();
loadAll(true);

// reopening the home-screen app (or switching back to the tab) refetches
// automatically, since ios often resumes a suspended page instead of reloading it
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible") loadAll(false);
});
window.addEventListener("pageshow", () => loadAll(false));
