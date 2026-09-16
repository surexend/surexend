# SureXend elliptic compatibility adapter

This private package is a deliberately narrow compatibility surface for the
`@ethersproject/signing-key@5.8.0` API used by Circle's SDK dependency graph.
It implements only the secp256k1 methods that that package calls and delegates
curve arithmetic to `@noble/curves`.

It is not a general replacement for the upstream `elliptic` package. Unsupported
curves and APIs fail closed. Run the repository smoke test after every dependency
change:

```bash
npm run security:crypto-compat
```

The smoke test is not an independent cryptographic audit or a substitute for
vendor security review.
