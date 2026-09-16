# Paceday web — same target vocabulary as the api repo (docs/factory/README.md §3),
# so an agent runs identical commands in both repos and never has to remember
# which one uses npm and which one uses go.
#
# Every target is safe to run from any directory: paths are absolute, derived
# from this file's own location. Recipes run under `bash -euo pipefail`.
SHELL := /usr/bin/env bash
.SHELLFLAGS := -euo pipefail -c

ROOT := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
# The contract lives in the api repo — this repo consumes it, never defines it.
# Override for a checkout elsewhere: `make openapi CONTRACT=/path/to/openapi.yaml`.
CONTRACT ?= $(ROOT)/../clockwise-like/contracts/openapi/openapi.yaml
API_REPO := $(patsubst %/contracts/openapi/openapi.yaml,%,$(CONTRACT))
VERIFY_DIR := $(ROOT)/.verify

SELF := $(MAKE) --no-print-directory -f $(ROOT)/Makefile

# The coverage floor (70%, factory §3) is enforced inside vitest.config.ts, not
# by parsing output here — see the comment there.

REQUIRE_DEPS = @test -d "$(ROOT)/node_modules" || { echo "node_modules missing — run: npm install" >&2; exit 1; }

.DEFAULT_GOAL := help
.PHONY: help lint typecheck test coverage openapi openapi-check verify verify-banner verify-summary

help:
	@echo "Paceday (web repo) — targets"
	@echo "  verify         lint, typecheck, openapi-check, test, coverage — fail-fast, prints a PR-pasteable summary"
	@echo "  lint           eslint (src/api/generated is excluded on purpose)"
	@echo "  typecheck      tsc against the generated contract types"
	@echo "  test           vitest run"
	@echo "  coverage       vitest run --coverage; the 70% floor is in vitest.config.ts"
	@echo "  openapi        regenerate src/api/generated from $(CONTRACT)"
	@echo "  openapi-check  the same, as a gate: fails on any drift"
	@echo ""
	@echo "  e2e lives in the api repo ($(API_REPO)) — it drives the whole compose stack."

lint:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm run lint

# Not folded into `lint`: eslint does not typecheck, vitest does not typecheck,
# and vite builds with SWC which strips types without checking them. Without
# this target nothing would notice a call site that disagrees with the
# regenerated contract types — which is the whole reason they are generated.
typecheck:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm run typecheck

test:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm test

coverage:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm run coverage

## Regenerate the committed types and zod schemas from the api repo's bundle
openapi:
	$(REQUIRE_DEPS)
	CONTRACT="$(CONTRACT)" $(ROOT)/scripts/openapi-gen.sh

## Gate: the committed generated files match the contract byte for byte
openapi-check:
	$(REQUIRE_DEPS)
	CONTRACT="$(CONTRACT)" $(ROOT)/scripts/openapi-gen.sh --check

## Everything, fail-fast, with a summary to paste into the PR body
verify:
	@rm -rf "$(VERIFY_DIR)"
	@mkdir -p "$(VERIFY_DIR)"
	@$(SELF) verify-banner | tee "$(VERIFY_DIR)/banner.txt"
	@$(SELF) lint          && echo "lint           PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) typecheck     && echo "typecheck      PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) openapi-check && echo "openapi-check  PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) test          && echo "test           PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) coverage      && echo "coverage       PASS (floor 70%, enforced by vitest)" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) verify-summary

# Both SHAs, because a frontend PR is only meaningful against the contract
# commit it was generated from.
verify-banner:
	@echo "make verify — Paceday web"
	@echo "date : $$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
	@echo "web  : $$(git -C '$(ROOT)' describe --always --dirty 2>/dev/null || echo '<not a git checkout>')" \
	      "on $$(git -C '$(ROOT)' rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')  [$(ROOT)]"
	@if [ -d "$(API_REPO)" ]; then \
		echo "api  : $$(git -C '$(API_REPO)' describe --always --dirty 2>/dev/null || echo '<not a git checkout>')" \
		     "on $$(git -C '$(API_REPO)' rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')  [$(API_REPO)]"; \
	else \
		echo "api  : absent at $(API_REPO) — openapi-check cannot run"; \
	fi

verify-summary:
	@echo ""
	@echo "===== BEGIN make verify summary (paste into the PR body) ====="
	@cat "$(VERIFY_DIR)/banner.txt"
	@echo ""
	@cat "$(VERIFY_DIR)/steps.txt"
	@echo "===== END make verify summary ====="
