import {
    Box,
    Button,
    capitalize,
    CircularProgress,
    Input,
    InputLabel,
    MenuItem,
    Select,
    SelectChangeEvent,
    Typography
} from "@mui/material";
import {highlight, languages} from "prismjs";
import {useEffect, useState} from "react";
import Editor from "react-simple-code-editor";

import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism-okaidia.css";
import {Save} from "@mui/icons-material";
import {CreateSnippet, CreateSnippetWithLang, languagesOf, versionsOf} from "../../utils/snippet.ts";
import {ModalWrapper} from "../common/ModalWrapper.tsx";
import {useCreateSnippet, useGetFileTypes} from "../../utils/queries.tsx";
import {queryClient} from "../../App.tsx";
import {useSnackbarContext} from "../../contexts/snackbarContext.tsx";

export const AddSnippetModal = ({open, onClose, defaultSnippet}: {
    open: boolean,
    onClose: () => void,
    defaultSnippet?: CreateSnippetWithLang
}) => {
    const [language, setLanguage] = useState(defaultSnippet?.language ?? "printscript");
    const [version, setVersion] = useState("");
    const [code, setCode] = useState(defaultSnippet?.content ?? "");
    const [snippetName, setSnippetName] = useState(defaultSnippet?.name ?? "")
    const [description, setDescription] = useState("")
    const {mutateAsync: createSnippet, isLoading: loadingSnippet} = useCreateSnippet({
        onSuccess: () => queryClient.invalidateQueries('listSnippets')
    })
    const {data: fileTypes} = useGetFileTypes();
    const {createSnackbar} = useSnackbarContext();

    const resetForm = () => {
        setSnippetName("")
        setCode("")
        setDescription("")
        setLanguage("printscript")
        setVersion("")
    }

    // Un 400 (sintaxis invalida) se muestra en el snackbar y el modal queda abierto para corregir;
    // al crear con exito el formulario se limpia para que el proximo alta no arrastre datos.
    // Si no se eligió una versión se propone la más nueva del lenguaje.
    const versions = versionsOf(fileTypes ?? [], language)
    const effectiveVersion = versions.includes(version) ? version : versions.at(-1) ?? ""

    const handleCreateSnippet = async () => {
        const newSnippet: CreateSnippet = {
            name: snippetName,
            content: code,
            language: language,
            version: effectiveVersion || undefined,
            extension: fileTypes?.find((f) => f.language === language)?.extension ?? "prs",
            description: description.trim() || undefined
        }
        try {
            await createSnippet(newSnippet);
            resetForm();
            onClose();
        } catch (e) {
            createSnackbar('error', (e as Error).message)
        }
    }

    useEffect(() => {
        if (defaultSnippet) {
            setCode(defaultSnippet?.content)
            setLanguage(defaultSnippet?.language)
            setSnippetName(defaultSnippet?.name)
        }
    }, [defaultSnippet]);

    return (
        <ModalWrapper open={open} onClose={onClose}>
            {
                <Box sx={{display: 'flex', flexDirection: "row", justifyContent: "space-between"}}>
                    <Typography id="modal-modal-title" variant="h5" component="h2"
                                sx={{display: 'flex', alignItems: 'center'}}>
                        Add Snippet
                    </Typography>
                    <Button disabled={!snippetName || !code || !language || loadingSnippet} variant="contained"
                            disableRipple
                            sx={{boxShadow: 0}} onClick={handleCreateSnippet}>
                        <Box pr={1} display={"flex"} alignItems={"center"} justifyContent={"center"}>
                            {loadingSnippet ? <CircularProgress size={24}/> : <Save/>}
                        </Box>
                        Save Snippet
                    </Button>
                </Box>
            }
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <InputLabel htmlFor="name">Name</InputLabel>
                <Input onChange={e => setSnippetName(e.target.value)} value={snippetName} id="name"
                       sx={{width: '50%'}}/>
            </Box>
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <InputLabel htmlFor="description">Description</InputLabel>
                <Input onChange={e => setDescription(e.target.value)} value={description} id="description"
                       placeholder="What does this snippet do?" multiline sx={{width: '100%'}}/>
            </Box>
            {/* Lenguaje y versión van en la misma fila: con el selector de versión en su propia fila el
                modal crecía lo suficiente para dejar fuera de pantalla el botón de guardar. */}
            <Box sx={{display: 'flex', flexDirection: 'row', gap: '24px'}}>
                <Box sx={{display: 'flex', flexDirection: 'column', gap: '16px', width: '50%'}}>
                    <InputLabel htmlFor="demo-simple-select">Language</InputLabel>
                    <Select
                        id="demo-simple-select"
                        value={language}
                        onChange={(e: SelectChangeEvent<string>) => {
                            setLanguage(e.target.value)
                            setVersion("")
                        }}
                    >
                        {
                            languagesOf(fileTypes ?? []).map(name => (
                                <MenuItem data-testid={`menu-option-${name}`} key={name}
                                          value={name}>{capitalize(name)}</MenuItem>
                            ))
                        }
                    </Select>
                </Box>
                <Box sx={{display: 'flex', flexDirection: 'column', gap: '16px', width: '50%'}}>
                    <InputLabel id="version-select-label">Version</InputLabel>
                    <Select
                        labelId="version-select-label"
                        id="version-select"
                        data-testid="version-select"
                        value={effectiveVersion}
                        onChange={(e: SelectChangeEvent<string>) => setVersion(e.target.value)}
                    >
                        {
                            versions.map(v => (
                                <MenuItem data-testid={`version-option-${v}`} key={v} value={v}>{v}</MenuItem>
                            ))
                        }
                    </Select>
                </Box>
            </Box>
            <InputLabel>Code Snippet</InputLabel>
            <Box width={"100%"} sx={{
                backgroundColor: 'black', color: 'white', borderRadius: "8px",
            }}>
                <Editor
                    value={code}
                    padding={10}
                    // `react-simple-code-editor` manda las props que no conoce al <div> contenedor, así que un
                    // `data-testid` nunca llegaría al <textarea>. `textareaId` sí es una prop propia de la
                    // librería y se aplica al textarea real, que es el que tiene el valor del código.
                    textareaId={"add-snippet-code-editor"}
                    onValueChange={(code) => setCode(code)}
                    highlight={(code) => highlight(code, languages.js, 'javascript')}
                    style={{
                        borderRadius: "8px",
                        overflow: "auto",
                        minHeight: "300px",
                        maxHeight: "600px",
                        width: "100%",
                        fontFamily: "monospace",
                        fontSize: 17,
                    }}
                />
            </Box>
        </ModalWrapper>
    )
}

