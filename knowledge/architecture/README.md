# Architecture Knowledge

How sodax systems are structured — boundaries, data flow, key components. Create
subareas on demand, e.g. `frontend/`, `backend/`, `sdk/`.

One file per topic, `kebab-title.md`, with knowledge frontmatter (see
`../README.md`). Discovery is via `rg "type: knowledge"`; the table below is a
human convenience and may lag.

## Index

| Topic | File | Status |
| ----- | ---- | ------ |
| Bound Auth mechanism, from source | `bound-auth-mechanism.md` | Active |
| Bound client-side crypto (KDF, envelope, derivation, backup) | `bound-client-crypto.md` | Active |
| Bound email+password flow, simplified walkthrough | `bound-email-password-flow.md` | Active |

Reference repos cloned locally at [[bound-exchange-repos]] (`knowledge/external/`).
| Email wallets: encrypted keystore vs MPC | `encrypted-keystore-vs-mpc-email-wallets.md` | Active |
| Delivery hooks are SDK-only | `delivery-hooks-are-sdk-only.md` | — |
