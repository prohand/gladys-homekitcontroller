# CLAUDE.md

Guide pour Claude Code (et tout contributeur) sur ce dépôt.

## Le projet

Intégration externe **Gladys Assistant** « HomeKit Controller » : Gladys
s'appaire avec des accessoires HomeKit **IP** (HAP sur Wi-Fi / Ethernet) et
les pilote en local. Basée sur le template officiel
`GladysAssistant/integration-template-js`, le SDK
`@gladysassistant/integration-sdk` et la librairie `hap-controller`.

L'intégration tourne dans un conteneur Docker supervisé par Gladys.

## Commandes

```bash
npm install            # dépendances (ajouter --ignore-scripts si noble échoue)
npm test               # tests unitaires (node --test, aucun framework)
npm run lint           # ESLint
npm run format         # Prettier (écrit) — npm run format:check pour vérifier
npx github:GladysAssistant/integration-store .   # validation du store (Node >= 24)
```

Avant chaque commit : `npm run format:check && npm run lint && npm test`.

## Architecture

- `index.js` : câblage SDK ↔ contrôleur uniquement. **Aucune logique HomeKit ici.**
- `src/controller.js` : connexions aux accessoires, événements, relecture
  périodique, commandes, appairage, statut de connexion.
- `src/mapping/index.js` : traduction **pure** service HomeKit → fonctionnalités
  Gladys (`SERVICE_MAPPERS`). Ajouter un type d'appareil = ajouter un mapper +
  un test dans `test/mapping.test.js`.
- `src/hap/` : client HAP (`client.js`), lecture mDNS (`discovery.js`), types
  de services / caractéristiques (`uuid.js`).
- `src/store.js` : appairages dans `/data/pairings.json`.
- `scripts/changelog.js` : outil du CHANGELOG utilisé par les workflows de release.
- `test/helpers/` : faux SDK Gladys, faux client HAP, base d'accessoires de test.

## Règles à respecter

- **External IDs stables** : `accessory:<id hex>-<aid>` pour l'appareil et la
  clé de fonctionnalité (`<iid>`, `color-<iid>`, `state-<iid>`). Les changer
  casse les appareils déjà créés chez les utilisateurs.
- **Sandbox Gladys** : rootfs en lecture seule, seul `/data` est inscriptible ;
  le conteneur ne reçoit pas le mDNS (passer par `gladys.scanNetwork('mdns')`) ;
  pas d'accès Bluetooth.
- **Ne jamais importer `hap-controller` par son point d'entrée** : il charge le
  module Bluetooth natif `noble`. Importer `hap-controller/lib/transport/ip/...`
  (voir `src/hap/client.js`). Le Dockerfile installe avec `--ignore-scripts`.
- **Secrets** : ne jamais journaliser le code de configuration ni les données
  d'appairage (`pairingData`). Le fichier des appairages est en droits `600`.
- **Toute requête vers un accessoire passe par `withTimeout`** : un socket TCP
  vers un accessoire débranché peut sinon bloquer plusieurs minutes.
- **Manifest** (`gladys-assistant-integration.json`) : `description` ≤ 100
  caractères par langue, textes multilingues en objet `{ en, fr }` (y compris
  `placeholder`), `default` identiques à `DEFAULT_CONFIG` (`src/config.js`),
  chaque action doit avoir un `gladys.onAction` dans `index.js`. Les tests
  `test/manifest.test.js` et le workflow « Validate manifest » le vérifient.
- **Docs utilisateur** `docs/fr.md` et `docs/en.md` obligatoires (store) : les
  mettre à jour quand le comportement visible change.
- Commentaires de code en anglais, style du code existant (ESM, Prettier).

## Changelog et versions

- Chaque changement visible ajoute une ligne sous `## [Unreleased]` dans
  `CHANGELOG.md` (rubriques `Ajouté`, `Modifié`, `Corrigé`, `Supprimé`, `Sécurité`).
- Ne jamais modifier à la main `version` / `docker_image` du manifest ni la
  version de `package.json` : le workflow **Release** s'en charge (il déplace
  aussi `Unreleased` dans la nouvelle version et publie la Release GitHub).

## Tester avec un vrai accessoire simulé

Les tests unitaires utilisent des faux. Pour un test de bout en bout, lancer
un accessoire HomeKit simulé avec `hap-nodejs` (dans un dossier à part) sur
`127.0.0.1:51826`, puis instancier `HomeKitController` avec un faux `gladys`
dont `scanNetwork` renvoie
`[{ name, addresses: ['127.0.0.1'], port: 51826, txt: ['id=11:22:33:44:55:66', 'sf=1', 'ff=0'] }]`
et appeler `pair()`, `setValue()`, etc.
