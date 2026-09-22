# FoxLog Flow error repro kit

Purpose: generate real Salesforce debug logs covering the event types
FoxLog's parser/call-tree builder was recently extended to handle, so those
fixes can be checked (and corrected) against real log output instead of
guessed formats. Specifically:

1. **Validation Rule failures** (`VALIDATION_FAIL`/`VALIDATION_ERROR`) —
   not previously treated as error nodes.
2. **Callouts** (`CALLOUT_REQUEST`/`CALLOUT_RESPONSE`) — not previously
   shown as tree nodes.
3. **SOSL** (`SOSL_EXECUTE_BEGIN`/`SOSL_EXECUTE_END`) — previously
   unhandled entirely, unlike SOQL.
4. **Flow internals** (`FLOW_ELEMENT_BEGIN`/`FLOW_ELEMENT_END`,
   `FLOW_RULE_DETAIL`, `FLOW_ASSIGNMENT_DETAIL`, `FLOW_SUBFLOW_DETAIL`) —
   previously a Flow was a black box in the tree.
5. **`FLOW_LOOP_DETAIL`** — the Flow equivalent of the SOQL/DML-in-loop
   antipattern, plus a genuine DML-in-loop scenario to check whether that
   antipattern check fires for Flow-native DML the same way it does for Apex.

Also still covers the original purpose: `FLOW_ELEMENT_ERROR` and friends
(errors surfaced to/from a Flow, with and without an explicit fault path).

This is a throwaway test fixture, not part of the extension itself. Delete
it from your sandbox whenever you're done with it (see Cleanup below).

## What it deploys

- **`FoxLogErrorDemoController.cls`** — one `@InvocableMethod` that runs one
  of several scenarios based on an input string:
  - `CUSTOM_EXCEPTION` — a custom, clearly-labeled exception
  - `NULL_POINTER` — a `NullPointerException`
  - `DML_EXCEPTION` — an `insert` missing the required `Name` field on `Account`
  - `LIST_INDEX` — a list-index-out-of-bounds error
  - `VALIDATION_RULE` — an `insert` that trips the custom Validation Rule
    below, via Apex DML (point 1)
  - `HTTP_CALLOUT` — a real GET callout to a public test endpoint, no error
    (point 2)
  - `SOSL_QUERY` — a SOSL search across Accounts, no error (point 3)
  - anything else — no error, returns normally

- **`FoxLog_Error_Demo` flow** (Screen Flow):
  - A screen lets you pick one of the scenarios above (plus `FLOW_DML_ERROR`
    and `FLOW_VALIDATION_ERROR`, see below) and a checkbox "Simulate NO
    fault connector".
  - **Always-run chain** (runs on every single execution, regardless of the
    chosen scenario), added for points 4/5:
    - `Set_Demo_Variables` (Assignment) sets a counter and a 3-item text
      collection.
    - `Loop_Demo_Items` (Loop) iterates the collection 3 times. Each
      iteration runs `Increment_Counter` (Assignment) then
      `Create_Loop_Account` (Create Records) — **one individual DML insert
      per iteration, on purpose**: this is the Flow DML-in-loop antipattern,
      to see whether FoxLog's existing SOQL/DML-in-loop check fires for it.
      This creates 3 `Account` records named `FoxLog Demo Loop Account 1/2/3`
      **on every run** — see Cleanup.
    - `Call_Demo_Subflow` calls `FoxLog_Error_Demo_Subflow` (a trivial
      autolaunched subflow with one Assignment), to exercise
      `FLOW_SUBFLOW_DETAIL`.
  - Then routes to one of:
    - `Create_Bad_Account` — only when `FLOW_DML_ERROR` is picked. A native
      **Create Records** element inserting an `Account` with no `Name`, no
      Apex involved at all (missing required field, not a Validation Rule).
    - `Create_Account_Trip_Validation` — only when `FLOW_VALIDATION_ERROR`
      is picked. A native **Create Records** element that sets
      `Description` to a value that trips the Validation Rule below — the
      flow-native counterpart to the `VALIDATION_RULE` Apex scenario
      (point 1, no Apex involved).
    - Otherwise, the Apex action (`raiseError`) is called, on the chosen
      scenario, **twice**, on purpose:
      - `Call_With_Fault_Path` — has a Fault Connector wired to a screen
        showing `{!$Flow.FaultMessage}`. This is the "explicitly surfaced
        to the flow" case.
      - `Call_No_Fault_Path` — same action, same input, **no** fault
        connector. An error here isn't caught by the flow itself, letting
        us see how that differs in the raw log.

  `Create_Bad_Account` and `Create_Account_Trip_Validation` always have
  their own Fault Connector (the "simulate no fault connector" checkbox
  only affects the two Apex calls).

- **`FoxLog_Error_Demo_Subflow` flow** (Autolaunched Flow) — trivial, one
  Assignment, called by the main flow's always-run chain.

- **`FoxLog_Demo_Validation_Fail`** — a Validation Rule on `Account` that
  fails when `Description` contains `FOXLOG_FORCE_VALIDATION_ERROR`. Tripped
  by both `VALIDATION_RULE` (via Apex DML) and `FLOW_VALIDATION_ERROR` (via
  flow-native DML), so the resulting `VALIDATION_FAIL`/`VALIDATION_ERROR`
  log lines can be checked in both contexts.

- **`FoxLog_Demo_Callout`** — a Remote Site Setting whitelisting
  `https://jsonplaceholder.typicode.com` (a free, public, safe-to-hit test
  API), needed for the `HTTP_CALLOUT` scenario.

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
usually to fix it directly in Flow Builder after the Apex class/Validation
Rule/Remote Site Setting deploy successfully on their own, rather than
debugging the XML blind — happy to adjust the XML too if you paste me the
deploy error.

## Before you run it: FoxLog's debug level

Make sure the TraceFlag/DebugLevel FoxLog creates for your user actually
covers all the categories these events live under — `Workflow` and
`Validation` in particular need to be verbose enough to reliably capture
Flow-element and Validation-Rule events (this is exactly the fix in
`src/services/debug-level-manager.js` on this branch: previously a
newly-created DebugLevel record silently ignored the "raise Workflow/
Validation" fix because of a leftover duplicate config — now unified). If
you already had a `FoxLog_Debug_Level` DebugLevel record from before this
branch, delete it (or toggle debug logs off/on once) so FoxLog re-creates
it with the corrected levels; otherwise the stale record is reused as-is.

## Run it and collect logs

1. Make sure debug logs are being captured for your user (TraceFlag — FoxLog's
   panel can toggle this, or Setup > Debug Logs).
2. Setup > Flows > **FoxLog Error Demo** > Run (screen flows can be run
   directly from the Flows list without adding them to a page).
3. Run through all these combinations so every scenario shows up in a log
   at least once (the always-run chain — loop, DML-in-loop, subflow — fires
   on every single run, so you don't need to do anything extra for points
   4/5 beyond running the flow at all):
   - The 6 Apex-driven `Error type` choices (`CUSTOM_EXCEPTION`,
     `NULL_POINTER`, `DML_EXCEPTION`, `LIST_INDEX`, `VALIDATION_RULE`,
     `HTTP_CALLOUT`, `SOSL_QUERY`) plus `NONE`, each once with "Simulate NO
     fault connector" **unchecked**, once **checked** (16 runs — the
     checkbox doesn't change behavior for `HTTP_CALLOUT`/`SOSL_QUERY` since
     they don't error, but running both ways costs nothing).
   - `FLOW_DML_ERROR` once — the flow-native missing-required-field error.
   - `FLOW_VALIDATION_ERROR` once — the flow-native Validation Rule error.
   - 18 runs total. If you're short on time, the highest-value ones are
     `VALIDATION_RULE`, `FLOW_VALIDATION_ERROR`, `HTTP_CALLOUT`, and
     `SOSL_QUERY` once each (points 1-3), since every run already exercises
     points 4/5.
4. Open each resulting debug log (in FoxLog itself, or Setup > Debug Logs >
   View, or `sf apex list log` / `sf apex get log`) and grab the lines
   containing `FLOW_`, `VALIDATION_`, `SOSL_`, and `CALLOUT_`.

Send me those lines (or the full raw logs) and I'll correct the parser on
this branch (`flow-element-error-repro`) against the real format, then you
can pull and re-test in FoxLog directly.

## Cleanup

The always-run loop creates 3 `Account` records on **every** run
(`FoxLog Demo Loop Account 1/2/3`, description starting with "Created
one-at-a-time..."). Delete them when you're done, e.g.:

```bash
sf data query --query "SELECT Id FROM Account WHERE Name LIKE 'FoxLog Demo Loop Account%'" -o foxlog-sandbox
```
then delete the returned Ids (or delete via the UI/Data Loader). The
`VALIDATION_RULE`/`FLOW_VALIDATION_ERROR` scenarios do **not** create a
record (the Validation Rule blocks the save), and `CUSTOM_EXCEPTION`/
`NULL_POINTER`/`LIST_INDEX` don't reach a DML statement at all.

When you're done with the whole kit, this is safe to delete from the
sandbox:

```bash
sf project delete source -m ApexClass:FoxLogErrorDemoController \
  -m Flow:FoxLog_Error_Demo -m Flow:FoxLog_Error_Demo_Subflow \
  -m ValidationRule:Account.FoxLog_Demo_Validation_Fail \
  -m RemoteSiteSetting:FoxLog_Demo_Callout \
  -o foxlog-sandbox
```
