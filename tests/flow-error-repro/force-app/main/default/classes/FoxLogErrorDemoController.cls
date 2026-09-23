/**
 * Invocable action used by the "FoxLog Error Demo" screen flow to raise a
 * chosen error scenario on purpose, so the resulting debug log can be used
 * to fix FoxLog's FLOW_ELEMENT_ERROR parsing (see tests/flow-error-repro/README.md).
 */
public with sharing class FoxLogErrorDemoController {

    public class Request {
        @InvocableVariable(required=true)
        public String errorType;
    }

    public class Response {
        @InvocableVariable
        public String outcome;
    }

    public class DemoException extends Exception {}

    @InvocableMethod(label='FoxLog Raise Demo Error' description='Raises a chosen error scenario for FoxLog Flow-log parsing tests.')
    public static List<Response> raiseError(List<Request> requests) {
        String errorType = requests[0].errorType;
        Response res = new Response();

        if (errorType == 'CUSTOM_EXCEPTION') {
            // A deliberate, clearly-labeled custom exception.
            throw new DemoException('FoxLog demo: explicit custom exception raised on purpose.');

        } else if (errorType == 'NULL_POINTER') {
            Account acc;
            acc.Name = 'this throws a NullPointerException'; // acc is null

        } else if (errorType == 'DML_EXCEPTION') {
            insert new Account(); // Name is required -> DmlException

        } else if (errorType == 'LIST_INDEX') {
            List<Account> empty = new List<Account>();
            Account first = empty[0]; // List index out of bounds

        } else if (errorType == 'VALIDATION_RULE') {
            // Trips FoxLog_Demo_Validation_Fail (see
            // force-app/main/default/objects/Account/validationRules) via
            // an Apex DML, as opposed to the flow-native path below.
            insert new Account(Name = 'FoxLog Apex Validation Test', Description = 'FOXLOG_FORCE_VALIDATION_ERROR');

        } else if (errorType == 'HTTP_CALLOUT') {
            // Requires the FoxLog_Demo_Callout Remote Site Setting.
            Http http = new Http();
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://jsonplaceholder.typicode.com/todos/1');
            req.setMethod('GET');
            HttpResponse httpRes = http.send(req);
            res.outcome = 'Callout returned HTTP ' + httpRes.getStatusCode();

        } else if (errorType == 'SOSL_QUERY') {
            List<List<SObject>> results = [FIND 'FoxLog' IN ALL FIELDS RETURNING Account(Id, Name)];
            res.outcome = 'SOSL query returned ' + results[0].size() + ' Account(s)';

        } else {
            res.outcome = 'No error raised (errorType=' + errorType + ')';
        }

        return new List<Response>{ res };
    }
}
