# KIMI SWARM — Plan Maestro
<!-- SYNC: 2026-05-13T18:00:00Z -->
<!-- Modo: AUTOPILOTO -->

## Visión
Sistema de orquestación multi-agente para Kimi CLI que distribuye el context window de 262k tokens entre workers efímeros, usando el filesystem como message bus (patrón FCoP + Claude Swarm).

## Arquitectura

```
Usuario → Orquestador (1 CLI, 240k tokens)
    ↓ Agent(tool="worker-X")
Worker subagente (262k tokens propios, efímero)
    ↓ Escribe resultado
~/shared-context/{project}/bus/  (message bus filesystem)
    requests/ → processing/ (atomic rename) → responses/ → archive/
```

## Fases

### FASE 1: Message Bus Filesystem
- Crear bus/{requests,processing,responses,archive} para solbot y polybot
- Implementar atomic rename protocol (Maildir-style)
- Testear race conditions

### FASE 2: Scripts de Coordinación
| Script | Propósito |
|--------|-----------|
| `swarm-delegate.sh` | Orquestador delega tarea a worker |
| `swarm-claim.sh` | Worker toma tarea (atomic rename) |
| `swarm-complete.sh` | Worker entrega resultado |
| `swarm-status.sh` | Estado de todos los workers |
| `swarm-watch.sh` | Worker espera tareas (polling) |
| `swarm-compact.sh` | Super-Orquestador compacta contexto |

### FASE 3: Templates
- `worker-brief.json.template` — Contexto estructurado (200-500 tokens)
- `worker-report.md.template` — Entrega del worker
- `context-seed.md.template` — Seed post-compactación

### FASE 4: Hooks Swarm
- `session-start-swarm.sh` — Detectar si es Orquestador o Worker
- `pre-tool-use-swarm.sh` — Tracker de bus usage
- `stop-swarm.sh` — Persistir estado al cerrar

### FASE 5: Test End-to-End
- Flujo: Orquestador delega → Worker claim → Worker ejecuta → Worker completa → Orquestador integra

### FASE 6: Knowledge Persistence
- Guardar todo en ~/.kimi/knowledge/kimi-swarm/

## Decisions Log
- 2026-05-13: Usar atomic rename (mv) en vez de flock para claims — más simple, sin locks
- 2026-05-13: Workers efímeros (Agent tool) en vez de CLIs permanentes — ahorra RAM/CPU
- 2026-05-13: Super-Orquestador como hook automático, no CLI separado
