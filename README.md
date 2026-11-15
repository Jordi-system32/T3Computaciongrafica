# Operación Extracción

FPS 3D de supervivencia ambientado en un búnker infestado. El jugador debe recorrer el complejo, administrar munición, eliminar o evitar infectados y alcanzar la baliza verde de extracción.

## Ejecutar

Se requiere Python 3 y conexión a internet para cargar Three.js desde jsDelivr.

```powershell
python -m http.server 4173
```

Abre `http://localhost:4173` en el navegador y pulsa **Iniciar misión**. El servidor debe ejecutarse desde la carpeta del proyecto.

## Controles

| Tecla | Acción |
|---|---|
| W, A, S, D | Moverse |
| Mouse | Mirar |
| Clic izquierdo | Un disparo por clic |
| 1 / 2 | Cambiar arma |
| R | Recoger una caja cercana de munición |
| Shift | Correr |
| Escape | Pausar o liberar el mouse |

## Mecánicas

- Dos armas GLB en primera persona, cada una con su propio contador de munición.
- La munición disminuye en cada clic y solo se recupera al recoger cajas del escenario.
- Cada infectado se activa al acercarse el jugador, lo persigue y requiere dos impactos válidos.
- El contacto con un infectado termina la partida.
- La baliza verde marca la extracción; llegar a ella completa la misión.

## Recursos

Los modelos `sidearm-m9.glb`, `carbine-ak47.glb` e `infected.glb` son geometría low-poly generada para este proyecto con `generate-assets.mjs`. El juego utiliza Three.js 0.180.0 y GLTFLoader desde jsDelivr.
git add README.md
git commit -m "Resolver conflicto README"
git push -u origin main