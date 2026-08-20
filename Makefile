DEFAULT_GOAL := help
.ONESHELL:

# ---- Node / tooling ----
NPM ?= npm

.PHONY: help install dev build preview lint gen-api

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-14s %s\n", $$1, $$2}'

install: ## Install dependencies from package.json (run once, and after pulling dependency changes).
	$(NPM) install

dev: ## Start the Vite dev server with HMR (default :5173), proxying API paths to the backend on :8000.
	$(NPM) run dev

build: ## Typecheck (tsc -b) then build the production bundle into dist/.
	$(NPM) run build

preview: ## Serve the already-built dist/ locally to preview the production build.
	$(NPM) run preview

lint: ## Run eslint across the project.
	$(NPM) run lint

gen-api: ## Regenerate src/api/schema.d.ts from the backend's openapi.json (types.ts re-exports it).
	$(NPM) run gen:api
