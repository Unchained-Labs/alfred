# Alfred — common tasks. `make help` lists them.
NPM ?= npm

.PHONY: help
help:
	@grep -hE '^[a-z0-9-]+:.*?## ' $(MAKEFILE_LIST) \
		| sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install dependencies
	$(NPM) install

.PHONY: dev
dev: ## Run the dev server
	$(NPM) run dev

.PHONY: build
build: ## Production build
	$(NPM) run build

.PHONY: start
start: build ## Build, then serve the production app
	$(NPM) run start

.PHONY: typecheck
typecheck: ## tsc --noEmit
	$(NPM) run typecheck

.PHONY: lint
lint: ## ESLint
	$(NPM) run lint

.PHONY: format
format: ## Rewrite files with Prettier
	$(NPM) run format

.PHONY: format-check
format-check: ## Fail if anything is unformatted
	$(NPM) run format:check

.PHONY: test
test: typecheck lint format-check ## Everything CI runs, minus the build

.PHONY: check
check: test build ## Everything CI runs

.PHONY: seed
seed: ## Replace all data with the demo pipeline (destructive)
	$(NPM) run seed

.PHONY: migrate
migrate: ## Apply pending database migrations
	$(NPM) run migrate

.PHONY: docs
docs: ## Build the docs site (strict — broken links fail)
	mkdocs build --strict

.PHONY: docs-serve
docs-serve: ## Serve the docs with live reload
	mkdocs serve

.PHONY: clean
clean: ## Remove build output
	rm -rf .next site

# --- container ------------------------------------------------------------
# The app needs no database service, so "run it" really is one command. These
# exist so that fact is discoverable from `make help` rather than from reading
# a compose file.

.PHONY: docker-build
docker-build: ## Build the container image
	docker compose build

.PHONY: docker-up
docker-up: ## Build if needed, then run it at http://127.0.0.1:3100
	docker compose up -d --build
	@echo "alfred → http://127.0.0.1:$${ALFRED_PORT:-3100}"

.PHONY: docker-down
docker-down: ## Stop it (the data volume is kept)
	docker compose down

.PHONY: docker-logs
docker-logs: ## Follow the container log
	docker compose logs -f --tail=200

.PHONY: docker-reset
docker-reset: ## Stop it AND delete the database volume (destructive)
	docker compose down -v
