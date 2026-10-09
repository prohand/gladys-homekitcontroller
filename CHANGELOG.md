# Changelog

Toutes les évolutions notables de l'intégration sont listées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et
le projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

Ajoutez vos entrées sous **[Unreleased]** (rubriques `Ajouté`, `Modifié`,
`Corrigé`, `Supprimé`, `Sécurité`). Le workflow **Release** les déplace dans
la section de la nouvelle version et les publie dans la Release GitHub.

## [Unreleased]

### Ajouté

- Badge « local » dans le store : le manifest déclare `transports: ["local"]`
  (les accessoires HomeKit IP sont pilotés sur le réseau local, sans cloud).

## [1.0.2] - 2026-10-09

### Ajouté

- Déclencheur de scène « Bouton HomeKit appuyé » : boutons programmables et
  sonnettes (appui simple, double, long ; filtre par appareil et numéro de
  bouton).
- Déclencheur de scène « Accessoire HomeKit perdu / revenu ».
- Actions de scène « Identifier un appareil HomeKit » et « Relire un
  appareil HomeKit ».
- Widget de tableau de bord « Accessoires HomeKit » : accessoires en ligne /
  hors ligne et bouton « Reconnecter ».

### Modifié

- Gladys 5.1.0 ou plus récent est maintenant nécessaire (widgets et scènes).

## [1.0.1] - 2026-10-09

### Ajouté

- Intégration « HomeKit Controller » : Gladys devient un contrôleur HomeKit
  pour les accessoires IP (Wi-Fi / Ethernet), sans concentrateur Apple.
- Recherche des accessoires (mDNS `_hap._tcp`) par l'intermédiaire de Gladys.
- Appairage avec le code à 8 chiffres, appairages stockés dans `/data`.
- Un appareil Gladys par accessoire HomeKit, ponts (bridges) compris.
- Prise en charge des lampes (marche/arrêt, luminosité, couleur,
  température), interrupteurs, prises, vannes, ventilateurs, thermostats,
  volets / fenêtres / portes, serrures, capteurs et batteries.
- États en temps réel (événements HomeKit) et relecture périodique.
- Reconnexion automatique et nouvelle recherche de l'adresse IP d'un
  accessoire injoignable.
- Actions : rechercher, appairer, identifier, désappairer.
- Documentation utilisateur en français et en anglais.
- CI identique à `gladys-forecastsolar` : Prettier, ESLint et tests sous
  Node 22 et 24, build de l'image Docker et contrôles du store Gladys sur
  chaque pull request.
- Dependabot : dépendances npm (chaque semaine), actions GitHub et image
  Docker (chaque mois).
- Une Release GitHub par version, avec les notes de ce changelog.

[Unreleased]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-homekitcontroller/releases/tag/v1.0.1
