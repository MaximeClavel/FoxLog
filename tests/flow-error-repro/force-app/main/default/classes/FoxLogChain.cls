/**
 * Log-chain helper for the ASYNC_CHAIN demo scenario (see tests/flow-error-repro/README.md).
 *
 * Salesforce gives every async job (Queueable, @future, Batch) a brand-new request id, so nothing
 * in the debug logs says which request started a job. FoxLog chains the logs from two debug lines
 * that each step writes:
 *   FOXLOG_REQUEST_ID=<id of this request>
 *   FOXLOG_PARENT_REQUEST_ID=<id of the request that enqueued this job>
 * and matches them with the RequestIdentifier of the ApexLog records.
 */
public with sharing class FoxLogChain {

    public static String currentRequestId() {
        return Request.getCurrent().getRequestId();
    }

    /** parentRequestId is null for the first step of a chain */
    public static void mark(String step, String parentRequestId) {
        System.debug(LoggingLevel.INFO, 'FOXLOG_REQUEST_ID=' + currentRequestId());
        if (parentRequestId != null) {
            System.debug(LoggingLevel.INFO, 'FOXLOG_PARENT_REQUEST_ID=' + parentRequestId);
        }
        System.debug(LoggingLevel.INFO, 'FOXLOG_STEP=' + step + ' quiddity=' + Request.getCurrent().getQuiddity());
    }
}
