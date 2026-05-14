# Prompt para Sesion Local — CI/CD, Tests, Docs, Backup

Copia y pega esto exactamente en la nueva sesion de Kimi CLI:

```
Lee tu manual de operacion:

ReadFile(path="~/.kimi/skills/swarm-orchestrator/NEW_SESSION_INSTRUCTIONS.md")

Luego lee el analisis completo del proyecto:

ReadFile(path="~/.kimi/knowledge/polybot/2026-05-14-complete-project-audit.md")

Hoy se completaron 8 tareas criticas. El enfoque ahora es TODO LOCAL.
Nada de GitHub Actions, nada de servicios cloud. Todo se ejecuta en esta maquina.

Para CADA tarea:
  a) Corre el motor: cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "<tarea>"
  b) Lee el prompt del bus: cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
  c) Delega a worker: Agent(subagent_type="coder", prompt="<contenido>")
  d) Integra: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
  e) Testea: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
  f) Commitea: git add -A && git commit --no-verify -m "feat: ..."

TAREAS PENDIENTES (en este orden, todo local):

TAREA 1: "Create local CI/CD pipeline for polybot using shell scripts. Create scripts/deploy.sh that runs: npm run lint, npm run typecheck, npm run build, docker build, and deploys to local Docker. Create scripts/backup.sh for database backup. All scripts must be executable and stored in the project scripts/ directory."

TAREA 2: "Add unit tests for polybot services with zero test coverage. Focus on: telegram-bot placeholder service, database wrapper, bettor-discovery scorer module, analytics queries, copy-betting pending-queue-worker stub, copy-betting balance-provider stub, order-intelligence volatility-tracker stub. Create at least one meaningful test per service. Run npm test to validate."

TAREA 3: "Create local API documentation and operational runbooks for polybot. Document all dashboard REST API endpoints in a docs/API.md file. Document TUI keyboard shortcuts and WebSocket events in docs/TUI.md. Create a deployment runbook at docs/DEPLOY.md with step-by-step instructions using the local scripts."

TAREA 4: "Implement automated local database backup system for polybot. Create a Node.js script in scripts/backup-database.ts that: dumps the SQLite database, compresses it with timestamp, stores backups in data/backups/, keeps only last 30 backups, verifies backup integrity. Schedule it via a cron-like mechanism in db-maintenance.ts. Add tests for backup verification."

Empeza con la Tarea 1.
```
