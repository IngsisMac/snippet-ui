import {useState} from "react";
import {TestCase} from "../../types/TestCase.ts";
import {Alert, Autocomplete, Box, Button, Chip, TextField, Typography} from "@mui/material";
import {BugReport, Delete, Save} from "@mui/icons-material";
import {useTestSnippet} from "../../utils/queries.tsx";
import {useSnackbarContext} from "../../contexts/snackbarContext.tsx";
import {queryClient} from "../../App.tsx";

type TabPanelProps = {
    snippetId: string;
    index: number;
    value: number;
    test?: TestCase;
    setTestCase: (test: Partial<TestCase>) => void;
    removeTestCase?: (testIndex: string) => void;
}

export const TabPanel = ({snippetId, value, index, test: initialTest, setTestCase, removeTestCase}: TabPanelProps) => {
    const [testData, setTestData] = useState<Partial<TestCase> | undefined>(initialTest);
    const {createSnackbar} = useSnackbarContext()

    const {mutateAsync: testSnippet, data} = useTestSnippet(snippetId);

    // El resultado queda guardado en el backend, así que se refresca la lista para que el
    // indicador de la pestaña muestre lo mismo que acaba de pasar.
    const runTest = () => testSnippet(testData ?? {})
        .then(() => queryClient.invalidateQueries(['testCases', snippetId]))
        .catch((e: Error) => createSnackbar('error', e.message))

    const lastRun = initialTest?.lastRun


    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`vertical-tabpanel-${index}`}
            aria-labelledby={`vertical-tab-${index}`}
            style={{flex: 1, minWidth: 0, height: '100%'}}
        >
            {value === index && (
                <Box sx={{px: 3}} display="flex" flexDirection="column" gap={2}>
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Typography fontWeight="bold">Name</Typography>
                        <TextField size="small" value={testData?.name}
                                   inputProps={{'data-testid': 'test-case-name-input'}}
                                   onChange={(e) => setTestData({...testData, name: e.target.value})}/>
                    </Box>
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Typography fontWeight="bold">Input</Typography>
                        <Autocomplete
                            multiple
                            size="small"
                            id="tags-filled"
                            freeSolo
                            value={testData?.input ?? []}
                            onChange={(_, value) => setTestData({...testData, input: value})}
                            renderTags={(value: readonly string[], getTagProps) =>
                                value.map((option: string, index: number) => (
                                    <Chip variant="outlined" label={option} {...getTagProps({index})} />
                                ))
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    inputProps={{...params.inputProps, 'data-testid': 'test-case-input-input'}}
                                />
                            )}
                            options={[]}
                        />
                    </Box>
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Typography fontWeight="bold">Output</Typography>
                        <Autocomplete
                            multiple
                            size="small"
                            id="tags-filled"
                            freeSolo
                            value={testData?.output ?? []}
                            onChange={(_, value) => setTestData({...testData, output: value})}
                            renderTags={(value: readonly string[], getTagProps) =>
                                value.map((option: string, index: number) => (
                                    <Chip variant="outlined" label={option} {...getTagProps({index})} />
                                ))
                            }
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    inputProps={{...params.inputProps, 'data-testid': 'test-case-output-input'}}
                                />
                            )}
                            options={[]}
                        />
                    </Box>
                    {lastRun?.status === 'pending' && (
                        <Alert data-testid="test-case-pending-alert" severity="info">Queued: the snippet changed and this test is running in the background</Alert>
                    )}
                    {lastRun?.status === 'failed' && lastRun.errors.length > 0 && (
                        <Alert data-testid="test-case-failed-alert" severity="error">{lastRun.errors.join(' · ')}</Alert>
                    )}
                    {lastRun?.status === 'failed' && lastRun.errors.length === 0 && (
                        <Alert data-testid="test-case-failed-alert" severity="warning">Last run produced {lastRun.actualOutputs.join(' · ') || 'no output'}</Alert>
                    )}
                    <Box display="flex" flexDirection="row" gap={1}>
                        {
                            (testData?.id && removeTestCase) && (
                            <Button data-testid="test-case-remove-button" onClick={() => removeTestCase(testData?.id ?? "")} variant={"outlined"} color={"error"}
                                    startIcon={<Delete/>}>
                                Remove
                            </Button>)
                        }
                        <Button data-testid="test-case-save-button" disabled={!testData?.name} onClick={() => setTestCase(testData ?? {})} variant={"outlined"} startIcon={<Save/>}>
                            Save
                        </Button>
                        <Button data-testid="test-case-run-button" onClick={runTest} variant={"contained"} startIcon={<BugReport/>}
                                disableElevation>
                            Test
                        </Button>
                        {data && (data === "success" ? <Chip data-testid="test-case-result-pass" label="Pass" color="success"/> :
                            <Chip data-testid="test-case-result-fail" label="Fail" color="error"/>)}
                    </Box>
                </Box>
            )}
        </div>
    );
}