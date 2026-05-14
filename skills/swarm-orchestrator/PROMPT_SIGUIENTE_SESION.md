# Prompt para Siguiente Sesión — Tareas Pendientes

Copia y pega esto en la nueva sesión de Kimi CLI:

```
Lee tu manual de operacion:

ReadFile(path="~/.kimi/skills/swarm-orchestrator/NEW_SESSION_INSTRUCTIONS.md")

Luego lee el analisis completo del proyecto:

ReadFile(path="~/.kimi/knowledge/polybot/2026-05-14-complete-project-audit.md")

Hoy se completaron 8 tareas criticas (commits f43a7f7, 9d1f5b0, 9ffeb85, a6b8cc4, 589b09b).
Tu trabajo ahora son las tareas pendientes del analisis.

Para CADA tarea:
  a) Corre el motor: cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "<tarea>"
  b) Lee el prompt del bus: cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
  c) Delega a worker: Agent(subagent_type="coder", prompt="<contenido>")
  d) Integra: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
  e) Testea: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
  f) Commitea: git add -A && git commit --no-verify -m "feat: ..."

TAREAS PENDIENTES (en este orden):

TAREA 1: "Set up GitHub Actions CI/CD pipeline with Docker build, push to registry, and automated deployment workflow for polybot. Include staging and production environments."

TAREA 2: "Add unit tests for polybot services with zero coverage: telegram-bot placeholder, database wrapper, bettor-discovery scorer, analytics queries, copy-betting pending-queue-worker, copy-betting balance-provider, order-intelligence volatility-tracker. Ensure each service has at least basic test coverage."

TAREA 3: "Create API documentation and operational runbooks for polybot. Document the REST API endpoints in dashboard service, the WebSocket events in TUI, and create deployment runbook with step-by-step instructions."

TAREA 4: "Implement automated database backup system for polybot SQLite database with scheduled dumps, remote storage upload, and recovery procedures. Add health checks for backup integrity."

Empeza con la Tarea 1.
```

---

## Notas para el orchestrador

**Tarea 1 (CI/CD):** Es cross-cutting (no es un servicio específico). El motor puede detectar solo un servicio. Esto es normal — CI/CD toca `.github/workflows/`, `Dockerfile`, `docker-compose.yml`, etc. El worker necesitará leer esos archivos.

**Tarea 2 (Tests):** El motor probablemente particione en multiples chunks porque toca muchos servicios. Esto es correcto.

**Tarea 3 (Docs):** Similar a CI/CD, es cross-cutting. Puede necesitar 1-2 workers.

**Tarea 4 (Backup):** Toca `src/core/db-maintenance.ts` y `src/services/database/`. Probablemente 1 worker.
