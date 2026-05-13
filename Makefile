.PHONY: dist-local install-local test lint typecheck

dist-local:
	mkdir -p dist
	cd packages/cli && bun build src/main.ts --compile --outfile ../../dist/argus
	@echo "Binary at dist/argus"

install-local:
	cd packages/cli && bun build src/main.ts --compile --outfile ~/.bun/bin/argus
	@echo "Installed: argus -> ~/.bun/bin/argus"

test:
	bun run --filter='*' test

lint:
	bun run lint

typecheck:
	bun run typecheck
