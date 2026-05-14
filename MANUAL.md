# 📖 MANUAL DE USO — Kimi Swarm
> Para humanos, no para robots. Escrito en español simple.

---

## 🤔 ¿Qué es esto?

Es un sistema para que **1 persona** (vos) pueda trabajar en proyectos GIGANTES sin que se le llene la cabeza.

**El problema:** Kimi CLI tiene un límite de memoria (262 mil tokens). Cuando un proyecto es muy grande, Kimi se "olvida" de cosas importantes.

**La solución:** En vez de meter TODO en una sola conversación, repartimos el trabajo en tareas chiquitas. Cada tarea la hace un "worker" especializado, y vos (el Orquestador) solo juntas los resultados.

**En una frase:** Vos sos el director de orquesta. Los workers tocan los instrumentos. Vos no tocás nada, solo dirigís.

---

## 🎭 Los 3 personajes

| Personaje | ¿Quién es? | ¿Hace qué? | ¿Cuántas ventanas necesita? |
|---|---|---|---|
| **Vos (Orquestador)** | El director | Decidís qué hacer y a quién delegar | **1 ventana** |
| **Worker** | El músico | Ejecuta UNA tarea concreta | **1 ventana por tarea** |
| **Super-Orquestador** | El archivista | Guarda la historia para que nada se pierda | **NINGUNA** (es un programa) |

---

## 🚀 PRIMER PASO: Lo que ejecutás UNA SOLA VEZ

Cuando prendés la computadora por primera vez después de instalar todo:

```bash
# Esto crea las carpetas donde se guardan las tareas
~/kimi-swarm/scripts/swarm-bus-init.sh
```

**Esto lo hacés una vez.** Después nunca más.

---

## 📝 PASO A PASO — Un día de trabajo

### **1. Abrís tu ventana principal (Orquestador)**

```bash
cd ~/projects/solbot-ts && kimi
```

**Esto es automático:** Al entrar, Kimi te muestra:
```
🐝 KIMI SWARM — Project: solbot-ts
  📥 Pending: 2 | 🔄 Active: 1 | ✅ Ready: 1
```

Eso significa:
- **📥 Pending: 2** → Hay 2 tareas esperando que alguien las haga
- **🔄 Active: 1** → Hay 1 tarea que alguien está haciendo ahora
- **✅ Ready: 1** → Hay 1 tarea terminada esperando que vos la revises

---

### **2. Si querés delegar una tarea nueva**

Vos decís en la ventana del Orquestador:

```bash
~/kimi-swarm/scripts/swarm-delegate.sh solbot worker-1 \
  "Arreglar el bug del circuit breaker" \
  "El circuit breaker se queda trabado porque nunca se reinicia"
```

**Esto es manual.** Vos decidís qué tarea delegar, a quién, y cuándo.

El sistema te devuelve un número:
```
task-20260514084353-4bc1fc39
```

**Guardá ese número.** Es como el número de seguimiento de un paquete.

---

### **3. Abrís una ventana para el Worker**

**Esto es manual.** Vos tenés que abrir una nueva terminal y escribir:

```bash
cd ~/projects/solbot-ts && kimi
```

Ahí dentro, el worker lee su tarea:

```bash
~/kimi-swarm/scripts/swarm-watch.sh solbot worker-1
```

El worker ve la tarea y empieza a trabajar.

---

### **4. El worker trabaja**

El worker hace su trabajo. Puede usar todas las herramientas normales:
- Buscar en el código
- Editar archivos
- Correr tests
- Lo que sea

**Mientras el worker trabaja, vos podés:**
- Cerrar la ventana del Orquestador (no pasa nada)
- Hacer otras cosas en la computadora
- Tomar un café

**El worker NO corre en background.** Si cerrás la terminal del worker, se detiene. No gasta CPU ni RAM cuando no lo estás usando.

---

### **5. El worker termina**

Cuando el worker termina, ejecuta:

```bash
~/kimi-swarm/scripts/swarm-complete.sh solbot task-20260514084353-4bc1fc39 /tmp/resultado.txt
```

**Esto es manual.** El worker tiene que avisar que terminó.

Después el worker cierra su terminal.

---

### **6. Vos revisás el resultado**

Cuando volvés a la ventana del Orquestador, Kimi te dice:
```
📬 SWARM NOTICE: 1 response(s) ready for integration
```

Vos revisás:

```bash
~/kimi-swarm/scripts/swarm-status.sh solbot
```

Ves el resultado, lo revisás, y si está bien, lo integrás al proyecto.

---

### **7. Al final del día, cerrás todo**

Cuando cerrás la ventana del Orquestador, automáticamente el sistema:
- Guarda todo lo que hiciste en archivos
- Avisa si hay tareas que quedaron a mitad de hacer
- Compacta la memoria si es muy grande

**Esto es automático.** Vos solo cerrás la ventana.

---

## ✅ ¿Qué es AUTOMÁTICO? (No tenés que hacer nada)

| Acción | ¿Automático? | ¿Cuándo pasa? |
|---|---|---|
| Mostrar tareas pendientes al entrar | ✅ Sí | Cada vez que abrís Kimi CLI |
| Guardar historia completa | ✅ Sí | Cada vez que cerrás Kimi CLI |
| Compactar memoria si es muy grande | ✅ Sí | Cuando usás más de 200k tokens |
| Avisar si hay tareas sin terminar | ✅ Sí | Cuando cerrás Kimi CLI |
| Crear archivos de respaldo | ✅ Sí | Cada hora |

---

## ❌ ¿Qué es MANUAL? (Tenés que hacerlo vos)

| Acción | ¿Manual? | ¿Quién lo hace? |
|---|---|---|
| Decidir qué tarea delegar | ❌ Manual | Vos (Orquestador) |
| Abrir terminal del worker | ❌ Manual | Vos |
| Pegar el prompt del worker | ❌ Manual | Vos |
| Worker ejecuta su tarea | ❌ Manual | Worker (con tu supervisión) |
| Worker avisa que terminó | ❌ Manual | Worker |
| Revisar resultado e integrar | ❌ Manual | Vos (Orquestador) |

---

## 🔄 Resumen visual del flujo

```
┌─────────────────┐
│  Vos abrís Kimi │ ← 1 sola ventana
│   (Orquestador) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Ves tareas en   │ ← Automático
│ el bus (pending)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Delegás tarea   │ ← Manual (vos)
│ al worker-1     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Abrís NUEVA     │ ← Manual (vos)
│ terminal para   │
│ el worker       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Worker trabaja  │ ← Manual (worker)
│ y termina       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Worker avisa    │ ← Manual (worker)
│ que terminó     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Vos volvés a    │ ← 1 sola ventana
│ Orquestador y   │
│ revisás         │
└─────────────────┘
```

---

## ⚠️ Preguntas frecuentes

### ¿Se me olvida todo si cierro la computadora?
**NO.** Todo se guarda en archivos dentro de `~/shared-context/`. Cuando volvés a abrir Kimi, el sistema te muestra exactamente dónde quedaste.

### ¿Y si se me olvida qué estaba haciendo el worker?
**NO pasa.** El worker guarda un "snapshot" (resumen) de todo lo que hizo en `~/shared-context/solbot/05-snapshots/`. Vos lo leés y sabés todo.

### ¿Los workers consumen batería/CPU cuando no los uso?
**NO.** Los workers no corren en background. Cuando cerrás su terminal, mueren. No gastan nada.

### ¿Puedo tener 2 workers trabajando al mismo tiempo?
**SÍ.** Abrís 2 terminales, cada una con un worker. Pero vos tenés que estar pendiente de ambas.

### ¿Y si un worker se queda trabado?
El hook `swarm-stop.sh` te avisa cuando cerrás el Orquestador: "⚠️ Hay 1 tarea activa sin terminar". Vos decidís si la recuperás o no.

### ¿Cuántas terminales necesito en total?
- **Mínimo: 1** (solo el Orquestador, vos hacés todo)
- **Recomendado: 2** (1 Orquestador + 1 Worker activo)
- **Máximo práctico: 3** (1 Orquestador + 2 Workers)

**NUNCA necesitás 14 terminales.** Eso era una idea teórica, no práctica.

---

## 🆘 Si algo sale mal

| Problema | Solución |
|---|---|
| No veo tareas en el bus | Corré: `~/kimi-swarm/scripts/swarm-status.sh solbot` |
| El worker no encuentra su tarea | Asegurate de que el `task-id` esté bien escrito |
| Quiero borrar todo y empezar de nuevo | Borrá los archivos `.json` de `~/shared-context/solbot/bus/` |
| El sistema me muestra errores raros | Corré: `~/kimi-swarm/scripts/swarm-bus-init.sh` para reiniciar |

---

## 📞 Comandos que necesitás saber de memoria

**Solo estos 3:**

```bash
# Ver estado de todo
~/kimi-swarm/scripts/swarm-status.sh solbot

# Delegar tarea
~/kimi-swarm/scripts/swarm-delegate.sh solbot worker-1 "objetivo" "contexto"

# Worker toma tarea
~/kimi-swarm/scripts/swarm-watch.sh solbot worker-1
```

**Los demás los ves cuando los necesitás.** No hace falta memorizarlos.

---

*Manual creado el 2026-05-14. Si algo no funciona, preguntá.*
