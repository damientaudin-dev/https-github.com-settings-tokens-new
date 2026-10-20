/* Le Cercle — stockage local (IndexedDB, repli localStorage).
   Les données restent sur l'appareil ; l'export JSON sert de sauvegarde / transfert. */
(function () {
  'use strict';

  const DB_NAME = 'le-cercle';
  const STORE = 'kv';
  const KEY = 'state';
  const LS_KEY = 'le-cercle-state';

  // Domaines du bilan partagé (score 0 = dépendance forte, 10 = pleine autonomie / situation sécurisée)
  const DOMAINES = [
    { key: 'sante', label: 'Santé & suivi médical', court: 'Santé' },
    { key: 'mobilite', label: 'Mobilité & prévention des chutes', court: 'Mobilité' },
    { key: 'nutrition', label: 'Nutrition & hydratation', court: 'Nutrition' },
    { key: 'cognition', label: 'Mémoire & cognition', court: 'Cognition' },
    { key: 'moral', label: 'Moral & lien social', court: 'Moral' },
    { key: 'quotidien', label: 'Actes de la vie quotidienne', court: 'Quotidien' },
    { key: 'logement', label: 'Logement & adaptation', court: 'Logement' },
    { key: 'admin', label: 'Administratif & droits', court: 'Droits' },
    { key: 'patrimoine', label: 'Budget & patrimoine', court: 'Patrimoine' },
    { key: 'aidants', label: 'Soutien des aidants', court: 'Aidants' }
  ];

  const CATEGORIES = {
    aidant: { label: 'Aidant', color: '#b8892f' },
    soignant: { label: 'Soignant', color: '#2f5fa7' },
    'non-soignant': { label: 'Non soignant', color: '#169c84' },
    upin: { label: 'Up&In', color: '#10214c' }
  };

  const STATUTS = {
    prevue: { label: 'Prévue', cls: 'st-prevue', icon: '○' },
    faite: { label: 'Réalisée', cls: 'st-faite', icon: '✓' },
    reportee: { label: 'Reportée', cls: 'st-reportee', icon: '↻' },
    annulee: { label: 'Annulée', cls: 'st-annulee', icon: '✕' }
  };

  const ROLES_SOIGNANTS = ['Médecin traitant', 'Infirmier(ère)', 'Kinésithérapeute', 'Ergothérapeute', 'Orthophoniste', 'Psychologue', 'Gériatre', 'Pharmacien', 'Podologue', 'Aide-soignant(e)', 'Diététicien(ne)', 'Spécialiste'];
  const ROLES_NON_SOIGNANTS = ['Aide à domicile', 'Auxiliaire de vie', 'Portage de repas', 'Assistante sociale', 'Notaire', 'Conseiller patrimonial', 'Mandataire / tuteur', 'Artisan / adaptation logement', 'Téléassistance', 'Transport accompagné', 'Animateur / bénévole', 'Coiffeur / esthétique', 'Coordinateur Up&In'];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyState() {
    return {
      version: 1,
      cabinet: { conseiller: '', email: '', tel: '', signature: "L'équipe Up&In — Family Office de l'Autonomie" },
      securite: { pinHash: null },
      offre: window.Offre.defaultCatalogue(),
      seniors: [],
      bilans: [],
      comptesRendus: [],
      interventions: [],
      mailsLog: []
    };
  }

  // ---------- IndexedDB ----------
  let dbPromise = null;
  function openDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('no-idb'));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  const Store = {
    state: emptyState(),
    DOMAINES, CATEGORIES, STATUTS, ROLES_SOIGNANTS, ROLES_NON_SOIGNANTS,
    uid,

    async load() {
      let data = null;
      try { data = await idbGet(KEY); } catch (e) {
        try { data = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e2) { data = null; }
      }
      this.state = Object.assign(emptyState(), data || {});
      if (navigator.storage && navigator.storage.persist) {
        try { navigator.storage.persist(); } catch (e) { /* facultatif */ }
      }
      return this.state;
    },

    _timer: null,
    save() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 250);
    },
    async flush() {
      clearTimeout(this._timer);
      try { await idbSet(KEY, this.state); } catch (e) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch (e2) {
          window.dispatchEvent(new CustomEvent('lc-save-error'));
        }
      }
    },

    replace(data) {
      this.state = Object.assign(emptyState(), data);
      return this.flush();
    },

    // ---------- Accès ----------
    senior(id) { return this.state.seniors.find(s => s.id === id); },
    seniorName(id, formel) {
      const s = this.senior(id);
      if (!s) return '—';
      return formel ? `${s.civilite || ''} ${s.prenom} ${s.nom}`.trim() : `${s.prenom} ${s.nom}`;
    },
    bilansOf(id) { return this.state.bilans.filter(b => b.seniorId === id).sort((a, b) => a.date.localeCompare(b.date)); },
    lastBilan(id) { const l = this.bilansOf(id); return l[l.length - 1] || null; },
    crOf(id) { return this.state.comptesRendus.filter(c => c.seniorId === id).sort((a, b) => b.date.localeCompare(a.date)); },
    interventionsOf(id) {
      return this.state.interventions.filter(i => !id || i.seniorId === id)
        .sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
    },
    scoreGlobal(bilan) {
      if (!bilan) return null;
      const vals = DOMAINES.map(d => Number(bilan.domaines?.[d.key]?.score)).filter(v => !isNaN(v));
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
    },

    upsert(collection, item) {
      const list = this.state[collection];
      if (!item.id) item.id = uid();
      const i = list.findIndex(x => x.id === item.id);
      if (i >= 0) list[i] = item; else list.push(item);
      this.save();
      return item;
    },
    remove(collection, id) {
      this.state[collection] = this.state[collection].filter(x => x.id !== id);
      this.save();
    },
    removeSenior(id) {
      this.state.seniors = this.state.seniors.filter(s => s.id !== id);
      ['bilans', 'comptesRendus', 'interventions'].forEach(c => {
        this.state[c] = this.state[c].filter(x => x.seniorId !== id);
      });
      this.save();
    },

    // ---------- Données de démonstration ----------
    loadDemo() {
      const today = new Date();
      const d = (offset) => {
        const x = new Date(today); x.setDate(x.getDate() + offset);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      };
      const sid = uid();
      const senior = {
        id: sid, civilite: 'Mme', prenom: 'Jeanne', nom: 'Martin (démo)', naissance: '1938-04-12',
        adresse: '12 avenue des Tilleuls, 69006 Lyon', tel: '04 00 00 00 00', email: 'jeanne.martin@example.com',
        situation: 'Vit seule en appartement (3e étage avec ascenseur). Veuve depuis 2021.',
        medecin: 'Dr Bernard', notes: 'Aime la lecture et les promenades au parc. Préfère être appelée le matin.',
        aidants: [
          { id: uid(), prenom: 'Claire', nom: 'Martin', lien: 'Fille', tel: '06 00 00 00 01', email: 'claire.martin@example.com', principal: true },
          { id: uid(), prenom: 'Paul', nom: 'Martin', lien: 'Fils', tel: '06 00 00 00 02', email: 'paul.martin@example.com', principal: false }
        ],
        intervenants: [
          { id: uid(), nom: 'Dr Bernard', role: 'Médecin traitant', categorie: 'soignant', structure: 'Cabinet du Parc', tel: '', email: '' },
          { id: uid(), nom: 'Sophie Leroy', role: 'Infirmier(ère)', categorie: 'soignant', structure: 'Cabinet IDE Lyon 6', tel: '', email: '' },
          { id: uid(), nom: 'Marc Petit', role: 'Kinésithérapeute', categorie: 'soignant', structure: '', tel: '', email: '' },
          { id: uid(), nom: 'Amina Diallo', role: 'Aide à domicile', categorie: 'non-soignant', structure: 'Domicile Services', tel: '', email: '' },
          { id: uid(), nom: 'Lucie Morel', role: 'Ergothérapeute', categorie: 'soignant', structure: '', tel: '', email: '' },
          { id: uid(), nom: 'Maître Garnier', role: 'Notaire', categorie: 'non-soignant', structure: 'Étude Garnier', tel: '', email: '' }
        ]
      };
      const mk = (scores, comments) => {
        const o = {};
        DOMAINES.forEach((dm, i) => { o[dm.key] = { score: scores[i], commentaire: (comments && comments[i]) || '' }; });
        return o;
      };
      const bilans = [
        {
          id: uid(), seniorId: sid, date: d(-180), auteur: 'Up&In', gir: 5,
          domaines: mk([6, 4, 5, 7, 4, 6, 4, 5, 6, 5]),
          synthese: 'Bilan initial.', besoins: '', recommandations: '',
          planAction: [], aides: [], budget: { ressources: [], charges: [] }
        },
        {
          id: uid(), seniorId: sid, date: d(-14), auteur: 'Up&In', gir: 5,
          domaines: mk([7, 5, 6, 7, 6, 6, 7, 7, 7, 6], [
            'Suivi régulier par le Dr Bernard. Traitement HTA stable.',
            'Une chute sans gravité en juillet. Kiné 2×/semaine.',
            'Appétit correct, portage de repas le soir à envisager.',
            'Aucune plainte mnésique significative.',
            'Moral meilleur depuis la reprise du club de lecture.',
            'Aide pour la toilette 3 matins par semaine.',
            'Barres d\'appui installées, douche à l\'italienne en cours.',
            'Dossier APA déposé.',
            'Budget équilibré, réflexion sur la donation en cours.',
            'Claire très présente, Paul plus à distance.'
          ]),
          synthese: 'Mme Martin maintient une bonne autonomie à domicile. Les priorités sont la prévention des chutes, la finalisation de l\'adaptation de la salle de bain et l\'obtention de l\'APA pour pérenniser l\'aide à domicile.',
          besoins: 'Sécuriser la salle de bain ; renforcer la présence le week-end ; soulager Claire (aidante principale).',
          recommandations: 'Téléassistance avec détecteur de chute. Kinésithérapie de rééducation à l\'équilibre. Répit pour l\'aidante 1 week-end par mois.',
          planAction: [
            { id: uid(), action: 'Travaux douche à l\'italienne', responsable: 'Artisan / ergothérapeute', echeance: d(20), statut: 'en cours' },
            { id: uid(), action: 'Installation téléassistance', responsable: 'Up&In', echeance: d(7), statut: 'à faire' },
            { id: uid(), action: 'Suivi dossier APA', responsable: 'Up&In', echeance: d(30), statut: 'en cours' },
            { id: uid(), action: 'Rendez-vous notaire (donation)', responsable: 'Maître Garnier', echeance: d(45), statut: 'à faire' }
          ],
          aides: [
            { id: uid(), nom: 'APA à domicile', organisme: 'Département', montant: 450, statut: 'demandée' },
            { id: uid(), nom: 'Crédit d\'impôt services à la personne', organisme: 'Impôts', montant: 210, statut: 'obtenue' },
            { id: uid(), nom: 'MaPrimeAdapt\'', organisme: 'ANAH', montant: 3500, statut: 'demandée' }
          ],
          budget: {
            ressources: [{ libelle: 'Pensions de retraite', montant: 2150 }, { libelle: 'Pension de réversion', montant: 620 }, { libelle: 'Revenus locatifs', montant: 480 }],
            charges: [{ libelle: 'Logement & charges', montant: 780 }, { libelle: 'Aide à domicile', montant: 690 }, { libelle: 'Santé / mutuelle', montant: 160 }, { libelle: 'Alimentation', montant: 420 }, { libelle: 'Divers', montant: 300 }]
          }
        }
      ];
      const I = senior.intervenants;
      const interventions = [
        [-10, '09:30', I[2], 'Séance de kinésithérapie', 'Rééducation à l\'équilibre', 'faite', 'Bonne séance, progrès sur l\'appui unipodal.'],
        [-7, '10:00', I[0], 'Consultation de suivi', 'Renouvellement traitement tension', 'faite', 'Tension 13/8. Traitement renouvelé à l\'identique.'],
        [-6, '09:30', I[2], 'Séance de kinésithérapie', 'Rééducation à l\'équilibre', 'faite', ''],
        [-3, '14:00', I[4], 'Visite ergothérapeute', 'Préconisations salle de bain', 'faite', 'Préconise barre supplémentaire + siège de douche.'],
        [-1, '08:30', I[1], 'Prise de sang', 'Bilan biologique annuel', 'reportee', 'Reportée : Mme Martin n\'était pas à jeun.'],
        [1, '08:30', I[1], 'Prise de sang', 'Bilan biologique annuel', 'prevue', ''],
        [2, '09:30', I[2], 'Séance de kinésithérapie', 'Rééducation à l\'équilibre', 'prevue', ''],
        [3, '10:00', I[3], 'Aide à domicile', 'Courses et entretien du logement', 'prevue', ''],
        [7, '15:00', { nom: 'Up&In', role: 'Coordinateur Up&In', categorie: 'upin' }, 'Installation téléassistance', 'Sécurité en cas de chute', 'prevue', ''],
        [9, '09:30', I[2], 'Séance de kinésithérapie', 'Rééducation à l\'équilibre', 'prevue', ''],
        [14, '11:00', I[0], 'Consultation', 'Résultats de la prise de sang', 'prevue', ''],
        [45, '16:00', I[5], 'Rendez-vous chez le notaire', 'Préparer la donation aux enfants', 'prevue', '']
      ].map(([o, h, who, type, motif, statut, cr]) => ({
        id: uid(), seniorId: sid, date: d(o), heure: h, duree: 60, type, motif, statut, cr,
        intervenant: who.nom, role: who.role, categorie: who.categorie, lieu: 'Domicile', transmis: statut === 'faite' && o < -5 ? d(o) : null
      }));
      const comptesRendus = [
        { id: uid(), seniorId: sid, date: d(-30), auteur: 'Sophie Leroy', role: 'Infirmier(ère)', categorie: 'soignant', mode: 'saisie', titre: 'Passage infirmier', contenu: 'Pilulier préparé pour la semaine. Bonne observance.', observations: '', alertes: '', indicateurs: { poids: 61.5, tas: 14, tad: 8, douleur: 3, humeur: 3 }, photos: [] },
        { id: uid(), seniorId: sid, date: d(-21), auteur: 'Sophie Leroy', role: 'Infirmier(ère)', categorie: 'soignant', mode: 'saisie', titre: 'Passage infirmier', contenu: 'RAS. Petite fatigue signalée.', observations: '', alertes: '', indicateurs: { poids: 61.0, tas: 13, tad: 8, douleur: 4, humeur: 3 }, photos: [] },
        { id: uid(), seniorId: sid, date: d(-14), auteur: 'Up&In', role: 'Coordinateur Up&In', categorie: 'upin', mode: 'pendant', titre: 'Rendez-vous bilan partagé', contenu: 'Réévaluation complète de la situation avec Mme Martin et sa fille Claire.', observations: 'Mme Martin souhaite rester à domicile le plus longtemps possible.', alertes: '', indicateurs: { poids: 60.8, humeur: 4 }, photos: [] },
        { id: uid(), seniorId: sid, date: d(-7), auteur: 'Dr Bernard', role: 'Médecin traitant', categorie: 'soignant', mode: 'import', titre: 'Consultation de suivi', contenu: 'Tension 13/8. Traitement renouvelé. Bilan sanguin prescrit.', observations: '', alertes: '', indicateurs: { poids: 60.5, tas: 13, tad: 8, douleur: 2 }, photos: [] },
        { id: uid(), seniorId: sid, date: d(-4), auteur: 'Amina Diallo', role: 'Aide à domicile', categorie: 'non-soignant', mode: 'saisie', titre: 'Passage aide à domicile', contenu: 'Courses faites. Réfrigérateur un peu vide, Mme Martin mange peu le soir.', observations: 'À surveiller : appétit le soir.', alertes: 'Appétit en baisse le soir', indicateurs: { humeur: 4, appetit: 2 }, photos: [] },
        { id: uid(), seniorId: sid, date: d(-3), auteur: 'Lucie Morel', role: 'Ergothérapeute', categorie: 'soignant', mode: 'saisie', titre: 'Visite ergothérapeute', contenu: 'Préconisations : barre d\'appui supplémentaire, siège de douche, retrait du tapis du salon.', observations: '', alertes: 'Tapis du salon : risque de chute', indicateurs: { douleur: 2 }, photos: [] }
      ];
      this.state.seniors.push(senior);
      this.state.bilans.push(...bilans);
      this.state.interventions.push(...interventions);
      this.state.comptesRendus.push(...comptesRendus);
      this.save();
      return sid;
    }
  };

  window.Store = Store;
})();
