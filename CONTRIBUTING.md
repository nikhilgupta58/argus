# Contributing to Argus

## Getting started

```bash
git clone https://github.com/nikhilgupta58/argus
cd argus
bun install
bun test
```

All tests should pass on a fresh clone.

## Workflow

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run `bun test` and `bun run lint` — both must pass
5. Open a pull request against `main`

## Code style

We use [Biome](https://biomejs.dev/) for linting and formatting.

```bash
bun run lint        # check
bun run format      # auto-fix
```

## Tests

Every new feature needs tests. We use [Vitest](https://vitest.dev/) and [fast-check](https://fast-check.io/) for property-based testing on the contract and lineage layers.

```bash
bun test            # run all tests
bun test --watch    # watch mode
```

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Ed25519 signing to lineage events
fix: handle empty contract deadline field
docs: update lineage spec
chore: upgrade @noble/curves to 1.5.0
```

## Labels

Issues and PRs use these labels:

| Label | Meaning |
|-------|---------|
| `claude-code:auto` | Safe to ship with minimal human review |
| `claude-code:review` | Requires human review before merge |
| `kind:security` | Security-touching — extra scrutiny required |
| `priority:p0` | MVP-blocking |

## Security issues

Do not open public issues for security bugs. See [SECURITY.md](SECURITY.md).
