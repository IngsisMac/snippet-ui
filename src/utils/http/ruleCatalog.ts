import {Rule} from "../../types/Rule.ts";
import {RuleDefinitionResponse} from "./backendTypes.ts";

/**
 * Traducción entre el catálogo de reglas que publica permission-service y la lista que espera la
 * pantalla de reglas. El catálogo ya no vive acá: es el backend el que conoce las claves que
 * entienden el formatter y el linter, y el que rechaza un PUT con claves desconocidas. La interfaz
 * solo necesita la lista completa para mostrar también las reglas apagadas.
 */

/** Mapa guardado en el backend -> lista completa de reglas para la pantalla de Rules. */
export const rulesFromConfig = (catalog: RuleDefinitionResponse[], config: Record<string, unknown>): Rule[] =>
    catalog.map((definition, index) => {
      const stored = config[definition.name]
      const isActive = stored !== undefined && stored !== null && stored !== false
      return {
        id: String(index + 1),
        name: definition.name,
        isActive,
        value: valueFor(definition, stored),
        options: definition.allowedValues.length > 0 ? definition.allowedValues : undefined,
      }
    })

/** Lista de reglas de la pantalla -> mapa con solo las reglas activas, listo para el backend. */
export const configFromRules = (catalog: RuleDefinitionResponse[], rules: Rule[]): Record<string, unknown> => {
  const kinds = new Map(catalog.map(d => [d.name, d]))
  const config: Record<string, unknown> = {}
  rules.filter(rule => rule.isActive).forEach(rule => {
    const definition = kinds.get(rule.name)
    if (definition?.kind === 'boolean') {
      config[rule.name] = true
    } else {
      config[rule.name] = rule.value ?? definition?.defaultValue ?? true
    }
  })
  return config
}

const valueFor = (definition: RuleDefinitionResponse, stored: unknown): Rule['value'] => {
  switch (definition.kind) {
    case 'boolean':
      return null
    case 'number':
      return typeof stored === 'number' ? stored : (definition.defaultValue as number) ?? 0
    case 'string':
      return typeof stored === 'string' ? stored : (definition.defaultValue as string) ?? ''
  }
}
