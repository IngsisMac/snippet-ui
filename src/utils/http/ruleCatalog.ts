import {Rule} from "../../types/Rule.ts";

/**
 * Catálogo de reglas de PrintScript con las claves exactas que entienden el formatter y el
 * linter (son las del TCK). El backend guarda un mapa `clave -> valor` por usuario; la UI
 * necesita la lista completa para mostrar también las reglas apagadas.
 */
export type RuleDefinition = {
  name: string;
  kind: 'boolean' | 'number' | 'string';
  defaultValue?: number | string;
}

export const FORMAT_RULE_CATALOG: RuleDefinition[] = [
  {name: 'enforce-spacing-around-equals', kind: 'boolean'},
  {name: 'enforce-no-spacing-around-equals', kind: 'boolean'},
  {name: 'enforce-spacing-before-colon-in-declaration', kind: 'boolean'},
  {name: 'enforce-spacing-after-colon-in-declaration', kind: 'boolean'},
  {name: 'mandatory-single-space-separation', kind: 'boolean'},
  {name: 'mandatory-space-surrounding-operations', kind: 'boolean'},
  {name: 'mandatory-line-break-after-statement', kind: 'boolean'},
  {name: 'line-breaks-after-println', kind: 'number', defaultValue: 1},
  {name: 'if-brace-same-line', kind: 'boolean'},
  {name: 'if-brace-below-line', kind: 'boolean'},
  {name: 'indent-inside-if', kind: 'number', defaultValue: 4},
  {name: 'enforce-no-space-before-semicolon', kind: 'boolean'},
  {name: 'max-blank-lines-between-statements', kind: 'number', defaultValue: 1},
]

export const LINT_RULE_CATALOG: RuleDefinition[] = [
  {name: 'identifier_format', kind: 'string', defaultValue: 'camel case'},
  {name: 'mandatory-variable-or-literal-in-println', kind: 'boolean'},
  {name: 'mandatory-variable-or-literal-in-readInput', kind: 'boolean'},
  {name: 'no-unused-variables', kind: 'boolean'},
  {name: 'no-empty-println', kind: 'boolean'},
]

/** Mapa guardado en el backend -> lista completa de reglas para la pantalla de Rules. */
export const rulesFromConfig = (catalog: RuleDefinition[], config: Record<string, unknown>): Rule[] =>
    catalog.map((definition, index) => {
      const stored = config[definition.name]
      const isActive = stored !== undefined && stored !== null && stored !== false
      return {
        id: String(index + 1),
        name: definition.name,
        isActive,
        value: valueFor(definition, stored),
      }
    })

/** Lista de reglas de la pantalla -> mapa con solo las reglas activas, listo para el backend. */
export const configFromRules = (catalog: RuleDefinition[], rules: Rule[]): Record<string, unknown> => {
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

const valueFor = (definition: RuleDefinition, stored: unknown): Rule['value'] => {
  switch (definition.kind) {
    case 'boolean':
      return null
    case 'number':
      return typeof stored === 'number' ? stored : definition.defaultValue ?? 0
    case 'string':
      return typeof stored === 'string' ? stored : definition.defaultValue ?? ''
  }
}
