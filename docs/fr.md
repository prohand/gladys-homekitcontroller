# HomeKit Controller

Cette intégration fait de Gladys un **contrôleur HomeKit** : elle s'appaire
directement avec vos accessoires HomeKit Wi-Fi / Ethernet et les pilote en
local, **sans iPhone, sans Apple TV ni HomePod**, et sans cloud.

## Avant de commencer

- Un accessoire HomeKit n'accepte **qu'un seul contrôleur** à la fois.
  S'il est déjà dans l'app **Maison** d'Apple (ou dans Home Assistant…),
  retirez-le d'abord. Sinon, faites une remise à zéro de l'accessoire.
- Gardez sous la main le **code de configuration à 8 chiffres**
  (`123-45-678`), imprimé sur l'accessoire, sa boîte ou sa notice.
- L'accessoire doit être sur le **même réseau local** que Gladys.
- Seuls les accessoires **IP** (Wi-Fi, Ethernet) sont pris en charge. Les
  accessoires Bluetooth et Thread ne le sont pas.
- Il faut **Gladys 5.1.0 ou plus récent**.

## Appairer un accessoire

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Cliquez sur **Rechercher les accessoires**. La liste affiche, pour chaque
   accessoire : son nom, son type, son identifiant HomeKit, son adresse IP et
   son état (`prêt à appairer`, `déjà appairé ailleurs`, `appairé à Gladys`).
3. Cliquez sur **Appairer un accessoire** et renseignez :
   - **Accessoire** : le nom, l'identifiant ou l'adresse IP affiché par la
     recherche. Si la recherche ne le trouve pas, tapez son adresse sous la
     forme `IP:port` (par exemple `192.168.1.20:51826`) ;
   - **Code de configuration** : les 8 chiffres, avec ou sans tirets.
4. L'appairage prend quelques secondes (jusqu'à une minute sur les petits
   modules). Ensuite, ouvrez l'onglet **Découverte** : les appareils de
   l'accessoire y sont prêts à être ajoutés.

Un **pont** (bridge) HomeKit donne un appareil Gladys par accessoire relié.

## Appareils pris en charge

| Service HomeKit              | Dans Gladys                                    |
| ---------------------------- | ---------------------------------------------- |
| Ampoule                      | Marche/arrêt, luminosité, couleur, température |
| Interrupteur, prise, vanne   | Marche/arrêt                                   |
| Ventilateur                  | Marche/arrêt, vitesse                          |
| Thermostat                   | Température, consigne, humidité                |
| Volet, store, fenêtre, porte | Position, ouvrir / stop / fermer               |
| Serrure                      | Verrouillée / déverrouillée                    |
| Capteurs                     | Température, humidité, luminosité, mouvement,  |
|                              | présence, ouverture, fuite, fumée, CO, CO2,    |
|                              | particules PM2.5 / PM10                        |
| Batterie                     | Niveau, batterie faible                        |

Les **boutons programmables** et les **sonnettes** ne sont pas des appareils :
leurs appuis déclenchent des scènes (voir plus bas).

Les autres services (caméras, télévisions…) sont ignorés pour l'instant.

## Réglages

- **Intervalle de rafraîchissement** : HomeKit envoie les changements en
  temps réel. Gladys relit en plus tout l'accessoire à cet intervalle, par
  sécurité (60 s par défaut).
- **Durée de recherche** : temps d'écoute du réseau lors d'une recherche
  (10 s par défaut).

## Actions

- **Rechercher les accessoires** : liste les accessoires HomeKit du réseau.
- **Appairer un accessoire** : voir plus haut.
- **Identifier un appareil** : l'accessoire se signale (il clignote, émet un
  son…), pratique pour le repérer.
- **Désappairer un accessoire** : retire l'appairage de l'accessoire et de
  Gladys. Pour un pont, tous ses appareils sont concernés. Supprimez ensuite
  les appareils dans Gladys.

## Scènes

Déclencheurs (« Quand… ») :

- **Bouton HomeKit appuyé** : un bouton ou une sonnette a été appuyé. Filtres
  facultatifs : l'appareil, le type d'appui (simple, double, long) et le
  numéro du bouton (pour une télécommande à plusieurs boutons). Variables :
  accessoire, bouton, numéro du bouton, appui, sonnette.
- **Accessoire HomeKit perdu / revenu** : un accessoire est devenu
  injoignable, ou est revenu. Filtres facultatifs : l'appareil et l'état.
  Pour un pont, chaque appareil relié envoie son propre événement.

Pour choisir un bouton dans le filtre « Appareil », l'accessoire doit avoir
créé un appareil dans Gladys (par exemple grâce à sa batterie). Sinon,
laissez le filtre vide.

Actions (« Alors… ») :

- **Identifier un appareil HomeKit** : l'accessoire se signale.
- **Relire un appareil HomeKit** : relit tout de suite toutes ses valeurs
  (utile avant une condition).

## Widget du tableau de bord

Le widget **Accessoires HomeKit** affiche le nombre d'accessoires en ligne
et hors ligne, la liste des accessoires (les injoignables en premier) et,
s'il y en a un hors ligne, un bouton **Reconnecter**.

## Dépannage

- **L'accessoire n'apparaît pas dans la recherche** : vérifiez qu'il est
  allumé et sur le même réseau (même VLAN) que Gladys. Essayez d'augmenter
  la durée de recherche, ou appairez-le avec `IP:port`.
- **« déjà appairé ailleurs »** : retirez-le de l'app Maison ou remettez-le
  à zéro.
- **Accessoire injoignable** : l'écran de configuration indique quels
  accessoires sont hors ligne. L'intégration réessaie toute seule et
  retrouve l'accessoire si son adresse IP a changé. Pour éviter ce cas,
  donnez-lui une adresse IP fixe (bail DHCP réservé).
- Les appairages sont stockés dans le volume `/data` de l'intégration : ils
  sont conservés lors des mises à jour.
- Pour le détail, consultez les logs de l'intégration (niveau `LOG_LEVEL=debug`).
