import {CreateSnippet, PaginatedSnippets, Snippet, SnippetSort, UpdateSnippet} from './snippet'
import {PaginatedUsers} from "./users.ts";
import {TestCase} from "../types/TestCase.ts";
import {TestCaseResult} from "./queries.tsx";
import {FileType} from "../types/FileType.ts";
import {Rule} from "../types/Rule.ts";
import {ExecutionEvent} from "./execution.ts";

export type CurrentUserProfile = {
  name: string;
  email?: string;
}

export interface SnippetOperations {
  listSnippetDescriptors(page: number,pageSize: number,sippetName?: string,sort?: SnippetSort): Promise<PaginatedSnippets>

  createSnippet(createSnippet: CreateSnippet): Promise<Snippet>

  getSnippetById(id: string): Promise<Snippet | undefined>

  updateSnippetById(id: string, updateSnippet: UpdateSnippet): Promise<Snippet>

  registerCurrentUser(profile: CurrentUserProfile): Promise<void>

  getUserFriends(name?: string,page?: number,pageSize?: number): Promise<PaginatedUsers>

  shareSnippet(snippetId: string,userId: string): Promise<Snippet>

  getFormatRules(): Promise<Rule[]>

  getLintingRules(): Promise<Rule[]>

  getTestCases(snippetId: string): Promise<TestCase[]>

  formatSnippet(snippetId: string, content: string): Promise<string>

  postTestCase(snippetId: string, testCase: Partial<TestCase>): Promise<TestCase>

  removeTestCase(snippetId: string, id: string): Promise<string>

  deleteSnippet(id: string): Promise<string>

  testSnippet(snippetId: string, testCase: Partial<TestCase>): Promise<TestCaseResult>

  startExecution(snippetId: string, env?: Record<string, string>): Promise<string>

  streamExecution(snippetId: string, executionId: string, onEvent: (event: ExecutionEvent) => void, signal: AbortSignal): Promise<void>

  sendExecutionInput(snippetId: string, executionId: string, value: string): Promise<void>

  cancelExecution(snippetId: string, executionId: string): Promise<void>

  getFileTypes(): Promise<FileType[]>

  modifyFormatRule(newRules: Rule[]): Promise<Rule[]>

  modifyLintingRule(newRules: Rule[]): Promise<Rule[]>
}
