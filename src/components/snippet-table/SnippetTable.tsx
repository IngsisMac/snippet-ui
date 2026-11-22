import {
  Box,
  Button,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  styled,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField
} from "@mui/material";
import {AddSnippetModal} from "./AddSnippetModal.tsx";
import {useRef, useState} from "react";
import {Add, Search} from "@mui/icons-material";
import {LoadingSnippetRow, SnippetRow} from "./SnippetRow.tsx";
import {
  ComplianceEnum,
  CreateSnippetWithLang,
  getFileLanguage,
  languagesOf,
  Snippet,
  SnippetScope,
  SnippetSort,
  SnippetSortField
} from "../../utils/snippet.ts";
import {usePaginationContext} from "../../contexts/paginationContext.tsx";
import {useSnackbarContext} from "../../contexts/snackbarContext.tsx";
import {useGetFileTypes} from "../../utils/queries.tsx";

type SnippetTableProps = {
  handleClickSnippet: (id: string) => void;
  snippets?: Snippet[];
  loading: boolean;
  handleSearchSnippet: (snippetName: string) => void;
  sort?: SnippetSort;
  handleSortSnippets: (field: SnippetSortField) => void;
  scope: SnippetScope;
  onScopeChange: (scope: SnippetScope) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  compliance: ComplianceEnum | '';
  onComplianceChange: (compliance: ComplianceEnum | '') => void;
}

const SCOPE_OPTIONS: { value: SnippetScope, label: string }[] = [
  {value: 'all', label: 'All'},
  {value: 'owned', label: 'Mine'},
  {value: 'shared', label: 'Shared with me'},
]

const COMPLIANCE_OPTIONS: { value: ComplianceEnum, label: string }[] = [
  {value: 'compliant', label: 'Compliant'},
  {value: 'not-compliant', label: 'Not compliant'},
  {value: 'pending', label: 'Pending'},
  {value: 'failed', label: 'Failed'},
]

/** Columnas ordenables del listado (US #5). `author` sale del servicio de permisos, no se ordena. */
const SORTABLE_COLUMNS: { label: string, field: SnippetSortField }[] = [
  {label: 'Name', field: 'name'},
  {label: 'Language', field: 'language'},
]

export const SnippetTable = (props: SnippetTableProps) => {
  const {
    snippets, handleClickSnippet, loading, handleSearchSnippet, sort, handleSortSnippets,
    scope, onScopeChange, language, onLanguageChange, compliance, onComplianceChange
  } = props;
  const [addModalOpened, setAddModalOpened] = useState(false);
  const [popoverMenuOpened, setPopoverMenuOpened] = useState(false)
  const [snippet, setSnippet] = useState<CreateSnippetWithLang | undefined>()

  const popoverRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {page, page_size: pageSize, count, handleChangePageSize, handleGoToPage} = usePaginationContext()
  const {createSnackbar} = useSnackbarContext()
  const {data: fileTypes} = useGetFileTypes();

  const handleLoadSnippet = async (target: EventTarget & HTMLInputElement) => {
    const files = target.files
    if (!files || !files.length) {
      createSnackbar('error',"Please select at leat one file")
      return
    }
    const file = files[0]
    const splitName = file.name.split(".")
    const fileType = getFileLanguage(fileTypes ?? [], splitName.at(-1))
    if (!fileType) {
      createSnackbar('error', `File type ${splitName.at(-1)} not supported`)
      return
    }
    file.text().then((text) => {
      setSnippet({
        name: splitName[0],
        content: text,
        language: fileType.language,
        extension: fileType.extension
      })
    }).catch(e => {
      console.error(e)
    }).finally(() => {
      setAddModalOpened(true)
      target.value = ""
    })
  }

  function handleClickMenu() {
    setPopoverMenuOpened(false)
  }

  return (
      <>
        <Box display="flex" flexDirection="row" justifyContent="space-between">
          <Box sx={{background: 'white', width: '30%', display: 'flex'}}>
            <InputBase
                sx={{ml: 1, flex: 1}}
                placeholder="Search by name"
                inputProps={{'aria-label': 'search', 'data-testid': 'search-snippet-input'}}
                onChange={e => handleSearchSnippet(e.target.value)}
            />
            <IconButton type="button" sx={{p: '10px'}} aria-label="search">
              <Search/>
            </IconButton>
          </Box>
          <Box sx={{display: 'flex', gap: 1}}>
            <TextField select size="small" label="Show" value={scope} sx={{minWidth: 150, '& .MuiOutlinedInput-root': {background: 'white'}}}
                       inputProps={{'data-testid': 'scope-filter'}}
                       onChange={e => onScopeChange(e.target.value as SnippetScope)}>
              {SCOPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Language" value={language} sx={{minWidth: 150, '& .MuiOutlinedInput-root': {background: 'white'}}}
                       inputProps={{'data-testid': 'language-filter'}}
                       onChange={e => onLanguageChange(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {languagesOf(fileTypes ?? []).map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Conformance" value={compliance} sx={{minWidth: 160, '& .MuiOutlinedInput-root': {background: 'white'}}}
                       inputProps={{'data-testid': 'compliance-filter'}}
                       onChange={e => onComplianceChange(e.target.value as ComplianceEnum | '')}>
              <MenuItem value="">All</MenuItem>
              {COMPLIANCE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Box>
          <Button ref={popoverRef} variant="contained" disableRipple sx={{boxShadow: 0}}
                  data-testid={"add-snippet-button"}
                  onClick={() => setPopoverMenuOpened(true)}>
            <Add/>
            Add Snippet
          </Button>
        </Box>
        <Table size="medium" sx={{borderSpacing: "0 10px", borderCollapse: "separate"}}>
          <TableHead>
            <TableRow sx={{fontWeight: 'bold'}}>
              {SORTABLE_COLUMNS.map(column => (
                  <StyledTableCell key={column.field} sx={{fontWeight: "bold"}}
                                   sortDirection={sort?.field === column.field ? sort.direction : false}>
                    <TableSortLabel active={sort?.field === column.field}
                                    direction={sort?.field === column.field ? sort.direction : 'asc'}
                                    onClick={() => handleSortSnippets(column.field)}>
                      {column.label}
                    </TableSortLabel>
                  </StyledTableCell>
              ))}
              <StyledTableCell sx={{fontWeight: "bold"}}>Author</StyledTableCell>
              <StyledTableCell sx={{fontWeight: "bold"}}
                               sortDirection={sort?.field === 'compliance' ? sort.direction : false}>
                <TableSortLabel active={sort?.field === 'compliance'}
                                direction={sort?.field === 'compliance' ? sort.direction : 'asc'}
                                onClick={() => handleSortSnippets('compliance')}>
                  Conformance
                </TableSortLabel>
              </StyledTableCell>
            </TableRow>
          </TableHead>
          <TableBody>{
            loading ? (
                <>
                  {Array.from({length: 10}).map((_, index) => (
                      <LoadingSnippetRow key={index}/>
                  ))}
                </>
            ) : (
                <>
                  {
                      snippets && snippets.map((snippet) => (
                          <SnippetRow data-testid={"snippet-row"}
                                      onClick={() => handleClickSnippet(snippet.id)} key={snippet.id} snippet={snippet}/>
                      ))
                  }
                </>
            )
          }
          </TableBody>
          <TablePagination count={count} page={page} rowsPerPage={pageSize}
                           onPageChange={(_, page) => handleGoToPage(page)}
                           onRowsPerPageChange={e => handleChangePageSize(Number(e.target.value))}/>
        </Table>
        <AddSnippetModal defaultSnippet={snippet} open={addModalOpened}
                         onClose={() => setAddModalOpened(false)}/>
        <Menu anchorEl={popoverRef.current} open={popoverMenuOpened} onClick={handleClickMenu}>
          <MenuItem onClick={() => { setSnippet(undefined); setAddModalOpened(true) }}>Create snippet</MenuItem>
          <MenuItem onClick={() => inputRef?.current?.click()}>Load snippet from file</MenuItem>
        </Menu>
        <input hidden type={"file"} ref={inputRef} multiple={false} data-testid={"upload-file-input"}
               onChange={e => handleLoadSnippet(e?.target)}/>
      </>
  )
}


export const StyledTableCell = styled(TableCell)`
    border: 0;
    align-items: center;
`
