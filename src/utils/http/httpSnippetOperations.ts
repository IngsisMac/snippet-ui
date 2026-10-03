import axios, {AxiosError, AxiosInstance} from 'axios'
import autoBind from 'auto-bind'
import {CurrentUserProfile, SnippetOperations} from '../snippetOperations'
import {ComplianceEnum, CreateSnippet, PaginatedSnippets, Snippet, UpdateSnippet} from '../snippet'
import {PaginatedUsers} from "../users.ts";
import {TestCase} from "../../types/TestCase.ts";
import {TestCaseResult} from "../queries.tsx";
import {FileType} from "../../types/FileType.ts";
import {Rule} from "../../types/Rule.ts";
import {
  ComplianceStatusResponse,
  FileTypeResponse,
  RulesResponse,
  SnippetResponse,
  SpringPage,
  TestCaseExecutionResponse,
  TestCaseResponse,
  UserSummaryResponse
} from "./backendTypes.ts";
import {configFromRules, FORMAT_RULE_CATALOG, LINT_RULE_CATALOG, rulesFromConfig} from "./ruleCatalog.ts";

export type AccessTokenProvider = () => Promise<string>

const COMPLIANCE: Record<ComplianceStatusResponse, ComplianceEnum> = {
  PENDING: 'pending',
  COMPLIANT: 'compliant',
  NOT_COMPLIANT: 'not-compliant',
  FAILED: 'failed',
}

const DEFAULT_LANGUAGE_VERSION = '1.1'

/**
 * Adaptador entre la UI de cátedra y los servicios propios. Habla con snippet-service y
 * permission-service a través del gateway (misma origin, `/api`) y traduce los contratos del
 * backend (Page de Spring, estados en mayúsculas, mapa de reglas) a los tipos de la UI.
 * El JWT de Auth0 se adjunta en cada request con `getAccessTokenSilently`.
 */
export class HttpSnippetOperations implements SnippetOperations {
  private readonly http: AxiosInstance
  private fileTypesCache?: Promise<FileTypeResponse[]>

  constructor(baseUrl: string, getAccessToken: AccessTokenProvider) {
    this.http = axios.create({baseURL: baseUrl})
    this.http.interceptors.request.use(async config => {
      const token = await getAccessToken()
      config.headers.Authorization = `Bearer ${token}`
      return config
    })
    this.http.interceptors.response.use(response => response, (error: AxiosError<{ message?: string }>) => {
      const status = error.response?.status
      const detail = error.response?.data?.message ?? error.message
      return Promise.reject(new Error(status ? `${status}: ${detail}` : detail))
    })
    autoBind(this)
  }

  async listSnippetDescriptors(page: number, pageSize: number, snippetName?: string): Promise<PaginatedSnippets> {
    const {data} = await this.http.get<SpringPage<SnippetResponse>>('/snippets', {
      params: {page, size: pageSize, name: snippetName || undefined}
    })
    const fileTypes = await this.fileTypes()
    return {
      page: data.number,
      page_size: data.size,
      count: data.totalElements,
      snippets: data.content.map(s => this.toSnippet(s, fileTypes))
    }
  }

  async createSnippet(createSnippet: CreateSnippet): Promise<Snippet> {
    const fileTypes = await this.fileTypes()
    const version = fileTypes.find(f => f.language === createSnippet.language)?.version ?? DEFAULT_LANGUAGE_VERSION
    const {data} = await this.http.post<SnippetResponse>('/snippets', {
      name: createSnippet.name,
      language: createSnippet.language,
      version,
      content: createSnippet.content,
    })
    return this.toSnippet(data, fileTypes)
  }

  async getSnippetById(id: string): Promise<Snippet | undefined> {
    const {data} = await this.http.get<SnippetResponse>(`/snippets/${id}`)
    return this.toSnippet(data, await this.fileTypes())
  }

  async updateSnippetById(id: string, updateSnippet: UpdateSnippet): Promise<Snippet> {
    const {data} = await this.http.put<SnippetResponse>(`/snippets/${id}`, {content: updateSnippet.content})
    return this.toSnippet(data, await this.fileTypes())
  }

  async registerCurrentUser(profile: CurrentUserProfile): Promise<void> {
    await this.http.put('/users/me', profile)
  }

  // La UI pide la primera página como 1 en este modal; el backend pagina desde 0.
  async getUserFriends(name: string = "", page: number = 1, pageSize: number = 10): Promise<PaginatedUsers> {
    const {data} = await this.http.get<SpringPage<UserSummaryResponse>>('/users', {
      params: {name: name || undefined, page: Math.max(page - 1, 0), size: pageSize}
    })
    return {
      page,
      page_size: data.size,
      count: data.totalElements,
      users: data.content.map(u => ({id: u.id, name: u.email ? `${u.name} (${u.email})` : u.name}))
    }
  }

  async shareSnippet(snippetId: string, userId: string): Promise<Snippet> {
    await this.http.post(`/permissions/${snippetId}/share`, {targetUserId: userId, level: 'READ'})
    const shared = await this.getSnippetById(snippetId)
    if (!shared) throw new Error(`Snippet ${snippetId} not found after sharing`)
    return shared
  }

  async getFormatRules(): Promise<Rule[]> {
    const {data} = await this.http.get<RulesResponse>('/permissions/rules/format')
    return rulesFromConfig(FORMAT_RULE_CATALOG, data.rules)
  }

  async getLintingRules(): Promise<Rule[]> {
    const {data} = await this.http.get<RulesResponse>('/permissions/rules/lint')
    return rulesFromConfig(LINT_RULE_CATALOG, data.rules)
  }

  async modifyFormatRule(newRules: Rule[]): Promise<Rule[]> {
    const {data} = await this.http.put<RulesResponse>('/permissions/rules/format', {
      rules: configFromRules(FORMAT_RULE_CATALOG, newRules)
    })
    return rulesFromConfig(FORMAT_RULE_CATALOG, data.rules)
  }

  async modifyLintingRule(newRules: Rule[]): Promise<Rule[]> {
    const {data} = await this.http.put<RulesResponse>('/permissions/rules/lint', {
      rules: configFromRules(LINT_RULE_CATALOG, newRules)
    })
    return rulesFromConfig(LINT_RULE_CATALOG, data.rules)
  }

  async formatSnippet(snippetId: string, content: string): Promise<string> {
    const {data} = await this.http.post<{ formattedContent: string }>(`/snippets/${snippetId}/format`, {content})
    return data.formattedContent
  }

  async getTestCases(snippetId: string): Promise<TestCase[]> {
    const {data} = await this.http.get<TestCaseResponse[]>(`/snippets/${snippetId}/test-cases`)
    return data.map(toTestCase)
  }

  async postTestCase(snippetId: string, testCase: Partial<TestCase>): Promise<TestCase> {
    const body = {
      name: testCase.name ?? '',
      inputs: testCase.input ?? [],
      expectedOutputs: testCase.output ?? [],
    }
    const {data} = testCase.id
        ? await this.http.put<TestCaseResponse>(`/snippets/${snippetId}/test-cases/${testCase.id}`, body)
        : await this.http.post<TestCaseResponse>(`/snippets/${snippetId}/test-cases`, body)
    return toTestCase(data)
  }

  async removeTestCase(snippetId: string, id: string): Promise<string> {
    await this.http.delete(`/snippets/${snippetId}/test-cases/${id}`)
    return id
  }

  async testSnippet(snippetId: string, testCase: Partial<TestCase>): Promise<TestCaseResult> {
    if (!testCase.id) {
      throw new Error('Save the test case before running it')
    }
    const {data} = await this.http.post<TestCaseExecutionResponse>(
        `/snippets/${snippetId}/test-cases/${testCase.id}/run`
    )
    return data.passed ? 'success' : 'fail'
  }

  async deleteSnippet(id: string): Promise<string> {
    await this.http.delete(`/snippets/${id}`)
    return id
  }

  async getFileTypes(): Promise<FileType[]> {
    return (await this.fileTypes()).map(f => ({language: f.language, extension: f.extension}))
  }

  private fileTypes(): Promise<FileTypeResponse[]> {
    if (!this.fileTypesCache) {
      this.fileTypesCache = this.http.get<FileTypeResponse[]>('/snippets/file-types')
          .then(r => r.data)
          .catch(error => {
            this.fileTypesCache = undefined
            throw error
          })
    }
    return this.fileTypesCache
  }

  private toSnippet(response: SnippetResponse, fileTypes: FileTypeResponse[]): Snippet {
    return {
      id: response.id,
      name: response.name,
      content: response.content ?? '',
      language: response.language,
      extension: fileTypes.find(f => f.language === response.language)?.extension ?? response.language,
      compliance: COMPLIANCE[response.status] ?? 'pending',
      author: response.ownerId,
    }
  }
}

const toTestCase = (response: TestCaseResponse): TestCase => ({
  id: response.id,
  name: response.name,
  input: response.inputs,
  output: response.expectedOutputs,
})
