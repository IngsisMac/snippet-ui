import axios, {AxiosError, AxiosInstance} from 'axios'
import autoBind from 'auto-bind'
import {CurrentUserProfile, SnippetOperations} from '../snippetOperations'
import {ComplianceEnum, CreateSnippet, PaginatedSnippets, Snippet, SnippetSort, UpdateSnippet} from '../snippet'
import {PaginatedUsers} from "../users.ts";
import {TestCase, TestRunStatus} from "../../types/TestCase.ts";
import {TestCaseResult} from "../queries.tsx";
import {FileType} from "../../types/FileType.ts";
import {Rule} from "../../types/Rule.ts";
import {
  ComplianceStatusResponse,
  FileTypeResponse,
  RuleDefinitionResponse,
  RulesResponse,
  SnippetResponse,
  SpringPage,
  TestCaseExecutionResponse,
  TestCaseResponse,
  UserSummaryResponse
} from "./backendTypes.ts";
import {configFromRules, rulesFromConfig} from "./ruleCatalog.ts";
import {ExecutionEvent} from "../execution.ts";

export type AccessTokenProvider = () => Promise<string>

const COMPLIANCE: Record<ComplianceStatusResponse, ComplianceEnum> = {
  PENDING: 'pending',
  COMPLIANT: 'compliant',
  NOT_COMPLIANT: 'not-compliant',
  FAILED: 'failed',
}

const DEFAULT_LANGUAGE_VERSION = '1.1'

type RuleType = 'lint' | 'format'

/** `compliance` es el nombre que usa la tabla; snippet-service lo acepta tal cual (US #5). */
const sortParam = (sort?: SnippetSort) => sort ? `${sort.field},${sort.direction}` : undefined

/**
 * Adaptador entre la UI de cátedra y los servicios propios. Habla con snippet-service y
 * permission-service a través del gateway (misma origin, `/api`) y traduce los contratos del
 * backend (Page de Spring, estados en mayúsculas, mapa de reglas) a los tipos de la UI.
 * El JWT de Auth0 se adjunta en cada request con `getAccessTokenSilently`.
 */
export class HttpSnippetOperations implements SnippetOperations {
  private readonly http: AxiosInstance
  private readonly baseUrl: string
  private readonly getAccessToken: AccessTokenProvider
  private fileTypesCache?: Promise<FileTypeResponse[]>
  private ruleCatalogCache: Partial<Record<RuleType, Promise<RuleDefinitionResponse[]>>> = {}

  constructor(baseUrl: string, getAccessToken: AccessTokenProvider) {
    this.baseUrl = baseUrl
    this.getAccessToken = getAccessToken
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

  async listSnippetDescriptors(page: number, pageSize: number, snippetName?: string, sort?: SnippetSort): Promise<PaginatedSnippets> {
    const {data} = await this.http.get<SpringPage<SnippetResponse>>('/snippets', {
      params: {page, size: pageSize, name: snippetName || undefined, sort: sortParam(sort)}
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
      description: createSnippet.description || undefined,
    })
    return this.toSnippet(data, fileTypes)
  }

  async getSnippetById(id: string): Promise<Snippet | undefined> {
    const {data} = await this.http.get<SnippetResponse>(`/snippets/${id}`)
    return this.toSnippet(data, await this.fileTypes())
  }

  async updateSnippetById(id: string, updateSnippet: UpdateSnippet): Promise<Snippet> {
    const {data} = await this.http.put<SnippetResponse>(`/snippets/${id}`, {
      content: updateSnippet.content,
      description: updateSnippet.description,
    })
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
    return this.readRules('format')
  }

  async getLintingRules(): Promise<Rule[]> {
    return this.readRules('lint')
  }

  async modifyFormatRule(newRules: Rule[]): Promise<Rule[]> {
    return this.writeRules('format', newRules)
  }

  async modifyLintingRule(newRules: Rule[]): Promise<Rule[]> {
    return this.writeRules('lint', newRules)
  }

  private async readRules(type: RuleType): Promise<Rule[]> {
    const [catalog, {data}] = await Promise.all([
      this.ruleCatalog(type),
      this.http.get<RulesResponse>(`/permissions/rules/${type}`)
    ])
    return rulesFromConfig(catalog, data.rules)
  }

  private async writeRules(type: RuleType, newRules: Rule[]): Promise<Rule[]> {
    const catalog = await this.ruleCatalog(type)
    const {data} = await this.http.put<RulesResponse>(`/permissions/rules/${type}`, {
      rules: configFromRules(catalog, newRules)
    })
    return rulesFromConfig(catalog, data.rules)
  }

  /**
   * El catálogo lo publica permission-service, que es también quien valida el PUT: así la pantalla
   * de reglas nunca puede ofrecer una clave que el backend vaya a rechazar.
   */
  private ruleCatalog(type: RuleType): Promise<RuleDefinitionResponse[]> {
    if (!this.ruleCatalogCache[type]) {
      this.ruleCatalogCache[type] = this.http.get<RuleDefinitionResponse[]>(`/permissions/rules/catalog/${type}`)
          .then(r => r.data)
          .catch(error => {
            this.ruleCatalogCache[type] = undefined
            throw error
          })
    }
    return this.ruleCatalogCache[type] as Promise<RuleDefinitionResponse[]>
  }

  async startExecution(snippetId: string, env: Record<string, string> = {}): Promise<string> {
    const {data} = await this.http.post<{ executionId: string }>(`/snippets/${snippetId}/executions`, {env})
    return data.executionId
  }

  /**
   * `EventSource` no permite mandar el header `Authorization`, así que el stream se consume con
   * `fetch` y se parsea el formato SSE a mano. Es poco código y evita tener que pasar el token
   * por la URL, donde quedaría en logs e historial.
   */
  async streamExecution(
      snippetId: string,
      executionId: string,
      onEvent: (event: ExecutionEvent) => void,
      signal: AbortSignal
  ): Promise<void> {
    const token = await this.getAccessToken()
    const response = await fetch(`${this.baseUrl}/snippets/${snippetId}/executions/${executionId}/stream`, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'text/event-stream'},
      signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`${response.status}: could not open the execution stream`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      let separator = buffer.indexOf('\n\n')
      while (separator >= 0) {
        const event = parseSseEvent(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
        if (event) onEvent(event)
        separator = buffer.indexOf('\n\n')
      }
    }
  }

  async sendExecutionInput(snippetId: string, executionId: string, value: string): Promise<void> {
    await this.http.post(`/snippets/${snippetId}/executions/${executionId}/input`, {value})
  }

  async cancelExecution(snippetId: string, executionId: string): Promise<void> {
    await this.http.delete(`/snippets/${snippetId}/executions/${executionId}`)
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
      description: response.description ?? undefined,
      findings: response.findings ?? undefined,
    }
  }
}

/** Un bloque SSE son líneas `campo: valor`; acá solo interesa `data`, que trae el JSON. */
const parseSseEvent = (chunk: string): ExecutionEvent | undefined => {
  const data = chunk
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('')
  if (!data) return undefined
  try {
    return JSON.parse(data) as ExecutionEvent
  } catch {
    return undefined
  }
}

const RUN_STATUS: Record<'PENDING' | 'PASSED' | 'FAILED', TestRunStatus> = {
  PENDING: 'pending',
  PASSED: 'passed',
  FAILED: 'failed',
}

const toTestCase = (response: TestCaseResponse): TestCase => ({
  id: response.id,
  name: response.name,
  input: response.inputs,
  output: response.expectedOutputs,
  lastRun: response.lastRun ? {
    status: RUN_STATUS[response.lastRun.status],
    actualOutputs: response.lastRun.actualOutputs,
    errors: response.lastRun.errors,
    executedAt: response.lastRun.executedAt ?? undefined,
  } : undefined,
})
