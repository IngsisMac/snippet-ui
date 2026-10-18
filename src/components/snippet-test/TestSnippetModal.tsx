import {Box, Divider, IconButton, Tab, Tabs, Tooltip, Typography} from "@mui/material";
import {CheckCircle, Error as ErrorIcon, HourglassEmpty} from "@mui/icons-material";
import {ModalWrapper} from "../common/ModalWrapper.tsx";
import {SyntheticEvent, useState} from "react";
import {AddRounded} from "@mui/icons-material";
import {useGetTestCases, usePostTestCase, useRemoveTestCase} from "../../utils/queries.tsx";
import {TabPanel} from "./TabPanel.tsx";
import {queryClient} from "../../App.tsx";
import {TestCase, TestRunStatus} from "../../types/TestCase.ts";

/**
 * Estado del último resultado guardado del test case (US #16). `pending` aparece mientras la
 * corrida automática que dispara un cambio de contenido todavía no terminó.
 */
const RUN_ICON: Record<TestRunStatus, { title: string, icon: JSX.Element }> = {
  passed: {title: 'Passed on the last run', icon: <CheckCircle color="success" fontSize="small"/>},
  failed: {title: 'Failed on the last run', icon: <ErrorIcon color="error" fontSize="small"/>},
  pending: {title: 'Queued after the last change', icon: <HourglassEmpty color="disabled" fontSize="small"/>},
}

const TestCaseTabLabel = ({testCase}: { testCase: TestCase }) => {
  const run = testCase.lastRun && RUN_ICON[testCase.lastRun.status]
  return (
      <Box display="flex" alignItems="center" gap={1}>
        {testCase.name}
        {run && <Tooltip title={run.title}>{run.icon}</Tooltip>}
      </Box>
  )
}

type TestSnippetModalProps = {
    snippetId: string
    open: boolean
    onClose: () => void
}

export const TestSnippetModal = ({snippetId, open, onClose}: TestSnippetModalProps) => {
    const [value, setValue] = useState(0);

    // Mientras haya una corrida automática en vuelo se vuelve a consultar: el resultado lo
    // escribe un hilo de fondo del backend, así que no llega como respuesta de ninguna mutación.
    const {data: testCases} = useGetTestCases(snippetId, {
        refetchInterval: (data?: TestCase[]) =>
            data?.some(testCase => testCase.lastRun?.status === 'pending') ? 2000 : false,
    });
    const {mutateAsync: postTestCase} = usePostTestCase(snippetId);
    const {mutateAsync: removeTestCase} = useRemoveTestCase(snippetId, {
        onSuccess: () => queryClient.invalidateQueries(['testCases', snippetId])
    });
    const saveTestCase = (tc: Partial<TestCase>) =>
        postTestCase(tc).then(() => queryClient.invalidateQueries(['testCases', snippetId]))

    const handleChange = (_: SyntheticEvent, newValue: number) => {
        setValue(newValue);
    };

    return (
        <ModalWrapper open={open} onClose={onClose}>
            <Typography variant={"h5"}>Test snippet</Typography>
            <Divider/>
            {/* La columna de pestañas no puede encogerse: sin `flexShrink: 0` el panel la aplasta a ancho 0
                y deja de verse la lista de tests y el botón para agregar otro. */}
            <Box mt={2} display="flex">
                <Tabs
                    orientation="vertical"
                    variant="scrollable"
                    value={value}
                    onChange={handleChange}
                    aria-label="Vertical tabs example"
                    sx={{borderRight: 1, borderColor: 'divider', flexShrink: 0, minWidth: 160}}
                >
                    {testCases?.map((testCase) => (
                        <Tab key={testCase.id} label={<TestCaseTabLabel testCase={testCase}/>}/>
                    ))}
                    <IconButton disableRipple onClick={() => setValue((testCases?.length ?? 0) + 1)}>
                        <AddRounded />
                    </IconButton>
                </Tabs>
                {testCases?.map((testCase, index) => (
                    <TabPanel key={testCase.id} snippetId={snippetId} index={index} value={value} test={testCase}
                              setTestCase={saveTestCase}
                              removeTestCase={(i) => removeTestCase(i)}
                    />
                ))}
                {/* La key remonta el panel vacío cada vez que se guarda un test: sin ella conserva el formulario anterior. */}
                <TabPanel key={`new-${testCases?.length ?? 0}`} snippetId={snippetId}
                          index={(testCases?.length ?? 0) + 1} value={value}
                          setTestCase={saveTestCase}
                />
            </Box>
        </ModalWrapper>
    )
}
