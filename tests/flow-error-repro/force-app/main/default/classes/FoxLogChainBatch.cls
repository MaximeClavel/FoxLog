/**
 * Batch step of the ASYNC_CHAIN demo. start, each execute (scope size 1) and finish write their own
 * debug log: they show whether Salesforce reuses one request id across a Batch's logs or not.
 * The records are the Accounts the FoxLog Error Demo flow creates on every run.
 */
public with sharing class FoxLogChainBatch implements Database.Batchable<SObject> {

    private final String parentRequestId;

    public FoxLogChainBatch(String parentRequestId) {
        this.parentRequestId = parentRequestId;
    }

    public Database.QueryLocator start(Database.BatchableContext context) {
        FoxLogChain.mark('Batch start', parentRequestId);
        return Database.getQueryLocator([
            SELECT Id FROM Account WHERE Name LIKE 'FoxLog Demo Loop Account%' LIMIT 2
        ]);
    }

    public void execute(Database.BatchableContext context, List<SObject> scope) {
        FoxLogChain.mark('Batch execute', parentRequestId);
    }

    public void finish(Database.BatchableContext context) {
        FoxLogChain.mark('Batch finish', parentRequestId);
    }
}
