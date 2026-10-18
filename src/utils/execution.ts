/**
 * Eventos de una ejecución interactiva (US #9 y #10), tal como los emite el runner por SSE.
 * `input-request` significa que el programa llamó a `readInput` y está detenido hasta que llegue
 * el valor; el prompt ya salió como `output`, así que solo se usa para habilitar el campo.
 */
export type ExecutionEvent =
    | { type: 'output'; line: string }
    | { type: 'input-request'; prompt: string }
    | { type: 'end'; completed: boolean; errors: string[] }

export type ExecutionHandlers = {
  onEvent: (event: ExecutionEvent) => void;
}
