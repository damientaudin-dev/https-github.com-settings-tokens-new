# Le Cercle — Up&In, Family Office de l'Autonomie

**Le Cercle** est le logiciel de coordination d'Up&In. Il réunit, pour chaque senior accompagné :

- le **bilan partagé** (10 domaines notés de 0 à 10, GIR, synthèse, besoins, recommandations) avec **radar**, **évolution dans le temps**, **tableaux** (plan d'action, aides et financements, budget) et **schéma du cercle d'accompagnement** ;
- les **comptes rendus des intervenants**, soignants et non soignants (saisie, message collé, import CSV/JSON, photos et PDF joints), avec le suivi des indicateurs (poids, tension, douleur…) ;
- le **calendrier des interventions** (prévue, réalisée, reportée, annulée), avec un **court compte rendu** à transmettre aux aidants ;
- une **version du calendrier pour le senior** en gros caractères, imprimable : date, heure, intervention, **avec qui** et **pourquoi** ;
- la **génération des mails** pour le senior, les aidants et les intervenants, pré-remplis à partir du dossier ;
- le **forfait le plus adapté** : la recommandation s'appuie sur le bilan partagé (indice d'autonomie, GIR, domaines fragiles). L'application propose aussi les **options utiles**, conseillées selon les scores de chaque domaine, et calcule le **coût total** : coût mensuel, frais de mise en place, première année, remise et crédit d'impôt estimé. **Chaque mail aux aidants rappelle le forfait, les options et le coût total.** La grille tarifaire se modifie dans *Réglages › Forfaits & tarifs* ; les tarifs fournis ne sont qu'un exemple, à remplacer par les vôtres ;
- la saisie des **rendez-vous**, **pendant** l'entretien (chronomètre, notation par domaine, sauvegarde automatique) ou **après**, à partir de la photo des notes papier.

Le logo Up&In est utilisé tel quel (`assets/logo-upandin.jpg`). La charte reprend ses couleurs : bleu nuit `#10214c`, or `#b8892f` / `#e6c06f`, ivoire, avec une typographie à empattements.

## Installation sur l'iPad, le Mac ou le PC

Le Cercle est une application web installable (PWA). Une fois installée, elle a sa propre icône, s'ouvre en plein écran et fonctionne **hors connexion**.

1. **Publier l'application** (une seule fois) : dans GitHub, *Settings › Pages › Source : GitHub Actions*. Le workflow `.github/workflows/pages.yml` publie la branche `main` à une adresse en `https://…github.io/…`. Tout hébergement HTTPS statique convient aussi.
2. **iPad / iPhone** : ouvrir l'adresse dans **Safari** › bouton **Partager** › **Sur l'écran d'accueil**.
3. **Mac** : Safari › **Fichier › Ajouter au Dock**, ou Chrome / Edge › icône **Installer** dans la barre d'adresse.
4. **PC Windows** : Edge ou Chrome › menu › **Installer Le Cercle**. L'icône apparaît sur le bureau et dans le menu Démarrer.

Pour un essai local : `python3 -m http.server` dans ce dossier, puis ouvrir `http://localhost:8000`.

## Données et confidentialité

- Les données sont stockées **sur l'appareil** (IndexedDB). Rien n'est envoyé à un serveur.
- Un **code d'accès** peut être activé (Réglages). Verrouillage automatique après 10 minutes d'inactivité.
- **Sauvegarde** : Réglages › *Exporter une sauvegarde* (fichier JSON à ranger dans Fichiers, iCloud Drive…). L'export d'**un seul dossier** permet de le transmettre à un autre poste, qui l'intègre via *Transmissions › Importer un fichier Le Cercle*.
- Les données de santé sont sensibles (RGPD). Une synchronisation entre appareils via un serveur imposerait un hébergeur certifié HDS ; cette version, volontairement locale, n'en a pas besoin.

## Intégrer les données des intervenants

Écran **Transmissions** :

| Source | Comment |
|---|---|
| Compte rendu oral ou papier | *Saisir un compte rendu* (indicateurs, photos, PDF) |
| Mail ou SMS d'un intervenant | *Coller un mail ou un SMS* : la date, la tension, le poids, la douleur et les points de vigilance sont repérés automatiquement, puis vérifiés avant d'être enregistrés |
| Planning ou export d'une structure | *Importer un fichier CSV* (modèles téléchargeables, séparateur `;`, compatible Excel / Numbers) |
| Autre poste Le Cercle | *Importer un fichier Le Cercle* (JSON) |

Le mail type *Demande de compte rendu (intervenant)* propose à chaque intervenant une trame de réponse simple à recopier.

## Structure

```
index.html            application (une seule page)
manifest.webmanifest  installation (nom, icônes, couleurs)
sw.js                 fonctionnement hors ligne
css/style.css         charte graphique Up&In
js/offre.js           forfaits, options, recommandation et calcul du coût
js/store.js           données (IndexedDB), domaines du bilan, démonstration
js/charts.js          graphiques SVG : radar, courbes, barres, schéma du cercle
js/emails.js          modèles de mails
js/app.js             écrans et logique
assets/               logo Up&In et icônes
```

Aucune dépendance ni étape de compilation.
