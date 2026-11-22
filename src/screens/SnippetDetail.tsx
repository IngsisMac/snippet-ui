import {useEffect, useMemo, useRef, useState} from "react";
import Editor from "react-simple-code-editor";
import {highlight, languages} from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism-okaidia.css";
import {
  Alert,
  AlertTitle,
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import {
  useUpdateSnippetById
} from "../utils/queries.tsx";
import {useFormatSnippet, useGetFileTypes, useGetSnippetById, useShareSnippet, useSnippetsOperations} from "../utils/queries.tsx";
import {Bòx} from "../components/snippet-table/SnippetBox.tsx";
import {BugReport, Delete, Download, Save, Share, UploadFile} from "@mui/icons-material";
import {ShareSnippetModal} from "../components/snippet-detail/ShareSnippetModal.tsx";
import {TestSnippetModal} from "../components/snippet-test/TestSnippetModal.tsx";
import {canEdit, getFileLanguage, isOwner, Snippet} from "../utils/snippet.ts";
import {SnippetExecution} from "./SnippetExecution.tsx";
import ReadMoreIcon from '@mui/icons-material/ReadMore';
import {queryClient} from "../App.tsx";
import {DeleteConfirmationModal} from "../components/snippet-detail/DeleteConfirmationModal.tsx";
import {useSnackbarContext} from "../contexts/snackbarContext.tsx";

type SnippetDetailProps = {
  id: string;
  handleCloseModal: () => void;
}

/**
 * Descarga (US #13). El menú ofrece las dos versiones: la original, tal como está guardada, y la
 * formateada con las reglas del usuario, que se le pide al backend en el momento. Ninguna de las
 * dos depende de lo que haya escrito hoy en el editor sin guardar.
 */
const DownloadButton = ({snippet}: { snippet?: Snippet }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [formatting, setFormatting] = useState(false)
  const snippetOperations = useSnippetsOperations()
  const {createSnackbar} = useSnackbarContext()
  const content = snippet?.content
  const originalUrl = useMemo(
      () => content === undefined ? undefined : URL.createObjectURL(new Blob([content], {type: 'text/plain'})),
      [content]
  )
  useEffect(() => () => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
  }, [originalUrl])

  if (!snippet || !originalUrl) return null;
  const fileName = `${snippet.name}.${snippet.extension}`

  const downloadFormatted = async () => {
    setFormatting(true)
    try {
      const formatted = await snippetOperations.formatSnippet(snippet.id, snippet.content)
      const url = URL.createObjectURL(new Blob([formatted], {type: 'text/plain'}))
      const link = document.createElement('a')
      link.href = url
      link.download = `${snippet.name}.formatted.${snippet.extension}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      createSnackbar('error', (e as Error).message)
    } finally {
      setFormatting(false)
      setAnchor(null)
    }
  }

  return (
    <>
      <Tooltip title={"Download"}>
        <IconButton data-testid="download-button" aria-label="Download" sx={{cursor: "pointer"}}
                    onClick={e => setAnchor(e.currentTarget)}>
          <Download/>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem component="a" data-testid="download-original" href={originalUrl} download={fileName}
                  onClick={() => setAnchor(null)}>
          Original
        </MenuItem>
        <MenuItem data-testid="download-formatted" disabled={formatting} onClick={downloadFormatted}>
          Formatted
        </MenuItem>
      </Menu>
    </>
  )
}

/**
 * Reglas de linteo que el snippet no cumple (US #6). Vienen guardadas con el estado, así que se
 * muestran sin volver a lintear; cuando el contenido cambia el backend las limpia y el snippet
 * queda en `pending` hasta que el linteo asincrónico vuelva a correr.
 */
const LintFindings = ({snippet}: { snippet?: Snippet }) => {
  if (!snippet) return null;
  if (snippet.compliance === 'compliant') {
    return <Alert sx={{mb: 2}} severity="success">This snippet complies with all your linting rules</Alert>
  }
  if (!snippet.findings?.length) return null;

  return (
      <Alert sx={{mb: 2}} severity="warning">
        <AlertTitle>{snippet.findings.length} linting rule{snippet.findings.length > 1 ? 's' : ''} not met</AlertTitle>
        <List dense disablePadding>
          {snippet.findings.map((finding, index) => (
              <ListItem key={`${finding.line}-${finding.column}-${index}`} disablePadding>
                <ListItemText primary={`Line ${finding.line}:${finding.column} — ${finding.message}`}/>
              </ListItem>
          ))}
        </List>
      </Alert>
  )
}

export const SnippetDetail = (props: SnippetDetailProps) => {
  const {id, handleCloseModal} = props;
  const [code, setCode] = useState(
      ""
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shareModalOppened, setShareModalOppened] = useState(false)
  const [deleteConfirmationModalOpen, setDeleteConfirmationModalOpen] = useState(false)
  const [testModalOpened, setTestModalOpened] = useState(false);

  const {data: snippet, isLoading} = useGetSnippetById(id);
  const {mutate: shareSnippet, isLoading: loadingShare} = useShareSnippet()
  const {mutate: formatSnippet, isLoading: isFormatLoading, data: formatSnippetData} = useFormatSnippet(id)
  // Guardar cambia el contenido, vuelve el estado de linteo a pending y dispara la corrida de los
  // tests en background (US #16): hay que refrescar el detalle, el listado y los test cases, o el
  // modal de tests sigue mostrando los resultados de la versión anterior.
  const {mutate: updateSnippet, isLoading: isUpdateSnippetLoading} = useUpdateSnippetById({
    onSuccess: () => {
      queryClient.invalidateQueries(['snippet', id])
      queryClient.invalidateQueries(['testCases', id])
      queryClient.invalidateQueries('listSnippets')
    }
  })
  const {createSnackbar} = useSnackbarContext()
  const {data: fileTypes} = useGetFileTypes()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Toda mutacion informa su resultado: sin esto un 403 (usuario con solo lectura) o un 400 pasan en silencio.
  const notifyError = (error: Error) => createSnackbar('error', error.message)

  const writable = canEdit(snippet)
  const owner = isOwner(snippet)
  const nameIsValid = name.trim().length > 0
  const hasPendingChanges = snippet?.content !== code || (snippet?.description ?? "") !== description ||
      (snippet?.name ?? "") !== name.trim()

  const handleSaveChanges = () => updateSnippet({id: id, updateSnippet: {name: name.trim(), content: code, description}}, {
    onSuccess: () => createSnackbar('success', 'Snippet saved'),
    onError: notifyError,
  })

  const handleFormat = () => formatSnippet(code, {onError: notifyError})

  /**
   * US #2: actualizar un snippet con el contenido de un archivo. El archivo solo reemplaza el
   * texto del editor; el `PUT` lo sigue haciendo el boton de guardar, asi que el cambio se revisa
   * antes de confirmarlo y sigue valiendo el mismo chequeo de permisos. La extension tiene que
   * corresponder al lenguaje de este snippet: subir un archivo de otro lenguaje es un error del
   * usuario que conviene frenar acá y no que lo rechace el backend.
   */
  const handleLoadFromFile = async (target: EventTarget & HTMLInputElement) => {
    const file = target.files?.[0]
    // El input se limpia siempre, para que elegir dos veces el mismo archivo vuelva a disparar.
    target.value = ""
    if (!file) {
      createSnackbar('error', 'Please select a file')
      return
    }

    const extension = file.name.split(".").at(-1)
    const fileType = getFileLanguage(fileTypes ?? [], extension)
    if (!fileType) {
      createSnackbar('error', `File type ${extension} not supported`)
      return
    }
    if (snippet && fileType.language !== snippet.language) {
      createSnackbar('error', `This snippet is ${snippet.language}, but .${extension} files are ${fileType.language}`)
      return
    }

    try {
      setCode(await file.text())
      createSnackbar('info', `${file.name} loaded: review the changes and save to update the snippet`)
    } catch (e) {
      createSnackbar('error', (e as Error).message)
    }
  }

  useEffect(() => {
    if (snippet) {
      setCode(snippet.content);
      setDescription(snippet.description ?? "");
      setName(snippet.name);
    }
  }, [snippet]);

  useEffect(() => {
    if (formatSnippetData) {
      setCode(formatSnippetData)
    }
  }, [formatSnippetData])


  async function handleShareSnippet(userId: string) {
    shareSnippet({snippetId: id, userId}, {
      onSuccess: () => {
        createSnackbar('success', 'Snippet shared')
        setShareModalOppened(false)
      },
      onError: notifyError,
    })
  }

  return (
      <Box p={4} minWidth={'60vw'}>
        <Box width={'100%'} p={2} display={'flex'} justifyContent={'flex-end'}>
          <CloseIcon data-testid="close-drawer-button" style={{cursor: "pointer"}} onClick={handleCloseModal}/>
        </Box>
        {
          isLoading ? (<>
            <Typography fontWeight={"bold"} mb={2} variant="h4">Loading...</Typography>
            <CircularProgress/>
          </>) : <>
            <TextField variant="standard" placeholder="Name" value={name} error={!nameIsValid} disabled={!writable}
                       helperText={nameIsValid ? undefined : "The name cannot be empty"}
                       inputProps={{'data-testid': 'snippet-name-input', 'aria-label': 'Snippet name'}}
                       InputProps={{sx: {fontSize: '2.125rem', fontWeight: 'bold'}}}
                       onChange={e => setName(e.target.value)}/>
            <Box display="flex" flexDirection="row" gap="8px" padding="8px">
              <Tooltip title={"Share"}>
                <IconButton aria-label="Share" data-testid="share-button" disabled={!owner} onClick={() => setShareModalOppened(true)}>
                  <Share/>
                </IconButton>
              </Tooltip>
              <Tooltip title={"Test"}>
                <IconButton aria-label="Test" data-testid="test-button" onClick={() => setTestModalOpened(true)}>
                  <BugReport/>
                </IconButton>
              </Tooltip>
              <DownloadButton snippet={snippet}/>
              <Tooltip title={"Format"}>
                <IconButton aria-label="Format" data-testid="format-button" onClick={handleFormat} disabled={isFormatLoading}>
                  <ReadMoreIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={"Load content from file"}>
                <IconButton aria-label="Load content from file" data-testid="load-file-button" disabled={!writable}
                            onClick={() => fileInputRef.current?.click()}>
                  <UploadFile/>
                </IconButton>
              </Tooltip>
              <Tooltip title={"Save changes"}>
                <IconButton aria-label="Save changes" data-testid="save-button" color={"primary"} onClick={handleSaveChanges} disabled={!writable || isUpdateSnippetLoading || !hasPendingChanges || !nameIsValid} >
                  <Save />
                </IconButton>
              </Tooltip>
              <Tooltip title={"Delete"}>
                <IconButton aria-label="Delete" data-testid="delete-button" disabled={!owner} onClick={() => setDeleteConfirmationModalOpen(true)} >
                  <Delete color={"error"} />
                </IconButton>
              </Tooltip>
              <input hidden type={"file"} ref={fileInputRef} multiple={false}
                     data-testid={"update-file-input"}
                     onChange={e => handleLoadFromFile(e?.target)}/>
            </Box>
            {!writable && (
                <Alert data-testid="read-only-alert" severity="info" sx={{mb: 1, py: 0}}>
                  This snippet was shared with you as read-only: you can view, run, format and download it.
                </Alert>
            )}
            <TextField label="Description" placeholder="What does this snippet do?" fullWidth multiline
                       minRows={1} sx={{mb: 2}} value={description} disabled={!writable}
                       onChange={e => setDescription(e.target.value)}/>
            <LintFindings snippet={snippet}/>
            <Box display={"flex"} gap={2}>
              <Bòx flex={1} height={"fit-content"} overflow={"none"} minHeight={"500px"} bgcolor={'black'} color={'white'} code={code}>
                <Editor
                    value={code}
                    padding={10}
                    // `react-simple-code-editor` manda las props que no conoce al <div> contenedor, así que un
                    // `data-testid` nunca llegaría al <textarea>. `textareaId` sí es una prop propia de la
                    // librería y se aplica al textarea real, que es el que tiene el valor del código.
                    textareaId={"snippet-detail-editor"}
                    readOnly={!writable}
                    onValueChange={(code) => setCode(code)}
                    highlight={(code) => highlight(code, languages.js, "javascript")}
                    maxLength={1000}
                    style={{
                      minHeight: "500px",
                      fontFamily: "monospace",
                      fontSize: 17,
                    }}
                />
              </Bòx>
            </Box>
            <Box pt={1} flex={1} marginTop={2}>
              <Alert severity="info">Output</Alert>
              <SnippetExecution snippetId={id}/>
            </Box>
          </>
        }
        <ShareSnippetModal loading={loadingShare || isLoading} open={shareModalOppened}
                           onClose={() => setShareModalOppened(false)}
                           onShare={handleShareSnippet}/>
        <TestSnippetModal snippetId={id} canWrite={writable} open={testModalOpened} onClose={() => setTestModalOpened(false)}/>
        <DeleteConfirmationModal open={deleteConfirmationModalOpen} onClose={() => setDeleteConfirmationModalOpen(false)} id={snippet?.id ?? ""} setCloseDetails={handleCloseModal} />
      </Box>
  );
}

