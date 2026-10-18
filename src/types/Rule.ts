export type Rule = {
    id: string,
    name: string,
    isActive: boolean,
    value?: string | number | null,
    /** Valores aceptados por el backend para esta regla; si vienen, se elige de una lista. */
    options?: string[],
}