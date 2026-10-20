/* Le Cercle — application Up&In, Family Office de l'Autonomie. */
(function () {
  'use strict';

  const S = window.Store, Ch = window.Charts, M = window.Emails;
  const main = document.getElementById('main');
  const modalRoot = document.getElementById('modal-root');

  // ======================================================================
  // Utilitaires
  // ======================================================================
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const today = () => M.todayIso();
  const fmt = (iso) => iso ? M.shortDate(iso) : '—';
  const fmtLong = (iso) => iso ? M.longDate(iso) : '—';
  const age = (iso) => {
    if (!iso) return '';
    const b = new Date(iso + 'T12:00:00'), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
    return a + ' ans';
  };
  const initials = (s) => ((s.prenom || '')[0] || '') + ((s.nom || '')[0] || '');
  const euro = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' €';
  const catBadge = (c) => c ? `<span class="badge cat-${esc(c)}">${esc((S.CATEGORIES[c] || {}).label || c)}</span>` : '';
  const statutChip = (st) => { const x = S.STATUTS[st] || S.STATUTS.prevue; return `<span class="chip ${x.cls}"><b>${x.icon}</b> ${x.label}</span>`; };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function formData(root) {
    const o = {};
    root.querySelectorAll('[name]').forEach(el => {
      if (el.closest('.rows')) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return o;
  }

  function seniorOptions(selected, withAll) {
    return (withAll ? `<option value="">Tous les seniors</option>` : '') +
      S.state.seniors.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.prenom + ' ' + s.nom)}</option>`).join('');
  }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '') || 'tableau';
    const [path, qs] = h.split('?');
    return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs || '')) };
  }
  const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

  // ---------- Modale ----------
  function openModal({ title, body, footer, wide, onMount }) {
    const el = document.createElement('div');
    el.className = 'modal-wrap';
    el.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div>`;
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    function close() { el.remove(); document.body.classList.toggle('modal-open', !!modalRoot.children.length); }
    el.close = close;
    modalRoot.appendChild(el);
    document.body.classList.add('modal-open');
    if (onMount) onMount(el.querySelector('.modal'), close);
    const first = el.querySelector('input:not([type=hidden]),select,textarea');
    if (first && window.matchMedia('(pointer:fine)').matches) first.focus();
    return el;
  }
  function confirmBox(msg, onYes, label) {
    openModal({
      title: 'Confirmation', body: `<p>${esc(msg)}</p>`,
      footer: `<button class="btn ghost" data-close>Annuler</button><button class="btn danger" id="cf-yes">${esc(label || 'Supprimer')}</button>`,
      onMount(m, close) { m.querySelector('#cf-yes').onclick = () => { close(); onYes(); }; }
    });
  }

  // ---------- Lignes éditables (tableaux du bilan) ----------
  function fieldHtml(c, v) {
    const val = esc(v ?? '');
    if (c.type === 'select') {
      return `<select data-k="${c.k}" style="flex:${c.w || 1}">${c.options.map(o => {
        const ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o;
        return `<option value="${esc(ov)}" ${String(ov) === String(v ?? '') ? 'selected' : ''}>${esc(ol)}</option>`;
      }).join('')}</select>`;
    }
    return `<input data-k="${c.k}" type="${c.type || 'text'}" value="${val}" placeholder="${esc(c.label)}" style="flex:${c.w || 1}" ${c.type === 'number' ? 'inputmode="decimal" step="any"' : ''}>`;
  }
  function rowHtml(cols, r) {
    r = r || {};
    return `<div class="erow" data-id="${esc(r.id || '')}">${cols.map(c => fieldHtml(c, r[c.k])).join('')}<button type="button" class="icon-btn" data-act="row-del" aria-label="Supprimer la ligne">✕</button></div>`;
  }
  function rowsEditor(key, cols, rows) {
    return `<div class="rows" data-rows="${key}" data-cols="${esc(JSON.stringify(cols))}">
      <div class="rows-head">${cols.map(c => `<span style="flex:${c.w || 1}">${esc(c.label)}</span>`).join('')}<span class="rows-x"></span></div>
      <div class="rows-body">${(rows && rows.length ? rows : [{}]).map(r => rowHtml(cols, r)).join('')}</div>
      <button type="button" class="btn ghost sm" data-act="row-add">+ Ajouter une ligne</button>
    </div>`;
  }
  function collectRows(root, key) {
    const box = root.querySelector(`.rows[data-rows="${key}"]`);
    if (!box) return [];
    const cols = JSON.parse(box.dataset.cols);
    return [...box.querySelectorAll('.erow')].map(row => {
      const o = { id: row.dataset.id || S.uid() };
      let filled = false;
      row.querySelectorAll('[data-k]').forEach(el => {
        const c = cols.find(x => x.k === el.dataset.k);
        let v = el.value.trim();
        if (c && c.type === 'number') v = v === '' ? '' : Number(v.replace(',', '.'));
        if (v !== '' && !(c && c.type === 'select')) filled = true;
        o[el.dataset.k] = v;
      });
      return filled ? o : null;
    }).filter(Boolean);
  }

  // ---------- Pièces jointes (photos de notes papier, PDF des intervenants) ----------
  function attachHtml() {
    return `<div class="attach" data-attach>
      <div class="attach-list"></div>
      <div class="attach-btns">
        <label class="btn ghost sm">📷 Photographier<input type="file" accept="image/*" capture="environment" hidden data-attach-input></label>
        <label class="btn ghost sm">📎 Joindre un document<input type="file" accept="image/*,application/pdf" multiple hidden data-attach-input></label>
      </div>
    </div>`;
  }
  function renderAttach(w) {
    w.querySelector('.attach-list').innerHTML = (w._files || []).map((f, i) => `
      <figure class="thumb">${f.type.startsWith('image/') ? `<img src="${f.data}" alt="${esc(f.name)}" data-act="view-file" data-i="${i}">` : `<span class="pdf" data-act="view-file" data-i="${i}">PDF</span>`}
      <figcaption>${esc(f.name)}</figcaption><button type="button" class="icon-btn sm" data-act="attach-del" data-i="${i}" aria-label="Retirer">✕</button></figure>`).join('');
  }
  function initAttach(root, files) {
    const w = root.querySelector('[data-attach]');
    if (!w) return;
    w._files = (files || []).slice();
    renderAttach(w);
  }
  function getAttach(root) { const w = root.querySelector('[data-attach]'); return w ? w._files || [] : []; }
  function readFile(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => {
        if (!file.type.startsWith('image/')) return resolve({ name: file.name, type: file.type, data: r.result });
        const img = new Image();
        img.onload = () => {
          const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve({ name: file.name || 'photo.jpg', type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.82) });
        };
        img.onerror = () => resolve({ name: file.name, type: file.type, data: r.result });
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  function openFile(f) {
    const w = window.open();
    if (!w) return toast('Autorisez les fenêtres pour afficher le document');
    if (f.type.startsWith('image/')) w.document.write(`<title>${esc(f.name)}</title><img src="${f.data}" style="max-width:100%">`);
    else w.location.href = f.data;
  }
  document.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-attach-input]');
    if (!inp) return;
    const w = inp.closest('[data-attach]');
    w._files = w._files || [];
    for (const f of inp.files) w._files.push(await readFile(f));
    inp.value = '';
    renderAttach(w);
    w.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ======================================================================
  // Actions (délégation d'événements)
  // ======================================================================
  const actions = {
    'row-add'(a) { const box = a.closest('.rows'); box.querySelector('.rows-body').insertAdjacentHTML('beforeend', rowHtml(JSON.parse(box.dataset.cols))); },
    'row-del'(a) { const box = a.closest('.rows'); a.closest('.erow').remove(); if (!box.querySelector('.erow')) actions['row-add'](box.querySelector('[data-act=row-add]')); },
    'attach-del'(a) { const w = a.closest('[data-attach]'); w._files.splice(Number(a.dataset.i), 1); renderAttach(w); },
    'view-file'(a) { const w = a.closest('[data-attach]'); if (w) openFile(w._files[Number(a.dataset.i)]); },
    'view-cr-file'(a) { const cr = S.state.comptesRendus.find(c => c.id === a.dataset.cr); if (cr) openFile(cr.photos[Number(a.dataset.i)]); },
    'new-senior'() { seniorModal(); },
    'edit-senior'(a) { seniorModal(S.senior(a.dataset.id)); },
    'del-senior'(a) {
      const s = S.senior(a.dataset.id);
      confirmBox(`Supprimer définitivement le dossier de ${s.prenom} ${s.nom} et toutes ses données (bilans, comptes rendus, calendrier) ?`, () => { S.removeSenior(s.id); toast('Dossier supprimé'); go('#/seniors'); });
    },
    'person'(a) { personModal(a.dataset.senior, a.dataset.kind, a.dataset.id); },
    'new-int'(a) { interventionModal(null, { seniorId: a.dataset.senior, date: a.dataset.date }); },
    'edit-int'(a) { interventionModal(S.state.interventions.find(i => i.id === a.dataset.id)); },
    'quick-done'(a) { quickDone(a.dataset.id); },
    'quick-status'(a) {
      const it = S.state.interventions.find(i => i.id === a.dataset.id);
      it.statut = a.dataset.st; S.upsert('interventions', it); toast('Statut mis à jour : ' + S.STATUTS[it.statut].label); render();
    },
    'new-cr'(a) { crModal(null, { seniorId: a.dataset.senior }); },
    'edit-cr'(a) { crModal(S.state.comptesRendus.find(c => c.id === a.dataset.id)); },
    'paste-cr'(a) { pasteModal(a.dataset.senior); },
    'transmit'(a) { go(`#/mails?senior=${a.dataset.senior}&tpl=aidants-interventions${a.dataset.ids ? '&ids=' + a.dataset.ids : ''}`); },
    'print'() { window.print(); },
    'demo'() { const id = S.loadDemo(); toast('Dossier de démonstration chargé'); go('#/senior/' + id); },
    'install'() { installApp(); },
    'cal-nav'(a) { calState.month = Number(a.dataset.m); calState.year = Number(a.dataset.y); render(); },
    'cal-view'(a) { calState.view = a.dataset.v; try { localStorage.setItem('lc-cal-view', calState.view); } catch (e) { /* facultatif */ } render(); },
    'cr-filter'(a) { crFilter = a.dataset.f; render(); }
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && actions[a.dataset.act]) { e.preventDefault(); actions[a.dataset.act](a, e); }
  });

  // Infobulles (survol souris ou toucher)
  const tip = document.getElementById('tip');
  function showTip(el, x, y) {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
    tip.style.top = Math.max(8, y - r.height - 14) + 'px';
  }
  document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
  document.addEventListener('pointermove', (e) => { const el = e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else tip.hidden = true; });
  document.addEventListener('pointerleave', () => { tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);

  // ======================================================================
  // Rendu / routage
  // ======================================================================
  function setActive(key) {
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === key));
  }

  function render() {
    const { parts, q } = parseHash();
    const r = parts[0];
    tip.hidden = true;
    document.body.classList.toggle('senior-mode', r === 'mon-calendrier');
    const views = {
      tableau: viewDashboard, seniors: viewSeniors, senior: viewSenior, bilan: viewBilanEdit,
      rdv: viewRdv, calendrier: viewCalendar, 'mon-calendrier': viewSeniorCalendar,
      transmissions: viewTransmissions, mails: viewMails, reglages: viewSettings
    };
    const nav = { senior: 'seniors', bilan: 'seniors', 'mon-calendrier': 'calendrier' }[r] || r;
    setActive(nav);
    (views[r] || viewDashboard)(parts, q);
    main.scrollTop = 0; window.scrollTo(0, 0);
  }

  function pageHead(title, sub, actionsHtml) {
    return `<header class="page-head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="head-actions">${actionsHtml || ''}</div></header>`;
  }

  function emptyState(msg, btns) {
    return `<div class="empty"><img src="assets/logo-upandin.jpg" alt="" class="empty-logo"><p>${msg}</p><div class="btn-row center">${btns || ''}</div></div>`;
  }

  // ======================================================================
  // Tableau de bord
  // ======================================================================
  function viewDashboard() {
    const st = S.state, t = today(), in7 = M.addDays(t, 7), m30 = M.addDays(t, -30), m14 = M.addDays(t, -14);
    if (!st.seniors.length) {
      main.innerHTML = pageHead('Bienvenue dans <em>Le Cercle</em>', "Le logiciel de coordination du Family Office de l'Autonomie") +
        emptyState('Commencez par créer le dossier d\'un senior, ou découvrez le logiciel avec un dossier de démonstration.',
          `<button class="btn gold" data-act="new-senior">+ Nouveau senior</button><button class="btn ghost" data-act="demo">Charger la démonstration</button>`) + installCard();
      return;
    }
    const ints = st.interventions;
    const week = ints.filter(i => i.date >= t && i.date <= in7 && i.statut !== 'annulee');
    const past30 = ints.filter(i => i.date >= m30 && i.date < t && i.statut !== 'annulee');
    const done30 = past30.filter(i => i.statut === 'faite');
    const toTransmit = ints.filter(i => i.statut === 'faite' && i.cr && !i.transmis);
    const overdue = ints.filter(i => i.statut === 'prevue' && i.date < t);
    const alerts = st.comptesRendus.filter(c => c.alertes && c.date >= m14).sort((a, b) => b.date.localeCompare(a.date));
    const next = ints.filter(i => i.statut === 'prevue' && i.date >= t && i.date <= M.addDays(t, 1));
    const taux = past30.length ? Math.round(done30.length / past30.length * 100) : null;

    main.innerHTML = pageHead('Tableau de bord', fmtLong(t),
      `<a class="btn gold" href="#/rdv">✎ Nouveau rendez-vous</a><button class="btn ghost" data-act="new-int">+ Intervention</button>`) +
      `<section class="kpis">
        ${kpi(st.seniors.length, 'Seniors accompagnés')}
        ${kpi(week.length, 'Interventions sur 7 jours')}
        ${kpi(taux == null ? '—' : taux + ' %', 'Interventions réalisées (30 j)', `${done30.length} sur ${past30.length}`)}
        ${kpi(toTransmit.length, 'Comptes rendus à transmettre', '', toTransmit.length ? 'warn' : '')}
        ${kpi(alerts.length, 'Points de vigilance (14 j)', '', alerts.length ? 'alert' : '')}
      </section>
      <div class="grid-2">
        <section class="card"><h2>Aujourd'hui & demain</h2>${next.length ? intList(next, true) : '<p class="muted">Aucune intervention prévue.</p>'}</section>
        <section class="card"><h2>À mettre à jour <small>interventions passées encore « prévues »</small></h2>
          ${overdue.length ? intList(overdue, true, true) : '<p class="muted">Tout est à jour. ✓</p>'}</section>
        <section class="card"><h2>À transmettre aux aidants</h2>${toTransmitList(toTransmit)}</section>
        <section class="card"><h2>Points de vigilance récents</h2>${alerts.length ? alerts.map(c => `
          <div class="alert-item"><span class="alert-dot">!</span><div><b>${esc(S.seniorName(c.seniorId))}</b> · ${fmt(c.date)} · ${esc(c.auteur)} ${catBadge(c.categorie)}<br>${esc(c.alertes)}</div></div>`).join('') : '<p class="muted">Aucun point de vigilance.</p>'}</section>
      </div>
      <section class="card"><h2>Seniors</h2><div class="senior-cards">${st.seniors.map(seniorCard).join('')}</div></section>`;
  }
  function kpi(v, l, sub, cls) {
    return `<div class="kpi ${cls || ''}"><span class="kpi-v">${esc(v)}</span><span class="kpi-l">${esc(l)}</span>${sub ? `<span class="kpi-s">${esc(sub)}</span>` : ''}</div>`;
  }
  function toTransmitList(list) {
    if (!list.length) return '<p class="muted">Rien en attente. ✓</p>';
    const bySenior = {};
    list.forEach(i => { (bySenior[i.seniorId] = bySenior[i.seniorId] || []).push(i); });
    return Object.entries(bySenior).map(([sid, l]) => `<div class="transmit-row">
      <div><b>${esc(S.seniorName(sid))}</b><br><span class="muted">${l.map(i => `${fmt(i.date)} — ${esc(i.type)}`).join('<br>')}</span></div>
      <button class="btn sm gold" data-act="transmit" data-senior="${sid}" data-ids="${l.map(i => i.id).join(',')}">✉ Transmettre</button></div>`).join('');
  }
  function intList(list, showSenior, quick) {
    return `<ul class="int-list">${list.map(i => `<li class="int-item cat-line-${esc(i.categorie || 'upin')}">
      <button class="int-main" data-act="edit-int" data-id="${i.id}">
        <span class="int-when">${fmt(i.date)}${i.heure ? `<br><b>${M.heure(i.heure)}</b>` : ''}</span>
        <span class="int-what"><b>${esc(i.type)}</b>${showSenior ? ` · ${esc(S.seniorName(i.seniorId))}` : ''}<br>
          <span class="muted">avec ${esc(i.intervenant || '—')}${i.role ? ' (' + esc(i.role) + ')' : ''}${i.motif ? ' — ' + esc(i.motif) : ''}</span>
          ${i.cr ? `<br><span class="cr-line">“${esc(i.cr)}”</span>` : ''}</span>
        <span class="int-st">${statutChip(i.statut)}${i.transmis ? '<span class="chip st-transmis">✉ Transmis</span>' : ''}</span>
      </button>
      ${quick && i.statut === 'prevue' ? `<span class="quick"><button class="btn sm" data-act="quick-done" data-id="${i.id}">✓ Réalisée</button><button class="btn sm ghost" data-act="quick-status" data-st="reportee" data-id="${i.id}">↻ Reportée</button></span>` : ''}
    </li>`).join('')}</ul>`;
  }

  function seniorCard(s) {
    const b = S.lastBilan(s.id), g = S.scoreGlobal(b);
    const next = S.interventionsOf(s.id).find(i => i.statut === 'prevue' && i.date >= today());
    const al = S.crOf(s.id).filter(c => c.alertes && c.date >= M.addDays(today(), -14)).length;
    return `<a class="senior-card" href="#/senior/${s.id}">
      <span class="avatar">${esc(initials(s))}</span>
      <span class="sc-body"><b class="sc-name">${esc(s.prenom)} ${esc(s.nom)}</b>
        <span class="muted">${esc(age(s.naissance))}${b && b.gir ? ' · GIR ' + b.gir : ''}${formuleShort(s)}</span>
        <span class="sc-next">${next ? `Prochaine : ${fmt(next.date)} — ${esc(next.type)}` : 'Aucune intervention prévue'}</span></span>
      <span class="sc-score">${g != null ? `<b>${g}</b><small>/10</small>` : '<small>Pas de bilan</small>'}${al ? `<span class="chip st-annulee">! ${al}</span>` : ''}</span>
    </a>`;
  }

  // ======================================================================
  // Seniors
  // ======================================================================
  function viewSeniors(parts, q) {
    const term = (q.q || '').toLowerCase();
    const list = S.state.seniors.filter(s => !term || (s.prenom + ' ' + s.nom).toLowerCase().includes(term));
    main.innerHTML = pageHead('Seniors accompagnés', `${S.state.seniors.length} dossier(s)`, `<button class="btn gold" data-act="new-senior">+ Nouveau senior</button>`) +
      (S.state.seniors.length ? `<input class="search" type="search" placeholder="Rechercher un senior…" value="${esc(q.q || '')}" id="search">
        <div class="senior-cards">${list.map(seniorCard).join('') || '<p class="muted">Aucun résultat.</p>'}</div>`
        : emptyState('Aucun dossier pour le moment.', `<button class="btn gold" data-act="new-senior">+ Nouveau senior</button><button class="btn ghost" data-act="demo">Charger la démonstration</button>`));
    const sInp = document.getElementById('search');
    if (sInp) sInp.addEventListener('change', () => go('#/seniors?q=' + encodeURIComponent(sInp.value)));
  }

  function seniorModal(s) {
    const isNew = !s;
    s = s || { civilite: 'Mme', aidants: [], intervenants: [] };
    openModal({
      title: isNew ? 'Nouveau senior' : `Modifier — ${s.prenom} ${s.nom}`, wide: true,
      body: `<form class="form" id="f-senior">
        <div class="f-row"><label>Civilité<select name="civilite">${['Mme', 'M.', ''].map(c => `<option ${c === s.civilite ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="grow">Prénom<input name="prenom" required value="${esc(s.prenom)}"></label>
          <label class="grow">Nom<input name="nom" required value="${esc(s.nom)}"></label>
          <label>Date de naissance<input type="date" name="naissance" value="${esc(s.naissance)}"></label></div>
        <label>Adresse<input name="adresse" value="${esc(s.adresse)}"></label>
        <div class="f-row"><label class="grow">Téléphone<input name="tel" type="tel" value="${esc(s.tel)}"></label>
          <label class="grow">E-mail<input name="email" type="email" value="${esc(s.email)}"></label>
          <label class="grow">Médecin traitant<input name="medecin" value="${esc(s.medecin)}"></label></div>
        <label>Situation de vie<textarea name="situation" rows="2">${esc(s.situation)}</textarea></label>
        <label>Habitudes, préférences, points d'attention<textarea name="notes" rows="3">${esc(s.notes)}</textarea></label>
        ${isNew ? `<h3>Aidant principal</h3><div class="f-row"><label class="grow">Prénom<input name="a_prenom"></label><label class="grow">Nom<input name="a_nom"></label>
          <label>Lien<input name="a_lien" placeholder="Fille, fils, conjoint…"></label></div>
          <div class="f-row"><label class="grow">E-mail<input name="a_email" type="email"></label><label class="grow">Téléphone<input name="a_tel" type="tel"></label></div>` : ''}
      </form>`,
      footer: `${isNew ? '' : `<button class="btn danger ghost left" data-act="del-senior" data-id="${s.id}" data-close>Supprimer le dossier</button>`}<button class="btn ghost" data-close>Annuler</button><button class="btn gold" id="sv">Enregistrer</button>`,
      onMount(m, close) {
        m.querySelector('#sv').onclick = () => {
          const f = m.querySelector('form');
          if (!f.reportValidity()) return;
          const d = formData(f);
          const out = Object.assign({}, s, { civilite: d.civilite, prenom: d.prenom, nom: d.nom, naissance: d.naissance, adresse: d.adresse, tel: d.tel, email: d.email, medecin: d.medecin, situation: d.situation, notes: d.notes });
          if (isNew && (d.a_prenom || d.a_nom)) out.aidants = [{ id: S.uid(), prenom: d.a_prenom, nom: d.a_nom, lien: d.a_lien, email: d.a_email, tel: d.a_tel, principal: true }];
          if (isNew && d.medecin) out.intervenants = [{ id: S.uid(), nom: d.medecin, role: 'Médecin traitant', categorie: 'soignant', structure: '', tel: '', email: '' }];
          S.upsert('seniors', out);
          close(); toast('Dossier enregistré');
          go('#/senior/' + out.id);
        };
      }
    });
  }

  function personModal(seniorId, kind, id) {
    const s = S.senior(seniorId);
    const list = kind === 'aidant' ? s.aidants : s.intervenants;
    const p = list.find(x => x.id === id) || { categorie: kind === 'aidant' ? 'aidant' : 'soignant' };
    const isA = kind === 'aidant';
    openModal({
      title: (id ? 'Modifier ' : 'Ajouter ') + (isA ? 'un aidant' : 'un intervenant'),
      body: `<form class="form">${isA ? `
        <div class="f-row"><label class="grow">Prénom<input name="prenom" required value="${esc(p.prenom)}"></label><label class="grow">Nom<input name="nom" value="${esc(p.nom)}"></label></div>
        <div class="f-row"><label class="grow">Lien avec le senior<input name="lien" value="${esc(p.lien)}" placeholder="Fille, fils, voisin…"></label>
        <label class="check"><input type="checkbox" name="principal" ${p.principal ? 'checked' : ''}> Aidant principal</label></div>` : `
        <label>Nom<input name="nom" required value="${esc(p.nom)}"></label>
        <div class="f-row"><label class="grow">Catégorie<select name="categorie" id="pcat"><option value="soignant" ${p.categorie === 'soignant' ? 'selected' : ''}>Soignant</option><option value="non-soignant" ${p.categorie === 'non-soignant' ? 'selected' : ''}>Non soignant</option></select></label>
        <label class="grow">Fonction<input name="role" list="roles" value="${esc(p.role)}"><datalist id="roles">${[...S.ROLES_SOIGNANTS, ...S.ROLES_NON_SOIGNANTS].map(r => `<option value="${esc(r)}">`).join('')}</datalist></label></div>
        <label>Structure<input name="structure" value="${esc(p.structure)}"></label>`}
        <div class="f-row"><label class="grow">E-mail<input type="email" name="email" value="${esc(p.email)}"></label><label class="grow">Téléphone<input type="tel" name="tel" value="${esc(p.tel)}"></label></div>
      </form>`,
      footer: `${id ? '<button class="btn danger ghost left" id="pdel">Retirer</button>' : ''}<button class="btn ghost" data-close>Annuler</button><button class="btn gold" id="psv">Enregistrer</button>`,
      onMount(m, close) {
        m.querySelector('#psv').onclick = () => {
          const f = m.querySelector('form'); if (!f.reportValidity()) return;
          const d = Object.assign(p, formData(f)); d.id = d.id || S.uid();
          if (isA && d.principal) s.aidants.forEach(a => { if (a.id !== d.id) a.principal = false; });
          const i = list.findIndex(x => x.id === d.id); if (i >= 0) list[i] = d; else list.push(d);
          S.upsert('seniors', s); close(); render();
        };
        const del = m.querySelector('#pdel');
        if (del) del.onclick = () => { list.splice(list.findIndex(x => x.id === id), 1); S.upsert('seniors', s); close(); render(); };
      }
    });
  }

  // ======================================================================
  // Dossier senior (onglets)
  // ======================================================================
  let crFilter = 'tous';
  function viewSenior(parts) {
    const s = S.senior(parts[1]);
    if (!s) { main.innerHTML = emptyState('Dossier introuvable.', '<a class="btn" href="#/seniors">Retour</a>'); return; }
    const tab = parts[2] || 'synthese';
    const tabs = [['synthese', 'Synthèse'], ['bilan', 'Bilan partagé'], ['cercle', 'Le Cercle'], ['offre', 'Forfait & coût'], ['cr', 'Comptes rendus'], ['calendrier', 'Calendrier'], ['mails', 'Mails']];
    const b = S.lastBilan(s.id);
    main.innerHTML = `<header class="senior-head">
        <span class="avatar lg">${esc(initials(s))}</span>
        <div class="sh-id"><h1>${esc(s.civilite)} ${esc(s.prenom)} ${esc(s.nom)}</h1>
          <p class="sub">${esc(age(s.naissance))}${b && b.gir ? ' · GIR ' + b.gir : ''}${s.adresse ? ' · ' + esc(s.adresse) : ''}</p></div>
        <div class="head-actions"><a class="btn gold" href="#/rdv/${s.id}">✎ Rendez-vous</a><button class="btn ghost" data-act="edit-senior" data-id="${s.id}">Modifier</button></div>
      </header>
      <nav class="tabs no-print">${tabs.map(([k, l]) => `<a href="#/senior/${s.id}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <div id="tab"></div>`;
    const el = document.getElementById('tab');
    ({ synthese: tabSynthese, bilan: tabBilan, cercle: tabCercle, offre: tabOffre, cr: tabCR, calendrier: tabCalendar, mails: tabMails }[tab] || tabSynthese)(s, el);
  }

  function tabSynthese(s, el) {
    const bl = S.bilansOf(s.id), b = bl[bl.length - 1], prev = bl[bl.length - 2];
    const g = S.scoreGlobal(b), gp = S.scoreGlobal(prev);
    const upcoming = S.interventionsOf(s.id).filter(i => i.statut === 'prevue' && i.date >= today()).slice(0, 5);
    const crs = S.crOf(s.id).slice(0, 4);
    const delta = g != null && gp != null ? Math.round((g - gp) * 10) / 10 : null;
    el.innerHTML = `<div class="grid-2">
      <section class="card hero-card">
        <h2>Indice d'autonomie</h2>
        ${g != null ? `<div class="hero"><span class="hero-v">${g}</span><span class="hero-u">/10</span>
          ${delta != null ? `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲ +' : '▼ '}${delta} depuis le ${fmt(prev.date)}</span>` : ''}</div>
          <p class="muted">Bilan partagé du ${fmt(b.date)}${b.gir ? ' · GIR ' + b.gir : ''}</p>
          <div class="radar-sm">${Ch.radar(S.DOMAINES, [{ values: mapScores(b) }])}</div>`
          : `<p class="muted">Aucun bilan partagé.</p><a class="btn gold" href="#/bilan/${s.id}/new">Réaliser le bilan partagé</a>`}
      </section>
      <section class="card">
        <h2>Prochaines interventions</h2>${upcoming.length ? intList(upcoming) : '<p class="muted">Aucune intervention prévue.</p>'}
        <div class="btn-row"><button class="btn sm ghost" data-act="new-int" data-senior="${s.id}">+ Intervention</button><a class="btn sm ghost" href="#/mon-calendrier/${s.id}">Calendrier du senior</a></div>
      </section>
      <section class="card"><h2>Situation</h2>
        <dl class="dl"><dt>Situation de vie</dt><dd>${nl2br(s.situation) || '—'}</dd>
        <dt>Préférences</dt><dd>${nl2br(s.notes) || '—'}</dd>
        <dt>Formule Up&amp;In</dt><dd>${formuleLine(s)}</dd>
        <dt>Contact</dt><dd>${esc([s.tel, s.email].filter(Boolean).join(' · ')) || '—'}</dd>
        <dt>Aidants</dt><dd>${(s.aidants || []).map(a => `${esc(a.prenom)} ${esc(a.nom)} (${esc(a.lien)}${a.principal ? ', principal' : ''})`).join('<br>') || '—'}</dd></dl>
      </section>
      <section class="card"><h2>Dernières transmissions</h2>${crs.length ? crs.map(crCard).join('') : '<p class="muted">Aucun compte rendu.</p>'}
        <div class="btn-row"><button class="btn sm ghost" data-act="new-cr" data-senior="${s.id}">+ Compte rendu d'intervenant</button></div></section>
    </div>`;
  }
  function mapScores(b) { const o = {}; S.DOMAINES.forEach(d => { o[d.key] = Number(b?.domaines?.[d.key]?.score) || 0; }); return o; }

  // ---------- Bilan partagé ----------
  function tabBilan(s, el, idx) {
    const bl = S.bilansOf(s.id);
    if (!bl.length) {
      el.innerHTML = emptyState('Aucun bilan partagé pour le moment.', `<a class="btn gold" href="#/bilan/${s.id}/new">Réaliser le bilan partagé</a>`);
      return;
    }
    if (idx == null || idx >= bl.length) idx = bl.length - 1;
    const b = bl[idx], prev = bl[idx - 1];
    const g = S.scoreGlobal(b);
    const res = (b.budget?.ressources || []).reduce((a, r) => a + (Number(r.montant) || 0), 0);
    const chg = (b.budget?.charges || []).reduce((a, r) => a + (Number(r.montant) || 0), 0);
    const aidesTot = (b.aides || []).filter(a => a.statut !== 'refusée').reduce((a, r) => a + (Number(r.montant) || 0), 0);
    const actionsOpen = (b.planAction || []).filter(p => p.statut !== 'fait').length;
    el.innerHTML = `
      <div class="print-only print-head"><img src="assets/logo-upandin.jpg" alt="Up&In"><div><h1>Bilan partagé</h1><p>${esc(S.seniorName(s.id, true))} — ${fmtLong(b.date)}</p></div></div>
      <div class="toolbar no-print">
        <label>Bilan du <select id="bsel">${bl.map((x, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${fmt(x.date)}</option>`).join('')}</select></label>
        <span class="spacer"></span>
        <a class="btn ghost sm" href="#/bilan/${s.id}/${b.id}">Modifier</a>
        <a class="btn ghost sm" href="#/bilan/${s.id}/new">+ Nouveau bilan</a>
        <button class="btn ghost sm" data-act="print">⎙ Imprimer / PDF</button>
        <a class="btn gold sm" href="#/mails?senior=${s.id}&tpl=aidants-bilan">✉ Envoyer aux aidants</a>
      </div>
      <section class="kpis">
        ${kpi(g != null ? g + '/10' : '—', "Indice d'autonomie", prev ? `précédent : ${S.scoreGlobal(prev)}/10` : '')}
        ${kpi(b.gir ? 'GIR ' + b.gir : '—', 'Grille AGGIR')}
        ${kpi(actionsOpen, 'Actions en cours')}
        ${kpi(euro(aidesTot), 'Aides obtenues ou demandées')}
        ${kpi(euro(res - chg), 'Solde mensuel', '', res - chg < 0 ? 'alert' : '')}
      </section>
      <div class="grid-2">
        <section class="card"><h2>Profil d'autonomie par domaine</h2>
          ${Ch.radar(S.DOMAINES, [...(prev ? [{ values: mapScores(prev) }] : []), { values: mapScores(b) }])}
          <div class="legend center"><span class="lg"><i class="sw" style="background:#b8892f"></i>Bilan du ${fmt(b.date)}</span>${prev ? `<span class="lg"><i class="sw dashed"></i>Bilan du ${fmt(prev.date)}</span>` : ''}</div>
        </section>
        <section class="card"><h2>Scores détaillés <small>0 = dépendance forte · 10 = pleine autonomie</small></h2>
          ${Ch.bars(S.DOMAINES.map(d => { const v = Number(b.domaines?.[d.key]?.score) || 0; return { label: d.label, value: v, display: v + '/10', color: v <= 4 ? '#b3261e' : v <= 6 ? '#b8892f' : '#10214c' }; }), { max: 10 })}
          <p class="muted small">Couleur : <span class="txt-alert">■</span> ≤ 4 vigilance · <span class="txt-gold">■</span> 5–6 à surveiller · <span class="txt-navy">■</span> ≥ 7 point d'appui</p>
        </section>
      </div>
      ${bl.length > 1 ? `<section class="card"><h2>Évolution de l'indice d'autonomie</h2>${Ch.line(bl.map(x => ({ x: x.date, y: S.scoreGlobal(x) })), { yMin: 0, yMax: 10, unit: '/10', color: '#b8892f', label: "Évolution de l'indice d'autonomie" })}</section>` : ''}
      <div class="grid-3">
        <section class="card"><h2>Synthèse</h2><p>${nl2br(b.synthese) || '—'}</p></section>
        <section class="card"><h2>Besoins identifiés</h2><p>${nl2br(b.besoins) || '—'}</p></section>
        <section class="card"><h2>Recommandations</h2><p>${nl2br(b.recommandations) || '—'}</p></section>
      </div>
      <section class="card"><h2>Observations par domaine</h2>
        <table class="table"><thead><tr><th>Domaine</th><th class="num">Score</th><th class="num">Évol.</th><th>Observations</th></tr></thead><tbody>
        ${S.DOMAINES.map(d => { const v = Number(b.domaines?.[d.key]?.score); const p = prev ? Number(prev.domaines?.[d.key]?.score) : NaN; const dv = isNaN(p) || isNaN(v) ? '' : v - p;
          return `<tr><td>${esc(d.label)}</td><td class="num"><b>${isNaN(v) ? '—' : v}</b>/10</td><td class="num">${dv === '' ? '' : dv > 0 ? `<span class="up">▲ ${dv}</span>` : dv < 0 ? `<span class="down">▼ ${-dv}</span>` : '='}</td><td>${esc(b.domaines?.[d.key]?.commentaire || '')}</td></tr>`; }).join('')}
        </tbody></table></section>
      <section class="card"><h2>Formule Up&amp;In adaptée</h2><p>${formuleLine(s)}</p></section>
      <section class="card"><h2>Plan d'action</h2>
        ${(b.planAction || []).length ? `<table class="table"><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>
        ${b.planAction.map(p => `<tr><td>${esc(p.action)}</td><td>${esc(p.responsable)}</td><td>${fmt(p.echeance)}</td><td><span class="chip ${p.statut === 'fait' ? 'st-faite' : p.statut === 'en cours' ? 'st-reportee' : 'st-prevue'}">${esc(p.statut)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucune action.</p>'}
      </section>
      <div class="grid-2">
        <section class="card"><h2>Aides & financements</h2>
          ${(b.aides || []).length ? `<table class="table"><thead><tr><th>Aide</th><th>Organisme</th><th class="num">Montant</th><th>Statut</th></tr></thead><tbody>
          ${b.aides.map(a => `<tr><td>${esc(a.nom)}</td><td>${esc(a.organisme)}</td><td class="num">${a.montant !== '' ? euro(a.montant) : '—'}</td><td>${esc(a.statut)}</td></tr>`).join('')}
          </tbody><tfoot><tr><td colspan="2">Total (hors refusées)</td><td class="num"><b>${euro(aidesTot)}</b></td><td></td></tr></tfoot></table>` : '<p class="muted">Aucune aide renseignée.</p>'}
        </section>
        <section class="card"><h2>Budget mensuel</h2>
          ${res || chg ? (() => { const bmax = Math.max(1, ...[...(b.budget.charges || []), ...(b.budget.ressources || [])].map(c => Number(c.montant) || 0)); return `<div class="budget-tiles"><div><span>Ressources</span><b>${euro(res)}</b></div><div><span>Charges</span><b>${euro(chg)}</b></div><div class="${res - chg < 0 ? 'neg' : 'pos'}"><span>Solde</span><b>${euro(res - chg)}</b></div></div>
            <h3>Ressources</h3>${Ch.bars((b.budget.ressources || []).map(c => ({ label: c.libelle, value: Number(c.montant) || 0, display: euro(c.montant), color: '#b8892f' })), { max: bmax })}
            <h3>Charges</h3>${Ch.bars((b.budget.charges || []).map(c => ({ label: c.libelle, value: Number(c.montant) || 0, display: euro(c.montant), color: '#10214c' })), { max: bmax })}`; })()
            : '<p class="muted">Budget non renseigné.</p>'}
        </section>
      </div>
      <section class="card print-break"><h2>Le cercle d'accompagnement</h2><div class="cercle-wrap">${Ch.cercle(s)}</div></section>`;
    document.getElementById('bsel').onchange = (e) => tabBilan(s, el, Number(e.target.value));
  }

  function viewBilanEdit(parts) {
    const s = S.senior(parts[1]);
    if (!s) return go('#/seniors');
    const last = S.lastBilan(s.id);
    const isNew = parts[2] === 'new';
    let b = isNew ? JSON.parse(JSON.stringify(last || {})) : S.state.bilans.find(x => x.id === parts[2]);
    if (!b) return go('#/senior/' + s.id + '/bilan');
    if (isNew) { b.id = null; b.date = today(); b.seniorId = s.id; b.auteur = S.state.cabinet.conseiller || 'Up&In'; }
    b.domaines = b.domaines || {}; b.budget = b.budget || { ressources: [], charges: [] };

    main.innerHTML = pageHead(`${isNew ? 'Nouveau bilan partagé' : 'Modifier le bilan'} — ${esc(s.prenom)} ${esc(s.nom)}`, isNew && last ? 'Pré-rempli avec le bilan précédent : ajustez ce qui a changé.' : '') +
      `<form class="form bilan-form" id="fb">
      <section class="card"><div class="f-row">
        <label>Date<input type="date" name="date" value="${esc(b.date)}" required></label>
        <label class="grow">Réalisé par<input name="auteur" value="${esc(b.auteur)}"></label>
        <label>GIR (AGGIR)<select name="gir"><option value="">—</option>${[1, 2, 3, 4, 5, 6].map(g => `<option ${String(b.gir) === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div></section>
      <section class="card"><h2>Évaluation par domaine <small>0 = dépendance forte · 10 = pleine autonomie</small></h2>
        <div class="domain-grid">${S.DOMAINES.map(d => { const v = b.domaines[d.key]?.score ?? 5; return `
          <div class="domain"><div class="domain-top"><b>${esc(d.label)}</b><output id="o-${d.key}">${v}</output></div>
            <input type="range" min="0" max="10" step="1" name="score_${d.key}" value="${v}" oninput="document.getElementById('o-${d.key}').textContent=this.value">
            <textarea name="com_${d.key}" rows="2" placeholder="Observations…">${esc(b.domaines[d.key]?.commentaire || '')}</textarea></div>`; }).join('')}</div>
      </section>
      <section class="card"><h2>Synthèse & préconisations</h2>
        <label>Synthèse<textarea name="synthese" rows="4">${esc(b.synthese)}</textarea></label>
        <label>Besoins identifiés<textarea name="besoins" rows="3">${esc(b.besoins)}</textarea></label>
        <label>Recommandations<textarea name="recommandations" rows="3">${esc(b.recommandations)}</textarea></label>
      </section>
      <section class="card"><h2>Plan d'action</h2>${rowsEditor('planAction', [{ k: 'action', label: 'Action', w: 3 }, { k: 'responsable', label: 'Responsable', w: 2 }, { k: 'echeance', label: 'Échéance', type: 'date', w: 1.4 }, { k: 'statut', label: 'Statut', type: 'select', options: ['à faire', 'en cours', 'fait'], w: 1.2 }], b.planAction)}</section>
      <section class="card"><h2>Aides & financements</h2>${rowsEditor('aides', [{ k: 'nom', label: 'Aide', w: 2.5 }, { k: 'organisme', label: 'Organisme', w: 2 }, { k: 'montant', label: 'Montant €', type: 'number', w: 1.2 }, { k: 'statut', label: 'Statut', type: 'select', options: ['à étudier', 'demandée', 'obtenue', 'refusée'], w: 1.3 }], b.aides)}</section>
      <div class="grid-2">
        <section class="card"><h2>Ressources mensuelles</h2>${rowsEditor('ressources', [{ k: 'libelle', label: 'Libellé', w: 2 }, { k: 'montant', label: 'Montant €', type: 'number', w: 1 }], b.budget.ressources)}</section>
        <section class="card"><h2>Charges mensuelles</h2>${rowsEditor('charges', [{ k: 'libelle', label: 'Libellé', w: 2 }, { k: 'montant', label: 'Montant €', type: 'number', w: 1 }], b.budget.charges)}</section>
      </div>
      <div class="sticky-actions"><a class="btn ghost" href="#/senior/${s.id}/bilan">Annuler</a>${!isNew ? '<button type="button" class="btn danger ghost" id="bdel">Supprimer</button>' : ''}<button type="submit" class="btn gold">Enregistrer le bilan</button></div>
    </form>`;
    const f = document.getElementById('fb');
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = formData(f);
      const out = {
        id: b.id || S.uid(), seniorId: s.id, date: d.date, auteur: d.auteur, gir: d.gir ? Number(d.gir) : '',
        domaines: Object.fromEntries(S.DOMAINES.map(dm => [dm.key, { score: Number(d['score_' + dm.key]), commentaire: d['com_' + dm.key] }])),
        synthese: d.synthese, besoins: d.besoins, recommandations: d.recommandations,
        planAction: collectRows(f, 'planAction'), aides: collectRows(f, 'aides'),
        budget: { ressources: collectRows(f, 'ressources'), charges: collectRows(f, 'charges') }
      };
      S.upsert('bilans', out);
      toast('Bilan partagé enregistré');
      go(`#/senior/${s.id}/bilan`);
    };
    const del = document.getElementById('bdel');
    if (del) del.onclick = () => confirmBox('Supprimer ce bilan partagé ?', () => { S.remove('bilans', b.id); go(`#/senior/${s.id}/bilan`); });
  }

  // ---------- Le Cercle ----------
  function tabCercle(s, el) {
    const people = (list, kind) => list.map(p => `<li><button class="person" data-act="person" data-senior="${s.id}" data-kind="${kind}" data-id="${p.id}">
      <span class="dot cat-bg-${esc(kind === 'aidant' ? 'aidant' : p.categorie)}"></span>
      <span><b>${esc(kind === 'aidant' ? p.prenom + ' ' + p.nom : p.nom)}</b>${p.principal ? ' <span class="chip st-transmis">principal</span>' : ''}<br>
      <span class="muted">${esc(kind === 'aidant' ? p.lien : p.role)}${p.structure ? ' · ' + esc(p.structure) : ''}</span><br>
      <span class="muted small">${esc([p.tel, p.email].filter(Boolean).join(' · '))}</span></span></button></li>`).join('');
    el.innerHTML = `<div class="grid-cercle">
      <section class="card"><h2>Le cercle d'accompagnement</h2><div class="cercle-wrap">${Ch.cercle(s)}</div></section>
      <div>
        <section class="card"><h2>Aidants</h2><ul class="people">${people(s.aidants || [], 'aidant') || '<li class="muted">Aucun aidant.</li>'}</ul>
          <button class="btn sm ghost" data-act="person" data-senior="${s.id}" data-kind="aidant">+ Aidant</button></section>
        <section class="card"><h2>Intervenants soignants</h2><ul class="people">${people((s.intervenants || []).filter(i => i.categorie === 'soignant'), 'intervenant') || '<li class="muted">Aucun.</li>'}</ul>
          <button class="btn sm ghost" data-act="person" data-senior="${s.id}" data-kind="intervenant">+ Intervenant</button></section>
        <section class="card"><h2>Intervenants non soignants</h2><ul class="people">${people((s.intervenants || []).filter(i => i.categorie !== 'soignant'), 'intervenant') || '<li class="muted">Aucun.</li>'}</ul>
          <button class="btn sm ghost" data-act="person" data-senior="${s.id}" data-kind="intervenant">+ Intervenant</button></section>
      </div></div>`;
  }

  // ---------- Forfait & coût ----------
  function formuleShort(s) {
    const sel = window.Offre.selection(s);
    const f = sel && S.state.offre.forfaits.find(x => x.id === sel.forfaitId);
    return f ? ` · ${esc(f.nom)}${sel.source === 'retenue' ? '' : ' (conseillé)'}` : '';
  }
  function formuleLine(s) {
    const O = window.Offre, sel = O.selection(s);
    if (!sel) return '<span class="muted">À déterminer après le bilan partagé</span>';
    const r = O.compute(sel);
    if (!r.forfait) return '—';
    return `<a href="#/senior/${s.id}/offre">${esc(r.forfait.nom)}${r.lignes.length ? ` + ${r.lignes.length} option(s)` : ''}</a> — <b>${O.euro(r.mensuel)}/mois</b>, ${O.euro(r.premiereAnnee)} la première année
      ${sel.source === 'retenue' ? `<span class="chip ${sel.statut === 'acceptée' ? 'st-faite' : 'st-prevue'}">${esc(sel.statut || 'proposée')}</span>` : '<span class="chip st-transmis">recommandée</span>'}`;
  }

  function tabOffre(s, el, override) {
    const O = window.Offre, c = S.state.offre;
    const rec = O.recommend(s);
    const base = override || O.selection(s) || { forfaitId: (c.forfaits[0] || {}).id, options: [], remise: 0, statut: 'proposée', source: 'manuelle' };
    const sel = JSON.parse(JSON.stringify(base));
    const recOpt = (id) => rec && rec.options.find(o => o.option.id === id);
    const chosen = (id) => sel.options.find(o => o.id === id);
    el.innerHTML = `
      <div class="print-only print-head"><img src="assets/logo-upandin.jpg" alt="Up&In"><div><h1>Proposition d'accompagnement</h1><p>${esc(S.seniorName(s.id, true))} — ${fmtLong(today())}</p></div></div>
      <div class="toolbar no-print">
        <span class="chip ${sel.source === 'retenue' ? 'st-faite' : 'st-transmis'}">${sel.source === 'retenue' ? 'Formule enregistrée' : sel.source === 'recommandee' ? 'Recommandation automatique (non enregistrée)' : 'Saisie manuelle'}</span>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-act="print">⎙ Imprimer / PDF</button>
        <a class="btn gold sm" href="#/mails?senior=${s.id}&tpl=aidants-offre">✉ Envoyer aux aidants</a>
      </div>
      <div class="grid-offre"><div>
        <section class="card reco"><h2>Recommandation</h2>
          ${rec ? `<p>D'après le bilan partagé du ${fmt(rec.bilanDate)}, le forfait le plus adapté est <b class="reco-name">${esc(rec.forfait.nom)}</b>${rec.options.length ? `, avec ${rec.options.length} option(s) utile(s)` : ''}.</p>
            <ul class="reasons">${rec.raisons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <button type="button" class="btn sm ghost no-print" id="apply-rec">Appliquer la recommandation</button>`
            : `<p class="muted">Réalisez le bilan partagé pour obtenir une recommandation automatique.</p><a class="btn sm gold no-print" href="#/bilan/${s.id}/new">Réaliser le bilan partagé</a>`}
        </section>
        <section class="card"><h2>Forfait</h2>
          <div class="forfaits">${c.forfaits.map(f => `<label class="forfait ${f.id === sel.forfaitId ? 'on' : ''}">
            <input type="radio" name="forfait" value="${esc(f.id)}" ${f.id === sel.forfaitId ? 'checked' : ''}>
            <span class="ff-top"><b>${esc(f.nom)}</b>${rec && rec.forfait && rec.forfait.id === f.id ? '<span class="chip st-transmis">★ Recommandé</span>' : ''}</span>
            <span class="ff-prix">${O.euro(f.prix)}<small> / mois</small></span>
            <span class="ff-desc">${esc(f.description)}</span></label>`).join('') || '<p class="muted">Aucun forfait : définissez votre grille dans Réglages.</p>'}</div>
        </section>
        <section class="card"><h2>Options <small>les options conseillées découlent des domaines fragiles du bilan</small></h2>
          <table class="table opt-table"><thead><tr><th></th><th>Option</th><th>Tarif</th><th class="num">Qté / mois</th><th class="num">Sous-total</th></tr></thead><tbody>
          ${c.options.map(o => { const ch = chosen(o.id), ro = recOpt(o.id); return `<tr class="${ch ? 'on' : ''}">
            <td><input type="checkbox" data-opt="${esc(o.id)}" ${ch ? 'checked' : ''} aria-label="${esc(o.nom)}"></td>
            <td><b>${esc(o.nom)}</b>${ro ? ` <span class="chip st-transmis">Conseillé · ${esc(ro.raison)}</span>` : ''}<br><span class="muted small">${esc(o.description)}</span></td>
            <td class="small">${O.euro(o.prix)} ${o.unite === 'mois' ? '/ mois' : o.unite === 'séance' ? '/ séance' : 'une fois'}</td>
            <td class="num">${o.unite === 'mois' ? '—' : `<input type="number" class="qty" min="1" step="1" inputmode="numeric" data-q="${esc(o.id)}" value="${esc(ch ? ch.quantite : o.quantiteDefaut || 1)}">`}</td>
            <td class="num" data-sub="${esc(o.id)}"></td></tr>`; }).join('')}
          </tbody></table>
        </section>
        <section class="card"><h2>Conditions</h2><div class="form"><div class="f-row">
          <label>Remise (%)<input type="number" min="0" max="100" step="1" id="o-remise" value="${esc(sel.remise || 0)}"></label>
          <label>Statut<select id="o-statut">${['proposée', 'acceptée', 'refusée'].map(x => `<option ${x === sel.statut ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Début<input type="date" id="o-debut" value="${esc(sel.dateDebut || '')}"></label></div>
          <label>Notes<textarea id="o-notes" rows="2">${esc(sel.notes || '')}</textarea></label></div>
        </section>
      </div>
      <aside class="card totals" id="offre-totals"></aside></div>
      <div class="sticky-actions no-print">${s.offre ? '<button type="button" class="btn danger ghost" id="o-reset">Effacer la formule enregistrée</button>' : ''}<button type="button" class="btn gold" id="o-save">Enregistrer la formule</button></div>`;

    const read = () => {
      const f = el.querySelector('input[name=forfait]:checked');
      sel.forfaitId = f ? f.value : null;
      sel.options = [...el.querySelectorAll('[data-opt]:checked')].map(i => {
        const q = el.querySelector(`[data-q="${i.dataset.opt}"]`);
        return { id: i.dataset.opt, quantite: q ? Math.max(1, Number(q.value) || 1) : 1 };
      });
      sel.remise = Math.min(100, Math.max(0, Number(el.querySelector('#o-remise').value) || 0));
      sel.statut = el.querySelector('#o-statut').value;
      sel.dateDebut = el.querySelector('#o-debut').value;
      sel.notes = el.querySelector('#o-notes').value.trim();
    };
    const update = () => {
      read();
      const r = O.compute(sel);
      el.querySelectorAll('.forfait').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
      el.querySelectorAll('.opt-table tbody tr').forEach(tr => tr.classList.toggle('on', tr.querySelector('[data-opt]').checked));
      el.querySelectorAll('[data-sub]').forEach(td => {
        const l = r.lignes.find(x => x.id === td.dataset.sub);
        td.innerHTML = l ? `<b>${O.euro(l.mensuel || l.unique)}</b>${l.unique ? '<br><span class="muted small">une fois</span>' : ''}` : '<span class="muted">—</span>';
      });
      const comp = [{ label: 'Forfait ' + (r.forfait ? r.forfait.nom : ''), value: r.forfaitMensuel, display: O.euro(r.forfaitMensuel), color: '#10214c' }]
        .concat(r.lignes.filter(l => l.mensuel).map(l => ({ label: l.nom, value: l.mensuel, display: O.euro(l.mensuel), color: '#b8892f' })));
      el.querySelector('#offre-totals').innerHTML = `<h2>Coût total</h2>
        <dl class="tot">
          <dt>Forfait ${esc(r.forfait ? r.forfait.nom : '—')}</dt><dd>${O.euro(r.forfaitMensuel)}</dd>
          <dt>Options mensuelles</dt><dd>${O.euro(r.optMensuel)}</dd>
          ${r.remise ? `<dt>Remise ${sel.remise} %</dt><dd>−${O.euro(r.remise)}</dd>` : ''}
          <dt class="strong">Total mensuel</dt><dd class="big">${O.euro(r.mensuel)}</dd>
          <dt>Frais de mise en place</dt><dd>${O.euro(r.fraisMiseEnPlace)}</dd>
          ${r.unique - r.fraisMiseEnPlace ? `<dt>Options ponctuelles</dt><dd>${O.euro(r.unique - r.fraisMiseEnPlace)}</dd>` : ''}
          <dt class="strong">Coût total 1<sup>re</sup> année</dt><dd class="big gold">${O.euro(r.premiereAnnee)}</dd>
          ${r.credit ? `<dt>Crédit d'impôt estimé (${c.creditImpot} %)</dt><dd>−${O.euro(r.credit)}</dd><dt class="strong">Reste à charge 1<sup>re</sup> année</dt><dd class="big">${O.euro(r.net)}</dd>` : ''}
        </dl>
        <h3>Composition du coût mensuel</h3>${Ch.bars(comp)}
        <p class="muted small">${esc(c.mention || '')}</p>`;
    };
    el.addEventListener('input', update);
    el.addEventListener('change', update);
    update();
    const ar = el.querySelector('#apply-rec');
    if (ar) ar.onclick = () => tabOffre(s, el, { forfaitId: rec.forfait.id, options: rec.options.map(o => ({ id: o.option.id, quantite: Number(o.option.quantiteDefaut) || 1 })), remise: sel.remise, statut: sel.statut, dateDebut: sel.dateDebut, notes: sel.notes, source: 'recommandee' });
    el.querySelector('#o-save').onclick = () => {
      read();
      if (!sel.forfaitId) return toast('Choisissez un forfait');
      s.offre = { forfaitId: sel.forfaitId, options: sel.options, remise: sel.remise, statut: sel.statut, dateDebut: sel.dateDebut, notes: sel.notes, majLe: today() };
      S.upsert('seniors', s); toast('Formule enregistrée — elle figurera dans chaque mail aux aidants'); render();
    };
    const rs = el.querySelector('#o-reset');
    if (rs) rs.onclick = () => confirmBox('Effacer la formule enregistrée ? Les mails reprendront la recommandation automatique.', () => { delete s.offre; S.upsert('seniors', s); render(); }, 'Effacer');
  }

  // ---------- Comptes rendus ----------
  function crCard(c) {
    return `<article class="cr cat-line-${esc(c.categorie)}">
      <header><b>${esc(c.titre || 'Compte rendu')}</b> ${catBadge(c.categorie)} <span class="muted">· ${fmt(c.date)} · ${esc(c.auteur)}${c.role ? ' (' + esc(c.role) + ')' : ''}</span>
        <span class="mode">${{ pendant: 'Saisi pendant le RDV', apres: 'Saisi après le RDV (notes papier)', import: 'Importé', collage: 'Transmis par message' }[c.mode] || ''}</span>
        <button class="icon-btn sm right no-print" data-act="edit-cr" data-id="${c.id}" aria-label="Modifier">✎</button></header>
      <p>${nl2br(c.contenu)}</p>
      ${c.observations ? `<p class="muted"><b>Observations :</b> ${nl2br(c.observations)}</p>` : ''}
      ${c.alertes ? `<p class="alert-line">! ${esc(c.alertes)}</p>` : ''}
      ${indicLine(c.indicateurs)}
      ${(c.photos || []).length ? `<div class="thumbs">${c.photos.map((p, i) => p.type.startsWith('image/') ? `<img src="${p.data}" alt="${esc(p.name)}" data-act="view-cr-file" data-cr="${c.id}" data-i="${i}">` : `<span class="pdf" data-act="view-cr-file" data-cr="${c.id}" data-i="${i}">PDF</span>`).join('')}</div>` : ''}
    </article>`;
  }
  function indicLine(ind) {
    if (!ind) return '';
    const parts = [];
    if (ind.poids) parts.push(`Poids ${ind.poids} kg`);
    if (ind.tas) parts.push(`Tension ${ind.tas}/${ind.tad || '?'}`);
    if (ind.douleur !== undefined && ind.douleur !== '') parts.push(`Douleur ${ind.douleur}/10`);
    if (ind.humeur) parts.push(`Humeur ${ind.humeur}/5`);
    if (ind.appetit) parts.push(`Appétit ${ind.appetit}/5`);
    if (ind.sommeil) parts.push(`Sommeil ${ind.sommeil}/5`);
    return parts.length ? `<p class="indic">${parts.map(esc).join(' · ')}</p>` : '';
  }

  function tabCR(s, el) {
    const all = S.crOf(s.id);
    const list = crFilter === 'tous' ? all : all.filter(c => c.categorie === crFilter);
    const series = (k) => all.filter(c => c.indicateurs && c.indicateurs[k] !== undefined && c.indicateurs[k] !== '').map(c => ({ x: c.date, y: c.indicateurs[k], label: c.auteur }));
    el.innerHTML = `<div class="toolbar no-print">
        <div class="seg">${[['tous', 'Tous'], ['soignant', 'Soignants'], ['non-soignant', 'Non soignants'], ['aidant', 'Aidants'], ['upin', 'Up&In']].map(([k, l]) => `<button class="${crFilter === k ? 'on' : ''}" data-act="cr-filter" data-f="${k}">${l}</button>`).join('')}</div>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-act="paste-cr" data-senior="${s.id}">Coller un message reçu</button>
        <button class="btn gold sm" data-act="new-cr" data-senior="${s.id}">+ Compte rendu</button>
      </div>
      <section class="card"><h2>Indicateurs transmis par les intervenants</h2>
        <div class="grid-3 small-multiples">
          <div><h3>Poids (kg)</h3>${Ch.line(series('poids'), { unit: ' kg', label: 'Évolution du poids' })}</div>
          <div><h3>Tension systolique</h3>${Ch.line(series('tas'), { label: 'Tension systolique' })}</div>
          <div><h3>Douleur (0–10)</h3>${Ch.line(series('douleur'), { yMin: 0, yMax: 10, unit: '/10', label: 'Douleur' })}</div>
        </div></section>
      <section class="timeline">${list.length ? list.map(crCard).join('') : '<p class="muted">Aucun compte rendu.</p>'}</section>`;
  }

  function crModal(cr, preset) {
    const isNew = !cr;
    cr = cr || Object.assign({ date: today(), categorie: 'soignant', mode: 'saisie', indicateurs: {}, photos: [] }, preset || {});
    const ind = cr.indicateurs || {};
    const peopleOpts = (s) => s ? [...(s.intervenants || []).map(i => ({ nom: i.nom, role: i.role, categorie: i.categorie })), ...(s.aidants || []).map(a => ({ nom: `${a.prenom} ${a.nom}`, role: a.lien, categorie: 'aidant' }))] : [];
    openModal({
      title: isNew ? "Intégrer un compte rendu d'intervenant" : 'Modifier le compte rendu', wide: true,
      body: `<form class="form">
        <div class="f-row"><label class="grow">Senior<select name="seniorId" id="cr-s" required>${seniorOptions(cr.seniorId)}</select></label>
          <label>Date<input type="date" name="date" value="${esc(cr.date)}" required></label></div>
        <div class="f-row"><label class="grow">Intervenant<input name="auteur" list="cr-people" value="${esc(cr.auteur)}" required placeholder="Nom de l'intervenant"><datalist id="cr-people"></datalist></label>
          <label class="grow">Fonction<input name="role" list="roles2" value="${esc(cr.role)}"><datalist id="roles2">${[...S.ROLES_SOIGNANTS, ...S.ROLES_NON_SOIGNANTS].map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
          <label>Catégorie<select name="categorie">${Object.entries(S.CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === cr.categorie ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>
        <label>Titre<input name="titre" value="${esc(cr.titre)}" placeholder="Passage infirmier, consultation, visite…"></label>
        <label>Compte rendu<textarea name="contenu" rows="5" required>${esc(cr.contenu)}</textarea></label>
        <label>Observations<textarea name="observations" rows="2">${esc(cr.observations)}</textarea></label>
        <label>Point de vigilance (sera signalé en alerte)<input name="alertes" value="${esc(cr.alertes)}"></label>
        <fieldset class="indics"><legend>Indicateurs (facultatif)</legend>
          <label>Poids kg<input name="poids" inputmode="decimal" value="${esc(ind.poids)}"></label>
          <label>Tension sys.<input name="tas" inputmode="decimal" value="${esc(ind.tas)}" placeholder="13"></label>
          <label>Tension dia.<input name="tad" inputmode="decimal" value="${esc(ind.tad)}" placeholder="8"></label>
          <label>Douleur /10<input name="douleur" inputmode="numeric" value="${esc(ind.douleur)}"></label>
          <label>Humeur /5<input name="humeur" inputmode="numeric" value="${esc(ind.humeur)}"></label>
          <label>Appétit /5<input name="appetit" inputmode="numeric" value="${esc(ind.appetit)}"></label>
          <label>Sommeil /5<input name="sommeil" inputmode="numeric" value="${esc(ind.sommeil)}"></label>
        </fieldset>
        <h3>Documents transmis (ordonnance, photo de fiche de liaison, PDF…)</h3>${attachHtml()}
      </form>`,
      footer: `${isNew ? '' : '<button class="btn danger ghost left" id="crdel">Supprimer</button>'}<button class="btn ghost" data-close>Annuler</button><button class="btn gold" id="crsv">Enregistrer</button>`,
      onMount(m, close) {
        initAttach(m, cr.photos);
        const sel = m.querySelector('#cr-s'), dl = m.querySelector('#cr-people');
        const fill = () => { const list = peopleOpts(S.senior(sel.value)); dl.innerHTML = list.map(p => `<option value="${esc(p.nom)}">${esc(p.role)}</option>`).join(''); dl._list = list; };
        fill(); sel.onchange = fill;
        m.querySelector('[name=auteur]').addEventListener('change', (e) => {
          const p = (dl._list || []).find(x => x.nom === e.target.value);
          if (p) { m.querySelector('[name=role]').value = p.role || ''; m.querySelector('[name=categorie]').value = p.categorie; }
        });
        m.querySelector('#crsv').onclick = () => {
          const f = m.querySelector('form'); if (!f.reportValidity()) return;
          const d = formData(f);
          const num = (v) => v === '' ? '' : Number(String(v).replace(',', '.'));
          const out = Object.assign(cr, {
            seniorId: d.seniorId, date: d.date, auteur: d.auteur, role: d.role, categorie: d.categorie, titre: d.titre,
            contenu: d.contenu, observations: d.observations, alertes: d.alertes, photos: getAttach(m),
            indicateurs: Object.fromEntries(['poids', 'tas', 'tad', 'douleur', 'humeur', 'appetit', 'sommeil'].map(k => [k, num(d[k])]).filter(([, v]) => v !== '' && !isNaN(v)))
          });
          S.upsert('comptesRendus', out); close(); toast('Compte rendu intégré au dossier'); render();
        };
        const del = m.querySelector('#crdel');
        if (del) del.onclick = () => { S.remove('comptesRendus', cr.id); close(); render(); };
      }
    });
  }

  // Lecture d'un message libre (mail / SMS d'un intervenant) → compte rendu structuré
  function parseMessage(txt) {
    const ind = {};
    const g = (re) => { const m = txt.match(re); return m ? m[1].replace(',', '.') : null; };
    const poids = g(/poids\s*[:=]?\s*(\d{2,3}(?:[.,]\d)?)/i); if (poids) ind.poids = Number(poids);
    const ta = txt.match(/(?:tension|TA)\s*[:=]?\s*(\d{2,3})\s*[/-]\s*(\d{1,3})/i);
    if (ta) { let sys = Number(ta[1]), dia = Number(ta[2]); if (sys > 30) { sys = sys / 10; dia = dia / 10; } ind.tas = sys; ind.tad = dia; }
    const dl = g(/douleur\s*[:=]?\s*(\d{1,2})/i); if (dl) ind.douleur = Number(dl);
    const vig = txt.match(/(?:vigilance|alerte|attention|inquiet\w*)\s*[:\-]?\s*([^\n]+)/i);
    const date = txt.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
    let iso = null;
    if (date) { const y = date[3].length === 2 ? '20' + date[3] : date[3]; iso = `${y}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`; }
    return { indicateurs: ind, alertes: vig ? vig[1].trim() : '', date: iso };
  }
  function pasteModal(seniorId) {
    openModal({
      title: 'Intégrer un message reçu d\'un intervenant',
      body: `<form class="form">
        <p class="muted">Collez le texte d'un mail ou d'un SMS. Le Cercle repère automatiquement la date, le poids, la tension, la douleur et les points de vigilance ; vous vérifiez avant d'enregistrer.</p>
        <label>Senior<select name="seniorId">${seniorOptions(seniorId)}</select></label>
        <label>Message<textarea name="msg" rows="9" placeholder="Ex. : Passage du 14/10 — tension 13/8, poids 60,5. Douleur 3. Attention : chaussons usés, risque de chute."></textarea></label>
      </form>`,
      footer: `<button class="btn ghost" data-close>Annuler</button><button class="btn gold" id="pgo">Analyser et vérifier</button>`,
      onMount(m, close) {
        m.querySelector('#pgo').onclick = () => {
          const d = formData(m.querySelector('form'));
          if (!d.msg) return toast('Collez d\'abord un message');
          const p = parseMessage(d.msg);
          close();
          crModal(null, { seniorId: d.seniorId, contenu: d.msg, mode: 'collage', indicateurs: p.indicateurs, alertes: p.alertes, date: p.date || today() });
        };
      }
    });
  }

  // ---------- Calendrier (onglet senior) ----------
  function tabCalendar(s, el) {
    const all = S.interventionsOf(s.id);
    const t = today();
    const fut = all.filter(i => i.date >= t), past = all.filter(i => i.date < t).reverse();
    const counts = (st) => all.filter(i => i.date < t && i.statut === st).length;
    el.innerHTML = `<div class="toolbar no-print"><span class="spacer"></span>
        <a class="btn ghost sm" href="#/calendrier?senior=${s.id}">Vue mensuelle</a>
        <a class="btn ghost sm" href="#/mon-calendrier/${s.id}">◱ Version senior</a>
        <button class="btn gold sm" data-act="new-int" data-senior="${s.id}">+ Intervention</button></div>
      <section class="card"><h2>Suivi des interventions passées</h2>
        ${Ch.stack([{ label: 'Réalisées', value: counts('faite'), cls: 'st-faite' }, { label: 'Reportées', value: counts('reportee'), cls: 'st-reportee' }, { label: 'Annulées', value: counts('annulee'), cls: 'st-annulee' }, { label: 'Non renseignées', value: counts('prevue'), cls: 'st-prevue' }])}
      </section>
      <div class="grid-2">
        <section class="card"><h2>À venir</h2>${fut.length ? intList(fut, false, false) : '<p class="muted">Aucune intervention prévue.</p>'}</section>
        <section class="card"><h2>Historique</h2>${past.length ? intList(past, false, true) : '<p class="muted">Aucun historique.</p>'}
          ${past.some(i => i.statut === 'faite' && !i.transmis) ? `<button class="btn gold sm" data-act="transmit" data-senior="${s.id}">✉ Transmettre les comptes rendus aux aidants</button>` : ''}</section>
      </div>`;
  }

  function tabMails(s, el) {
    const groups = { senior: 'Pour le senior', aidants: 'Pour les aidants', intervenants: 'Pour les intervenants' };
    el.innerHTML = Object.entries(groups).map(([k, l]) => `<section class="card"><h2>${l}</h2><div class="mail-tiles">
      ${Object.entries(M.TEMPLATES).filter(([, t]) => t.cible === k).map(([id, t]) => `<a class="mail-tile" href="#/mails?senior=${s.id}&tpl=${id}"><span>✉</span>${esc(t.label)}</a>`).join('')}</div></section>`).join('') +
      `<section class="card"><h2>Historique des envois</h2>${mailLog(s.id)}</section>`;
  }
  function mailLog(sid) {
    const l = S.state.mailsLog.filter(x => !sid || x.seniorId === sid).slice(-30).reverse();
    return l.length ? `<table class="table"><thead><tr><th>Date</th><th>Senior</th><th>Objet</th><th>Destinataires</th></tr></thead><tbody>${l.map(x => `<tr><td>${fmt(x.date)}</td><td>${esc(S.seniorName(x.seniorId))}</td><td>${esc(x.subject)}</td><td class="small">${esc(x.to.join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun mail envoyé.</p>';
  }

  // ======================================================================
  // Interventions
  // ======================================================================
  function interventionModal(it, preset) {
    const isNew = !it;
    it = it || Object.assign({ date: today(), heure: '', duree: 60, statut: 'prevue', categorie: 'soignant', lieu: 'Domicile' }, preset || {});
    if (!it.seniorId && S.state.seniors.length === 1) it.seniorId = S.state.seniors[0].id;
    if (!S.state.seniors.length) { toast("Créez d'abord le dossier d'un senior"); return; }
    openModal({
      title: isNew ? 'Nouvelle intervention' : 'Intervention', wide: true,
      body: `<form class="form">
        <div class="f-row"><label class="grow">Senior<select name="seniorId" id="i-s" required><option value="">—</option>${seniorOptions(it.seniorId)}</select></label>
          <label>Date<input type="date" name="date" value="${esc(it.date)}" required></label>
          <label>Heure<input type="time" name="heure" value="${esc(it.heure)}"></label>
          <label>Durée (min)<input name="duree" inputmode="numeric" value="${esc(it.duree)}" size="4"></label></div>
        <div class="f-row"><label class="grow">Intervention<input name="type" required value="${esc(it.type)}" placeholder="Séance de kiné, passage infirmier, visite…"></label>
          <label class="grow">Lieu<input name="lieu" value="${esc(it.lieu)}"></label></div>
        <div class="f-row"><label class="grow">Avec qui<input name="intervenant" list="i-people" value="${esc(it.intervenant)}" placeholder="Choisir dans le cercle ou saisir"><datalist id="i-people"></datalist></label>
          <label class="grow">Fonction<input name="role" list="roles3" value="${esc(it.role)}"><datalist id="roles3">${[...S.ROLES_SOIGNANTS, ...S.ROLES_NON_SOIGNANTS].map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
          <label>Catégorie<select name="categorie">${Object.entries(S.CATEGORIES).map(([k, v]) => `<option value="${k}" ${k === it.categorie ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>
        <label>Pourquoi (expliqué simplement au senior)<input name="motif" value="${esc(it.motif)}" placeholder="Ex. : rééducation à l'équilibre"></label>
        <div class="f-row"><label>Statut<select name="statut">${Object.entries(S.STATUTS).map(([k, v]) => `<option value="${k}" ${k === it.statut ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          ${isNew ? `<label>Répéter chaque semaine<select name="repeat"><option value="0">Non</option>${[2, 3, 4, 6, 8, 12].map(n => `<option value="${n}">${n} semaines</option>`).join('')}</select></label>` : ''}
          ${it.transmis ? `<p class="chip st-transmis">✉ Transmis aux aidants le ${fmt(it.transmis)}</p>` : ''}</div>
        <label>Court compte rendu (à transmettre aux aidants)<textarea name="cr" rows="3" placeholder="Ce qui a été fait, comment cela s'est passé…">${esc(it.cr)}</textarea></label>
        <label class="check"><input type="checkbox" name="addcr" ${isNew ? '' : 'checked'}> Ajouter aussi ce compte rendu au fil des transmissions du senior</label>
      </form>`,
      footer: `${isNew ? '' : '<button class="btn danger ghost left" id="idel">Supprimer</button>'}<button class="btn ghost" data-close>Annuler</button><button class="btn" id="isv2">Enregistrer et transmettre</button><button class="btn gold" id="isv">Enregistrer</button>`,
      onMount(m, close) {
        const sel = m.querySelector('#i-s'), dl = m.querySelector('#i-people');
        const fill = () => {
          const s = S.senior(sel.value); const list = s ? (s.intervenants || []).map(i => ({ nom: i.nom, role: i.role, categorie: i.categorie })) : [];
          list.push({ nom: S.state.cabinet.conseiller || 'Up&In', role: 'Coordinateur Up&In', categorie: 'upin' });
          dl.innerHTML = list.map(p => `<option value="${esc(p.nom)}">${esc(p.role)}</option>`).join(''); dl._list = list;
        };
        fill(); sel.onchange = fill;
        m.querySelector('[name=intervenant]').addEventListener('change', (e) => {
          const p = (dl._list || []).find(x => x.nom === e.target.value);
          if (p) { m.querySelector('[name=role]').value = p.role || ''; m.querySelector('[name=categorie]').value = p.categorie; }
        });
        const save = (transmit) => {
          const f = m.querySelector('form'); if (!f.reportValidity()) return;
          const d = formData(f);
          const base = Object.assign(it, { seniorId: d.seniorId, date: d.date, heure: d.heure, duree: Number(d.duree) || '', type: d.type, lieu: d.lieu, intervenant: d.intervenant, role: d.role, categorie: d.categorie, motif: d.motif, statut: d.statut, cr: d.cr });
          S.upsert('interventions', base);
          const reps = Number(d.repeat || 0);
          for (let k = 1; k < reps; k++) {
            S.upsert('interventions', Object.assign({}, base, { id: S.uid(), date: M.addDays(base.date, 7 * k), statut: 'prevue', cr: '', transmis: null }));
          }
          if (d.addcr && d.cr) {
            const existing = S.state.comptesRendus.find(c => c.interventionId === base.id);
            S.upsert('comptesRendus', Object.assign(existing || { photos: [], indicateurs: {}, mode: 'saisie' }, { seniorId: base.seniorId, interventionId: base.id, date: base.date, auteur: base.intervenant, role: base.role, categorie: base.categorie, titre: base.type, contenu: d.cr }));
          }
          close(); toast(reps > 1 ? `${reps} interventions planifiées` : 'Intervention enregistrée');
          if (transmit) go(`#/mails?senior=${base.seniorId}&tpl=aidants-interventions&ids=${base.id}`); else render();
        };
        m.querySelector('#isv').onclick = () => save(false);
        m.querySelector('#isv2').onclick = () => save(true);
        const del = m.querySelector('#idel');
        if (del) del.onclick = () => { S.remove('interventions', it.id); close(); render(); };
      }
    });
  }

  function quickDone(id) {
    const it = S.state.interventions.find(i => i.id === id);
    openModal({
      title: `Réalisée — ${it.type}`,
      body: `<form class="form"><p class="muted">${fmtLong(it.date)} · ${esc(S.seniorName(it.seniorId))} · ${esc(it.intervenant)}</p>
        <label>Court compte rendu<textarea name="cr" rows="4" placeholder="Comment cela s'est-il passé ?">${esc(it.cr)}</textarea></label></form>`,
      footer: `<button class="btn ghost" data-close>Annuler</button><button class="btn" id="qd2">Enregistrer et transmettre</button><button class="btn gold" id="qd">Enregistrer</button>`,
      onMount(m, close) {
        const save = (tr) => {
          it.statut = 'faite'; it.cr = formData(m.querySelector('form')).cr;
          S.upsert('interventions', it);
          if (it.cr) S.upsert('comptesRendus', Object.assign(S.state.comptesRendus.find(c => c.interventionId === it.id) || { photos: [], indicateurs: {}, mode: 'saisie' },
            { seniorId: it.seniorId, interventionId: it.id, date: it.date, auteur: it.intervenant, role: it.role, categorie: it.categorie, titre: it.type, contenu: it.cr }));
          close(); toast('Intervention marquée comme réalisée');
          if (tr) go(`#/mails?senior=${it.seniorId}&tpl=aidants-interventions&ids=${it.id}`); else render();
        };
        m.querySelector('#qd').onclick = () => save(false);
        m.querySelector('#qd2').onclick = () => save(true);
      }
    });
  }

  // ======================================================================
  // Calendrier général
  // ======================================================================
  const calState = (() => {
    const d = new Date();
    let view = 'mois';
    try { view = localStorage.getItem('lc-cal-view') || (window.innerWidth < 760 ? 'liste' : 'mois'); } catch (e) { /* facultatif */ }
    return { month: d.getMonth(), year: d.getFullYear(), view };
  })();

  function viewCalendar(parts, q) {
    const sid = q.senior || '';
    const { month, year, view } = calState;
    const first = new Date(year, month, 1);
    const title = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const prev = new Date(year, month - 1, 1), next = new Date(year, month + 1, 1);
    const ints = S.interventionsOf(sid);
    const byDate = {};
    ints.forEach(i => { (byDate[i.date] = byDate[i.date] || []).push(i); });
    const t = today();
    const toTransmit = ints.filter(i => i.statut === 'faite' && i.cr && !i.transmis);

    let body = '';
    if (view === 'mois') {
      const start = (first.getDay() + 6) % 7;
      const cells = [];
      for (let k = 0; k < 42; k++) {
        const d = new Date(year, month, 1 - start + k);
        const iso = M.isoLocal(d);
        const list = byDate[iso] || [];
        cells.push(`<div class="day ${d.getMonth() !== month ? 'out' : ''} ${iso === t ? 'today' : ''}" data-act="new-int" data-date="${iso}" data-senior="${sid}">
          <span class="dnum">${d.getDate()}</span>
          ${list.map(i => `<button class="ev cat-line-${esc(i.categorie || 'upin')} ${S.STATUTS[i.statut].cls}" data-act="edit-int" data-id="${i.id}" data-tip="${esc(i.type)} — ${esc(i.intervenant || '')} · ${esc(S.seniorName(i.seniorId))} · ${S.STATUTS[i.statut].label}">
            <b>${S.STATUTS[i.statut].icon}</b> ${i.heure ? M.heure(i.heure) + ' ' : ''}${esc(i.type)}${sid ? '' : `<span class="ev-who"> · ${esc(S.senior(i.seniorId)?.prenom || '')}</span>`}</button>`).join('')}
        </div>`);
        if (k === 34 && new Date(year, month, 1 - start + 35).getMonth() !== month) break;
      }
      body = `<div class="month"><div class="dow">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(x => `<span>${x}</span>`).join('')}</div><div class="days">${cells.join('')}</div></div>`;
    } else {
      const from = M.isoLocal(new Date(year, month, 1)), to = M.isoLocal(new Date(year, month + 1, 0));
      const l = ints.filter(i => i.date >= from && i.date <= to);
      const days = [...new Set(l.map(i => i.date))];
      body = days.length ? days.map(d => `<h3 class="day-h ${d === t ? 'today' : ''}">${fmtLong(d)}</h3>${intList(byDate[d], !sid, d <= t)}`).join('') : '<p class="muted">Aucune intervention ce mois-ci.</p>';
    }
    main.innerHTML = pageHead('Calendrier des interventions', sid ? esc(S.seniorName(sid, true)) : 'Tous les seniors',
      `${sid ? `<a class="btn ghost" href="#/mon-calendrier/${sid}">◱ Version senior</a>` : ''}<button class="btn gold" data-act="new-int" data-senior="${sid}">+ Intervention</button>`) +
      `<div class="toolbar">
        <select id="cal-s">${seniorOptions(sid, true)}</select>
        <div class="seg"><button data-act="cal-nav" data-m="${prev.getMonth()}" data-y="${prev.getFullYear()}" aria-label="Mois précédent">‹</button>
          <button class="cal-title" data-act="cal-nav" data-m="${new Date().getMonth()}" data-y="${new Date().getFullYear()}">${title}</button>
          <button data-act="cal-nav" data-m="${next.getMonth()}" data-y="${next.getFullYear()}" aria-label="Mois suivant">›</button></div>
        <span class="spacer"></span>
        <div class="seg"><button class="${view === 'mois' ? 'on' : ''}" data-act="cal-view" data-v="mois">Mois</button><button class="${view === 'liste' ? 'on' : ''}" data-act="cal-view" data-v="liste">Liste</button></div>
      </div>
      <div class="legend">${Object.values(S.STATUTS).map(x => `<span class="lg"><span class="chip ${x.cls}"><b>${x.icon}</b> ${x.label}</span></span>`).join('')}
        ${['soignant', 'non-soignant', 'aidant', 'upin'].map(k => `<span class="lg"><i class="sw" style="background:${S.CATEGORIES[k].color}"></i>${S.CATEGORIES[k].label}</span>`).join('')}</div>
      <section class="card cal-card">${body}</section>
      <section class="card"><h2>Comptes rendus à transmettre aux aidants</h2>${toTransmitList(toTransmit)}</section>`;
    document.getElementById('cal-s').onchange = (e) => go('#/calendrier' + (e.target.value ? '?senior=' + e.target.value : ''));
  }

  // ---------- Version senior (gros caractères, imprimable) ----------
  function viewSeniorCalendar(parts, q) {
    const s = S.senior(parts[1]);
    if (!s) return go('#/calendrier');
    const days = Number(q.jours || 14);
    const t = today(), end = M.addDays(t, days - 1);
    const list = S.interventionsOf(s.id).filter(i => i.date >= t && i.date <= end && i.statut !== 'annulee');
    const byDate = {};
    list.forEach(i => { (byDate[i.date] = byDate[i.date] || []).push(i); });
    main.innerHTML = `<div class="senior-cal">
      <div class="sc-bar no-print"><a class="btn ghost" href="#/senior/${s.id}/calendrier">‹ Retour</a>
        <div class="seg">${[7, 14, 31].map(n => `<a class="${n === days ? 'on' : ''}" href="#/mon-calendrier/${s.id}?jours=${n}">${n === 31 ? '1 mois' : n + ' jours'}</a>`).join('')}</div>
        <span class="spacer"></span><button class="btn ghost" data-act="print">⎙ Imprimer</button><a class="btn gold" href="#/mails?senior=${s.id}&tpl=senior-planning">✉ Envoyer par mail</a></div>
      <header class="sc-head"><img src="assets/logo-upandin.jpg" alt="Up&In"><div><p class="sc-kicker">Mon calendrier</p>
        <h1>${esc(s.civilite)} ${esc(s.prenom)} ${esc(s.nom)}</h1><p>Du ${fmtLong(t).toLowerCase()} au ${fmtLong(end).toLowerCase()}</p></div></header>
      ${Object.keys(byDate).length ? Object.entries(byDate).map(([d, l]) => `<section class="sc-day ${d === t ? 'today' : ''}">
        <h2>${d === t ? "Aujourd'hui — " : d === M.addDays(t, 1) ? 'Demain — ' : ''}${fmtLong(d)}</h2>
        ${l.map(i => `<div class="sc-item"><div class="sc-time">${i.heure ? M.heure(i.heure) : 'Dans la journée'}</div>
          <div class="sc-desc"><p class="sc-what">${esc(i.type)}</p>
          <p><span class="sc-lbl">Avec qui :</span> ${esc(i.intervenant || '—')}${i.role ? ` <span class="sc-role">(${esc(i.role)})</span>` : ''}</p>
          <p><span class="sc-lbl">Pourquoi :</span> ${esc(i.motif || '—')}</p>
          ${i.lieu ? `<p><span class="sc-lbl">Où :</span> ${esc(i.lieu)}</p>` : ''}</div></div>`).join('')}</section>`).join('')
        : '<p class="sc-none">Aucun rendez-vous prévu sur cette période.</p>'}
      <footer class="sc-foot">Une question ? Appelez Up&amp;In${S.state.cabinet.tel ? ' au <b>' + esc(S.state.cabinet.tel) + '</b>' : ''}${(s.aidants || []).find(a => a.principal) ? ` ou ${esc(s.aidants.find(a => a.principal).prenom)}${s.aidants.find(a => a.principal).tel ? ' au <b>' + esc(s.aidants.find(a => a.principal).tel) + '</b>' : ''}` : ''}.</footer>
    </div>`;
  }

  // ======================================================================
  // Rendez-vous (pendant / après)
  // ======================================================================
  let chrono = null;
  function viewRdv(parts) {
    clearInterval(chrono);
    const sid = parts[1], mode = parts[2];
    if (!sid || !S.senior(sid) || !mode) {
      main.innerHTML = pageHead('Rendez-vous', 'Saisir un rendez-vous pendant l\'entretien ou après, à partir de vos notes papier.') +
        (S.state.seniors.length ? `<section class="card"><form class="form" id="frdv">
          <label>Senior<select name="sid">${seniorOptions(sid)}</select></label>
          <div class="mode-choice">
            <button type="button" class="mode-btn" data-mode="pendant"><span class="mb-ico">●</span><b>Pendant le rendez-vous</b><span>Saisie en direct sur l'iPad, chronomètre, notation par domaine.</span></button>
            <button type="button" class="mode-btn" data-mode="apres"><span class="mb-ico">✎</span><b>Après le rendez-vous</b><span>Photographiez vos notes papier puis reportez l'essentiel.</span></button>
          </div></form></section>` : emptyState("Créez d'abord le dossier d'un senior.", '<button class="btn gold" data-act="new-senior">+ Nouveau senior</button>'));
      main.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => go(`#/rdv/${main.querySelector('[name=sid]').value}/${b.dataset.mode}`));
      return;
    }
    const s = S.senior(sid), last = S.lastBilan(sid);
    const draftKey = 'lc-rdv-draft-' + sid;
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch (e) { draft = {}; }
    const live = mode === 'pendant';
    main.innerHTML = pageHead(`${live ? 'Rendez-vous en cours' : 'Compte rendu après rendez-vous'} — ${esc(s.prenom)} ${esc(s.nom)}`,
      live ? 'Les notes sont sauvegardées automatiquement au fil de la saisie.' : 'Joignez la photo de vos notes papier, puis reportez l\'essentiel.',
      live ? `<span class="chrono" id="chrono">00:00</span>` : '') +
      `<form class="form" id="frdv">
      ${!live ? `<section class="card"><h2>Notes papier</h2>${attachHtml()}
        <label>Transcription / points clés<textarea name="transcription" rows="5">${esc(draft.transcription)}</textarea></label></section>` : ''}
      <section class="card"><div class="f-row"><label>Date<input type="date" name="date" value="${esc(draft.date || today())}"></label>
        <label class="grow">Présents<input name="presents" value="${esc(draft.presents || [s.prenom + ' ' + s.nom, ...(s.aidants || []).filter(a => a.principal).map(a => a.prenom + ' ' + a.nom)].join(', '))}"></label></div>
        <label>${live ? 'Notes rapides' : 'Compte rendu'}<textarea name="contenu" rows="${live ? 7 : 5}" placeholder="Ce qui a été dit, les souhaits du senior, les décisions…">${esc(draft.contenu)}</textarea></label>
      </section>
      <section class="card"><h2>Bilan partagé — domaine par domaine <small>${last ? 'scores du ' + fmt(last.date) + ' pré-remplis' : ''}</small></h2>
        <div class="domain-grid">${S.DOMAINES.map(d => { const v = draft['score_' + d.key] ?? last?.domaines?.[d.key]?.score ?? 5; return `
          <details class="domain" ${draft['note_' + d.key] ? 'open' : ''}><summary><b>${esc(d.label)}</b><output id="r-${d.key}">${v}</output></summary>
            <input type="range" min="0" max="10" name="score_${d.key}" value="${v}" oninput="document.getElementById('r-${d.key}').textContent=this.value">
            <textarea name="note_${d.key}" rows="2" placeholder="Observation…">${esc(draft['note_' + d.key])}</textarea></details>`; }).join('')}</div>
        <label class="check"><input type="checkbox" name="majBilan" ${draft.majBilan === false ? '' : 'checked'}> Créer un nouveau bilan partagé avec ces scores</label>
      </section>
      <section class="card"><h2>Observations & vigilance</h2>
        <label>Observations<textarea name="observations" rows="2">${esc(draft.observations)}</textarea></label>
        <label>Point de vigilance<input name="alertes" value="${esc(draft.alertes)}"></label></section>
      <section class="card"><h2>Interventions à programmer</h2>
        <p class="muted small">Elles seront ajoutées au calendrier et au plan d'action.</p>
        ${rowsEditor('actions', [{ k: 'type', label: 'Intervention', w: 2.5 }, { k: 'intervenant', label: 'Avec qui', w: 2 }, { k: 'motif', label: 'Pourquoi', w: 2.5 }, { k: 'date', label: 'Date', type: 'date', w: 1.5 }], draft.actions)}
      </section>
      ${live ? `<section class="card"><h2>Photos / documents</h2>${attachHtml()}</section>` : ''}
      <div class="sticky-actions"><button type="button" class="btn ghost" id="rdv-cancel">Abandonner</button><button type="submit" class="btn gold">Terminer et enregistrer</button></div>
    </form>`;
    const f = document.getElementById('frdv');
    initAttach(f, []);
    if (live) {
      const t0 = draft.t0 || Date.now(); draft.t0 = t0;
      const c = document.getElementById('chrono');
      chrono = setInterval(() => {
        if (!document.body.contains(c)) return clearInterval(chrono);
        const sec = Math.floor((Date.now() - t0) / 1000);
        c.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      }, 1000);
    }
    const saveDraft = () => {
      const d = formData(f); d.actions = collectRows(f, 'actions'); d.t0 = draft.t0;
      try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch (e) { /* facultatif */ }
    };
    f.addEventListener('input', saveDraft);
    document.getElementById('rdv-cancel').onclick = () => confirmBox('Abandonner ce rendez-vous ? Les notes non enregistrées seront perdues.', () => {
      try { localStorage.removeItem(draftKey); } catch (e) { /* facultatif */ }
      go('#/senior/' + sid);
    }, 'Abandonner');
    f.onsubmit = (e) => {
      e.preventDefault();
      clearInterval(chrono);
      const d = formData(f);
      const actionsList = collectRows(f, 'actions');
      const domainesNotes = Object.fromEntries(S.DOMAINES.map(dm => [dm.key, d['note_' + dm.key]]).filter(([, v]) => v));
      const cr = S.upsert('comptesRendus', {
        seniorId: sid, date: d.date, auteur: S.state.cabinet.conseiller || 'Up&In', role: 'Coordinateur Up&In', categorie: 'upin', mode,
        titre: 'Rendez-vous Up&In', contenu: [d.transcription, d.contenu].filter(Boolean).join('\n\n'), observations: d.observations, alertes: d.alertes,
        presents: d.presents, domainesNotes, indicateurs: {}, photos: getAttach(f),
        duree: draft.t0 && live ? Math.round((Date.now() - draft.t0) / 60000) : ''
      });
      if (d.majBilan) {
        const nb = JSON.parse(JSON.stringify(last || { planAction: [], aides: [], budget: { ressources: [], charges: [] }, domaines: {} }));
        Object.assign(nb, { id: S.uid(), seniorId: sid, date: d.date, auteur: S.state.cabinet.conseiller || 'Up&In' });
        S.DOMAINES.forEach(dm => { nb.domaines[dm.key] = { score: Number(d['score_' + dm.key]), commentaire: d['note_' + dm.key] || nb.domaines[dm.key]?.commentaire || '' }; });
        nb.planAction = (nb.planAction || []).concat(actionsList.map(a => ({ id: S.uid(), action: a.type + (a.motif ? ' — ' + a.motif : ''), responsable: a.intervenant, echeance: a.date, statut: 'à faire' })));
        S.upsert('bilans', nb);
      }
      actionsList.forEach(a => {
        const who = (s.intervenants || []).find(i => i.nom === a.intervenant);
        S.upsert('interventions', { seniorId: sid, date: a.date || M.addDays(d.date, 7), heure: '', duree: 60, type: a.type, intervenant: a.intervenant, role: who ? who.role : '', categorie: who ? who.categorie : 'upin', motif: a.motif, statut: 'prevue', lieu: 'Domicile', cr: '' });
      });
      try { localStorage.removeItem(draftKey); } catch (err) { /* facultatif */ }
      main.innerHTML = pageHead('Rendez-vous enregistré ✓', esc(S.seniorName(sid, true))) + `<section class="card done-card">
        <p>Le compte rendu a été intégré au dossier${d.majBilan ? ', le bilan partagé a été mis à jour' : ''}${actionsList.length ? ` et ${actionsList.length} intervention(s) ont été ajoutées au calendrier` : ''}.</p>
        <div class="btn-row"><a class="btn gold" href="#/mails?senior=${sid}&tpl=aidants-cr-rdv">✉ Envoyer le compte rendu aux aidants</a>
          <a class="btn" href="#/mails?senior=${sid}&tpl=senior-cr-rdv">✉ Envoyer un résumé au senior</a>
          <a class="btn ghost" href="#/senior/${sid}/bilan">Voir le bilan partagé</a><a class="btn ghost" href="#/mon-calendrier/${sid}">Calendrier du senior</a></div></section>`;
      return cr;
    };
  }

  // ======================================================================
  // Transmissions — intégration des données des intervenants
  // ======================================================================
  const CSV_INT = 'senior;date;heure;intervention;intervenant;fonction;categorie;pourquoi;statut;compte_rendu\nJeanne Martin;2026-11-04;09:30;Séance de kinésithérapie;Marc Petit;Kinésithérapeute;soignant;Rééducation à l\'équilibre;prevue;\n';
  const CSV_CR = 'senior;date;intervenant;fonction;categorie;titre;compte_rendu;observations;vigilance;poids;tension_sys;tension_dia;douleur\nJeanne Martin;2026-10-14;Sophie Leroy;Infirmier(ère);soignant;Passage infirmier;Pilulier préparé.;;;61,2;13;8;2\n';

  function viewTransmissions() {
    const recent = S.state.comptesRendus.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    const toTransmit = S.state.interventions.filter(i => i.statut === 'faite' && i.cr && !i.transmis);
    main.innerHTML = pageHead('Transmissions des intervenants', 'Intégrer les données transmises par les soignants et non-soignants, puis informer les aidants.') +
      `<div class="import-tiles">
        <button class="import-tile" data-act="new-cr"><span>✎</span><b>Saisir un compte rendu</b><small>Formulaire complet, indicateurs et documents joints</small></button>
        <button class="import-tile" data-act="paste-cr"><span>❝</span><b>Coller un mail ou un SMS</b><small>Lecture automatique de la date, tension, poids, douleur, vigilance</small></button>
        <label class="import-tile"><span>⇪</span><b>Importer un fichier CSV / Excel</b><small>Planning ou comptes rendus exportés par une structure</small><input type="file" accept=".csv,text/csv" hidden id="imp-csv"></label>
        <label class="import-tile"><span>⧉</span><b>Importer un fichier Le Cercle</b><small>Transmission JSON d'un autre poste ou sauvegarde</small><input type="file" accept=".json,application/json" hidden id="imp-json"></label>
      </div>
      <p class="muted small">Modèles CSV (séparateur « ; », ouverts dans Excel/Numbers) : <a href="#" id="dl-int">planning des interventions</a> · <a href="#" id="dl-cr">comptes rendus</a></p>
      <div class="grid-2">
        <section class="card"><h2>À transmettre aux aidants</h2>${toTransmitList(toTransmit)}</section>
        <section class="card"><h2>Demander un compte rendu à un intervenant</h2>
          <p class="muted">Envoyez un mail type à l'intervenant : il lui suffit de répondre, puis de coller sa réponse ici.</p>
          <div class="btn-row">${S.state.seniors.map(s => `<a class="btn sm ghost" href="#/mails?senior=${s.id}&tpl=intervenant-demande">${esc(s.prenom)} ${esc(s.nom)}</a>`).join('') || '<span class="muted">Aucun senior.</span>'}</div></section>
      </div>
      <section class="card"><h2>Dernières transmissions reçues</h2><div class="timeline">${recent.map(c => `<div class="tl-senior">${esc(S.seniorName(c.seniorId))}</div>${crCard(c)}`).join('') || '<p class="muted">Aucune transmission.</p>'}</div></section>`;
    const dl = (name, txt) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv' })); a.download = name; a.click(); };
    document.getElementById('dl-int').onclick = (e) => { e.preventDefault(); dl('modele-interventions.csv', CSV_INT); };
    document.getElementById('dl-cr').onclick = (e) => { e.preventDefault(); dl('modele-comptes-rendus.csv', CSV_CR); };
    document.getElementById('imp-csv').onchange = (e) => importCsv(e.target.files[0]);
    document.getElementById('imp-json').onchange = (e) => importJson(e.target.files[0], false);
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = (rows.shift() || []).map(h => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
    return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }
  function toIso(v) {
    if (!v) return today();
    const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return v.slice(0, 10);
  }
  function findSenior(name) {
    const n = (name || '').toLowerCase().trim();
    return S.state.seniors.find(s => (s.prenom + ' ' + s.nom).toLowerCase().startsWith(n) || (s.nom + ' ' + s.prenom).toLowerCase().startsWith(n) || n.includes(s.nom.toLowerCase().replace(/\s*\(démo\)/, '')));
  }
  async function importCsv(file) {
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) return toast('Fichier vide');
    const isCr = 'compte_rendu' in rows[0] && ('titre' in rows[0] || 'vigilance' in rows[0]);
    let ok = 0; const unknown = new Set();
    const num = (v) => v === '' || v == null ? undefined : Number(String(v).replace(',', '.'));
    rows.forEach(r => {
      const s = findSenior(r.senior);
      if (!s) { unknown.add(r.senior); return; }
      const cat = ['soignant', 'non-soignant', 'aidant', 'upin'].includes(r.categorie) ? r.categorie : 'soignant';
      if (isCr) {
        const ind = { poids: num(r.poids), tas: num(r.tension_sys), tad: num(r.tension_dia), douleur: num(r.douleur) };
        Object.keys(ind).forEach(k => (ind[k] === undefined || isNaN(ind[k])) && delete ind[k]);
        S.upsert('comptesRendus', { seniorId: s.id, date: toIso(r.date), auteur: r.intervenant, role: r.fonction, categorie: cat, titre: r.titre, contenu: r.compte_rendu, observations: r.observations, alertes: r.vigilance, indicateurs: ind, photos: [], mode: 'import' });
      } else {
        const st = { 'prevue': 'prevue', 'prévue': 'prevue', 'faite': 'faite', 'realisee': 'faite', 'réalisée': 'faite', 'annulee': 'annulee', 'annulée': 'annulee', 'reportee': 'reportee', 'reportée': 'reportee' }[(r.statut || '').toLowerCase()] || 'prevue';
        S.upsert('interventions', { seniorId: s.id, date: toIso(r.date), heure: r.heure, duree: 60, type: r.intervention, intervenant: r.intervenant, role: r.fonction, categorie: cat, motif: r.pourquoi, statut: st, cr: r.compte_rendu, lieu: 'Domicile' });
      }
      ok++;
    });
    toast(`${ok} ligne(s) importée(s)${unknown.size ? ` — senior inconnu : ${[...unknown].join(', ')}` : ''}`);
    render();
  }
  async function importJson(file, full) {
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast('Fichier illisible'); }
    if (full) {
      confirmBox('Remplacer toutes les données de cet appareil par cette sauvegarde ?', async () => { await S.replace(data); toast('Sauvegarde restaurée'); go('#/tableau'); }, 'Remplacer');
      return;
    }
    // Fusion : ajoute ce qui n'existe pas encore (par identifiant)
    let n = 0;
    ['seniors', 'bilans', 'comptesRendus', 'interventions'].forEach(k => {
      (data[k] || []).forEach(x => { if (!S.state[k].some(y => y.id === x.id)) { S.state[k].push(x); n++; } });
    });
    S.save(); toast(`${n} élément(s) intégré(s)`); render();
  }

  // ======================================================================
  // Mails
  // ======================================================================
  function viewMails(parts, q) {
    const sid = q.senior || (S.state.seniors[0] && S.state.seniors[0].id);
    const s = S.senior(sid);
    if (!s) { main.innerHTML = pageHead('Mails') + emptyState("Créez d'abord le dossier d'un senior.", '<button class="btn gold" data-act="new-senior">+ Nouveau senior</button>'); return; }
    const tplId = q.tpl && M.TEMPLATES[q.tpl] ? q.tpl : 'aidants-hebdo';
    const tpl = M.TEMPLATES[tplId];
    const ctx = q.ids ? { interventionIds: q.ids.split(',') } : null;
    const out = tpl.build(s, ctx);
    const contacts = [
      ...(s.email ? [{ email: s.email, label: `${s.prenom} ${s.nom} (senior)`, cible: 'senior' }] : []),
      ...(s.aidants || []).filter(a => a.email).map(a => ({ email: a.email, label: `${a.prenom} ${a.nom} (${a.lien || 'aidant'})`, cible: 'aidants' })),
      ...(s.intervenants || []).filter(i => i.email).map(i => ({ email: i.email, label: `${i.nom} (${i.role})`, cible: 'intervenants' }))
    ];
    const groups = { senior: 'Pour le senior', aidants: 'Pour les aidants', intervenants: 'Pour les intervenants' };
    main.innerHTML = pageHead('Générer un mail', 'Le texte est pré-rempli à partir du dossier ; relisez et ajustez avant envoi.') +
      `<div class="toolbar"><select id="m-s">${seniorOptions(sid)}</select>
        <select id="m-t">${Object.entries(groups).map(([g, l]) => `<optgroup label="${l}">${Object.entries(M.TEMPLATES).filter(([, t]) => t.cible === g).map(([id, t]) => `<option value="${id}" ${id === tplId ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <section class="card mail-card ${tpl.cible === 'senior' ? 'for-senior' : ''}">
        <div class="recips"><span class="lbl">À :</span>${contacts.map(c => `<label class="recip"><input type="checkbox" value="${esc(c.email)}" ${c.cible === tpl.cible ? 'checked' : ''}> ${esc(c.label)}</label>`).join('') || '<span class="muted">Aucune adresse e-mail dans le dossier — ajoutez-les dans « Le Cercle ».</span>'}
          <input id="m-extra" type="email" placeholder="Autre destinataire…" multiple></div>
        <label class="f-sub">Objet<input id="m-subj" value="${esc(out.subject)}"></label>
        <textarea id="m-body" rows="18">${esc(out.body)}</textarea>
        <div class="btn-row"><button class="btn gold" id="m-send">✉ Ouvrir dans Mail</button><button class="btn" id="m-share">⇪ Partager</button><button class="btn ghost" id="m-copy">Copier le texte</button><button class="btn ghost" data-act="print">⎙ Imprimer</button></div>
        ${ctx || tplId === 'aidants-interventions' ? `<p class="muted small">Les interventions concernées seront marquées « transmises aux aidants » à l'envoi.</p>` : ''}
      </section>
      <section class="card"><h2>Historique des envois</h2>${mailLog()}</section>`;
    document.getElementById('m-s').onchange = (e) => go(`#/mails?senior=${e.target.value}&tpl=${tplId}`);
    document.getElementById('m-t').onchange = (e) => go(`#/mails?senior=${sid}&tpl=${e.target.value}`);
    const collect = () => {
      const to = [...main.querySelectorAll('.recip input:checked')].map(i => i.value);
      const extra = document.getElementById('m-extra').value.split(/[,;\s]+/).filter(Boolean);
      return { to: to.concat(extra), subject: document.getElementById('m-subj').value, body: document.getElementById('m-body').value };
    };
    const logSent = (m) => {
      S.state.mailsLog.push({ id: S.uid(), date: today(), seniorId: sid, tpl: tplId, subject: m.subject, to: m.to });
      (out.interventionIds || []).forEach(id => { const it = S.state.interventions.find(i => i.id === id); if (it) it.transmis = today(); });
      S.save();
    };
    document.getElementById('m-send').onclick = () => { const m = collect(); logSent(m); window.location.href = M.mailto(m.to, m.subject, m.body); };
    document.getElementById('m-copy').onclick = async () => {
      const m = collect();
      try { await navigator.clipboard.writeText(`Objet : ${m.subject}\n\n${m.body}`); toast('Texte copié'); } catch (e) { toast('Copie impossible — sélectionnez le texte manuellement'); }
    };
    document.getElementById('m-share').onclick = async () => {
      const m = collect();
      if (!navigator.share) return toast('Partage non disponible sur cet appareil — utilisez « Ouvrir dans Mail »');
      try { await navigator.share({ title: m.subject, text: m.body }); logSent(m); toast('Partagé'); } catch (e) { /* annulé */ }
    };
  }

  // ======================================================================
  // Réglages
  // ======================================================================
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
  function installApp() {
    if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } else go('#/reglages');
  }
  function installCard() {
    return `<section class="card install"><h2>Installer Le Cercle sur cet appareil</h2>
      <div class="grid-3">
        <div><h3>iPad / iPhone</h3><ol><li>Ouvrir Le Cercle dans <b>Safari</b></li><li>Toucher <b>Partager</b> ⇪</li><li>Choisir <b>« Sur l'écran d'accueil »</b></li></ol></div>
        <div><h3>Mac</h3><ol><li>Safari : menu <b>Fichier › Ajouter au Dock</b></li><li>ou Chrome / Edge : icône <b>Installer</b> dans la barre d'adresse</li></ol></div>
        <div><h3>PC Windows</h3><ol><li>Ouvrir dans <b>Edge</b> ou <b>Chrome</b></li><li>Menu › <b>Installer Le Cercle</b></li><li>L'icône apparaît sur le bureau et dans le menu Démarrer</li></ol></div>
      </div>${deferredInstall ? '<button class="btn gold" data-act="install">Installer maintenant</button>' : ''}</section>`;
  }

  async function sha(txt) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('le-cercle:' + txt));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0; for (const c of 'le-cercle:' + txt) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
  }

  function viewSettings() {
    const c = S.state.cabinet;
    const size = new Blob([JSON.stringify(S.state)]).size;
    main.innerHTML = pageHead('Réglages') + `
      <div class="grid-2">
      <section class="card"><h2>Coordonnées (signature des mails)</h2><form class="form" id="fc">
        <label>Conseiller / coordinateur<input name="conseiller" value="${esc(c.conseiller)}"></label>
        <div class="f-row"><label class="grow">E-mail<input type="email" name="email" value="${esc(c.email)}"></label><label class="grow">Téléphone<input name="tel" value="${esc(c.tel)}"></label></div>
        <label>Signature<input name="signature" value="${esc(c.signature)}"></label>
        <button class="btn gold">Enregistrer</button></form></section>
      <section class="card"><h2>Confidentialité</h2>
        <p class="muted">Les données restent sur cet appareil (stockage local chiffré par le système de l'iPad / du Mac / du PC). Elles ne sont envoyées nulle part sans action de votre part.</p>
        <form class="form" id="fpin"><label>Code d'accès (4 à 8 chiffres)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="new-password" placeholder="${S.state.securite.pinHash ? 'Code actif — saisir pour changer' : 'Aucun code'}"></label>
          <div class="btn-row"><button class="btn gold">Définir le code</button>${S.state.securite.pinHash ? '<button type="button" class="btn ghost" id="nopin">Retirer le code</button>' : ''}</div></form>
        <p class="muted small">Verrouillage automatique après 10 minutes d'inactivité.</p></section>
      <section class="card"><h2>Sauvegarde & transfert</h2>
        <p class="muted">Volume actuel : ${(size / 1024 / 1024).toFixed(2)} Mo. Exportez régulièrement une sauvegarde (Fichiers, iCloud Drive, clé USB…).</p>
        <div class="btn-row"><button class="btn gold" id="exp">⇩ Exporter une sauvegarde</button>
          <label class="btn ghost">⇧ Restaurer une sauvegarde<input type="file" accept=".json" hidden id="restore"></label>
          ${S.state.seniors.length ? `<select id="exp-s">${seniorOptions()}</select><button class="btn ghost" id="exp-one">Exporter ce dossier (transmission)</button>` : ''}</div></section>
      <section class="card span-2"><h2>Forfaits & tarifs</h2><form class="form" id="fo">
        <p class="muted small">Le niveau (1 = besoin léger, 2 = modéré, 3 = important) sert à recommander le forfait. Une option est conseillée quand le score du domaine lié est inférieur ou égal au seuil.</p>
        <h3>Forfaits</h3>${rowsEditor('forfaits', [{ k: 'nom', label: 'Forfait', w: 1.3 }, { k: 'niveau', label: 'Niveau', type: 'select', options: ['1', '2', '3'], w: .7 }, { k: 'prix', label: '€ / mois', type: 'number', w: .8 }, { k: 'description', label: 'Ce qui est inclus', w: 3.5 }], S.state.offre.forfaits)}
        <h3>Options</h3>${rowsEditor('options', [{ k: 'nom', label: 'Option', w: 2 }, { k: 'prix', label: 'Prix €', type: 'number', w: .7 }, { k: 'unite', label: 'Unité', type: 'select', options: [{ v: 'mois', l: 'par mois' }, { v: 'séance', l: 'par séance' }, { v: 'unique', l: 'une fois' }], w: .9 }, { k: 'quantiteDefaut', label: 'Qté', type: 'number', w: .5 }, { k: 'domaine', label: 'Domaine lié', type: 'select', options: [{ v: '', l: '—' }, ...S.DOMAINES.map(d => ({ v: d.key, l: d.court }))], w: 1 }, { k: 'seuil', label: 'Seuil', type: 'number', w: .5 }, { k: 'description', label: 'Description', w: 2.2 }], S.state.offre.options)}
        <div class="f-row"><label>Frais de mise en place (€)<input name="fraisMiseEnPlace" type="number" inputmode="decimal" value="${esc(S.state.offre.fraisMiseEnPlace)}"></label>
          <label>Crédit d'impôt estimé (%)<input name="creditImpot" type="number" min="0" max="100" value="${esc(S.state.offre.creditImpot)}"></label>
          <label class="grow">Mention tarifaire<input name="mention" value="${esc(S.state.offre.mention)}"></label></div>
        <div class="btn-row"><button class="btn gold">Enregistrer la grille</button><button type="button" class="btn ghost" id="o-default">Rétablir la grille d'exemple</button></div>
      </form></section>
      <section class="card"><h2>Démonstration & réinitialisation</h2>
        <div class="btn-row"><button class="btn ghost" data-act="demo">Charger un dossier de démonstration</button><button class="btn danger ghost" id="wipe">Effacer toutes les données</button></div></section>
      </div>${installCard()}
      <p class="muted small center">Le Cercle · Up&amp;In — Family Office de l'Autonomie · version 1.0</p>`;
    document.getElementById('fc').onsubmit = (e) => { e.preventDefault(); Object.assign(S.state.cabinet, formData(e.target)); S.save(); toast('Coordonnées enregistrées'); };
    document.getElementById('fo').onsubmit = (e) => {
      e.preventDefault();
      const d = formData(e.target);
      Object.assign(S.state.offre, {
        forfaits: collectRows(e.target, 'forfaits').map(f => Object.assign(f, { niveau: Number(f.niveau) || 1, prix: Number(f.prix) || 0 })),
        options: collectRows(e.target, 'options').map(o => Object.assign(o, { prix: Number(o.prix) || 0, quantiteDefaut: Number(o.quantiteDefaut) || 1, seuil: o.seuil === '' ? 5 : Number(o.seuil) })),
        fraisMiseEnPlace: Number(d.fraisMiseEnPlace) || 0, creditImpot: Number(d.creditImpot) || 0, mention: d.mention
      });
      S.save(); toast('Grille tarifaire enregistrée');
    };
    document.getElementById('o-default').onclick = () => confirmBox("Remplacer votre grille par la grille d'exemple ?", () => { S.state.offre = window.Offre.defaultCatalogue(); S.save(); render(); }, 'Remplacer');
    document.getElementById('fpin').onsubmit = async (e) => {
      e.preventDefault(); const p = e.target.pin.value;
      if (!/^\d{4,8}$/.test(p)) return toast('Le code doit comporter 4 à 8 chiffres');
      S.state.securite.pinHash = await sha(p); S.save(); toast('Code d\'accès activé'); render();
    };
    const np = document.getElementById('nopin');
    if (np) np.onclick = () => { S.state.securite.pinHash = null; S.save(); toast('Code retiré'); render(); };
    const download = (name, obj) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })); a.download = name; a.click(); };
    document.getElementById('exp').onclick = () => download(`le-cercle-sauvegarde-${today()}.json`, S.state);
    const eo = document.getElementById('exp-one');
    if (eo) eo.onclick = () => {
      const id = document.getElementById('exp-s').value, s = S.senior(id);
      download(`le-cercle-${s.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.json`, {
        seniors: [s], bilans: S.bilansOf(id), comptesRendus: S.crOf(id), interventions: S.interventionsOf(id)
      });
    };
    document.getElementById('restore').onchange = (e) => importJson(e.target.files[0], true);
    document.getElementById('wipe').onclick = () => confirmBox('Effacer définitivement toutes les données de cet appareil ? Pensez à exporter une sauvegarde avant.', async () => {
      const keep = S.state.cabinet;
      await S.replace({ cabinet: keep }); toast('Données effacées'); go('#/tableau');
    }, 'Tout effacer');
  }

  // ======================================================================
  // Verrouillage par code
  // ======================================================================
  const lockEl = document.getElementById('lock');
  function lock() {
    if (!S.state.securite.pinHash) return;
    lockEl.hidden = false;
    let code = '';
    const draw = () => {
      lockEl.innerHTML = `<div class="lock-box"><img src="assets/logo-upandin.jpg" alt="Up&In — Family Office de l'Autonomie">
        <h1>Le Cercle</h1><p>Saisissez votre code d'accès</p>
        <div class="dots">${'●'.repeat(code.length)}${'○'.repeat(Math.max(0, 4 - code.length))}</div>
        <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => `<button ${k === '' ? 'disabled class="blank"' : ''} data-k="${k}">${k}</button>`).join('')}</div>
        <button class="btn gold" id="unlock">Déverrouiller</button></div>`;
    };
    draw();
    const tryUnlock = async () => {
      if (await sha(code) === S.state.securite.pinHash) { lockEl.hidden = true; lockEl.innerHTML = ''; lastActivity = Date.now(); }
      else { code = ''; draw(); lockEl.querySelector('.dots').classList.add('shake'); }
    };
    lockEl.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'unlock') return tryUnlock();
      const k = b.dataset.k;
      if (k === '⌫') code = code.slice(0, -1); else if (code.length < 8) code += k;
      draw();
      if (code.length >= 4) sha(code).then(h => { if (h === S.state.securite.pinHash) tryUnlock(); });
    };
  }
  let lastActivity = Date.now();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, true));
  setInterval(() => { if (lockEl.hidden && Date.now() - lastActivity > 10 * 60 * 1000) lock(); }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastActivity > 10 * 60 * 1000) lock();
    if (document.visibilityState === 'hidden') S.flush();
  });
  window.addEventListener('lc-save-error', () => toast('⚠ Espace de stockage insuffisant : exportez une sauvegarde'));

  // ======================================================================
  // Démarrage
  // ======================================================================
  window.addEventListener('hashchange', render);
  S.load().then(() => {
    lock();
    render();
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
  }
})();
