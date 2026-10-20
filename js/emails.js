/* Le Cercle — génération des mails pour les seniors, les aidants et les intervenants. */
(function () {
  'use strict';

  const S = () => window.Store;
  const longDate = (iso) => {
    const s = new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = (h) => h ? h.replace(':', 'h') : '';
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = () => isoLocal(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };

  function signature() {
    const c = S().state.cabinet;
    return ['', 'Bien cordialement,', '', c.conseiller || '', c.signature || "L'équipe Up&In — Family Office de l'Autonomie", [c.tel, c.email].filter(Boolean).join(' · ')]
      .filter((l, i) => i < 3 || l).join('\n');
  }

  function upcoming(senior, days) {
    const from = todayIso(), to = addDays(from, days);
    return S().interventionsOf(senior.id).filter(i => i.statut === 'prevue' && i.date >= from && i.date <= to);
  }

  function planningLines(list, simple) {
    if (!list.length) return ['Aucune intervention prévue sur cette période.'];
    return list.map(i => simple
      ? `• ${longDate(i.date)}${i.heure ? ' à ' + heure(i.heure) : ''}\n   ${i.type} avec ${i.intervenant}${i.role ? ' (' + i.role + ')' : ''}\n   Pourquoi : ${i.motif || '—'}`
      : `• ${longDate(i.date)}${i.heure ? ' ' + heure(i.heure) : ''} — ${i.type} — ${i.intervenant}${i.role ? ' (' + i.role + ')' : ''}${i.motif ? ' — ' + i.motif : ''}`);
  }

  function aidantsEmails(senior) { return (senior.aidants || []).filter(a => a.email).map(a => a.email); }
  function aidantsPrenoms(senior) {
    const list = (senior.aidants || []).map(a => a.prenom).filter(Boolean);
    return list.length ? list.join(', ').replace(/, ([^,]*)$/, ' et $1') : '';
  }

  const TEMPLATES = {
    // ---------- Pour le senior ----------
    'senior-planning': {
      cible: 'senior', label: 'Mes prochains rendez-vous (14 jours)',
      build(s) {
        const list = upcoming(s, 14);
        return {
          subject: 'Vos prochains rendez-vous',
          body: [`Bonjour ${s.civilite || ''} ${s.nom.replace(/\s*\(démo\)/, '')},`.replace(/\s+/g, ' '), '',
            'Voici les rendez-vous et les visites prévus pour vous dans les deux prochaines semaines :', '',
            ...planningLines(list, true), '',
            "Si un rendez-vous ne vous convient pas, n'hésitez pas à nous appeler : nous nous occupons de tout.", signature()].join('\n')
        };
      }
    },
    'senior-rappel': {
      cible: 'senior', label: 'Rappel du prochain rendez-vous',
      build(s) {
        const next = upcoming(s, 60)[0];
        return {
          subject: next ? `Rappel : ${next.type} ${longDate(next.date).toLowerCase()}` : 'Rappel de rendez-vous',
          body: [`Bonjour ${s.civilite || ''} ${s.nom.replace(/\s*\(démo\)/, '')},`.replace(/\s+/g, ' '), '',
            next ? `Nous vous rappelons votre prochain rendez-vous :\n\n${planningLines([next], true)[0]}\n   Lieu : ${next.lieu || 'à votre domicile'}`
              : "Vous n'avez pas de rendez-vous prévu pour le moment.",
            '', 'Nous restons à votre écoute.', signature()].join('\n')
        };
      }
    },
    'senior-cr-rdv': {
      cible: 'senior', label: 'Ce que nous nous sommes dit (rendez-vous)',
      build(s) {
        const cr = S().crOf(s.id).find(c => c.categorie === 'upin');
        const b = S().lastBilan(s.id);
        return {
          subject: 'Suite à notre rencontre',
          body: [`Bonjour ${s.civilite || ''} ${s.nom.replace(/\s*\(démo\)/, '')},`.replace(/\s+/g, ' '), '',
            `Merci pour notre échange${cr ? ' du ' + shortDate(cr.date) : ''}. Voici en quelques mots ce que nous avons retenu ensemble :`, '',
            cr ? cr.contenu : (b?.synthese || ''), '',
            ...(b?.planAction?.length ? ['Ce qui va être mis en place :', ...b.planAction.filter(p => p.statut !== 'fait').map(p => `• ${p.action}${p.echeance ? ' (d\'ici le ' + shortDate(p.echeance) + ')' : ''}`), ''] : []),
            'Vos proches sont informés et nous restons à vos côtés.', signature()].join('\n')
        };
      }
    },
    'senior-libre': {
      cible: 'senior', label: 'Message libre',
      build(s) {
        return { subject: '', body: [`Bonjour ${s.civilite || ''} ${s.nom.replace(/\s*\(démo\)/, '')},`.replace(/\s+/g, ' '), '', '', signature()].join('\n') };
      }
    },

    // ---------- Pour les aidants ----------
    'aidants-bilan': {
      cible: 'aidants', label: 'Synthèse du bilan partagé',
      build(s) {
        const b = S().lastBilan(s.id);
        if (!b) return { subject: 'Bilan partagé', body: "Aucun bilan partagé n'a encore été réalisé." };
        const D = S().DOMAINES;
        const sorted = D.map(d => ({ d, v: Number(b.domaines?.[d.key]?.score) || 0 })).sort((a, z) => a.v - z.v);
        const vig = sorted.filter(x => x.v <= 5);
        const forts = sorted.filter(x => x.v >= 7).reverse();
        return {
          subject: `Bilan partagé de ${S().seniorName(s.id, true)} — ${shortDate(b.date)}`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '',
            `Voici la synthèse du bilan partagé réalisé le ${shortDate(b.date)} pour ${S().seniorName(s.id, true)}.`, '',
            `Indice d'autonomie global : ${S().scoreGlobal(b)}/10${b.gir ? ` — GIR ${b.gir}` : ''}`, '',
            'SYNTHÈSE', b.synthese || '—', '',
            ...(forts.length ? ['POINTS D\'APPUI', ...forts.map(x => `• ${x.d.label} : ${x.v}/10`), ''] : []),
            ...(vig.length ? ['POINTS DE VIGILANCE', ...vig.map(x => `• ${x.d.label} : ${x.v}/10${b.domaines[x.d.key]?.commentaire ? ' — ' + b.domaines[x.d.key].commentaire : ''}`), ''] : []),
            ...(b.besoins ? ['BESOINS IDENTIFIÉS', b.besoins, ''] : []),
            ...(b.recommandations ? ['RECOMMANDATIONS', b.recommandations, ''] : []),
            ...(b.planAction?.length ? ['PLAN D\'ACTION', ...b.planAction.map(p => `• ${p.action} — ${p.responsable || ''} — échéance ${p.echeance ? shortDate(p.echeance) : 'à définir'} — ${p.statut}`), ''] : []),
            ...(b.aides?.length ? ['AIDES ET FINANCEMENTS', ...b.aides.map(a => `• ${a.nom} (${a.organisme}) : ${a.montant ? a.montant + ' €' : '—'} — ${a.statut}`), ''] : []),
            'Le bilan complet (graphiques et tableaux) est disponible sur demande en PDF.', signature()].join('\n')
        };
      }
    },
    'aidants-interventions': {
      cible: 'aidants', label: 'Comptes rendus des interventions réalisées',
      build(s, ctx) {
        let list = S().interventionsOf(s.id).filter(i => i.statut !== 'prevue');
        if (ctx && ctx.interventionIds) list = list.filter(i => ctx.interventionIds.includes(i.id));
        else list = list.filter(i => !i.transmis);
        return {
          subject: `Interventions auprès de ${S().seniorName(s.id, true)} — comptes rendus`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '',
            `Voici le point sur les dernières interventions auprès de ${S().seniorName(s.id, true)} :`, '',
            ...(list.length ? list.map(i => `• ${longDate(i.date)}${i.heure ? ' ' + heure(i.heure) : ''} — ${i.type} — ${i.intervenant}${i.role ? ' (' + i.role + ')' : ''}\n   Statut : ${S().STATUTS[i.statut].label}${i.cr ? '\n   Compte rendu : ' + i.cr : ''}`) : ['Aucune nouvelle intervention à signaler.']),
            '', 'Nous restons disponibles pour en parler.', signature()].join('\n'),
          interventionIds: list.map(i => i.id)
        };
      }
    },
    'aidants-planning': {
      cible: 'aidants', label: 'Planning des 14 prochains jours',
      build(s) {
        return {
          subject: `Planning de ${S().seniorName(s.id, true)} — 14 prochains jours`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '', `Voici le planning des interventions prévues pour ${S().seniorName(s.id, true)} :`, '',
            ...planningLines(upcoming(s, 14), false), '', signature()].join('\n')
        };
      }
    },
    'aidants-alerte': {
      cible: 'aidants', label: 'Point de vigilance',
      build(s) {
        const alertes = S().crOf(s.id).filter(c => c.alertes).slice(0, 5);
        return {
          subject: `Point de vigilance — ${S().seniorName(s.id, true)}`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '',
            'Nous souhaitons attirer votre attention sur les points suivants, remontés par les intervenants :', '',
            ...(alertes.length ? alertes.map(c => `• ${shortDate(c.date)} — ${c.auteur} (${c.role || ''}) : ${c.alertes}`) : ['• ']), '',
            'Voici ce que nous proposons :', '• ', '',
            'Pouvons-nous en échanger rapidement par téléphone ?', signature()].join('\n')
        };
      }
    },
    'aidants-hebdo': {
      cible: 'aidants', label: 'Récapitulatif de la semaine',
      build(s) {
        const from = addDays(todayIso(), -7);
        const done = S().interventionsOf(s.id).filter(i => i.date >= from && i.date <= todayIso() && i.statut !== 'prevue');
        const crs = S().crOf(s.id).filter(c => c.date >= from);
        return {
          subject: `La semaine de ${S().seniorName(s.id, true)}`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '', 'Voici le récapitulatif de la semaine écoulée.', '',
            'INTERVENTIONS DE LA SEMAINE',
            ...(done.length ? done.map(i => `• ${shortDate(i.date)} — ${i.type} (${i.intervenant}) : ${S().STATUTS[i.statut].label}${i.cr ? ' — ' + i.cr : ''}`) : ['Aucune.']), '',
            'TRANSMISSIONS DES INTERVENANTS',
            ...(crs.length ? crs.map(c => `• ${shortDate(c.date)} — ${c.auteur} (${c.role || ''}) : ${c.contenu}${c.alertes ? '\n   ⚠ ' + c.alertes : ''}`) : ['Aucune.']), '',
            'À VENIR (7 JOURS)', ...planningLines(upcoming(s, 7), false), '', signature()].join('\n')
        };
      }
    },
    'aidants-cr-rdv': {
      cible: 'aidants', label: 'Compte rendu du rendez-vous Up&In',
      build(s) {
        const cr = S().crOf(s.id).find(c => c.categorie === 'upin');
        return {
          subject: `Compte rendu de rendez-vous — ${S().seniorName(s.id, true)}`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '',
            cr ? `Voici le compte rendu de notre rendez-vous du ${shortDate(cr.date)} avec ${S().seniorName(s.id, true)}.` : 'Aucun compte rendu de rendez-vous enregistré.', '',
            ...(cr ? [cr.contenu, '', ...(cr.observations ? ['Observations : ' + cr.observations, ''] : []), ...(cr.alertes ? ['Vigilance : ' + cr.alertes, ''] : []),
              ...(cr.domainesNotes ? Object.entries(cr.domainesNotes).filter(([, v]) => v).map(([k, v]) => `• ${(S().DOMAINES.find(d => d.key === k) || {}).label} : ${v}`) : [])] : []),
            '', signature()].join('\n')
        };
      }
    },

    'aidants-offre': {
      cible: 'aidants', label: 'Forfait proposé et coût total', noOffre: true,
      build(s) {
        const O = window.Offre, sel = O.selection(s), rec = O.recommend(s);
        if (!sel) return { subject: 'Formule Up&In', body: "Le bilan partagé doit être réalisé avant de proposer une formule." };
        const r = O.compute(sel);
        return {
          subject: `Formule d'accompagnement Up&In — ${S().seniorName(s.id, true)}`,
          body: [`Bonjour ${aidantsPrenoms(s)},`, '',
            `Suite au bilan partagé${rec ? ' du ' + shortDate(rec.bilanDate) : ''}, voici la formule d'accompagnement que nous vous proposons pour ${S().seniorName(s.id, true)}.`, '',
            ...(rec ? ['POURQUOI CE FORFAIT', ...rec.raisons.map(x => '• ' + x), ''] : []),
            `FORFAIT ${r.forfait.nom.toUpperCase()} — ${O.euro(r.forfaitMensuel)} par mois`, r.forfait.description || '', '',
            ...(r.lignes.length ? ['OPTIONS UTILES', ...r.lignes.map(l => {
              const why = rec && rec.options.find(o => o.option.id === l.id);
              return `• ${l.nom} : ${O.euro(l.mensuel || l.unique)}${l.unite === 'unique' ? ' (une fois)' : ' par mois'}${l.unite === 'séance' ? ` — ${l.quantite} séance(s) × ${O.euro(l.prix)}` : ''}${why ? ` — conseillé car ${why.raison}` : ''}`;
            }), ''] : []),
            'COÛT TOTAL', ...O.totalLines(r), '',
            'Nous restons à votre disposition pour ajuster cette proposition ensemble.', signature()].join('\n')
        };
      }
    },

    // ---------- Pour les intervenants ----------
    'intervenant-demande': {
      cible: 'intervenants', label: 'Demande de compte rendu (intervenant)',
      build(s) {
        return {
          subject: `Transmission — ${S().seniorName(s.id, true)}`,
          body: ['Bonjour,', '',
            `Dans le cadre de la coordination de l'accompagnement de ${S().seniorName(s.id, true)} par Up&In, pourriez-vous nous transmettre un court compte rendu de votre intervention en répondant simplement à ce mail :`, '',
            'Date de l\'intervention :', 'Ce qui a été fait :', 'Observations :', 'Point de vigilance éventuel :',
            'Mesures (si pertinent — poids, tension, douleur /10) :', 'Prochaine intervention prévue :', '',
            'Merci pour votre précieuse collaboration.', signature()].join('\n')
        };
      }
    }
  };

  // Chaque mail aux aidants rappelle le forfait, les options et le coût total.
  Object.values(TEMPLATES).filter(t => t.cible === 'aidants' && !t.noOffre).forEach(t => {
    const build = t.build;
    t.build = (s, ctx) => {
      const out = build(s, ctx);
      const block = window.Offre ? window.Offre.textBlock(s) : [];
      if (!block.length) return out;
      const ins = '\n' + block.join('\n') + '\n';
      const i = out.body.lastIndexOf('\nBien cordialement,');
      out.body = i >= 0 ? out.body.slice(0, i) + ins + out.body.slice(i) : out.body + '\n' + ins;
      return out;
    };
  });

  function recipients(senior, cible) {
    if (cible === 'senior') return senior.email ? [senior.email] : [];
    if (cible === 'aidants') return aidantsEmails(senior);
    if (cible === 'intervenants') return (senior.intervenants || []).filter(i => i.email).map(i => i.email);
    return [];
  }

  function mailto(to, subject, body) {
    return `mailto:${encodeURIComponent(to.join(',')).replace(/%40/g, '@').replace(/%2C/g, ',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  window.Emails = { TEMPLATES, recipients, mailto, longDate, shortDate, heure, todayIso, addDays, isoLocal };
})();
