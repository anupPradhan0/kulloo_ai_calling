# Flow A (default): Kamailio → FreeSWITCH → ESL

> **Doc hub:** [Documentation index](README.md) — Flow B is [flow-b-drachtio.md](flow-b-drachtio.md).

Flow A is the default production layout:

- **SIP edge:** Kamailio receives SIP on `:5060` and load-balances to a FreeSWITCH pool.
- **Media:** RTP flows **directly** between carrier (e.g. Plivo) and the selected FreeSWITCH instance.
- **Call control:** FreeSWITCH dialplan runs `socket ... async full` to Kulloo’s **outbound ESL** listener (`ESL_OUTBOUND_PORT`, usually `3200`).
- **Persistence:** ESL handler updates Mongo (`Call`, `CallEvent`, `Recording`).
- **Redis:** required for API startup, readiness, idempotency cache, and webhook dedupe.

---

## When to use Flow A

Use Flow A when you want:

- a simple, config-driven SIP load balancer
- multi-FreeSWITCH pool routing with health checks + failover
- minimal Node.js involvement in SIP signaling

---

## Key invariants

- **`KullooCallId` must be preserved** on the SIP INVITE for outbound API-created calls.
- Kamailio forwards headers untouched; ESL uses `KullooCallId` to attach the FreeSWITCH UUID to the pre-created `Call`.

---

## Related docs

- [kamailio.md](kamailio.md)
- [outbound-calls.md](outbound-calls.md)
- [inbound-call-dataflow.md](inbound-call-dataflow.md)
- [esl.md](esl.md)
- [freeswitch.md](freeswitch.md)
- [stability.md](stability.md)

