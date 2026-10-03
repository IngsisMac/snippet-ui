// Contratos tal como los exponen snippet-service y snippet-permission-service.
// La traducción a los tipos que espera la UI vive en HttpSnippetOperations.

export type SpringPage<T> = {
  content: T[];
  totalElements: number;
  number: number;
  size: number;
}

export type ComplianceStatusResponse = 'PENDING' | 'COMPLIANT' | 'NOT_COMPLIANT' | 'FAILED'

export type SnippetResponse = {
  id: string;
  name: string;
  ownerId: string;
  language: string;
  version: string;
  content: string | null;
  status: ComplianceStatusResponse;
  rulesVersion: number;
  findingsCount: number;
  createdAt: string;
  updatedAt: string;
}

export type FileTypeResponse = {
  language: string;
  extension: string;
  version: string;
}

export type TestCaseResponse = {
  id: string;
  snippetId: string;
  name: string;
  inputs: string[];
  expectedOutputs: string[];
  env: Record<string, string> | null;
}

export type TestCaseExecutionResponse = {
  testCaseId: string;
  name: string;
  passed: boolean;
  actualOutputs: string[];
  expectedOutputs: string[];
  errors: string[];
}

export type RulesResponse = {
  userId: string;
  rulesVersion: number;
  rules: Record<string, unknown>;
  updatedAt: string;
}

export type UserSummaryResponse = {
  id: string;
  name: string;
  email: string | null;
}
