# Flow B (opt-in): Drachtio → FreeSWITCH → ESL

> **Doc hub:** [Documentation index](README.md) — Flow A is [flow-a-kamailio.md](flow-a-kamailio.md).

Flow B replaces the SIP edge (Kamailio) with **Drachtio**, while keeping the rest of the system the same.

- **SIP edge:** Drachtio C++ server receives SIP on `:5060`.
- **Control plane:** Node connects to Drachtio over the **command socket** (default `:9022`) using `drachtio-srf`.
- **Proxy:** Node calls `srf.proxyRequest(...)` to proxy the INVITE to FreeSWITCH.
- **Media:** RTP is still **direct** carrier ↔ FreeSWITCH.
- **ESL:** unchanged; FreeSWITCH still `socket`s to Kulloo `ESL_OUTBOUND_PORT`.

Activation is env-driven:

- `CALL_CONTROL_BACKEND=drachtio`

---

## Why Flow B exists

Flow B is useful when you want SIP signaling behavior to be controlled from Node (via Drachtio) instead of Kamailio config.

---

## Key invariants

- **Preserve `KullooCallId`:** Flow B explicitly re-adds it via `headers: { KullooCallId: value }` on `proxyRequest()`.
- **Stay in dialog:** `remainInDialog: true` keeps Drachtio in the signaling path (similar intent to Kamailio `record_route()`).

---

## Authoritative detail

The deep Flow B detail is documented here:

- [drachtio.md](drachtio.md)

---

## Related docs

- [drachtio.md](drachtio.md)
- [esl.md](esl.md)
- [freeswitch.md](freeswitch.md)
- [stability.md](stability.md)

