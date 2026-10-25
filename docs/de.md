# HomeKit Controller

Diese Integration macht Gladys zu einem **HomeKit-Controller**: Sie koppelt
sich direkt mit deinem WLAN-/Ethernet-HomeKit-Zubehör und steuert es lokal,
**ohne iPhone, Apple TV oder HomePod** und ganz ohne Cloud.

## Bevor du beginnst

- Ein HomeKit-Zubehör akzeptiert **nur einen Controller** gleichzeitig. Wenn
  es bereits in Apples **Home**-App (oder in Home Assistant…) eingerichtet
  ist, entferne es dort zuerst. Andernfalls setze das Zubehör auf
  die Werkseinstellungen zurück.
- Halte den **8-stelligen Setup-Code** (`123-45-678`) bereit: Er ist auf
  dem Zubehör, seiner Verpackung oder seiner Anleitung aufgedruckt.
- Das Zubehör muss sich im **selben lokalen Netzwerk** wie Gladys befinden.
- Nur **IP**-Zubehör (WLAN, Ethernet) wird unterstützt. Bluetooth- und
  Thread-Zubehör nicht.
- **Gladys 5.3.0 oder neuer** ist erforderlich.

## Ein Zubehör koppeln

1. Öffne die Registerkarte **Konfiguration** der Integration.
2. Klicke auf **Zubehör suchen**. Die Liste zeigt für jedes Zubehör:
   seinen Namen, Typ, die HomeKit-ID, die IP-Adresse und den Status
   (`bereit zum Koppeln`, `anderweitig gekoppelt`, `mit Gladys gekoppelt`).
3. Klicke auf **Zubehör koppeln** und fülle aus:
   - **Zubehör**: den Namen, die ID oder die IP-Adresse aus der Suche. Wenn
     die Suche es nicht findet, gib seine Adresse als `IP:port` ein
     (zum Beispiel `192.168.1.20:51826`);
   - **Setup-Code**: die 8 Ziffern, mit oder ohne Bindestriche.
4. Das Koppeln dauert einige Sekunden (bei kleinen Modulen bis zu einer
   Minute). Öffne dann die Registerkarte **Entdecken**: Die Geräte des
   Zubehörs können hinzugefügt werden.

Eine HomeKit-**Bridge** ergibt ein Gladys-Gerät pro angebundenem Zubehör.

## Unterstützte Geräte

| HomeKit-Dienst              | In Gladys                                    |
| --------------------------- | -------------------------------------------- |
| Lampe                       | Ein/Aus, Helligkeit, Farbe, Farbtemperatur   |
| Schalter, Steckdose, Ventil | Ein/Aus                                      |
| Ventilator                  | Ein/Aus, Geschwindigkeit                     |
| Thermostat                  | Temperatur, Solltemperatur, Luftfeuchtigkeit |
| Rollladen, Fenster, Tür     | Position, öffnen / stoppen / schließen       |
| Schloss                     | Verriegelt / entriegelt                      |
| Sensoren                    | Temperatur, Luftfeuchtigkeit, Helligkeit,    |
|                             | Bewegung, Anwesenheit, Kontakt, Leck, Rauch, |
|                             | CO, CO2, Feinstaub PM2.5 / PM10              |
| Batterie                    | Ladestand, niedriger Batteriestand           |

**Programmierbare Tasten** und **Türklingeln** sind keine Geräte: Ihr
Drücken löst Szenen aus (siehe unten).

Andere Dienste (Kameras, Fernseher…) werden vorerst ignoriert.

## Einstellungen

- **Aktualisierungsintervall**: HomeKit überträgt Änderungen in Echtzeit.
  Gladys liest zusätzlich das gesamte Zubehör in diesem Intervall neu ein,
  als Absicherung (standardmäßig 60 s).
- **Suchdauer**: wie lange das Netzwerk während einer Suche abgehört wird
  (standardmäßig 10 s).

## Aktionen

- **Zubehör suchen**: listet das HomeKit-Zubehör im Netzwerk auf.
- **Zubehör koppeln**: siehe oben.
- **Gerät identifizieren**: Das Zubehör macht sich bemerkbar (blinkt,
  piept…), praktisch, um es zu finden.
- **Zubehör entkoppeln**: entfernt die Kopplung vom Zubehör und aus Gladys.
  Bei einer Bridge sind alle ihre Geräte betroffen. Lösche anschließend
  die Geräte in Gladys.

## Szenen

Auslöser (in einer Szene **Auslöser hinzufügen → Integrationen**):

- **HomeKit-Taste gedrückt**: Eine Taste oder eine Türklingel wurde
  gedrückt. Optionale Filter: das Gerät, die Art des Drückens (einfach,
  doppelt, lang) und die Tastennummer (bei einer Fernbedienung mit mehreren
  Tasten). Variablen: Zubehör, Taste, Tastennummer, Tastendruck, Türklingel.
- **HomeKit-Zubehör offline / zurück**: Ein Zubehör ist nicht mehr
  erreichbar oder wieder da. Optionale Filter: das Gerät und der Status. Bei
  einer Bridge sendet jedes angebundene Gerät sein eigenes Ereignis.

Um eine Taste im Filter „Gerät“ auszuwählen, muss das Zubehör ein Gerät in
Gladys angelegt haben (zum Beispiel über seine Batterie). Andernfalls lass den Filter leer.

Aktionen (in einer Szene **Neue Aktion → Integrationen**):

- **HomeKit-Gerät identifizieren**: Das Zubehör macht sich bemerkbar.
- **HomeKit-Gerät neu einlesen**: liest sofort alle seine Werte (praktisch
  vor einer Bedingung).

## Dashboard-Widget

Das Widget **HomeKit-Zubehör** zeigt, wie viele Zubehörteile online und
offline sind, die Liste der Zubehörteile (nicht erreichbare zuerst) und,
wenn eines offline ist, eine Schaltfläche **Neu verbinden**.

## Fehlerbehebung

- **Die Suche findet das Zubehör nicht**: Prüfe, ob es eingeschaltet
  ist und sich im selben Netzwerk (selben VLAN) wie Gladys befindet.
  Versuche eine längere Suchdauer oder kopple es mit `IP:port`.
- **„anderweitig gekoppelt“**: Entferne es aus der Home-App oder setze es auf die Werkseinstellungen zurück.
- **Nicht erreichbares Zubehör**: Die Registerkarte **Konfiguration** der Integration zeigt, welches
  Zubehör offline ist. Die Integration versucht es selbstständig erneut und
  findet das Zubehör wieder, wenn sich seine IP-Adresse geändert hat. Um das
  zu vermeiden, gib dem Zubehör eine feste IP-Adresse
  (DHCP-Reservierung).
- Die Kopplungen werden im Volume `/data` der Integration gespeichert: Sie
  bleiben bei Updates erhalten.
- Für Details prüfe die Protokolle der Integration (`LOG_LEVEL=debug`).
