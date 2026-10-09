# Politique de sécurité

## Versions prises en charge

Seule la **dernière version publiée** reçoit des correctifs de sécurité.
Mettez l'intégration à jour depuis Gladys dès qu'une nouvelle version est
proposée.

| Version              | Prise en charge |
| -------------------- | --------------- |
| Dernière version     | ✅              |
| Versions précédentes | ❌              |

## Signaler une vulnérabilité

**N'ouvrez pas d'issue publique** pour une faille de sécurité.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt →
**Report a vulnerability**. Indiquez si possible :

- la version de l'intégration et de Gladys ;
- le type d'accessoire HomeKit concerné ;
- les étapes pour reproduire et l'impact ;
- les logs utiles, **sans** code de configuration ni contenu de
  `/data/pairings.json`.

Nous accusons réception sous 7 jours et visons un correctif sous 30 jours
selon la gravité. Vous serez crédité dans le changelog si vous le souhaitez.

## Périmètre

Concernés : le code de ce dépôt, son image Docker
(`ghcr.io/prohand/gladys-homekitcontroller`) et ses workflows GitHub.

Hors périmètre (à signaler aux projets concernés) : Gladys Assistant
lui-même, les librairies tierces (`hap-controller`, SDK Gladys…) et le
firmware des accessoires HomeKit.

## Mesures en place

- **Tout reste local** : aucun cloud, aucune donnée envoyée à l'extérieur.
  L'intégration n'ouvre aucun port entrant.
- **Appairages** : les clés long terme HomeKit sont stockées dans
  `/data/pairings.json`, en droits `600`, dans le volume privé de
  l'intégration. Le code de configuration n'est ni stocké ni journalisé.
- **Conteneur** : utilisateur non root, système de fichiers en lecture seule
  (sauf `/data`).
- **Communications HomeKit** chiffrées de bout en bout par le protocole HAP
  (SRP, Ed25519, ChaCha20-Poly1305).
- **Dépendances** : Dependabot propose les mises à jour des dépendances npm
  chaque semaine, des actions GitHub et de l'image de base chaque mois.
- Les alertes `npm audit` actuelles viennent de la partie Bluetooth de
  `hap-controller` (`noble` et ses outils d'installation) : ce code n'est
  jamais chargé (import direct du transport IP) et ses scripts
  d'installation ne sont pas exécutés (`npm ci --ignore-scripts`).
