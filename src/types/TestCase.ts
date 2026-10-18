/** `pending` = el contenido del snippet cambió y la corrida automática no terminó todavía. */
export type TestRunStatus = 'pending' | 'passed' | 'failed'

export type TestRun = {
    status: TestRunStatus;
    actualOutputs: string[];
    errors: string[];
    executedAt?: string;
}

export type TestCase = {
    id: string;
    name: string;
    input?: string[];
    output?: string[];
    /** Último resultado guardado; ausente si el test case nunca se corrió. */
    lastRun?: TestRun;
};