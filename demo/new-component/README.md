# Live Demo: Add a New Adapter Component

**Duration:** ~2 minutes
**File:** `esb-adapters/src/main/java/com/finexatech/esb/adapters/target/HttpLoggedTargetAdapter.java`

---

## What to say

> "Right now the platform ships with these target adapters: `soap`, `http`, `mock-response`, `mock-echo`.
> I'm going to add a fifth one — live — without touching the UI or any config file."

---

## Steps

**STEP 1** — Show the current palette
Open the Route Builder UI → look at the Targets section.
Say: _"Four targets. Let me add one more."_

**STEP 2** — Open the adapter file
Open `HttpLoggedTargetAdapter.java` in your editor.
Say: _"35 lines. Four methods. That's the entire contract."_

Point at each method:
- `protocol()` → _"This is the name the YAML uses: `http-logged`"_
- `buildToUri()` → _"This is the Camel endpoint URI — standard HTTP"_
- `preProcessor()` → _"Log before the call with the correlation ID"_
- `postProcessor()` → _"Log the response code after"_
- `@Component` → _"This annotation is the only wiring needed"_

**STEP 3** — The file is already compiled in
The adapter is already in `esb-adapters` and compiled into the runtime JAR.
Restart only the runtime:

```bash
# In the Runtime terminal: Ctrl+C, then:
cd esb-runtime
mvn spring-boot:run -Dspring-boot.run.profiles=demo
```

**STEP 4** — Show it in the UI
Refresh the Route Builder → Targets palette.
`http-logged` now appears. Say: _"Zero UI changes."_

**STEP 5** — Build and invoke a route
Drag `http-logged` into a route, deploy it, make an API call.
Watch the terminal: `[DEMO] → Outbound call to ...` and `[DEMO] ← Response 200 from ...`

---

## Key talking point

> "No UI code changed. No XML config. No annotation processor. Just `@Component`.
> The platform discovers it at startup and the palette updates automatically.
> This is how you'd add OAuth, GraphQL, gRPC — any protocol — in 30 lines."
