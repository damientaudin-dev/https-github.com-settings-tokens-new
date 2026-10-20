/* Le Cercle — forfaits Up&In : recommandation à partir du bilan partagé, options utiles et coût total. */
(function () {
  'use strict';

  const S = () => window.Store;

  // Grille par défaut (exemple) : à adapter dans Réglages › Forfaits & tarifs.
  function defaultCatalogue() {
    return {
      fraisMiseEnPlace: 350,
      creditImpot: 0,
      mention: 'Tarifs TTC, donnés à titre indicatif, à confirmer lors de la signature.',
      forfaits: [
        { id: 'f-essentiel', nom: 'Essentiel', niveau: 1, prix: 190, description: 'Bilan partagé annuel · 1 rendez-vous par trimestre · coordination des intervenants · point mensuel aux aidants' },
        { id: 'f-serenite', nom: 'Sérénité', niveau: 2, prix: 390, description: 'Bilan partagé semestriel · 1 rendez-vous par mois · coordination active · récapitulatif hebdomadaire aux aidants' },
        { id: 'f-integral', nom: 'Intégral', niveau: 3, prix: 690, description: 'Bilan partagé trimestriel · visite toutes les 2 semaines · coordination complète 7j/7 · gestion administrative incluse' }
      ],
      options: [
        { id: 'o-chutes', nom: 'Prévention des chutes & téléassistance', prix: 25, unite: 'mois', quantiteDefaut: 1, domaine: 'mobilite', seuil: 5, description: 'Mise en place et suivi de la téléassistance, coordination kiné' },
        { id: 'o-rdvmed', nom: 'Accompagnement aux rendez-vous médicaux', prix: 45, unite: 'séance', quantiteDefaut: 2, domaine: 'sante', seuil: 6, description: 'Accompagnement physique et compte rendu aux aidants' },
        { id: 'o-nutrition', nom: 'Suivi nutrition & portage de repas', prix: 30, unite: 'mois', quantiteDefaut: 1, domaine: 'nutrition', seuil: 5, description: 'Organisation du portage, suivi du poids et de l\'appétit' },
        { id: 'o-cognition', nom: 'Stimulation cognitive', prix: 80, unite: 'mois', quantiteDefaut: 1, domaine: 'cognition', seuil: 5, description: 'Ateliers mémoire et suivi spécialisé' },
        { id: 'o-lien', nom: 'Lien social & activités', prix: 40, unite: 'mois', quantiteDefaut: 1, domaine: 'moral', seuil: 5, description: 'Sorties, activités, bénévoles, appels de convivialité' },
        { id: 'o-logement', nom: 'Pilotage de l\'adaptation du logement', prix: 450, unite: 'unique', quantiteDefaut: 1, domaine: 'logement', seuil: 6, description: 'Diagnostic ergothérapeute, devis, suivi des travaux, dossier MaPrimeAdapt\'' },
        { id: 'o-admin', nom: 'Gestion administrative & dossiers d\'aides', prix: 60, unite: 'mois', quantiteDefaut: 1, domaine: 'admin', seuil: 6, description: 'APA, caisses de retraite, impôts, courriers' },
        { id: 'o-patrimoine', nom: 'Suivi budgétaire & patrimonial', prix: 90, unite: 'mois', quantiteDefaut: 1, domaine: 'patrimoine', seuil: 6, description: 'Budget, coordination notaire et conseiller patrimonial' },
        { id: 'o-repit', nom: 'Soutien & répit des aidants', prix: 50, unite: 'mois', quantiteDefaut: 1, domaine: 'aidants', seuil: 5, description: 'Écoute, solutions de répit, groupe de parole' }
      ]
    };
  }

  const euro = (n) => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return v.toLocaleString('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  };
  const cat = () => S().state.offre;
  const score = (b, key) => Number(b?.domaines?.[key]?.score);

  // Niveau de besoin 1 à 3 à partir de l'indice d'autonomie, du GIR et des domaines fragiles.
  function recommend(senior) {
    const b = S().lastBilan(senior.id);
    if (!b) return null;
    const c = cat(), raisons = [];
    const g = S().scoreGlobal(b);
    let n = g >= 7 ? 1 : g >= 5 ? 2 : 3;
    raisons.push(`Indice d'autonomie ${g}/10 → besoin ${['', 'léger', 'modéré', 'important'][n]}`);
    if (b.gir) {
      const gn = b.gir <= 2 ? 3 : b.gir <= 4 ? 2 : 1;
      if (gn > n) { n = gn; raisons.push(`GIR ${b.gir} → accompagnement renforcé`); } else raisons.push(`GIR ${b.gir} cohérent avec ce niveau`);
    }
    const fragiles = S().DOMAINES.filter(d => score(b, d.key) <= 4);
    if (fragiles.length >= 3 && n < 3) { n++; raisons.push(`${fragiles.length} domaines en vigilance (${fragiles.map(d => d.court).join(', ')}) → niveau supérieur`); }
    const forfaits = c.forfaits.slice().sort((a, z) => Number(a.niveau) - Number(z.niveau));
    const forfait = forfaits.find(f => Number(f.niveau) === n) ||
      forfaits.reduce((best, f) => (!best || Math.abs(Number(f.niveau) - n) < Math.abs(Number(best.niveau) - n) ? f : best), null);
    const options = c.options.filter(o => o.domaine && !isNaN(score(b, o.domaine)) && score(b, o.domaine) <= Number(o.seuil))
      .map(o => { const d = S().DOMAINES.find(x => x.key === o.domaine); return { option: o, raison: `${d ? d.court : o.domaine} ${score(b, o.domaine)}/10` }; });
    return { forfait, niveau: n, raisons, options, bilanDate: b.date };
  }

  // Sélection retenue pour le senior, sinon la recommandation.
  function selection(senior) {
    if (senior.offre && senior.offre.forfaitId) return Object.assign({ remise: 0, options: [] }, senior.offre, { source: 'retenue' });
    const r = recommend(senior);
    if (!r || !r.forfait) return null;
    return { forfaitId: r.forfait.id, options: r.options.map(o => ({ id: o.option.id, quantite: Number(o.option.quantiteDefaut) || 1 })), remise: 0, statut: 'proposée', source: 'recommandee' };
  }

  function compute(sel) {
    const c = cat();
    const forfait = c.forfaits.find(f => f.id === sel.forfaitId) || null;
    const lignes = [];
    let optMensuel = 0, unique = Number(c.fraisMiseEnPlace) || 0;
    (sel.options || []).forEach(o => {
      const opt = c.options.find(x => x.id === o.id);
      if (!opt) return;
      const q = Number(o.quantite) || 1, pu = Number(opt.prix) || 0;
      const l = { id: opt.id, nom: opt.nom, unite: opt.unite, quantite: q, prix: pu, mensuel: 0, unique: 0 };
      if (opt.unite === 'unique') l.unique = pu * q; else l.mensuel = pu * q;
      optMensuel += l.mensuel; unique += l.unique;
      lignes.push(l);
    });
    const forfaitMensuel = forfait ? Number(forfait.prix) || 0 : 0;
    const mensuelBrut = forfaitMensuel + optMensuel;
    const remise = Math.round(mensuelBrut * (Number(sel.remise) || 0)) / 100;
    const mensuel = mensuelBrut - remise;
    const premiereAnnee = mensuel * 12 + unique;
    const credit = premiereAnnee * (Number(c.creditImpot) || 0) / 100;
    return { forfait, forfaitMensuel, lignes, optMensuel, mensuelBrut, remise, mensuel, unique, fraisMiseEnPlace: Number(c.fraisMiseEnPlace) || 0, premiereAnnee, credit, net: premiereAnnee - credit };
  }

  const uniteLabel = (l) => l.unite === 'séance' ? `${l.quantite} séance(s)/mois × ${euro(l.prix)}` : l.unite === 'unique' ? 'paiement unique' : 'par mois';

  // Bloc texte inséré dans chaque mail aux aidants.
  function textBlock(senior) {
    const sel = selection(senior);
    if (!sel) return [];
    const r = compute(sel);
    if (!r.forfait) return [];
    const lines = [sel.source === 'retenue' && sel.statut === 'acceptée' ? 'VOTRE FORMULE UP&IN' : 'FORMULE UP&IN ' + (sel.source === 'retenue' ? 'PROPOSÉE' : 'RECOMMANDÉE (à valider ensemble)'),
      `• Forfait ${r.forfait.nom} : ${euro(r.forfaitMensuel)} par mois`];
    r.lignes.forEach(l => lines.push(`• Option ${l.nom} : ${euro(l.mensuel || l.unique)}${l.unite === 'unique' ? ' (une fois)' : ' par mois'}${l.unite === 'séance' ? ` (${l.quantite} séance(s) × ${euro(l.prix)})` : ''}`));
    return lines.concat(totalLines(r));
  }

  function totalLines(r) {
    const lines = [];
    if (r.remise) lines.push(`• Remise : −${euro(r.remise)} par mois`);
    lines.push(`Coût mensuel total : ${euro(r.mensuel)}`);
    if (r.unique) lines.push(`Frais uniques (mise en place${r.lignes.some(l => l.unique) ? ' et options ponctuelles' : ''}) : ${euro(r.unique)}`);
    lines.push(`Coût total sur la première année : ${euro(r.premiereAnnee)}`);
    if (r.credit) lines.push(`Après crédit d'impôt estimé (${cat().creditImpot} %) : ${euro(r.net)}`);
    if (cat().mention) lines.push(cat().mention);
    return lines;
  }

  window.Offre = { defaultCatalogue, recommend, selection, compute, textBlock, totalLines, euro, uniteLabel };
})();
