import {useEffect, useState} from "react";
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
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import {
  useUpdateSnippetById
} from "../utils/queries.tsx";
import {useFormatSnippet, useGetSnippetById, useShareSnippet} from "../utils/queries.tsx";
import {Bòx} from "../components/snippet-table/SnippetBox.tsx";
import {BugReport, Delete, Download, Save, Share} from "@mui/icons-material";
import {ShareSnippetModal} from "../components/snippet-detail/ShareSnippetModal.tsx";
import {TestSnippetModal} from "../components/snippet-test/TestSnippetModal.tsx";
import {Snippet} from "../utils/snippet.ts";
import {SnippetExecution} from "./SnippetExecution.tsx";
import ReadMoreIcon from '@mui/icons-material/ReadMore';
import {queryClient} from "../App.tsx";
import {DeleteConfirmationModal} from "../components/snippet-detail/DeleteConfirmationModal.tsx";
import {useSnackbarContext} from "../contexts/snackbarContext.tsx";

type SnippetDetailProps = {
  id: string;
  handleCloseModal: () => void;
}

const DownloadButton = ({snippet}: { snippet?: Snippet }) => {
  if (!snippet) return null;
  const file = new Blob([snippet.content], {type: 'text/plain'});

  return (
    <Tooltip title={"Download"}>
      <IconButton sx={{
        cursor: "pointer"
      }}>
        <a download={`${snippet.name}.${snippet.extension}`} target="_blank"
           rel="noreferrer" href={URL.createObjectURL(file)} style={{
          textDecoration: "none",
          color: "inherit",
          display: 'flex',
          alignItems: 'center',
        }}>
          <Download/>
        </a>
      </IconButton>
    </Tooltip>
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

  // Toda mutacion informa su resultado: sin esto un 403 (usuario con solo lectura) o un 400 pasan en silencio.
  const notifyError = (error: Error) => createSnackbar('error', error.message)

  const hasPendingChanges = snippet?.content !== code || (snippet?.description ?? "") !== description

  const handleSaveChanges = () => updateSnippet({id: id, updateSnippet: {content: code, description}}, {
    onSuccess: () => createSnackbar('success', 'Snippet saved'),
    onError: notifyError,
  })

  const handleFormat = () => formatSnippet(code, {onError: notifyError})

  useEffect(() => {
    if (snippet) {
      setCode(snippet.content);
      setDescription(snippet.description ?? "");
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
          <CloseIcon style={{cursor: "pointer"}} onClick={handleCloseModal}/>
        </Box>
        {
          isLoading ? (<>
            <Typography fontWeight={"bold"} mb={2} variant="h4">Loading...</Typography>
            <CircularProgress/>
          </>) : <>
            <Typography variant="h4" fontWeight={"bold"}>{snippet?.name ?? "Snippet"}</Typography>
            <Box display="flex" flexDirection="row" gap="8px" padding="8px">
              <Tooltip title={"Share"}>
                <IconButton onClick={() => setShareModalOppened(true)}>
                  <Share/>
                </IconButton>
              </Tooltip>
              <Tooltip title={"Test"}>
                <IconButton onClick={() => setTestModalOpened(true)}>
                  <BugReport/>
                </IconButton>
              </Tooltip>
              <DownloadButton snippet={snippet}/>
              {/*<Tooltip title={runSnippet ? "Stop run" : "Run"}>*/}
              {/*  <IconButton onClick={() => setRunSnippet(!runSnippet)}>*/}
              {/*    {runSnippet ? <StopRounded/> : <PlayArrow/>}*/}
              {/*  </IconButton>*/}
              {/*</Tooltip>*/}
              {/* TODO: we can implement a live mode*/}
              <Tooltip title={"Format"}>
                <IconButton onClick={handleFormat} disabled={isFormatLoading}>
                  <ReadMoreIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={"Save changes"}>
                <IconButton color={"primary"} onClick={handleSaveChanges} disabled={isUpdateSnippetLoading || !hasPendingChanges} >
                  <Save />
                </IconButton>
              </Tooltip>
              <Tooltip title={"Delete"}>
                <IconButton onClick={() => setDeleteConfirmationModalOpen(true)} >
                  <Delete color={"error"} />
                </IconButton>
              </Tooltip>
            </Box>
            <TextField label="Description" placeholder="What does this snippet do?" fullWidth multiline
                       minRows={1} sx={{mb: 2}} value={description}
                       onChange={e => setDescription(e.target.value)}/>
            <LintFindings snippet={snippet}/>
            <Box display={"flex"} gap={2}>
              <Bòx flex={1} height={"fit-content"} overflow={"none"} minHeight={"500px"} bgcolor={'black'} color={'white'} code={code}>
                <Editor
                    value={code}
                    padding={10}
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
        <TestSnippetModal snippetId={id} open={testModalOpened} onClose={() => setTestModalOpened(false)}/>
        <DeleteConfirmationModal open={deleteConfirmationModalOpen} onClose={() => setDeleteConfirmationModalOpen(false)} id={snippet?.id ?? ""} setCloseDetails={handleCloseModal} />
      </Box>
  );
}

