import {Box, Button, CircularProgress, OutlinedInput, Tooltip} from "@mui/material";
import {PlayArrow, StopRounded} from "@mui/icons-material";
import {useCallback, useEffect, useRef, useState} from "react";
import {Bòx} from "../components/snippet-table/SnippetBox.tsx";
import {useSnippetsOperations} from "../utils/queries.tsx";
import {useSnackbarContext} from "../contexts/snackbarContext.tsx";

type SnippetExecutionProps = {
  snippetId: string;
}

type Status = 'idle' | 'running' | 'waiting-input' | 'finished'

/**
 * Ejecución interactiva de un snippet (US #9 y #10).
 *
 * La salida llega por SSE a medida que el programa la produce, en lugar de aparecer toda junta
 * al final; cuando el programa llama a `readInput` el backend avisa con un evento y el campo de
 * entrada se habilita, y lo que se escribe viaja por un `POST` aparte. El prompt ya vino como
 * salida, así que acá solo se usa para saber que hay que esperar al usuario.
 */
export const SnippetExecution = ({snippetId}: SnippetExecutionProps) => {
  const operations = useSnippetsOperations()
  const {createSnackbar} = useSnackbarContext()

  const [input, setInput] = useState("")
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const executionId = useRef<string | undefined>(undefined)
  const abortController = useRef<AbortController | undefined>(undefined)

  // Cerrar el detalle con una ejecución abierta tiene que soltar el stream y cortar la sesión.
  useEffect(() => () => abortController.current?.abort(), [])

  const appendLine = useCallback((line: string) => setLines(current => [...current, line]), [])

  const run = async () => {
    setLines([])
    setStatus('running')
    const controller = new AbortController()
    abortController.current = controller
    try {
      const id = await operations.startExecution(snippetId)
      executionId.current = id
      await operations.streamExecution(snippetId, id, event => {
        if (event.type === 'output') appendLine(event.line)
        if (event.type === 'input-request') setStatus('waiting-input')
        if (event.type === 'end') {
          event.errors.forEach(error => appendLine(`! ${error}`))
          setStatus('finished')
        }
      }, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        createSnackbar('error', (error as Error).message)
      }
      setStatus('finished')
    }
  }

  const stop = async () => {
    const id = executionId.current
    abortController.current?.abort()
    setStatus('finished')
    if (id) {
      await operations.cancelExecution(snippetId, id).catch(() => undefined)
    }
  }

  const handleEnter = async (event: { key: string }) => {
    if (event.key !== 'Enter' || status !== 'waiting-input' || !executionId.current) return
    const value = input
    setInput("")
    setStatus('running')
    appendLine(value)
    try {
      await operations.sendExecutionInput(snippetId, executionId.current, value)
    } catch (error) {
      createSnackbar('error', (error as Error).message)
    }
  }

  const isRunning = status === 'running' || status === 'waiting-input'

  return (
      <>
        <Box display="flex" gap={1} py={1} alignItems="center">
          <Tooltip title={"Run"}>
            <span>
              <Button size="small" variant="contained" disableElevation startIcon={<PlayArrow/>}
                      disabled={isRunning} onClick={run}>
                Run
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={"Stop"}>
            <span>
              <Button size="small" variant="outlined" color="error" startIcon={<StopRounded/>}
                      disabled={!isRunning} onClick={stop}>
                Stop
              </Button>
            </span>
          </Tooltip>
          {status === 'running' && <CircularProgress size={18}/>}
        </Box>
        <Bòx flex={1} overflow={"auto"} minHeight={200} bgcolor={'black'} color={'white'} code={lines.join("\n")}>
          <pre style={{fontFamily: "monospace", fontSize: 17, margin: 0, padding: 10, whiteSpace: "pre-wrap"}}>
            {lines.join("\n")}
          </pre>
        </Bòx>
        <OutlinedInput onKeyDown={handleEnter} value={input} onChange={e => setInput(e.target.value)}
                       disabled={status !== 'waiting-input'}
                       placeholder={status === 'waiting-input' ? "The program is waiting for input" : "Run the snippet to send input"}
                       fullWidth/>
      </>
  )
}
