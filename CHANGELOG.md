# Changelog

Toutes les évolutions notables de l'intégration sont listées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et
le projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

Ajoutez vos entrées sous **[Unreleased]** (rubriques `Ajouté`, `Modifié`,
`Corrigé`, `Supprimé`, `Sécurité`). Le workflow **Release** les déplace dans
la section de la nouvelle version et les publie dans la Release GitHub.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-homekitcontroller/releases/tag/v1.0.1
