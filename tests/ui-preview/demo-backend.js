// Replaces the Salesforce network layer with in-memory demo data (patches methods on the real singletons).
(function() {
  'use strict';

  const { scenarios } = window.FoxLogPreview;
  const { salesforceAPI, debugLevelManager } = window.FoxLog;

  const CURRENT_USER_ID = '005DEMO000000001AA';
  window.FOXLOG_PREVIEW_CURRENT_USER_ID = CURRENT_USER_ID;

  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);
  const logId = (n) => `07LDEMO${String(n).padStart(8, '0')}AAA`;

  const USERS = [
    { id: CURRENT_USER_ID, name: 'Camille Laurent', isCurrentUser: true },
    { id: '005DEMO000000002AA', name: 'Jordan Blake', isCurrentUser: false },
    { id: '005DEMO000000003AA', name: 'Sam Okafor', isCurrentUser: false }
  ];

  const LOG_TEMPLATES = [
    { scenario: 'accountTriggerWithErrors', operation: 'ApexTrigger', status: 'System.NullPointerException: Attempt to de-reference a null object', ago: 2, duration: 8460 },
    { scenario: 'contactRestLookup', operation: '/services/apexrest/contacts', status: 'Success', ago: 6, duration: 96 },
    { scenario: 'forecastController', operation: '/aura', status: 'Success', ago: 14, duration: 1340 },
    { scenario: 'contactRestLookup', operation: '/services/apexrest/contacts', status: 'Success', ago: 22, duration: 88 },
    { scenario: 'accountTriggerWithErrors', operation: 'ApexTrigger', status: 'Success', ago: 41, duration: 7210 },
    { scenario: 'forecastController', operation: '/aura', status: 'Success', ago: 63, duration: 1180 },
    { scenario: 'contactRestLookup', operation: 'ApexExecution', status: 'Success', ago: 95, duration: 102 }
  ];

  const bodiesById = new Map();

  function buildLog(template, index, userId) {
    const startedAt = minutesAgo(template.ago);
    const body = scenarios[template.scenario](startedAt);
    const id = logId(index + 1 + (userId === CURRENT_USER_ID ? 0 : 100));
    bodiesById.set(id, body);
    return {
      Id: id,
      LogUserId: userId,
      LogLength: body.length,
      Operation: template.operation,
      Request: 'Api',
      Status: template.status,
      DurationMilliseconds: template.duration,
      StartTime: startedAt.toISOString(),
      Location: 'SystemLog'
    };
  }

  const logsByUser = {
    [CURRENT_USER_ID]: LOG_TEMPLATES.map((template, index) => buildLog(template, index, CURRENT_USER_ID)),
    '005DEMO000000002AA': LOG_TEMPLATES.slice(0, 3).map((template, index) => buildLog(template, index, '005DEMO000000002AA')),
    '005DEMO000000003AA': []
  };

  const traceFlags = new Map([
    [CURRENT_USER_ID, { expiresAt: minutesAgo(-38) }],
    ['005DEMO000000002AA', { expiresAt: minutesAgo(-12) }]
  ]);

  function activeTraceFlag(userId) {
    const flag = traceFlags.get(userId);
    if (!flag || flag.expiresAt <= new Date()) return null;
    return {
      Id: `7tfDEMO${userId.slice(-6)}AAAA`,
      ExpirationDate: flag.expiresAt.toISOString(),
      DebugLevel: { DeveloperName: 'SFDC_DevConsole' }
    };
  }

  Object.assign(salesforceAPI, {
    initialize: async () => {},
    getCurrentUser: async () => ({ Id: CURRENT_USER_ID, Name: USERS[0].name }),
    fetchUsersWithLogs: async () => USERS.map((user) => ({
      ...user,
      hasTraceFlag: Boolean(activeTraceFlag(user.id)),
      debugLevel: 'SFDC_DevConsole',
      logCount: (logsByUser[user.id] || []).length
    })),
    fetchLogs: async (userId, limit = 100, since = null) => (logsByUser[userId] || [])
      .filter((log) => !since || new Date(log.StartTime) >= new Date(since))
      .slice(0, limit),
    fetchLogBody: async (id) => bodiesById.get(id) || '',
    deleteLog: async () => {},
    getActiveTraceFlag: async (userId) => activeTraceFlag(userId)
  });

  debugLevelManager.toggleDebugLogs = async (userId, minutes = 60) => {
    const enabled = !activeTraceFlag(userId);
    if (enabled) traceFlags.set(userId, { expiresAt: minutesAgo(-minutes) });
    else traceFlags.delete(userId);
    return { success: true, enabled };
  };

  function seedImportedLogs() {
    chrome.storage.local.get(['importedLogs'], ({ importedLogs }) => {
      if (importedLogs) return;
      const imports = [
        { id: 'imp_1', filename: 'prod-nightly-batch.log', scenario: 'forecastController', ago: 190 },
        { id: 'imp_2', filename: 'uat-account-trigger.log', scenario: 'accountTriggerWithErrors', ago: 1500 }
      ].map(({ id, filename, scenario, ago }) => {
        const content = scenarios[scenario](minutesAgo(ago));
        return { id, filename, date: minutesAgo(ago).toISOString(), size: content.length, content };
      });
      chrome.storage.local.set({ importedLogs: imports });
    });
  }

  seedImportedLogs();

  // Error alerts: new logs can land after page load, from a test (window.FoxLogPreview.addLog)
  // or from the URL: ?simulateErrorLog=N adds N error logs a moment after FoxLog starts
  // (N >= 2 shows the grouped toast); ?alertInterval=ms shortens the background poll.
  const NEW_ERROR_LOGS = [
    { scenario: 'opportunitySaveWithValidationError', operation: '/aura', status: 'Success', duration: 412 },
    { scenario: 'accountTriggerWithErrors', operation: 'ApexTrigger', status: 'System.NullPointerException: Attempt to de-reference a null object', duration: 8460 },
    { scenario: 'accountTriggerWithErrors', operation: 'BatchApexWorker', status: 'System.NullPointerException: Attempt to de-reference a null object', duration: 9120 }
  ];
  let addedLogCount = 0;

  /**
   * Add a log that started now, as if Salesforce just recorded it
   * @param {{scenario?: string, operation?: string, status?: string, duration?: number, userId?: string}} [template]
   * @returns {Object} The ApexLog record
   */
  function addLog(template = NEW_ERROR_LOGS[0]) {
    const userId = template.userId || CURRENT_USER_ID;
    addedLogCount += 1;
    const log = buildLog({ scenario: 'contactRestLookup', duration: 120, ...template, ago: 0 }, 400 + addedLogCount, userId);
    logsByUser[userId] = [log, ...(logsByUser[userId] || [])];
    return log;
  }
  window.FoxLogPreview.addLog = addLog;
  window.FoxLogPreview.newErrorLogs = NEW_ERROR_LOGS;

  const params = new URLSearchParams(location.search);
  const alertInterval = Number(params.get('alertInterval')) || (params.has('simulateErrorLog') ? 1500 : 0);
  if (alertInterval) {
    window.FoxLog.CONFIG.ERROR_ALERT_INTERVAL = alertInterval;
  }
  if (params.has('simulateErrorLog')) {
    const count = Math.max(1, Number(params.get('simulateErrorLog')) || 1);
    const waitForBaseline = setInterval(() => {
      const app = window.FoxLogApp;
      if (!app || !app.initialized || app.preloadPromise) return;
      clearInterval(waitForBaseline);
      setTimeout(() => {
        for (let index = 0; index < count; index += 1) addLog(NEW_ERROR_LOGS[index % NEW_ERROR_LOGS.length]);
      }, 500);
    }, 100);
  }
})();
