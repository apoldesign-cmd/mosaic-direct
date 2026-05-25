/* ============================================================================
   Mosaic Direct — Review Overlay (vanilla JS)
   Sistema de revisão estilo Figma. Cliente clica em qualquer lugar pra
   deixar comentário; salva no Supabase em realtime; admin via ?adminKey=
   Inclui Supabase JS SDK via CDN (dynamic import).

   Versão: 1.0
============================================================================ */
(function () {
  "use strict";
  if (window.__mosaicReviewLoaded) return;
  window.__mosaicReviewLoaded = true;

  /* ============================================================================
     Config
     ============================================================================ */
  const SUPABASE_URL = "https://oopghwixughwedwhaure.supabase.co";
  const SUPABASE_KEY = "sb_publishable_HY4A1IAwfT1jY8tDkkzfZw_0CFBBmQC";
  const ADMIN_KEY    = "mosaic-revisao-2026"; // ?adminKey=mosaic-revisao-2026

  const KEY_MODE    = "mosaic:review-mode";
  const KEY_AUTHOR  = "mosaic:review-author";
  const KEY_AREA    = "mosaic:review-area";
  const KEY_WELCOME = "mosaic:welcome-seen";
  const KEY_ADMIN   = "mosaic:admin-key";

  /* ============================================================================
     Estado
     ============================================================================ */
  const state = {
    enabled:  localStorage.getItem(KEY_MODE) === "1",
    author:   localStorage.getItem(KEY_AUTHOR) || "",
    area:     localStorage.getItem(KEY_AREA)   || "",
    comments: [],
    loading:  true,
    pending:  null,   // { x, y } do composer aberto
    activePin: null,  // comment.id do pin com popover aberto
    replyingTo: null, // comment.id em modo "responder"
    isAdmin:  false,
  };

  let supabase = null;
  let scrollContainer = null;

  /* ============================================================================
     Util — pageId, escape, format
     ============================================================================ */
  const pageId = () => location.pathname + location.search;
  const pageTitle = () => document.title || location.pathname;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diff = (now - d.getTime()) / 1000;
      if (diff < 60)      return "agora";
      if (diff < 3600)    return Math.floor(diff / 60) + " min";
      if (diff < 86400)   return Math.floor(diff / 3600) + " h";
      if (diff < 7*86400) return Math.floor(diff / 86400) + " d";
      return d.toLocaleDateString("pt-BR") + " " +
             d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  /* ============================================================================
     Scroll container detection — encontra o div que efetivamente rola
     ============================================================================ */
  function findScrollContainer() {
    const fallback = document.scrollingElement || document.body;
    let best = null, bestArea = 0;
    document.querySelectorAll("div, main, section").forEach(el => {
      if (el.closest("[data-review-layer],[data-review-pin],[data-review-composer],[data-review-fab],[data-review-dialog],[data-review-admin]")) return;
      const cs = getComputedStyle(el);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 4) {
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) { bestArea = area; best = el; }
      }
    });
    return best || fallback;
  }

  /* ============================================================================
     Supabase — carrega CDN dynamic import, autentica, listen realtime
     ============================================================================ */
  async function initSupabase() {
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      supabase = mod.createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: { params: { eventsPerSecond: 5 } },
        auth: { persistSession: false },
      });
      await loadComments();
      supabase
        .channel("app-review")
        .on("postgres_changes", { event: "*", schema: "public", table: "app_comments" }, loadComments)
        .on("postgres_changes", { event: "*", schema: "public", table: "app_replies"  }, loadComments)
        .subscribe();
    } catch (e) {
      console.warn("[review] Supabase falhou:", e);
      state.loading = false;
      render();
    }
  }

  async function loadComments() {
    if (!supabase) return;
    const [{ data: cs, error: e1 }, { data: rs, error: e2 }] = await Promise.all([
      supabase.from("app_comments").select("*").order("created_at"),
      supabase.from("app_replies").select("*").order("created_at"),
    ]);
    if (e1 || e2) {
      console.warn("[review] load erro:", e1?.message || e2?.message);
      state.loading = false;
      return render();
    }
    state.comments = (cs || []).map(c => ({
      id: c.id, pageUrl: c.page_url, pageTitle: c.page_title,
      x: +c.x, y: +c.y, text: c.text,
      author: c.author, area: c.area || "",
      status: c.status, createdAt: c.created_at,
      replies: (rs || [])
        .filter(r => r.comment_id === c.id)
        .map(r => ({ id: r.id, author: r.author, area: r.area || "", text: r.text, createdAt: r.created_at })),
    }));
    state.loading = false;
    render();
  }

  async function addComment(data) {
    if (!supabase) return;
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic = {
      id, ...data, status: "aberto",
      createdAt: new Date().toISOString(), replies: [],
    };
    state.comments.push(optimistic);
    render();
    const { error } = await supabase.from("app_comments").insert({
      id, page_url: data.pageUrl, page_title: data.pageTitle,
      x: data.x, y: data.y, text: data.text,
      author: data.author, area: data.area, status: "aberto",
    });
    if (error) {
      console.warn("[review] insert erro:", error.message);
      state.comments = state.comments.filter(c => c.id !== id);
      render();
    }
  }

  async function updateComment(id, patch) {
    const c = state.comments.find(x => x.id === id);
    if (c) Object.assign(c, patch);
    render();
    if (!supabase) return;
    const db = { updated_at: new Date().toISOString() };
    if (patch.text   !== undefined) db.text   = patch.text;
    if (patch.status !== undefined) db.status = patch.status;
    if (patch.x      !== undefined) db.x      = patch.x;
    if (patch.y      !== undefined) db.y      = patch.y;
    const { error } = await supabase.from("app_comments").update(db).eq("id", id);
    if (error) console.warn("[review] update erro:", error.message);
  }

  async function deleteComment(id) {
    state.comments = state.comments.filter(c => c.id !== id);
    render();
    if (!supabase) return;
    const { error } = await supabase.from("app_comments").delete().eq("id", id);
    if (error) console.warn("[review] delete erro:", error.message);
  }

  async function addReply(commentId, reply) {
    const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const c = state.comments.find(x => x.id === commentId);
    if (c) c.replies.push({ id, ...reply, createdAt: new Date().toISOString() });
    render();
    if (!supabase) return;
    const { error } = await supabase.from("app_replies").insert({
      id, comment_id: commentId, author: reply.author, area: reply.area, text: reply.text,
    });
    if (error) console.warn("[review] reply erro:", error.message);
  }

  /* ============================================================================
     CSS — injetado uma vez
     ============================================================================ */
  const CSS = `
    [data-review-fab] {
      position: fixed; bottom: 24px; right: 24px;
      width: 56px; height: 56px; border-radius: 50%;
      background: #00583d; color: #fff; border: none; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 9999;
      transition: transform 160ms, background 160ms;
    }
    [data-review-fab]:hover { background: #003e2a; transform: translateY(-1px); }
    [data-review-fab].is-active { background: #b9202a; }
    [data-review-fab].is-active:hover { background: #8a1820; }
    [data-review-fab] svg { width: 22px; height: 22px; }
    [data-review-fab-badge] {
      position: absolute; top: -4px; right: -4px;
      min-width: 20px; height: 20px; padding: 0 6px;
      border-radius: 10px; background: #f0c020; color: #003e2a;
      font: 700 11px/20px Manrope, system-ui, sans-serif;
      text-align: center; pointer-events: none;
    }

    /* Layer dentro do scroll container */
    [data-review-layer] {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 50;
    }
    /* Cursor: balão de comentário (amarelo Mosaic) com ponta no x=4,y=28 */
    body.review-mode-active,
    body.review-mode-active * {
      cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 4 L28 4 Q30 4 30 6 L30 20 Q30 22 28 22 L12 22 L4 30 Z' fill='%23f0c020' stroke='%23003e2a' stroke-width='1.6' stroke-linejoin='round'/><circle cx='11' cy='13' r='1.6' fill='%23003e2a'/><circle cx='17' cy='13' r='1.6' fill='%23003e2a'/><circle cx='23' cy='13' r='1.6' fill='%23003e2a'/></svg>") 4 28, crosshair !important;
    }
    body.review-mode-active [data-review-fab],
    body.review-mode-active [data-review-pin],
    body.review-mode-active [data-review-pin] *,
    body.review-mode-active [data-review-composer],
    body.review-mode-active [data-review-composer] *,
    body.review-mode-active [data-review-dialog],
    body.review-mode-active [data-review-dialog] * { cursor: auto !important; }
    body.review-mode-active [data-review-composer] textarea,
    body.review-mode-active [data-review-dialog] textarea,
    body.review-mode-active [data-review-composer] input,
    body.review-mode-active [data-review-dialog] input { cursor: text !important; }
    body.review-mode-active button { cursor: pointer !important; }

    [data-review-pin] {
      position: absolute; transform: translate(-50%, -100%);
      pointer-events: auto; z-index: 51;
    }
    [data-review-pin] .pin-dot {
      width: 28px; height: 28px; border-radius: 50% 50% 50% 4px;
      background: #f0c020; color: #003e2a;
      display: inline-flex; align-items: center; justify-content: center;
      font: 800 12px/1 Manrope, system-ui, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 2px #fff;
      transform: rotate(-12deg); cursor: pointer;
      transition: transform 120ms;
    }
    [data-review-pin]:hover .pin-dot { transform: rotate(0) scale(1.05); }
    [data-review-pin][data-status="resolvido"] .pin-dot { background: #2c8b78; color: #fff; }
    [data-review-pin] .pin-popover {
      position: absolute; bottom: calc(100% + 8px); left: 0;
      width: 320px; max-width: calc(100vw - 32px);
      background: #fff; border: 1px solid #cdcdcd;
      box-shadow: 0 12px 28px rgba(0,0,0,0.18);
      padding: 12px; font: 500 13px/1.5 Manrope, system-ui, sans-serif;
      color: #15201b;
    }
    [data-review-pin][data-flip-x] .pin-popover { left: auto; right: 0; }
    [data-review-pin][data-flip-y] .pin-popover { bottom: auto; top: calc(100% + 8px); }
    .pin-author { font-weight: 700; color: #00583d; font-size: 13px; }
    .pin-area   { color: #6b7570; font-size: 11px; font-weight: 600; }
    .pin-date   { color: #6b7570; font-size: 11px; margin-left: 4px; }
    .pin-text   { margin: 6px 0 8px; white-space: pre-wrap; word-wrap: break-word; color: #15201b; }
    .pin-actions { display: flex; gap: 6px; align-items: center; }
    .pin-action {
      background: transparent; border: none; padding: 4px 8px;
      font: 600 12px/1 Manrope, system-ui, sans-serif;
      color: #00583d; cursor: pointer; border-radius: 4px;
    }
    .pin-action:hover { background: rgba(0,106,77,0.08); }
    .pin-action.danger { color: #b9202a; }
    .pin-action.danger:hover { background: rgba(185,32,42,0.08); }
    .pin-action.is-resolved { color: #2c8b78; }
    .pin-replies {
      margin-top: 8px; padding-top: 8px;
      border-top: 1px solid #e1e1e1;
      max-height: 200px; overflow-y: auto;
    }
    .pin-reply { padding: 6px 0; border-bottom: 1px solid #f4f4f4; }
    .pin-reply:last-child { border-bottom: none; }
    .pin-reply-head { font-size: 11px; color: #6b7570; font-weight: 600; }
    .pin-reply-head strong { color: #00583d; }
    .pin-reply-text { font-size: 12px; color: #15201b; white-space: pre-wrap; word-wrap: break-word; }
    .pin-reply-input {
      width: 100%; min-height: 60px;
      padding: 8px 10px; border: 1px solid #cdcdcd;
      font: 500 12px/1.4 Manrope, system-ui, sans-serif; resize: vertical;
      outline: none; margin-top: 8px;
    }
    .pin-reply-input:focus { border-color: #006a4d; }
    .pin-reply-actions { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }

    /* Composer (pending) — anchor X (left/center/right) e Y (up/down) */
    [data-review-composer] {
      position: absolute;
      pointer-events: auto; z-index: 52;
      width: 320px; max-width: calc(100vw - 32px);
      background: #fff; border: 1px solid #cdcdcd;
      box-shadow: 0 12px 28px rgba(0,0,0,0.18);
      padding: 12px;
      /* default: anchor center-up */
      transform: translate(-50%, -100%) translateY(-8px);
    }
    [data-review-composer][data-anchor-x="left"]   { transform: translate(0,    -100%) translateY(-8px); margin-left: 8px; }
    [data-review-composer][data-anchor-x="right"]  { transform: translate(-100%, -100%) translateY(-8px); margin-left: -8px; }
    [data-review-composer][data-anchor-y="down"]                                  { transform: translate(-50%, 0) translateY(28px); }
    [data-review-composer][data-anchor-x="left"][data-anchor-y="down"]            { transform: translate(0,    0) translateY(28px); margin-left: 8px; }
    [data-review-composer][data-anchor-x="right"][data-anchor-y="down"]           { transform: translate(-100%, 0) translateY(28px); margin-left: -8px; }
    [data-review-composer] textarea {
      width: 100%; min-height: 80px;
      padding: 8px 10px; border: 1px solid #cdcdcd;
      font: 500 13px/1.4 Manrope, system-ui, sans-serif; resize: vertical;
      outline: none; color: #15201b;
    }
    [data-review-composer] textarea:focus { border-color: #006a4d; }
    [data-review-composer] .composer-actions {
      display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end;
    }
    [data-review-composer] .composer-meta {
      font-size: 11px; color: #6b7570; margin-bottom: 6px;
    }
    [data-review-composer] .composer-meta strong { color: #00583d; }
    .review-btn {
      background: #00583d; color: #fff; border: none;
      padding: 6px 12px; font: 700 12px/1.2 Manrope, system-ui, sans-serif;
      cursor: pointer;
    }
    .review-btn:hover { background: #003e2a; }
    .review-btn:disabled { background: #d6d6d6; color: #8a8a8a; cursor: not-allowed; }
    .review-btn.secondary { background: #fff; color: #15201b; border: 1px solid #cdcdcd; }
    .review-btn.secondary:hover { background: #f4f4f4; }
    .review-btn.danger { background: #b9202a; }
    .review-btn.danger:hover { background: #8a1820; }

    /* Welcome / Author prompt dialogs */
    [data-review-dialog] {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; z-index: 10000;
    }
    [data-review-dialog] .dialog-card {
      width: 100%; max-width: 460px; background: #fff;
      box-shadow: 0 20px 60px rgba(0,0,0,0.30);
      font-family: Manrope, system-ui, sans-serif;
    }
    [data-review-dialog] .dialog-head {
      padding: 20px 24px 14px; border-bottom: 1px solid #e1e1e1;
    }
    [data-review-dialog] .dialog-head h2 {
      margin: 0; font-size: 18px; font-weight: 800; color: #15201b;
      letter-spacing: -0.005em;
    }
    [data-review-dialog] .dialog-head p {
      margin: 6px 0 0; font-size: 13px; color: #3b4642; font-weight: 500;
    }
    [data-review-dialog] .dialog-body {
      padding: 18px 24px;
    }
    [data-review-dialog] .field { margin-bottom: 14px; }
    [data-review-dialog] .field label {
      display: block; font-size: 12px; font-weight: 700;
      color: #15201b; margin-bottom: 4px;
    }
    [data-review-dialog] .field label .opt {
      font-size: 10px; color: #6b7570; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em; margin-left: 6px;
    }
    [data-review-dialog] .field input {
      width: 100%; height: 38px;
      padding: 0 12px; border: 1px solid #cdcdcd;
      font: 500 13px/1 Manrope, system-ui, sans-serif;
      color: #15201b; outline: none;
    }
    [data-review-dialog] .field input:focus { border-color: #006a4d; }
    [data-review-dialog] .dialog-actions {
      padding: 14px 24px; border-top: 1px solid #e1e1e1;
      display: flex; gap: 8px; justify-content: flex-end;
    }
    [data-review-dialog] .feature-list {
      display: flex; flex-direction: column; gap: 12px;
    }
    [data-review-dialog] .feature-item {
      display: flex; gap: 12px; align-items: flex-start;
      font-size: 13px; color: #15201b; line-height: 1.5;
    }
    [data-review-dialog] .feature-item strong { color: #00583d; }
    [data-review-dialog] .feature-icon {
      width: 28px; height: 28px; flex-shrink: 0;
      background: rgba(0,106,77,0.10); color: #00583d;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 4px;
    }

    /* Admin panel */
    [data-review-admin] {
      position: fixed; inset: 0;
      background: #fafaf8; z-index: 10001;
      overflow-y: auto;
      font-family: Manrope, system-ui, sans-serif;
    }
    [data-review-admin] .admin-head {
      padding: 24px 32px; background: #fff;
      border-bottom: 1px solid #e1e1e1;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 1;
    }
    [data-review-admin] .admin-head h1 {
      margin: 0; font-size: 22px; font-weight: 800; color: #15201b;
    }
    [data-review-admin] .admin-head .actions { display: flex; gap: 8px; }
    [data-review-admin] .admin-body {
      max-width: 1320px; margin: 0 auto; padding: 24px 32px;
    }
    [data-review-admin] .kpi-grid {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
      margin-bottom: 24px;
    }
    [data-review-admin] .kpi {
      background: #fff; border: 1px solid #e1e1e1; padding: 14px 16px;
    }
    [data-review-admin] .kpi-label {
      font-size: 11px; color: #6b7570; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    [data-review-admin] .kpi-value {
      font-size: 24px; font-weight: 800; color: #15201b; margin-top: 4px;
    }
    [data-review-admin] .filters {
      display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
    }
    [data-review-admin] .filters input,
    [data-review-admin] .filters select {
      height: 34px; padding: 0 10px;
      border: 1px solid #cdcdcd; background: #fff;
      font: 500 13px/1 Manrope, system-ui, sans-serif;
      color: #15201b; outline: none;
    }
    [data-review-admin] .filters input { min-width: 240px; }
    [data-review-admin] .filters input:focus,
    [data-review-admin] .filters select:focus { border-color: #006a4d; }
    [data-review-admin] .pages-list {
      background: #fff; border: 1px solid #e1e1e1;
    }
    [data-review-admin] .page-group {
      border-bottom: 1px solid #e1e1e1;
    }
    [data-review-admin] .page-group:last-child { border-bottom: none; }
    [data-review-admin] .page-group-head {
      background: #f4f4f4; padding: 10px 16px;
      font-size: 12px; color: #00583d; font-weight: 700;
      display: flex; align-items: center; justify-content: space-between;
    }
    [data-review-admin] .page-group-head .count {
      font-size: 11px; color: #6b7570; font-weight: 600;
    }
    [data-review-admin] .comment-row {
      padding: 14px 16px; border-top: 1px solid #f4f4f4;
      display: grid; grid-template-columns: 1fr auto; gap: 16px;
      align-items: start;
    }
    [data-review-admin] .comment-row:first-child { border-top: none; }
    [data-review-admin] .comment-row.resolved { background: #fafaf8; opacity: 0.7; }
    [data-review-admin] .comment-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }
    [data-review-admin] .comment-author { font-weight: 700; color: #00583d; font-size: 13px; }
    [data-review-admin] .badge {
      display: inline-block; padding: 2px 8px;
      background: rgba(0,106,77,0.10); color: #00583d;
      font-size: 11px; font-weight: 700;
      border-radius: 10px;
    }
    [data-review-admin] .badge.resolved { background: rgba(44,139,120,0.15); color: #2c8b78; }
    [data-review-admin] .comment-date { font-size: 11px; color: #6b7570; font-weight: 600; }
    [data-review-admin] .comment-text {
      font-size: 13px; color: #15201b; margin-top: 4px;
      white-space: pre-wrap; word-wrap: break-word;
    }
    [data-review-admin] .comment-replies {
      margin-top: 8px; padding-left: 12px;
      border-left: 2px solid #e1e1e1;
    }
    [data-review-admin] .comment-replies .reply {
      margin-top: 6px;
    }
    [data-review-admin] .comment-replies .reply-head {
      font-size: 11px; color: #6b7570; font-weight: 600;
    }
    [data-review-admin] .comment-replies .reply-head strong { color: #00583d; }
    [data-review-admin] .comment-replies .reply-text {
      font-size: 12px; color: #15201b; white-space: pre-wrap;
    }
    [data-review-admin] .comment-actions { display: flex; flex-direction: column; gap: 4px; }
  `;

  function injectCSS() {
    if (document.getElementById("__review-overlay-css")) return;
    const s = document.createElement("style");
    s.id = "__review-overlay-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ============================================================================
     Render — FAB, pins, composer, modais
     ============================================================================ */
  function render() {
    if (state.isAdmin) return renderAdmin();
    renderFAB();
    renderLayer();
  }

  function renderFAB() {
    let fab = document.querySelector("[data-review-fab]");
    const myComments = state.comments.filter(c => c.pageUrl === pageId() && c.status === "aberto");
    if (!fab) {
      fab = document.createElement("button");
      fab.setAttribute("data-review-fab", "");
      fab.type = "button";
      fab.setAttribute("aria-label", "Modo revisão");
      fab.addEventListener("click", toggleReviewMode);
      document.body.appendChild(fab);
    }
    fab.classList.toggle("is-active", state.enabled);
    fab.title = state.enabled ? "Sair do modo revisão (Esc)" : "Modo revisão";
    fab.innerHTML = state.enabled
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    if (myComments.length > 0 && !state.enabled) {
      fab.innerHTML += `<span data-review-fab-badge>${myComments.length}</span>`;
    }
  }

  function renderLayer() {
    let layer = document.querySelector("[data-review-layer]");
    if (!scrollContainer) scrollContainer = findScrollContainer();
    if (!scrollContainer) return;
    if (getComputedStyle(scrollContainer).position === "static") {
      scrollContainer.style.position = "relative";
    }
    if (!layer) {
      layer = document.createElement("div");
      layer.setAttribute("data-review-layer", "");
      scrollContainer.appendChild(layer);
    } else if (layer.parentElement !== scrollContainer) {
      scrollContainer.appendChild(layer);
    }
    layer.style.width = (scrollContainer.scrollWidth || scrollContainer.clientWidth) + "px";
    layer.style.height = (scrollContainer.scrollHeight || scrollContainer.clientHeight) + "px";

    // Pins — só visíveis quando o modo revisão está ATIVO. Senão a página
    // fica intocada (inputs, botões, scroll, etc.) e o usuário interage normal.
    let pinsHtml = "";
    if (state.enabled) {
      const here = state.comments.filter(c => c.pageUrl === pageId());
      pinsHtml = here.map(c => renderPin(c)).join("");
    }
    let composerHtml = "";
    if (state.pending && state.enabled) {
      composerHtml = renderComposer(state.pending);
    }
    layer.innerHTML = pinsHtml + composerHtml;

    // Wire up events on this rebuild
    layer.querySelectorAll("[data-review-pin]").forEach(el => {
      const id = el.dataset.pinId;
      el.querySelector(".pin-dot").addEventListener("click", (e) => {
        e.stopPropagation();
        state.activePin = state.activePin === id ? null : id;
        state.replyingTo = null;
        render();
      });
      const pop = el.querySelector(".pin-popover");
      if (pop) {
        wirePopover(pop, id);
      }
    });
    if (state.pending) wireComposer();
  }

  function renderPin(c) {
    const x = c.x, y = c.y;
    const flipX = x > 55 ? "data-flip-x" : "";
    const flipY = y < 30 ? "data-flip-y" : "";
    const active = state.activePin === c.id;
    return `
      <div data-review-pin data-pin-id="${c.id}" data-status="${c.status}" ${flipX} ${flipY}
           style="left:${x}%;top:${y}%">
        <button class="pin-dot" type="button" title="${esc(c.author)}: ${esc(c.text.slice(0, 50))}${c.text.length > 50 ? "…" : ""}">
          ${esc(c.author.slice(0, 1).toUpperCase())}
        </button>
        ${active ? renderPopover(c) : ""}
      </div>
    `;
  }

  function renderPopover(c) {
    const replies = c.replies.map(r => `
      <div class="pin-reply">
        <div class="pin-reply-head"><strong>${esc(r.author)}</strong>${r.area ? " · " + esc(r.area) : ""} <span class="pin-date">· ${fmtDate(r.createdAt)}</span></div>
        <div class="pin-reply-text">${esc(r.text)}</div>
      </div>
    `).join("");
    const replyBox = state.replyingTo === c.id ? `
      <textarea class="pin-reply-input" data-reply-text placeholder="Responder..." rows="3"></textarea>
      <div class="pin-reply-actions">
        <button class="review-btn secondary" type="button" data-action="cancel-reply">Cancelar</button>
        <button class="review-btn" type="button" data-action="send-reply">Enviar</button>
      </div>
    ` : "";
    return `
      <div class="pin-popover">
        <div>
          <span class="pin-author">${esc(c.author)}</span>${c.area ? `<span class="pin-area"> · ${esc(c.area)}</span>` : ""}
          <span class="pin-date">· ${fmtDate(c.createdAt)}</span>
        </div>
        <div class="pin-text">${esc(c.text)}</div>
        ${replies ? `<div class="pin-replies">${replies}</div>` : ""}
        ${replyBox || `
          <div class="pin-actions">
            <button class="pin-action" type="button" data-action="reply">Responder</button>
            <button class="pin-action ${c.status === 'resolvido' ? 'is-resolved' : ''}" type="button" data-action="resolve">${c.status === "resolvido" ? "Reabrir" : "Resolver"}</button>
            <button class="pin-action danger" type="button" data-action="delete">Excluir</button>
          </div>
        `}
      </div>
    `;
  }

  function renderComposer({ x, y }) {
    // Anchor X: se x estiver perto da esquerda → anchor left; perto da direita → anchor right; senão center
    let anchorX = "center";
    if (x < 25) anchorX = "left";
    else if (x > 65) anchorX = "right";
    // Anchor Y: se y estiver perto do topo (pouco espaço acima) → anchor down (composer abaixo do pin)
    const anchorY = y < 25 ? "down" : "up";
    return `
      <div data-review-composer data-anchor-x="${anchorX}" data-anchor-y="${anchorY}"
           style="left:${x}%;top:${y}%">
        <div class="composer-meta">
          <strong>${esc(state.author)}</strong>${state.area ? " · " + esc(state.area) : ""}
        </div>
        <textarea data-composer-text placeholder="Escreva seu comentário..." rows="3" autofocus></textarea>
        <div class="composer-actions">
          <button class="review-btn secondary" type="button" data-action="cancel">Cancelar</button>
          <button class="review-btn" type="button" data-action="send">Enviar</button>
        </div>
      </div>
    `;
  }

  function wirePopover(pop, commentId) {
    pop.addEventListener("click", (e) => e.stopPropagation());
    pop.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.action;
        const c = state.comments.find(x => x.id === commentId);
        if (!c) return;
        if (act === "reply")        { state.replyingTo = commentId; render(); }
        if (act === "cancel-reply") { state.replyingTo = null; render(); }
        if (act === "send-reply") {
          const t = pop.querySelector("[data-reply-text]");
          const text = (t.value || "").trim();
          if (!text) return;
          addReply(commentId, { author: state.author, area: state.area, text });
          state.replyingTo = null;
        }
        if (act === "resolve") {
          updateComment(commentId, { status: c.status === "resolvido" ? "aberto" : "resolvido" });
        }
        if (act === "delete") {
          if (confirm("Excluir esse comentário?")) deleteComment(commentId);
        }
      });
    });
  }

  function wireComposer() {
    const c = document.querySelector("[data-review-composer]");
    if (!c) return;
    c.addEventListener("click", (e) => e.stopPropagation());
    const ta = c.querySelector("[data-composer-text]");
    ta.focus();
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); state.pending = null; render(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
    });
    c.querySelector("[data-action='cancel']").addEventListener("click", (e) => {
      e.stopPropagation();
      state.pending = null;
      render();
    });
    c.querySelector("[data-action='send']").addEventListener("click", (e) => {
      e.stopPropagation();
      send();
    });
    function send() {
      const text = (ta.value || "").trim();
      if (!text) return;
      const { x, y } = state.pending;
      addComment({
        x, y, text,
        pageUrl: pageId(), pageTitle: pageTitle(),
        author: state.author, area: state.area,
      });
      state.pending = null;
      render();
    }
  }

  /* ============================================================================
     Click capture — em modo revisão, todo clique vira pin (exceto UI da revisão)
     ============================================================================ */
  function isReviewUI(el) {
    return !!el?.closest("[data-review-pin],[data-review-composer],[data-review-fab],[data-review-dialog],[data-review-admin]");
  }
  function stopEvent(e) {
    if (isReviewUI(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
  function onClickCapture(e) {
    if (!state.enabled) return;
    if (isReviewUI(e.target)) return;
    stopEvent(e);
    if (state.pending) {
      // ignore — composer aberto, click outside cancela
      state.pending = null;
      render();
      return;
    }
    if (state.activePin) {
      state.activePin = null;
      render();
      return;
    }
    if (!scrollContainer) scrollContainer = findScrollContainer();
    if (!scrollContainer) return;
    const rect = scrollContainer.getBoundingClientRect();
    const sw = scrollContainer.scrollWidth  || scrollContainer.clientWidth;
    const sh = scrollContainer.scrollHeight || scrollContainer.clientHeight;
    const x = ((e.clientX - rect.left + scrollContainer.scrollLeft) / sw) * 100;
    const y = ((e.clientY - rect.top  + scrollContainer.scrollTop)  / sh) * 100;
    state.pending = { x, y };
    render();
  }

  /* ============================================================================
     Toggle review mode — abre welcome se 1ª vez ou prompt se faltar autor
     ============================================================================ */
  function toggleReviewMode() {
    if (state.enabled) {
      state.enabled = false;
      state.pending = null;
      state.activePin = null;
      localStorage.setItem(KEY_MODE, "0");
      document.body.classList.remove("review-mode-active");
      render();
      return;
    }
    const welcomeSeen = localStorage.getItem(KEY_WELCOME) === "1";
    if (!welcomeSeen) {
      showWelcomeDialog();
      return;
    }
    if (!state.author) {
      showAuthorDialog();
      return;
    }
    enableReview();
  }
  function enableReview() {
    state.enabled = true;
    localStorage.setItem(KEY_MODE, "1");
    document.body.classList.add("review-mode-active");
    render();
  }

  /* ============================================================================
     Welcome / Author dialogs
     ============================================================================ */
  function showWelcomeDialog() {
    closeDialogs();
    const div = document.createElement("div");
    div.setAttribute("data-review-dialog", "welcome");
    div.innerHTML = `
      <div class="dialog-card">
        <div class="dialog-head">
          <h2>👋 Bem-vindo ao modo revisão</h2>
          <p>Deixe comentários em qualquer ponto da tela. Tudo em tempo real.</p>
        </div>
        <div class="dialog-body">
          <div class="feature-list">
            <div class="feature-item">
              <span class="feature-icon">①</span>
              <div><strong>Clique em qualquer lugar</strong> da tela pra deixar um comentário.</div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">②</span>
              <div>Pins ficam <strong>ancorados ao conteúdo</strong> e visíveis pra todo mundo em tempo real.</div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">③</span>
              <div>Responda, marque como resolvido, ou exclua a qualquer momento.</div>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⎋</span>
              <div>Aperte <strong>Esc</strong> ou clique no botão pra sair do modo.</div>
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="review-btn" type="button" data-action="continue">Continuar</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    div.querySelector("[data-action='continue']").addEventListener("click", () => {
      localStorage.setItem(KEY_WELCOME, "1");
      div.remove();
      if (!state.author) showAuthorDialog();
      else enableReview();
    });
  }

  function showAuthorDialog() {
    closeDialogs();
    const div = document.createElement("div");
    div.setAttribute("data-review-dialog", "author");
    div.innerHTML = `
      <div class="dialog-card">
        <div class="dialog-head">
          <h2>Quem está revisando?</h2>
          <p>Seu nome aparece nos comentários. A área é opcional.</p>
        </div>
        <div class="dialog-body">
          <div class="field">
            <label>Nome <span style="color:#b9202a">*</span></label>
            <input type="text" data-author-input value="${esc(state.author)}" placeholder="Ex: Maria Silva" autofocus />
          </div>
          <div class="field">
            <label>Área ou cargo <span class="opt">opcional</span></label>
            <input type="text" data-area-input value="${esc(state.area)}" placeholder="Ex: Comercial · Vendas · TI" />
          </div>
        </div>
        <div class="dialog-actions">
          <button class="review-btn secondary" type="button" data-action="cancel">Cancelar</button>
          <button class="review-btn" type="button" data-action="continue" disabled>Continuar</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    const authorIn = div.querySelector("[data-author-input]");
    const areaIn   = div.querySelector("[data-area-input]");
    const btnGo    = div.querySelector("[data-action='continue']");
    const refreshBtn = () => { btnGo.disabled = !authorIn.value.trim(); };
    authorIn.addEventListener("input", refreshBtn);
    refreshBtn();
    div.querySelector("[data-action='cancel']").addEventListener("click", () => div.remove());
    btnGo.addEventListener("click", () => {
      state.author = authorIn.value.trim();
      state.area   = areaIn.value.trim();
      localStorage.setItem(KEY_AUTHOR, state.author);
      localStorage.setItem(KEY_AREA,   state.area);
      div.remove();
      enableReview();
    });
    authorIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && authorIn.value.trim()) btnGo.click(); });
    areaIn  .addEventListener("keydown", (e) => { if (e.key === "Enter" && authorIn.value.trim()) btnGo.click(); });
  }

  function closeDialogs() {
    document.querySelectorAll("[data-review-dialog]").forEach(d => d.remove());
  }

  /* ============================================================================
     Admin panel — ?adminKey=XXX
     ============================================================================ */
  function checkAdmin() {
    const params = new URLSearchParams(location.search);
    const k = params.get("adminKey");
    if (k === ADMIN_KEY) {
      localStorage.setItem(KEY_ADMIN, "1");
      state.isAdmin = true;
    } else if (localStorage.getItem(KEY_ADMIN) === "1" && params.has("admin")) {
      state.isAdmin = true;
    }
  }

  let adminFilters = { q: "", status: "", author: "", area: "", page: "" };

  function renderAdmin() {
    document.body.classList.remove("review-mode-active");
    let panel = document.querySelector("[data-review-admin]");
    if (!panel) {
      panel = document.createElement("div");
      panel.setAttribute("data-review-admin", "");
      document.body.appendChild(panel);
    }
    const filtered = filterComments();
    const groups = groupByPage(filtered);
    const authors = [...new Set(state.comments.map(c => c.author))].sort();
    const areas   = [...new Set(state.comments.map(c => c.area).filter(Boolean))].sort();
    const pages   = [...new Set(state.comments.map(c => c.pageUrl))].sort();

    const total = state.comments.length;
    const aberto = state.comments.filter(c => c.status === "aberto").length;
    const resolvido = state.comments.filter(c => c.status === "resolvido").length;

    panel.innerHTML = `
      <div class="admin-head">
        <div>
          <h1>Revisão — Painel Admin</h1>
          <div style="font-size:12px;color:#6b7570;margin-top:2px">${state.comments.length} comentário(s) em ${pages.length} página(s)</div>
        </div>
        <div class="actions">
          <button class="review-btn secondary" type="button" data-action="export-md">Copiar Markdown</button>
          <button class="review-btn secondary" type="button" data-action="export-json">Baixar JSON</button>
          <button class="review-btn danger" type="button" data-action="exit">Sair</button>
        </div>
      </div>
      <div class="admin-body">
        <div class="kpi-grid">
          <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value">${total}</div></div>
          <div class="kpi"><div class="kpi-label">Abertos</div><div class="kpi-value">${aberto}</div></div>
          <div class="kpi"><div class="kpi-label">Resolvidos</div><div class="kpi-value">${resolvido}</div></div>
          <div class="kpi"><div class="kpi-label">Autores</div><div class="kpi-value">${authors.length}</div></div>
          <div class="kpi"><div class="kpi-label">Áreas</div><div class="kpi-value">${areas.length}</div></div>
        </div>
        <div class="filters">
          <input type="text" placeholder="Buscar texto..." data-filter="q" value="${esc(adminFilters.q)}" />
          <select data-filter="status">
            <option value="">Todos os status</option>
            <option value="aberto"    ${adminFilters.status==="aberto"?"selected":""}>Aberto</option>
            <option value="resolvido" ${adminFilters.status==="resolvido"?"selected":""}>Resolvido</option>
          </select>
          <select data-filter="author">
            <option value="">Todos os autores</option>
            ${authors.map(a => `<option value="${esc(a)}" ${adminFilters.author===a?"selected":""}>${esc(a)}</option>`).join("")}
          </select>
          <select data-filter="area">
            <option value="">Todas as áreas</option>
            ${areas.map(a => `<option value="${esc(a)}" ${adminFilters.area===a?"selected":""}>${esc(a)}</option>`).join("")}
          </select>
          <select data-filter="page">
            <option value="">Todas as páginas</option>
            ${pages.map(p => `<option value="${esc(p)}" ${adminFilters.page===p?"selected":""}>${esc(p)}</option>`).join("")}
          </select>
        </div>
        <div class="pages-list">
          ${groups.length === 0 ? '<div style="padding:40px;text-align:center;color:#6b7570">Nenhum comentário encontrado.</div>' : groups.map(g => `
            <div class="page-group">
              <div class="page-group-head">
                <span>${esc(g.title)} — <code style="font-family:ui-monospace,monospace;font-size:11px">${esc(g.url)}</code></span>
                <span class="count">${g.comments.length} comentário(s)</span>
              </div>
              ${g.comments.map(c => renderAdminRow(c)).join("")}
            </div>
          `).join("")}
        </div>
      </div>
    `;

    panel.querySelectorAll("[data-filter]").forEach(el => {
      el.addEventListener("input", () => { adminFilters[el.dataset.filter] = el.value; renderAdmin(); });
      el.addEventListener("change", () => { adminFilters[el.dataset.filter] = el.value; renderAdmin(); });
    });

    panel.querySelector("[data-action='exit']").addEventListener("click", () => {
      localStorage.removeItem(KEY_ADMIN);
      const u = new URL(location.href);
      u.searchParams.delete("adminKey");
      u.searchParams.delete("admin");
      location.href = u.toString();
    });
    panel.querySelector("[data-action='export-md']").addEventListener("click", () => {
      const md = exportMarkdown();
      navigator.clipboard.writeText(md).then(() => alert("Markdown copiado!"));
    });
    panel.querySelector("[data-action='export-json']").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state.comments, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "review-comments-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);
    });

    panel.querySelectorAll("[data-row-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const act = btn.dataset.rowAction;
        const c = state.comments.find(x => x.id === id);
        if (!c) return;
        if (act === "resolve") updateComment(id, { status: c.status === "resolvido" ? "aberto" : "resolvido" });
        if (act === "delete")  if (confirm("Excluir esse comentário?")) deleteComment(id);
        if (act === "reply") {
          const text = prompt("Sua resposta:");
          if (text && text.trim()) addReply(id, { author: state.author || "Admin", area: state.area || "", text: text.trim() });
        }
      });
    });
  }

  function renderAdminRow(c) {
    const replies = c.replies.map(r => `
      <div class="reply">
        <div class="reply-head"><strong>${esc(r.author)}</strong>${r.area ? " · " + esc(r.area) : ""} · ${fmtDate(r.createdAt)}</div>
        <div class="reply-text">${esc(r.text)}</div>
      </div>
    `).join("");
    return `
      <div class="comment-row ${c.status === 'resolvido' ? 'resolved' : ''}">
        <div>
          <div class="comment-meta">
            <span class="comment-author">${esc(c.author)}</span>
            ${c.area ? `<span class="badge">${esc(c.area)}</span>` : ""}
            <span class="badge ${c.status === 'resolvido' ? 'resolved' : ''}">${c.status}</span>
            <span class="comment-date">${fmtDate(c.createdAt)}</span>
          </div>
          <div class="comment-text">${esc(c.text)}</div>
          ${replies ? `<div class="comment-replies">${replies}</div>` : ""}
        </div>
        <div class="comment-actions">
          <button class="review-btn secondary" type="button" data-row-action="reply"   data-id="${c.id}">Responder</button>
          <button class="review-btn secondary" type="button" data-row-action="resolve" data-id="${c.id}">${c.status === "resolvido" ? "Reabrir" : "Resolver"}</button>
          <button class="review-btn danger"    type="button" data-row-action="delete"  data-id="${c.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function filterComments() {
    return state.comments.filter(c => {
      if (adminFilters.status && c.status !== adminFilters.status) return false;
      if (adminFilters.author && c.author !== adminFilters.author) return false;
      if (adminFilters.area   && c.area   !== adminFilters.area)   return false;
      if (adminFilters.page   && c.pageUrl !== adminFilters.page)  return false;
      if (adminFilters.q) {
        const q = adminFilters.q.toLowerCase();
        if (!c.text.toLowerCase().includes(q) &&
            !c.author.toLowerCase().includes(q) &&
            !c.replies.some(r => r.text.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }

  function groupByPage(comments) {
    const map = new Map();
    comments.forEach(c => {
      if (!map.has(c.pageUrl)) map.set(c.pageUrl, { url: c.pageUrl, title: c.pageTitle, comments: [] });
      map.get(c.pageUrl).comments.push(c);
    });
    return [...map.values()].sort((a, b) => a.url.localeCompare(b.url));
  }

  function exportMarkdown() {
    const groups = groupByPage(filterComments());
    let md = `# Comentários de Revisão\n\n_Exportado em ${new Date().toLocaleString("pt-BR")}_\n\n`;
    groups.forEach(g => {
      md += `## ${g.title}\n\`${g.url}\`\n\n`;
      g.comments.forEach(c => {
        md += `### ${c.author}${c.area ? " · " + c.area : ""} — ${c.status}\n`;
        md += `_${fmtDate(c.createdAt)}_\n\n${c.text}\n\n`;
        if (c.replies.length) {
          c.replies.forEach(r => {
            md += `> **${r.author}**${r.area ? " · " + r.area : ""} (${fmtDate(r.createdAt)}): ${r.text}\n\n`;
          });
        }
        md += "---\n\n";
      });
    });
    return md;
  }

  /* ============================================================================
     Boot
     ============================================================================ */
  function boot() {
    injectCSS();
    checkAdmin();
    if (state.isAdmin) {
      initSupabase();
      // Não renderiza FAB nem layer — apenas o painel admin
      const tick = setInterval(() => {
        if (!state.loading) { renderAdmin(); clearInterval(tick); }
      }, 100);
      return;
    }
    // App normal
    document.addEventListener("click",     onClickCapture, true);
    document.addEventListener("mousedown", stopEvent,      true);
    document.addEventListener("mouseup",   stopEvent,      true);
    document.addEventListener("auxclick",  stopEvent,      true);
    document.addEventListener("dblclick",  stopEvent,      true);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!state.enabled) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (state.pending) { state.pending = null; render(); return; }
      if (state.activePin) { state.activePin = null; render(); return; }
      toggleReviewMode();
    });
    // Re-render quando o scroll container muda de tamanho
    const watchLayer = () => {
      const c = findScrollContainer();
      if (c !== scrollContainer) { scrollContainer = c; renderLayer(); }
    };
    window.addEventListener("resize", watchLayer);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => renderLayer());
      const tryObs = setInterval(() => {
        const c = findScrollContainer();
        if (c && c !== document.body) { ro.observe(c); clearInterval(tryObs); }
      }, 500);
    }
    if (state.enabled) document.body.classList.add("review-mode-active");
    initSupabase();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
