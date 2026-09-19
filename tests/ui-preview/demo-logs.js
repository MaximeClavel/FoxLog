// Synthetic Apex debug logs in the real Salesforce format, used by the UI preview.
(function() {
  'use strict';

  const NS_PER_MS = 1e6;
  const CLASS_ID = '01pDEMO000000000AA';

  class LogBuilder {
    constructor(startedAt) {
      this.lines = [
        '65.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DB,INFO;SYSTEM,DEBUG;VALIDATION,INFO;WORKFLOW,INFO'
      ];
      this.startedAt = startedAt;
      this.elapsedNs = 0;
      this.counters = { soql: 0, dml: 0, dmlRows: 0, queryRows: 0 };
    }

    _clock() {
      const wall = new Date(this.startedAt.getTime() + Math.floor(this.elapsedNs / NS_PER_MS));
      const pad = (value, size = 2) => String(value).padStart(size, '0');
      const time = `${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}`;
      return `${time}.${wall.getMilliseconds()} (${Math.floor(this.elapsedNs)})`;
    }

    emit(type, content = '', advanceMs = 0.15) {
      this.elapsedNs += advanceMs * NS_PER_MS;
      this.lines.push(content ? `${this._clock()}|${type}|${content}` : `${this._clock()}|${type}`);
      return this;
    }

    enter(signature, line, advanceMs) {
      return this.emit('METHOD_ENTRY', `[${line}]|${CLASS_ID}|${signature}`, advanceMs);
    }

    exit(signature, line, advanceMs) {
      return this.emit('METHOD_EXIT', `[${line}]|${CLASS_ID}|${signature}`, advanceMs);
    }

    soql(query, rows, line, durationMs = 6) {
      this.counters.soql += 1;
      this.counters.queryRows += rows;
      this.emit('SOQL_EXECUTE_BEGIN', `[${line}]|Aggregations:0|${query}`);
      return this.emit('SOQL_EXECUTE_END', `[${line}]|Rows:${rows}`, durationMs);
    }

    dml(operation, objectType, rows, line, durationMs = 9) {
      this.counters.dml += 1;
      this.counters.dmlRows += rows;
      this.emit('DML_BEGIN', `[${line}]|Op:${operation}|Type:${objectType}|Rows:${rows}`);
      return this.emit('DML_END', `[${line}]`, durationMs);
    }

    debug(message, line) {
      return this.emit('USER_DEBUG', `[${line}]|DEBUG|${message}`);
    }

    limits({ cpu, heap }) {
      const { soql, dml, dmlRows, queryRows } = this.counters;
      this.emit('CUMULATIVE_LIMIT_USAGE');
      this.lines.push(
        `${this._clock()}|LIMIT_USAGE_FOR_NS|(default)|`,
        `  Number of SOQL queries: ${soql} out of 100`,
        `  Number of query rows: ${queryRows} out of 50000`,
        '  Number of SOSL queries: 0 out of 20',
        `  Number of DML statements: ${dml} out of 150`,
        `  Number of DML rows: ${dmlRows} out of 10000`,
        `  Maximum CPU time: ${cpu} out of 10000`,
        `  Maximum heap size: ${heap} out of 6000000`,
        '  Number of callouts: 0 out of 100',
        ''
      );
      return this.emit('CUMULATIVE_LIMIT_USAGE_END');
    }

    build() {
      return this.lines.join('\n');
    }
  }

  function open(builder, codeUnit) {
    builder.emit('USER_INFO', '[EXTERNAL]|005DEMO000000001AA|camille.laurent@acme.dev|(GMT+01:00) Central European Time|GMT+01:00');
    builder.emit('EXECUTION_STARTED');
    builder.emit('CODE_UNIT_STARTED', `[EXTERNAL]|${CLASS_ID}|${codeUnit}`);
  }

  function close(builder, codeUnit) {
    builder.emit('CODE_UNIT_FINISHED', codeUnit);
    builder.emit('EXECUTION_FINISHED');
  }

  function accountTriggerWithErrors(startedAt) {
    const unit = 'AccountTrigger on Account trigger event BeforeUpdate';
    const b = new LogBuilder(startedAt);
    open(b, unit);
    b.enter('AccountTriggerHandler.beforeUpdate(List<Account>)', 3);
    b.debug('Processing 12 accounts', 5);
    for (let index = 0; index < 12; index += 1) {
      b.enter('AccountService.recalculateRating(Account)', 12, 0.4);
      b.soql('SELECT Id, Amount, StageName FROM Opportunity WHERE AccountId = :acc.Id', 9 + index, 14);
      b.soql('SELECT Id FROM Contact WHERE AccountId = :acc.Id', 4, 21, 4);
      b.exit('AccountService.recalculateRating(Account)', 12, 0.3);
      b.dml('Update', 'Account', 1, 18);
    }
    b.exit('AccountTriggerHandler.beforeUpdate(List<Account>)', 3);
    b.enter('NotifyService.sendSummary(List<Account>)', 27);
    b.emit('EXCEPTION_THROWN', '[31]|System.NullPointerException: Attempt to de-reference a null object');
    b.emit('FATAL_ERROR', 'System.NullPointerException: Attempt to de-reference a null object\n\nClass.NotifyService.sendSummary: line 31, column 1');
    b.exit('NotifyService.sendSummary(List<Account>)', 27);
    b.limits({ cpu: 8450, heap: 4120000 });
    close(b, unit);
    return b.build();
  }

  function contactRestLookup(startedAt) {
    const unit = 'ContactRestResource.doGet';
    const b = new LogBuilder(startedAt);
    open(b, unit);
    b.enter('ContactRestResource.doGet()', 8);
    b.enter('ContactSelector.byEmail(String)', 15);
    b.soql('SELECT Id, FirstName, LastName, Email FROM Contact WHERE Email = :email LIMIT 1', 1, 17);
    b.exit('ContactSelector.byEmail(String)', 15);
    b.enter('ContactMapper.toDto(Contact)', 21, 0.5);
    b.debug('Mapped contact 003DEMO000000001AA', 24);
    b.exit('ContactMapper.toDto(Contact)', 21);
    b.exit('ContactRestResource.doGet()', 8);
    b.limits({ cpu: 41, heap: 96000 });
    close(b, unit);
    return b.build();
  }

  function forecastController(startedAt) {
    const unit = 'OpportunityController.getForecast';
    const b = new LogBuilder(startedAt);
    open(b, unit);
    b.enter('OpportunityController.getForecast(Id)', 6);
    b.enter('ForecastService.build(Id)', 14);
    b.soql('SELECT StageName, SUM(Amount) FROM Opportunity WHERE OwnerId = :uid GROUP BY StageName', 6, 19, 22);
    b.enter('ForecastService.applyWeights(List<AggregateResult>)', 27, 1.2);
    b.debug('Weighted 6 stages', 33);
    b.exit('ForecastService.applyWeights(List<AggregateResult>)', 27, 2.5);
    b.dml('Upsert', 'Forecast__c', 200, 41, 48);
    b.exit('ForecastService.build(Id)', 14);
    b.exit('OpportunityController.getForecast(Id)', 6);
    b.limits({ cpu: 1320, heap: 1450000 });
    close(b, unit);
    return b.build();
  }

  window.FoxLogPreview = window.FoxLogPreview || {};
  window.FoxLogPreview.scenarios = { accountTriggerWithErrors, contactRestLookup, forecastController };
})();
