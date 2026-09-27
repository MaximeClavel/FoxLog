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
      Location: 'SystemLog',
      RequestIdentifier: template.request || `REQ-DEMO-${id}`
    };
  }

  // One action that fans out into async jobs: each job is its own request and names its parent
  // request in a debug line, exactly like tests/flow-error-repro writes it.
  const CHAIN_TEMPLATES = [
    { scenario: 'forecastController', operation: '/aura', status: 'Success', ago: 4, duration: 1340, request: 'REQ-CHAIN-ROOT-0001' },
    { scenario: 'contactRestLookup', operation: 'Queueable', status: 'Success', ago: 3.8, duration: 420, request: 'REQ-CHAIN-QUEUE1-02', parent: 'REQ-CHAIN-ROOT-0001' },
    { scenario: 'contactRestLookup', operation: 'Future', status: 'Success', ago: 3.7, duration: 96, request: 'REQ-CHAIN-FUTURE-03', parent: 'REQ-CHAIN-QUEUE1-02' },
    { scenario: 'accountTriggerWithErrors', operation: 'Queueable', status: 'System.NullPointerException: Attempt to de-reference a null object', ago: 3.5, duration: 2210, request: 'REQ-CHAIN-QUEUE2-04', parent: 'REQ-CHAIN-QUEUE1-02' },
    { scenario: 'contactRestLookup', operation: 'Batch Apex', status: 'Success', ago: 3.2, duration: 310, request: 'REQ-CHAIN-BATCH-0005', parent: 'REQ-CHAIN-QUEUE2-04' },
    { scenario: 'contactRestLookup', operation: 'Batch Apex', status: 'Success', ago: 3.1, duration: 280, request: 'REQ-CHAIN-BATCH-0005', parent: 'REQ-CHAIN-QUEUE2-04' }
  ];

  function buildChainLogs(userId) {
    return CHAIN_TEMPLATES.map((template, index) => {
      const log = buildLog(template, 200 + index, userId);
      if (template.parent) {
        const marker = `00:00:00.0 (1)|USER_DEBUG|[1]|INFO|FOXLOG_PARENT_REQUEST_ID=${template.parent}`;
        bodiesById.set(log.Id, [bodiesById.get(log.Id), marker].join('\n'));
      }
      return log;
    });
  }

  const logsByUser = {
    [CURRENT_USER_ID]: LOG_TEMPLATES.map((template, index) => buildLog(template, index, CURRENT_USER_ID))
      .concat(buildChainLogs(CURRENT_USER_ID))
      .sort((a, b) => new Date(b.StartTime) - new Date(a.StartTime)),
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
    fetchLogs: async (userId) => logsByUser[userId] || [],
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
})();
