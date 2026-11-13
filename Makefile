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

# The coverage floor (a ratchet toward the 70% target, factory §3) is enforced inside vitest.config.ts, not
# by parsing output here — see the comment there.

REQUIRE_DEPS = @test -d "$(ROOT)/node_modules" || { echo "node_modules missing — run: npm install" >&2; exit 1; }

.DEFAULT_GOAL := help
.PHONY: help lint typecheck design-check design-baseline test coverage demo-check openapi openapi-check openapi-check-full verify verify-banner verify-summary

help:
	@echo "Paceday (web repo) — targets"
	@echo "  verify         lint, typecheck, design-check, openapi-check, test, demo-check, coverage — fail-fast, prints a PR-pasteable summary"
	@echo "  lint           eslint (src/api/generated is excluded on purpose)"
	@echo "  typecheck      tsc against the generated contract types"
	@echo "  design-check   Impeccable detector over src/, ratcheted against .impeccable/baseline.json"
	@echo "  design-baseline  rewrite the baseline from the current scan (new entries need a PAC issue)"
	@echo "  test           vitest run"
	@echo "  coverage       vitest run --coverage; the floor (ratchet toward 70%) is in vitest.config.ts"
	@echo "  demo-check     PAC-83: production build has no demo, development build has every demo marker"
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

# Deterministic design rules (Impeccable, pinned in the script). No LLM, no key.
# Ratchets rather than demanding zero: findings that predate the gate live in
# .impeccable/baseline.json, and the gate fails only on new ones. It is a gate
# rather than an agent instruction because Lovable's agent edits this repo and
# reads no agent definition — code is the only thing both agents obey.
design-check:
	cd $(ROOT) && node scripts/design-check.mjs

design-baseline:
	cd $(ROOT) && node scripts/design-check.mjs --update

test:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm test

coverage:
	$(REQUIRE_DEPS)
	cd $(ROOT) && npm run coverage

# PAC-83 (owner OQ-1 (c), AC-30): the demo exists only in non-production
# builds. Builds both modes into temp dirs and searches them for the markers
# pinned in contracts/features/PAC-83.md §4.3.
demo-check:
	$(REQUIRE_DEPS)
	cd $(ROOT) && node scripts/check-demo-absent.mjs

## Regenerate the committed types and zod schemas from the api repo's bundle
openapi:
	$(REQUIRE_DEPS)
	CONTRACT="$(CONTRACT)" $(ROOT)/scripts/openapi-gen.sh

## Gate: the committed generated files match the contract byte for byte
# Every byte of this check compares this repo with the api repo's bundle, so
# OPENAPI_CROSS_REPO=skip (set by ci.yml on pushes to main) leaves only the
# local part: the generated files are present. A paired contract change merges
# api first and web minutes later, so the two mains disagree in between by
# design; the api repo's release.yml runs the full check on the exact pair of
# main SHAs it would publish, and does not publish a pair that fails. PRs keep
# the full check.
OPENAPI_CROSS_REPO ?= check
GENERATED := types.ts schemas.ts schemas.types.d.ts
openapi-check:
	@if [ "$(OPENAPI_CROSS_REPO)" = "skip" ]; then \
		for f in $(GENERATED); do \
			test -f "$(ROOT)/src/api/generated/$$f" || { echo "FAIL: src/api/generated/$$f is missing; run \`make openapi\` and commit it" >&2; exit 1; }; \
		done; \
		echo "OK: src/api/generated present (local part only)"; \
		echo "::notice title=openapi-check::cross-repo half (generated types vs the api bundle) deferred to the api repo's release.yml (OPENAPI_CROSS_REPO=skip)"; \
	else \
		$(SELF) openapi-check-full; \
	fi

openapi-check-full:
	$(REQUIRE_DEPS)
	CONTRACT="$(CONTRACT)" $(ROOT)/scripts/openapi-gen.sh --check

## Everything, fail-fast, with a summary to paste into the PR body
verify:
	@rm -rf "$(VERIFY_DIR)"
	@mkdir -p "$(VERIFY_DIR)"
	@$(SELF) verify-banner | tee "$(VERIFY_DIR)/banner.txt"
	@$(SELF) lint          && echo "lint           PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) typecheck     && echo "typecheck      PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) design-check  && echo "design-check   PASS (impeccable, ratcheted)" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) openapi-check && if [ "$(OPENAPI_CROSS_REPO)" = "skip" ]; then \
		echo "openapi-check  PASS (local part; cross-repo check deferred to release)" >> "$(VERIFY_DIR)/steps.txt"; \
	else echo "openapi-check  PASS" >> "$(VERIFY_DIR)/steps.txt"; fi
	@$(SELF) test          && echo "test           PASS" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) demo-check    && echo "demo-check     PASS (no demo in the production build)" >> "$(VERIFY_DIR)/steps.txt"
	@$(SELF) coverage      && echo "coverage       PASS (ratchet floor in vitest.config.ts, target 70%)" >> "$(VERIFY_DIR)/steps.txt"
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
