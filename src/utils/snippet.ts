import {Pagination} from "./pagination.ts";
import {FileType} from "../types/FileType.ts";

export type ComplianceEnum =
    'pending' |
    'failed' |
    'not-compliant' |
    'compliant'


export type LintFinding = {
  message: string;
  line: number;
  column: number;
}

/** Criterios de ordenamiento que acepta el listado de snippet-service. */
export type SnippetSortField = 'name' | 'language' | 'compliance'

/** Relación del usuario con el snippet (US #5): autor, compartido o ambos. */
export type SnippetScope = 'all' | 'owned' | 'shared'

/** Filtros del listado (US #5). Un campo ausente no filtra. */
export type SnippetFilters = {
  name?: string;
  scope?: SnippetScope;
  language?: string;
  compliance?: ComplianceEnum;
}

export type SnippetSort = {
  field: SnippetSortField;
  direction: 'asc' | 'desc';
}

export type CreateSnippet = {
  name: string;
  content: string;
  language: string;
  extension: string;
  /** Versión del lenguaje; si falta se usa la más nueva del catálogo. */
  version?: string;
  description?: string;
}

export type CreateSnippetWithLang = CreateSnippet & { language: string }

export type UpdateSnippet = {
  name?: string;
  content?: string;
  description?: string;
}

/** Nivel de acceso del usuario sobre un snippet. Solo viaja en el detalle y en la actualización. */
export type SnippetPermission = 'OWNER' | 'WRITE' | 'READ'

export type Snippet = CreateSnippet & {
  id: string
  permission?: SnippetPermission
} & SnippetStatus

/** Sin dato de permiso (listado, mocks) se asume que se puede: el backend igual rechaza con 403. */
export const canEdit = (snippet?: Snippet) => !snippet?.permission || snippet.permission !== 'READ'
export const isOwner = (snippet?: Snippet) => !snippet?.permission || snippet.permission === 'OWNER'

type SnippetStatus = {
  compliance: ComplianceEnum;
  author: string;
  /** Reglas de linteo que el snippet no cumple. Solo viaja en el detalle. */
  findings?: LintFinding[];
}
export type PaginatedSnippets = Pagination & {
  snippets: Snippet[]
}

export const getFileLanguage = (fileTypes: FileType[], fileExt?: string) => {
  return fileExt && fileTypes?.find(x => x.extension == fileExt)
}

/** Lenguajes del catálogo sin repetir: un lenguaje con varias versiones aparece una vez por versión. */
export const languagesOf = (fileTypes: FileType[]): string[] => [...new Set(fileTypes.map(f => f.language))]

/** Versiones de un lenguaje, de la más vieja a la más nueva (el backend las devuelve en ese orden). */
export const versionsOf = (fileTypes: FileType[], language: string): string[] =>
    fileTypes.filter(f => f.language === language && f.version).map(f => f.version as string)
