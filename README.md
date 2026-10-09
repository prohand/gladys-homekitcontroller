# HomeKit Controller pour Gladys Assistant

Intégration externe [Gladys Assistant](https://gladysassistant.com) qui fait
de Gladys un **contrôleur HomeKit** : elle s'appaire directement avec les
accessoires HomeKit **IP** (Wi-Fi / Ethernet) et les pilote en local, sans
concentrateur Apple et sans cloud. C'est l'équivalent de l'intégration
« HomeKit Controller » de Home Assistant.

Construite à partir du template officiel
[`integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
et du SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Le protocole HomeKit (HAP) est géré par la librairie
[`hap-controller`](https://github.com/Apollon77/hap-controller-node).

Documentation utilisateur : [`docs/fr.md`](./docs/fr.md) / [`docs/en.md`](./docs/en.md).

## Fonctionnement

- **Découverte** : le conteneur de l'intégration est sur un réseau bridge, le
  mDNS ne l'atteint pas. Gladys fait la recherche `_hap._tcp` à sa place
  (`gladys.scanNetwork('mdns')`, déclaré dans le champ `network_discovery`
  du manifest). L'intégration lit les réponses brutes (`id`, `sf`, `ff`, `c#`…).
- **Appairage** : action « Appairer un accessoire » avec le code à 8
  chiffres (Pair Setup SRP). Les clés long terme sont stockées dans
  `/data/pairings.json` (droits `600`), le seul volume persistant.
- **Appareils** : un appareil Gladys par accessoire HomeKit (`aid`). Un pont
  donne donc plusieurs appareils. Les services connus sont traduits en
  fonctionnalités Gladys (voir le tableau dans la doc utilisateur).
- **États** : abonnement aux événements HomeKit (temps réel) + relecture
  complète toutes les `poll_frequency` secondes, par sécurité. Seules les
  valeurs qui changent sont publiées.
- **Robustesse** : un accessoire injoignable passe hors ligne (statut affiché
  dans l'écran de configuration) et l'intégration réessaie (10 s → 5 min).
  À partir du 2e échec, elle relance une recherche mDNS pour retrouver une
  nouvelle adresse IP (bail DHCP changé).

Limites : pas de Bluetooth (BLE) ni de Thread (le conteneur n'a pas accès à
la radio), pas de caméras ni de télévisions pour l'instant.

## Structure du projet

```
.
├─ index.js                          # câblage SDK <-> contrôleur (aucune logique HomeKit)
├─ src/
│  ├─ controller.js                  # connexions, événements, commandes, appairage
│  ├─ store.js                       # stockage des appairages dans /data
│  ├─ config.js                      # valeurs par défaut + normalisation de la config
│  ├─ hap/
│  │  ├─ client.js                   # client HAP IP (hap-controller) + timeouts
│  │  ├─ discovery.js                # lecture des réponses mDNS, code de config
│  │  └─ uuid.js                     # types de services / caractéristiques HomeKit
│  └─ mapping/
│     ├─ index.js                    # services HomeKit -> fonctionnalités Gladys
│     └─ color.js                    # conversions teinte/saturation <-> RGB
├─ test/                             # tests unitaires (node --test)
├─ docs/{fr,en}.md                   # documentation utilisateur (ré-hébergée par Gladys)
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, rootfs en lecture seule
└─ cover.png                         # couverture du catalogue (800×534)
```

Ajouter un type d'appareil : écrire un « mapper » dans
[`src/mapping/index.js`](./src/mapping/index.js) et l'ajouter à
`SERVICE_MAPPERS`.

## Lancer en local

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="homekit-controller" \
HOMEKIT_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

Les trois variables `GLADYS_*` sont injectées par le superviseur Gladys dans
le conteneur. `HOMEKIT_DATA_DIR` vaut `/data` par défaut.

## Contrôles qualité

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # tests unitaires
npx github:GladysAssistant/integration-store .   # validation du store Gladys
```

Les trois premiers tournent dans la CI à chaque push sur `main` et à chaque
pull request.

## Publier

1. Ajouter le topic GitHub `gladys-assistant-integration` au dépôt (dépôt public).
2. **Actions → Release → Run workflow** (`patch`, `minor` ou `major`) : la
   version est mise à jour partout, le tag `vX.Y.Z` est poussé et l'image
   `ghcr.io/prohand/gladys-homekitcontroller` est construite en
   `linux/amd64` + `linux/arm64`.
3. Rendre le package `ghcr.io` **public** (paramètres du package sur GitHub).
4. L'indexeur du store Gladys détecte la nouvelle version.

## Notes

- Node.js ≥ 20. L'image utilise Node 24.
- `npm ci --ignore-scripts` dans le Dockerfile : `hap-controller` dépend du
  module Bluetooth natif `noble`, qu'on ne charge jamais (on importe
  directement le transport IP). Les alertes `npm audit` viennent de cette
  partie Bluetooth inutilisée.

## Licence

Apache-2.0
