# Alertes de log en erreur

## Objectif

Prévenir l'utilisateur dès qu'un nouveau log en erreur arrive pour l'utilisateur surveillé, même quand le panneau FoxLog est fermé :

- un **badge** sur l'icône de l'extension dans la barre d'outils, avec le nombre de logs en erreur pas encore vus, limité à l'onglet Salesforce concerné ;
- un **toast** en bas à gauche de la page Salesforce : « Nouveau log en erreur : opération — première erreur », avec **Ouvrir** (ouvre ce log dans la modale d'analyse). Plusieurs logs à la fois donnent un seul toast groupé (« 3 nouveaux logs en erreur »), dont **Ouvrir** ouvre le panneau sur l'utilisateur concerné.

L'utilisateur surveillé est celui sélectionné dans le panneau, ou l'utilisateur connecté si le panneau n'a jamais été ouvert.

## Vue d'ensemble

```text
Content script (onglet Salesforce)                                         Background
─────────────────────────────────────────────────────────────────          ─────────────────────
panneau ouvert : refreshLogs() toutes les 5 s ─┐
panneau fermé  : _pollErrorAlerts() / 20 s ────┼─► errorAlertService.process(userId, logs)
  (fetchLogs(since = filigrane − 10 min))      │     1. findNewLogs()  : nouveaux depuis le filigrane
                                               │     2. liste à l'écran ? → tout marquer vu, rien d'autre
                                               │     3. analyzeBatch() : scan rapide des seuls nouveaux
                                               │     4. pickErrorLogs(): ceux en erreur
                                               │     5. toast (toastManager.showAlert)
                                               └──── 6. badge ──── message setErrorBadge ──► chrome.action.setBadgeText({ tabId })
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `src/services/error-alert-service.js` | `window.FoxLog.errorAlerts` : fonctions pures (`findNewLogs`, `isErrorLog`, `describeError`, `pickErrorLogs`, `summarizeOperations`), testées dans `tests/test-error-alerts.js`. `window.FoxLog.errorAlertService` : filigrane, compteur du badge, toast |
| `src/content.js` | Boucle de vérification panneau fermé (`_startErrorAlertPolling`, `_pollErrorAlerts`), branchement du rafraîchissement du panneau (`_checkErrorAlerts`), « la liste est-elle à l'écran » (`_isLogListInView`), ouverture du log ou du panneau depuis le toast |
| `src/ui/toast-manager.js` | `window.FoxLog.toastManager` : toasts simples (`show`) et variante alerte (`showAlert`) en bas à gauche |
| `src/background.js` | `setErrorBadge(tabId, count)` : les content scripts n'ont pas accès à `chrome.action`, ils envoient `{ action: 'setErrorBadge', count }` et le background utilise `sender.tab.id` |
| `src/services/salesforce-api.js` | `fetchLogs(userId, limit, since)` : filtre optionnel `AND StartTime >= …` |
| `src/services/log-preview-service.js` | Le scan rapide renvoie aussi `firstError` (première exception, erreur fatale ou message de validation), affiché dans le toast |
| `popup.html`, `popup.js` | Interrupteur « Alertes d'erreur » (`errorAlertsEnabled` dans `chrome.storage.local`, activé par défaut) |
| `src/core/constants.js` | Réglages `CONFIG.ERROR_ALERT_*` et libellés FR/EN `errorAlert…` |

## Ce qui compte comme une erreur

Exactement ce qui rend une carte de log rouge dans le panneau, pour que l'alerte et la carte soient toujours d'accord (`isErrorLog`) :

- un `Status` différent de `Success` (exception non gérée), gratuit puisqu'il vient de la requête de liste ;
- ou `hasError` du scan rapide du corps du log (`logPreviewService.analyzeBatch`) : exceptions gérées, Validation Rules en échec, action Flow → Apex en échec, etc.

Le texte du toast est `firstError` du scan, sinon le `Status`, coupé à 160 caractères (`describeError`).

## Quand vérifier

| Situation | Comportement |
|-----------|--------------|
| Panneau ouvert | Pas de boucle dédiée : le rafraîchissement existant (5 s) passe ses logs à `errorAlertService.process()`. Aucune requête en double |
| Panneau fermé, onglet visible | `_pollErrorAlerts()` toutes les `CONFIG.ERROR_ALERT_INTERVAL` (20 s) : au plus `ERROR_ALERT_FETCH_LIMIT` (20) logs, ceux qui ont commencé après le filigrane moins la fenêtre de retard ; seuls les nouveaux ont leur corps scanné (résultat mis en cache pour les cartes du panneau) |
| Onglet masqué | La boucle s'arrête (`visibilitychange`) et rattrape dès que l'onglet redevient visible, sauf si une vérification vient d'avoir lieu |
| Chargement de la page | Le préchargement des logs sert de référence ; la boucle attend qu'il soit fini |
| Alertes désactivées | Pas de boucle, badge et toast effacés. À la réactivation, ce qui est arrivé entre-temps sert de nouvelle référence |

## Jamais deux fois, jamais d'anciens logs

`findNewLogs(logs, state, { userId, clearMark, lateWindowMs })` compare les logs récupérés à un **filigrane** :

- `startTime` : le `StartTime` le plus récent déjà vu ;
- `seen` : les Id vus dont le `StartTime` est dans la fenêtre de retard (`CONFIG.ERROR_ALERT_LATE_WINDOW`, 10 min) sous le filigrane, 500 au plus.

La **fenêtre de retard** existe parce qu'un ApexLog est trié par son début mais n'apparaît qu'à la fin de la transaction : une longue transaction peut arriver derrière des logs plus récents. Un pur « plus récent que le filigrane » la raterait.

Règles :

- **Référence** : la première vérification après le chargement de la page, après un changement d'utilisateur ou après la réactivation ne signale rien. Elle enregistre seulement ce qui est déjà là. Contrepartie : un log en erreur arrivé pendant le rechargement de la page n'est pas signalé.
- **Clear** : un log masqué par le bouton Clear du panneau (antérieur à sa marque) n'est jamais signalé, et il est marqué vu, donc un Restore ne le signale pas non plus.
- **Plusieurs onglets de la même org** : le filigrane est stocké par org et par utilisateur dans `chrome.storage.local` (`foxlog.alertsSeen.<org>.<userId>`) et relu à chaque vérification, donc un log signalé dans un onglet ne l'est pas dans un autre. Seule une vérification exactement simultanée dans deux fenêtres visibles pourrait signaler deux fois.
- **Changement d'utilisateur** : un résultat arrivé après que la picklist a changé est ignoré (`isStale`), comme dans `refreshLogs()` (CHANGELOG 1.9.1).
- Les vérifications sont mises en file (`process()`), donc le rafraîchissement du panneau et la boucle panneau fermé ne traitent jamais le même log en même temps.

## Quand la liste est à l'écran

Si l'utilisateur voit déjà la liste des logs (panneau ouvert sur l'onglet Salesforce, pas de modale par-dessus, onglet du navigateur visible : `_isLogListInView()`), les nouveaux logs sont simplement marqués vus : ni toast ni badge, et un badge en attente est effacé. Si le panneau est ouvert mais que la liste est cachée (modale ouverte, onglet Fichiers, onglet du navigateur masqué), l'alerte part normalement.

## Badge

- Il compte les logs signalés pas encore vus de cet onglet (`unseen`), « 99+ » au-delà de 99, en rouge `--fl-red-600` (`#dc2626`, le badge ne lit pas les variables CSS).
- Il s'efface quand on ouvre le panneau, quand la liste devient visible, quand on ouvre le log signalé, au rechargement de la page ou quand on désactive les alertes.
- Fermer le toast (× ou Échap) ne l'efface **pas** : le log n'a pas été vu.

## Toast

`toastManager.showAlert()` (voir aussi « Toast » dans [ui-design-system.md](../ui-design-system.md)) :

- carte en bas à gauche, rail de couleur, texte dans une zone `role="status"` / `aria-live="polite"`, bouton d'action et bouton de fermeture ;
- se ferme seule après `CONFIG.ERROR_ALERT_TOAST_DURATION` (8 s), avec une pause au survol, au focus et quand l'onglet est masqué ; Échap la ferme et rend le focus au bouton FoxLog ;
- de nouvelles alertes alors qu'elle est affichée la mettent à jour en place (toast groupé) ;
- elle suit la position du bouton FoxLog flottant (`MutationObserver`) : au-dessus quand il est ancré en bas à gauche, à côté quand il est ancré sur le bord gauche, en laissant la place de son glissement au survol ;
- `prefers-reduced-motion` respecté, thèmes clair et sombre par les tokens de `theme.css`.

Un toast simple (confirmation de copie, etc.) n'efface pas un toast d'alerte : ils n'ont pas le même emplacement.

## Firefox

`chrome.action` existe dans Firefox MV3. Tous les appels (`setBadgeText`, `setBadgeBackgroundColor`, `setBadgeTextColor` s'il existe, `runtime.sendMessage`) passent par des callbacks, le shim `chrome.*` de Firefox ne renvoyant pas toujours de Promise (cf. CHANGELOG 1.10.0). Aucune nouvelle permission.

## Vie privée

Seul le filigrane (un `StartTime` et des Id de logs) est stocké, localement. Voir `PRIVACY.md`.

## Vérification

- `node tests/test-error-alerts.js` : référence à la première vérification, pas de double alerte, log en retard, marque de Clear, changement d'utilisateur, accord carte/alerte via le vrai scan.
- `tests/ui-preview` : `?simulateErrorLog=1` ajoute un log en erreur peu après le chargement (`=3` pour le toast groupé), `?alertInterval=ms` raccourcit l'intervalle. Les messages runtime passent par le vrai `background.js` ; le badge qu'il pose est relevé dans `window.FoxLogPreviewChrome.badge`.
- Non vérifié : le rendu réel du badge dans la barre d'outils de Chrome et de Firefox, et le filtre `StartTime >=` sur une vraie org.
