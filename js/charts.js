/* Le Cercle — graphiques SVG / HTML sans dépendance.
   Les marques portant une info au survol ont un attribut data-tip (infobulle gérée dans app.js). */
(function () {
  'use strict';

  const C = {
    navy: '#10214c', gold: '#b8892f', goldLight: '#e6c06f', ink: '#1b2433',
    muted: '#6b7280', grid: '#e4e1d8', surface: '#fcfbf8', prev: '#8b93a7'
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  // ---------- Radar (bilan partagé) ----------
  function radar(domaines, series, opts) {
    opts = opts || {};
    const size = 420, cx = size / 2, cy = size / 2, R = 130, max = 10;
    const n = domaines.length;
    const ang = (i) => -Math.PI / 2 + i * 2 * Math.PI / n;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v / max, cy + Math.sin(ang(i)) * R * v / max];
    let s = `<svg class="chart radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(opts.label || 'Radar des domaines du bilan')}">`;
    // anneaux
    [2, 4, 6, 8, 10].forEach(v => {
      const pts = domaines.map((_, i) => pt(i, v).join(',')).join(' ');
      s += `<polygon points="${pts}" fill="none" stroke="${C.grid}" stroke-width="1"/>`;
      s += `<text x="${cx + 3}" y="${cy - R * v / max + 11}" class="axis-txt">${v}</text>`;
    });
    domaines.forEach((d, i) => {
      const [x, y] = pt(i, max);
      s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
      const [lx, ly] = pt(i, max + 2.1);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : (lx > cx ? 'start' : 'end');
      s += `<text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" class="lbl-txt">${esc(d.court)}</text>`;
    });
    series.forEach((se, si) => {
      const vals = domaines.map(d => Number(se.values[d.key]) || 0);
      const pts = vals.map((v, i) => pt(i, v).join(',')).join(' ');
      const current = si === series.length - 1;
      s += `<polygon points="${pts}" fill="${current ? C.gold : 'none'}" fill-opacity="${current ? 0.16 : 0}" stroke="${current ? C.gold : C.prev}" stroke-width="2" ${current ? '' : 'stroke-dasharray="5 4"'} stroke-linejoin="round"/>`;
      if (current) {
        vals.forEach((v, i) => {
          const [x, y] = pt(i, v);
          s += `<circle cx="${x}" cy="${y}" r="5" fill="${C.gold}" stroke="${C.surface}" stroke-width="2"/>`;
          s += `<circle cx="${x}" cy="${y}" r="14" fill="transparent" class="hit" data-tip="${esc(domaines[i].label)} : ${v}/10"/>`;
        });
      }
    });
    s += '</svg>';
    return s;
  }

  // ---------- Courbe temporelle ----------
  function line(points, opts) {
    opts = opts || {};
    const W = 640, H = 230, m = { t: 16, r: 18, b: 34, l: 44 };
    const pts = points.filter(p => p.y !== '' && p.y != null && !isNaN(Number(p.y))).map(p => ({ x: new Date(p.x + 'T12:00:00').getTime(), y: Number(p.y), date: p.x, label: p.label }))
      .sort((a, b) => a.x - b.x);
    if (pts.length < 2) return `<div class="empty-chart">Pas encore assez de mesures pour tracer une évolution${pts.length ? ` (1 mesure : ${pts[0].y}${opts.unit || ''})` : ''}.</div>`;
    let yMin = opts.yMin ?? Math.min(...pts.map(p => p.y));
    let yMax = opts.yMax ?? Math.max(...pts.map(p => p.y));
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const pad = (opts.yMin == null) ? (yMax - yMin) * 0.15 : 0;
    yMin -= pad; yMax += pad;
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    const X = (x) => m.l + (x - x0) / Math.max(1, x1 - x0) * (W - m.l - m.r);
    const Y = (y) => H - m.b - (y - yMin) / (yMax - yMin) * (H - m.t - m.b);
    let s = `<svg class="chart line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Évolution')}">`;
    for (let k = 0; k <= 4; k++) {
      const v = yMin + (yMax - yMin) * k / 4;
      s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
      s += `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="axis-txt">${Math.round(v * 10) / 10}</text>`;
    }
    const ticks = pts.length <= 6 ? pts : [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
    ticks.forEach(p => { s += `<text x="${X(p.x)}" y="${H - 10}" text-anchor="middle" class="axis-txt">${esc(new Date(p.x).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }))}</text>`; });
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const color = opts.color || C.navy;
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${last ? 5 : 4}" fill="${color}" stroke="${C.surface}" stroke-width="2"/>`;
      s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="14" fill="transparent" class="hit" data-tip="${esc(fmtDate(p.date))} — ${p.y}${esc(opts.unit || '')}${p.label ? ' · ' + esc(p.label) : ''}"/>`;
      if (last) s += `<text x="${X(p.x) - 8}" y="${Y(p.y) - 10}" text-anchor="end" class="val-txt">${p.y}${esc(opts.unit || '')}</text>`;
    });
    s += '</svg>';
    return s;
  }

  // ---------- Barres horizontales (HTML, lisibles sur iPad) ----------
  function bars(items, opts) {
    opts = opts || {};
    const max = opts.max || Math.max(1, ...items.map(i => Number(i.value) || 0));
    return `<div class="hbars">${items.map(i => {
      const v = Number(i.value) || 0;
      const pct = Math.max(0, Math.min(100, v / max * 100));
      return `<div class="hbar" data-tip="${esc(i.label)} : ${esc(i.display ?? v)}">
        <span class="hbar-lbl">${esc(i.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;background:${i.color || C.navy}"></span></span>
        <span class="hbar-val">${esc(i.display ?? v)}</span>
      </div>`;
    }).join('')}</div>`;
  }

  // ---------- Barre de progression empilée (statuts) ----------
  function stack(parts) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    return `<div class="stack">${parts.filter(p => p.value).map(p =>
      `<span class="stack-seg ${p.cls}" style="width:${p.value / total * 100}%" data-tip="${esc(p.label)} : ${p.value}"></span>`).join('')}</div>
      <div class="legend">${parts.map(p => `<span class="lg"><i class="sw ${p.cls}"></i>${esc(p.label)} <b>${p.value}</b></span>`).join('')}</div>`;
  }

  // ---------- Schéma « Le Cercle » ----------
  function cercle(senior) {
    const size = 640, cx = size / 2, cy = size / 2;
    const rings = [
      { key: 'aidant', r: 105, people: (senior.aidants || []).map(a => ({ nom: `${a.prenom} ${a.nom}`.trim(), role: a.lien + (a.principal ? ' · principal' : '') })) },
      { key: 'soignant', r: 185, people: (senior.intervenants || []).filter(i => i.categorie === 'soignant') },
      { key: 'non-soignant', r: 262, people: (senior.intervenants || []).filter(i => i.categorie !== 'soignant') }
    ];
    const cat = window.Store.CATEGORIES;
    let s = `<svg class="chart cercle" viewBox="0 0 ${size} ${size}" role="img" aria-label="Schéma du cercle d'accompagnement">`;
    s += `<circle cx="${cx}" cy="${cy}" r="300" fill="none" stroke="${C.gold}" stroke-width="1.5" stroke-dasharray="2 6"/>`;
    s += `<text x="${cx}" y="${cy - 306}" text-anchor="middle" class="ring-title gold">Coordination Up&amp;In</text>`;
    rings.forEach(r => {
      s += `<circle cx="${cx}" cy="${cy}" r="${r.r}" fill="none" stroke="${cat[r.key].color}" stroke-opacity=".35" stroke-width="1.5"/>`;
    });
    // liens + nœuds
    rings.forEach((r, ri) => {
      const n = r.people.length;
      const offset = -Math.PI / 2 + (ri * 0.45) + (n === 1 ? 0.6 : 0);
      r.people.forEach((p, i) => {
        const a = offset + i * 2 * Math.PI / Math.max(n, 1);
        const x = cx + Math.cos(a) * r.r, y = cy + Math.sin(a) * r.r;
        s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${cat[r.key].color}" stroke-opacity=".18" stroke-width="1"/>`;
        p._x = x; p._y = y;
      });
    });
    s += `<circle cx="${cx}" cy="${cy}" r="48" fill="${C.navy}" stroke="${C.gold}" stroke-width="3"/>`;
    s += `<text x="${cx}" y="${cy - 3}" text-anchor="middle" class="center-txt">${esc(senior.prenom)}</text>`;
    s += `<text x="${cx}" y="${cy + 15}" text-anchor="middle" class="center-sub">${esc((senior.nom || '').split(' ')[0])}</text>`;
    rings.forEach(r => {
      r.people.forEach(p => {
        const initials = (p.nom || '?').replace(/^(Dr|Maître|Me)\.?\s+/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const below = p._y >= cy - 4;
        s += `<g class="node" data-tip="${esc(p.nom)} — ${esc(p.role || '')}${p.structure ? ' (' + esc(p.structure) + ')' : ''}">
          <circle cx="${p._x}" cy="${p._y}" r="19" fill="${cat[r.key].color}" stroke="${C.surface}" stroke-width="3"/>
          <text x="${p._x}" y="${p._y + 4.5}" text-anchor="middle" class="node-ini">${esc(initials)}</text>
          <text x="${p._x}" y="${below ? p._y + 35 : p._y - 34}" text-anchor="middle" class="node-name">${esc(p.nom)}</text>
          <text x="${p._x}" y="${below ? p._y + 49 : p._y - 20}" text-anchor="middle" class="node-role">${esc(p.role || '')}</text>
        </g>`;
      });
    });
    s += '</svg>';
    s += `<div class="legend center">${['aidant', 'soignant', 'non-soignant'].map(k => `<span class="lg"><i class="sw" style="background:${cat[k].color}"></i>${cat[k].label}s</span>`).join('')}<span class="lg"><i class="sw ring"></i>Coordination Up&amp;In</span></div>`;
    return s;
  }

  window.Charts = { radar, line, bars, stack, cercle, C };
})();
