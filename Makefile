.PHONY: help up down restart build logs ps \
        php node nginx postgres redis \
        composer symfony console cache-clear \
        npm \
        db-migrate db-reset jwt-keys

DC = docker compose

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Docker lifecycle ─────────────────────────────────────────────────────────

up: ## Start all services (detached)
	$(DC) up -d

down: ## Stop and remove containers
	$(DC) down

restart: ## Restart all services
	$(DC) restart

build: ## Rebuild images
	$(DC) build

logs: ## Follow logs for all services
	$(DC) logs -f

logs-php: ## Follow PHP container logs
	$(DC) logs -f php

logs-node: ## Follow Node container logs
	$(DC) logs -f node

ps: ## Show running containers
	$(DC) ps

# ── Shell access ─────────────────────────────────────────────────────────────

php: ## Exec into PHP (backend) container
	$(DC) exec php sh

node: ## Exec into Node (frontend) container
	$(DC) exec node sh

nginx: ## Exec into Nginx container
	$(DC) exec nginx sh

postgres: ## Exec into Postgres container
	$(DC) exec postgres psql -U $${POSTGRES_USER:-app} $${POSTGRES_DB:-app}

redis: ## Exec into Redis CLI
	$(DC) exec redis redis-cli

# ── Backend (Symfony / Composer) ─────────────────────────────────────────────

composer: ## Run composer command — usage: make composer CMD="require vendor/pkg"
	$(DC) exec php composer $(CMD)

symfony: ## Run Symfony CLI inside PHP container — usage: make symfony CMD="check:requirements"
	$(DC) exec php php bin/console $(CMD)

console: ## Alias for bin/console — usage: make console CMD="debug:router"
	$(DC) exec php php bin/console $(CMD)

cache-clear: ## Clear Symfony cache
	$(DC) exec php php bin/console cache:clear

jwt-keys: ## Generate JWT key pair (runs inside PHP container)
	$(DC) exec php php bin/console lexik:jwt:generate-keypair --overwrite

db-migrate: ## Run Doctrine migrations
	$(DC) exec php php bin/console doctrine:migrations:migrate --no-interaction

db-reset: ## Drop, create, and migrate database (dev only)
	$(DC) exec php php bin/console doctrine:database:drop --force --if-exists
	$(DC) exec php php bin/console doctrine:database:create
	$(DC) exec php php bin/console doctrine:migrations:migrate --no-interaction

# ── Frontend (Node / npm) ────────────────────────────────────────────────────

npm: ## Run npm command inside Node container — usage: make npm CMD="install"
	$(DC) exec node npm $(CMD)