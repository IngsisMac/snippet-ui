// Al guardar reglas de linteo o de formato, el backend publica un `lint-rules` y el consumidor
// marca los snippets del usuario como PENDING en background (US #12 y #15). Entre el `PUT` y ese
// marcado hay una ventana en la que el `GET` del listado todavía devuelve el estado anterior
// (`compliant` / `not-compliant`). Si el polling del listado dependiera solo del contenido de la
// página, ese primer `GET` apagaría el polling y la pantalla nunca se enteraría del resultado del
// relinteo: habría que recargar a mano.
//
// Por eso se guarda acá, fuera de React, el instante hasta el cual hay una revalidación masiva en
// curso. Es un módulo y no estado de componente a propósito: la pantalla de reglas y el listado son
// rutas distintas, así que el dato tiene que sobrevivir al desmontaje de `/rules`.

// Cuánto tiempo se sigue consultando el listado después de un cambio de reglas.
const VENTANA_DE_REVALIDACION_MS = 20_000

let revalidandoHasta = 0

/** Marca que se acaba de guardar un cambio de reglas y arranca la ventana de revalidación. */
export const marcarRevalidacionDeReglas = () => {
  revalidandoHasta = Date.now() + VENTANA_DE_REVALIDACION_MS
}

/** `true` mientras siga abierta la ventana posterior a un cambio de reglas. */
export const revalidacionDeReglasEnCurso = () => Date.now() < revalidandoHasta

/** Solo para los tests: vuelve el módulo a su estado inicial. */
export const reiniciarRevalidacionDeReglas = () => {
  revalidandoHasta = 0
}
