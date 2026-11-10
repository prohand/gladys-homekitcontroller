# Changelog

Toutes les évolutions notables de l'intégration sont listées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et
le projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

Ajoutez vos entrées sous **[Unreleased]** (rubriques `Ajouté`, `Modifié`,
`Corrigé`, `Supprimé`, `Sécurité`). Le workflow **Release** les déplace dans
la section de la nouvelle version et les publie dans la Release GitHub.

## [Unreleased]

## [1.4.0] - 2026-11-10

### Ajouté

- Mesure d'énergie : puissance (W), énergie (kWh), tension et courant lus
  dans les caractéristiques **Eve** (accessoires Eve, plugins Homebridge).
- Les logs listent aussi les caractéristiques propres au fabricant des
  services pris en charge (`vendor characteristic(s) not supported: …`),
  pour repérer une mesure cachée (ex. puissance d'une prise).

### Modifié

- Les services techniques d'un hub (transport Wi-Fi / Thread, informations
  d'exécution : `22A`, `701`, `239`) ne sont plus signalés comme non pris en
  charge.

## [1.3.0] - 2026-11-09

### Ajouté

- Boutons et sonnettes : chaque bouton donne une fonctionnalité Gladys
  « Bouton » (`1` simple, `2` double, `6` long ; `1` pour une sonnette),
  utilisable avec le déclencheur d'état d'appareil habituel. Le déclencheur
  `button_pressed` reste inchangé.
- Climatiseurs (service HomeKit « Heater Cooler ») : marche/arrêt, mode
  (auto, froid, chaud), consigne et température.
- Thermostats : mode (arrêt, chauffe, froid, auto) et état de fonctionnement.
- Capteurs de qualité d'air : COV, NO2, ozone et SO2 (µg/m³).
- Les logs listent, à chaque connexion, les services HomeKit non pris en
  charge de chaque accessoire.

## [1.2.0] - 2026-10-25

### Ajouté

- Mots-clés de recherche du catalogue (`keywords` : HAP, Apple Home,
  Homebridge, marques d'accessoires HomeKit Wi-Fi).

### Modifié

- SDK `@gladysassistant/integration-sdk` mis à jour en 0.16.0.
- Gladys 5.3.0 ou plus récent est désormais requis (champ `keywords` du
  manifest).
- CI : les vérifications du store passent `--skip-image-check` sur les pull
  requests ; le workflow Release relance la vérification complète, image
  comprise, une fois l'image publiée.

## [1.1.1] - 2026-10-23

- Maintenance release, no functional change.

## [1.1.0] - 2026-10-13

### Ajouté

- Traductions allemande et espagnole (écran de configuration, messages,
  widgets, documentation).

### Corrigé

- La documentation anglaise nomme les écrans de Gladys comme le fait l'interface
  de Gladys.

## [1.0.4] - 2026-10-12

### Modifié

- SDK `@gladysassistant/integration-sdk` mis à jour en 0.15.0.
- Le dédoublonnage des états et la lecture des enregistrements TXT mDNS
  passent par le SDK (`publishChangedStates`, `parseMdnsTxt`).

### Corrigé

- Un appareil ajouté dans Gladys reçoit ses valeurs dès la lecture suivante,
  même quand elles n'ont pas changé depuis leur dernier envoi (Gladys ignorait
  les états envoyés avant la création de l'appareil).

## [1.0.3] - 2026-10-09

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

[Unreleased]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-homekitcontroller/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-homekitcontroller/releases/tag/v1.0.1
