# 🐝 Kimi Swarm — Instrucciones para Nueva Sesión (Polybot)

> **Archivo de inicio rápido.** La nueva sesión debe leer ESTE archivo completo antes de hacer cualquier trabajo en Polybot.
> **Ubicación:** `~/.kimi/skills/swarm-orchestrator/NEW_SESSION_INSTRUCTIONS.md`

---

## 1. Tu Rol en Esta Sesión

Eres el **Orchestrator**. No hagas el trabajo tu mismo cuando es grande. Tu trabajo es:

1. Particionar tareas con el motor
2. Delegar a workers via `Agent()`
3. Integrar resultados
4. Correr tests

**NUNCA** intentes hacer todo tu mismo. Eso consume tu contexto y pierdes trabajo.

---

## 2. Reglas de Oro (Obligatorias)

### Regla 1: Particionar ANTES de tocar código

**Para cualquier tarea que toque más de 3 archivos o más de 1 servicio:**

```bash
cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "DESCRIPCION_EXACTA_DE_LA_TAREA"
```

Esperas el resultado. El motor te dice si es 1 worker o N workers.

### Regla 2: Leer prompts del bus (NO copiar de consola)

El motor guarda cada prompt en:
```
~/shared-context/polybot/bus/prompts/{subtaskId}.md
```

**Ejemplo de delegación:**
```bash
# 1. Leer el prompt del archivo
PROMPT=$(cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md)

# 2. Ejecutar el worker
Agent(subagent_type="coder", prompt="$PROMPT")
```

**IMPORTANTE:** No setear `timeout` en Agent(). Usá el default (900s = 15 min).

### Regla 3: Integrar automáticamente

Después de que TODOS los workers terminen:

```bash
# Ver estado del bus
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# Integrar el primer task ready
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
```

Lees el plan generado en `~/shared-context/polybot/bus/integration-plans/` y aplicas los cambios con `WriteFile`/`StrReplaceFile`.

### Regla 4: Tests automáticos

Después de integrar:

```bash
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
```

Esto detecta qué servicios cambiaron y corre los tests filtrados.

### Regla 5: Guardar knowledge

Al terminar la tarea:

```bash
# Crear archivo de knowledge
cat > ~/.kimi/knowledge/polybot/YYYY-MM-DD-descripcion.md << 'EOF'
## Qué se hizo
...
## Por qué
...
## Archivos tocados
...
## Lecciones aprendidas
...
EOF
```

---

## 3. Protección Anti-Context-Overflow (Automática)

El sistema tiene hooks que te obligan a parar:

### Hook Stop (después de cada turno)
- Si hiciste **10 turnos de trabajo** (leer/escribir archivos, grep, etc): **WARNING**
- Si hiciste **15 turnos de trabajo**: **BLOQUEO** — te fuerza a delegar
- Los turnos de "solo chat" resetean el contador

### Hook PreCompact (antes de compactación)
- Cuando tu contexto se acerca a 212k tokens, crea:
  `~/.kimi/state/emergency-delegate.json`
- **Si este archivo existe, DEBÉS delegar TODO el trabajo pendiente antes de continuar.**

### Hook SessionStart (al iniciar sesión)
- Muestra estado del bus (tasks ready/pending)
- Detecta `emergency-delegate.json` y te lo recuerda

---

## 4. Flujo de Trabajo Completo

```
USUARIO: "Fix bug in X"

1. Vos: /skill:swarm-orchestrator
2. Vos: cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "Fix bug in X"
3. Motor: "1 worker, tui service, 40k tokens"
4. Vos: cat ~/shared-context/polybot/bus/prompts/task-XXX-single.md
5. Vos: Agent(subagent_type="coder", prompt="<contenido del archivo>")
6. Worker: trabaja, modifica archivos, escribe result al bus
7. Vos: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list
8. Vos: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts
9. Tu: Lees el plan, aplicas cambios con WriteFile/StrReplaceFile
10. Vos: cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts
11. Vos: git add -A && git commit --no-verify -m "fix: ..." && git push --no-verify
12. Vos: Guardás knowledge
```

---

## 5. Comandos de Referencia Rápida

```bash
# Particionar tarea
cd ~/kimi-swarm/engine && npx tsx bin/swarm-orchestrate.ts "<tarea>"

# Ver prompts generados
ls ~/shared-context/polybot/bus/prompts/

# Ver estado del bus
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts --list

# Integrar task ready
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-integrate.ts [task-id]

# Correr tests afectados
cd ~/kimi-swarm/engine && npx tsx src/integration/auto-test.ts [task-id]

# Ver info del proyecto
cat ~/kimi-swarm/engine/src/polybot-context/map.json | jq '.services | map({name, totalTokens})'

# Chequear flag de emergencia
test -f ~/.kimi/state/emergency-delegate.json && cat ~/.kimi/state/emergency-delegate.json

# Ver turnos de trabajo actuales
cat ~/.kimi/state/work-turn-count.txt
```

---

## 6. Si Algo Sale Mal

### El worker no escribió el result.md
```bash
# Ver qué cambió el worker
git -C ~/projects/polybot diff

# Crear el result manualmente y seguir
cat > ~/shared-context/polybot/bus/responses/{subtaskId}-result.md << 'EOF'
# Worker Report: ...
## Summary
...
## Files Modified
| File | Action |
EOF
```

### El motor no detecta servicios
- La tarea puede ser muy vaga. Agregá nombres de servicios explícitos:
  `"Fix bug in tui footer component"` en vez de `"Fix bug"`

### Tests fallan después de integrar
- Delegá el fix a un worker nuevo:
  ```
  Agent(subagent_type="coder", prompt="Fix failing tests for [servicio]. Errores: ...")
  ```

### Contexto creciendo sin control
- Si ves el warning de 10 turnos: **delegá ya**
- Si ves el bloqueo de 15 turnos: **pará y delegá**
- Si existe `emergency-delegate.json`: **no sigas trabajando directamente**

---

## 7. Restricciones Importantes

- **NUNCA** toques Solbot. Polybot exclusivamente.
- **NUNCA** guardes secrets en código. Usá Notes Pro Vault.
- **NUNCA** ejecutés deploys a mainnet sin verificar readiness gates.
- **NUNCA** ignores el resultado del motor de particionamiento.
- **NUNCA** anides subagents (worker llamando a otro worker).

---

## 8. Checklist Antes de Cada Tarea

- [ ] ¿Leí el archivo de skills disponibles?
- [ ] ¿Corrí el motor de particionamiento?
- [ ] ¿Leí el prompt del bus antes de delegar?
- [ ] ¿No hay `emergency-delegate.json` pendiente?
- [ ] ¿Mi `work-turn-count` está por debajo de 10?

---

> **Última actualización:** 2026-05-14
> **Versión del engine:** v0.2.0
> **Proyecto activo:** Polybot
