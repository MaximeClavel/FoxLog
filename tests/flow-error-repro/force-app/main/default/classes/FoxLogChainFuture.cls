/**
 * @future step of the ASYNC_CHAIN demo (see FoxLogChain).
 */
public with sharing class FoxLogChainFuture {

    @future
    public static void run(String parentRequestId) {
        FoxLogChain.mark('Future', parentRequestId);
    }
}
