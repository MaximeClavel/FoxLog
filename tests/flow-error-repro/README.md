# FoxLog Flow error repro kit

Purpose: generate real Salesforce debug logs containing `FLOW_ELEMENT_ERROR`
(and its siblings) so FoxLog's parser/call-tree builder can be fixed against
real log output instead of guessed formats. See the Slack thread: FoxLog
currently drops `FLOW_ELEMENT_ERROR` lines entirely (not wired into
`src/workers/call-tree-worker.js`'s node/error classification).

This is a throwaway test fixture, not part of the extension itself. Delete
it from your sandbox whenever you're done with it.

## What it deploys

- **`FoxLogErrorDemoController.cls`** — one `@InvocableMethod` that raises
  one of 4 different Apex exceptions (or none), based on an input string:
  - `CUSTOM_EXCEPTION` — a custom, clearly-labeled exception
  - `NULL_POINTER` — a `NullPointerException`
  - `DML_EXCEPTION` — an `insert` missing the required `Name` field on `Account`
  - `LIST_INDEX` — a list-index-out-of-bounds error
  - anything else — no error, returns normally

- **`FoxLog_Error_Demo` flow** (Screen Flow) — a screen lets you pick the
  error type above and a checkbox "Simulate NO fault connector". It then
  calls the Apex action **twice**, on purpose:
  - `Call_With_Fault_Path` — has a Fault Connector wired to a screen showing
    `{!$Flow.FaultMessage}`. This is the "explicitly surfaced to the flow" case.
  - `Call_No_Fault_Path` — same action, same input, **no** fault connector.
    An error here isn't caught by the flow itself, letting us see how that
    differs in the raw log (which is the "not explicitly surfaced" case you
    asked about).

  The decision routes to whichever call matches the "Simulate NO fault
  connector" checkbox.

## Deploy

Requires the `sf` CLI, already authenticated to your sandbox:

```bash
sf org login web -a foxlog-sandbox -r https://test.salesforce.com
```

Then, from the repo root:

```bash
sf project deploy start -d tests/flow-error-repro/force-app -o foxlog-sandbox
```

(`-o foxlog-sandbox` is whatever alias you used above.)

Alternative if you'd rather deploy from the manifest (`manifest/package.xml`,
e.g. via Workbench or `--manifest`):

```bash
sf project deploy start --manifest tests/flow-error-repro/manifest/package.xml -o foxlog-sandbox
```

If the deploy fails on the Flow specifically: hand-written Flow XML is the
one metadata type most likely to need a small fix. Easiest recovery is
usually to fix it directly in Flow Builder after the Apex class deploys
successfully on its own, rather than debugging the XML blind — happy to
adjust the XML too if you paste me the deploy error.

## Run it and collect logs

1. Make sure debug logs are being captured for your user (TraceFlag — FoxLog's
   panel can toggle this, or Setup > Debug Logs).
2. Setup > Flows > **FoxLog Error Demo** > Run (screen flows can be run
   directly from the Flows list without adding them to a page).
3. Run through all these combinations (10 runs) so every scenario shows up
   in a log at least once:
   - Each of the 5 `Error type` choices, once with "Simulate NO fault
     connector" **unchecked**, once **checked**.
4. Open each resulting debug log (in FoxLog itself, or Setup > Debug Logs >
   View, or `sf apex list log` / `sf apex get log`) and grab the lines
   containing `FLOW_` (`FLOW_ELEMENT_ERROR`, `FLOW_ELEMENT_FAULT`,
   `FLOW_INTERVIEW_FINISHED`, etc. — whatever Salesforce actually emits).

Send me those lines (or the full raw logs) and I'll wire the parser fix on
this branch (`flow-element-error-repro`) against the real format, then
you can pull and re-test in FoxLog directly.

## Cleanup

When you're done, this is safe to delete from the sandbox:

```bash
sf project delete source -m ApexClass:FoxLogErrorDemoController -m Flow:FoxLog_Error_Demo -o foxlog-sandbox
```
