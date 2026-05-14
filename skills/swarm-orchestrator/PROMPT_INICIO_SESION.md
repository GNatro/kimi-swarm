# Prompt de Inicio de Sesión — Polybot Swarm v0.2

Copia y pega esto exactamente en la nueva sesión de Kimi CLI:

---

## PASO 1: Cargar Instrucciones del Sistema

```
Lee este archivo de instrucciones completo antes de hacer cualquier trabajo:

ReadFile(path="~/.kimi/skills/swarm-orchestrator/NEW_SESSION_INSTRUCTIONS.md")

Es tu manual de operacion para esta sesion. Siguelo al pie de la letra.
```

---

## PASO 2: Contexto de la Sesión Anterior

```
La sesion anterior ya hizo un analisis completo del proyecto Polybot.
Lee ese analisis para entender el estado actual:

ReadFile(path="~/.kimi/knowledge/polybot/2026-05-14-complete-project-analysis.md")

Ese analisis identifico 5 bugs criticos y problemas operativos.
Tu trabajo HOY es implementar fixes usando el sistema Swarm.
```

---

## PASO 3: Tareas Prioritarias (en este orden)

```
Estas son las 3 tareas que debes ejecutar usando el sistema Swarm.
Para CADA una: particiona con el motor, delega a workers, integra, testea.

TAREA 1 (CRITICA — impacto operacional maximo):
"Fix dashboard onPause bug: pausing a bettor triggers toggleKillSwitch(true) which stops ALL global trading. The kill switch should only affect the paused bettor, not the entire system."

TAREA 2 (CRITICA — bloqueante para produccion):
"Fix dashboard hardcoded auth token: replace hardcoded Bearer polybot-dev-token with proper token retrieval from environment variables or vault."

TAREA 3 (CRITICA — riesgo financiero):
"Fix dashboard LIVE balance display: it reads config.wallet.paperBalanceUsdc instead of querying the real CLOB API. Fix the TODO on line 52 of the relevant service."
```

---

## PASO 4: Comandos Listos para Ejecutar

```
Para cada tarea, ejecuta estos comandos en orden:

# 1. Particionar
cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "<TAREA_AQUI>"

# 2. Ver prompt generado
ls ~/shared-context/polybot/bus/prompts/

# 3. Leer prompt y delegar a worker
cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
# Luego: Agent(subagent_type="coder", prompt="<contenido del archivo>")

# 4. Verificar que worker termino
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# 5. Integrar resultados
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts task-XXX

# 6. Aplicar cambios del plan (WriteFile/StrReplaceFile)

# 7. Correr tests
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts task-XXX

# 8. Commit y push
git add -A && git commit --no-verify -m "fix: ..." && git push --no-verify
```

---

## REGLAS DE ESTA SESIÓN

1. NO hagas analisis — ya esta hecho. Solo implementacion.
2. SIEMPRE usa el motor Swarm antes de tocar codigo.
3. NUNCA trabajes directamente por mas de 10 turnos sin delegar.
4. Si ves un warning de "15 turnos de trabajo" o "emergency-delegate.json", PARA y delega inmediatamente.
5. Despues de cada tarea, guarda knowledge en ~/.kimi/knowledge/polybot/

---

## ARCHIVOS CLAVE

- Instrucciones del sistema: `~/.kimi/skills/swarm-orchestrator/NEW_SESSION_INSTRUCTIONS.md`
- Analisis completo: `~/.kimi/knowledge/polybot/2026-05-14-complete-project-analysis.md`
- Motor Swarm: `~/kimi-swarm/engine/`
- Bus de mensajes: `~/shared-context/polybot/bus/`
- Proyecto Polybot: `~/projects/polybot/`
