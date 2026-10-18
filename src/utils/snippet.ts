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

export type SnippetSort = {
  field: SnippetSortField;
  direction: 'asc' | 'desc';
}

export type CreateSnippet = {
  name: string;
  content: string;
  language: string;
  extension: string;
  description?: string;
}

export type CreateSnippetWithLang = CreateSnippet & { language: string }

export type UpdateSnippet = {
  content?: string;
  description?: string;
}

export type Snippet = CreateSnippet & {
  id: string
} & SnippetStatus

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