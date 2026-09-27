/**
 * Queueable step of the ASYNC_CHAIN demo: step 1 also fires an @future call, the last step starts
 * a Batch, every other step enqueues the next one. Each job runs in its own request, so it passes
 * its request id to the next job as its parent.
 */
public with sharing class FoxLogChainQueueable implements Queueable {

    private final Integer step;
    private final Integer lastStep;
    private final String parentRequestId;

    public FoxLogChainQueueable(Integer step, Integer lastStep, String parentRequestId) {
        this.step = step;
        this.lastStep = lastStep;
        this.parentRequestId = parentRequestId;
    }

    public void execute(QueueableContext context) {
        FoxLogChain.mark('Queueable step ' + step, parentRequestId);
        String requestId = FoxLogChain.currentRequestId();

        if (step == 1) {
            FoxLogChainFuture.run(requestId);
        }

        if (step < lastStep) {
            System.enqueueJob(new FoxLogChainQueueable(step + 1, lastStep, requestId));
        } else {
            Database.executeBatch(new FoxLogChainBatch(requestId), 1);
        }
    }
}
