import {Autocomplete, Box, Button, Divider, TextField, Typography} from "@mui/material";
import {ModalWrapper} from "../common/ModalWrapper.tsx";
import {useGetUsers} from "../../utils/queries.tsx";
import {useEffect, useState} from "react";
import {User} from "../../utils/users.ts";

type ShareSnippetModalProps = {
  open: boolean
  onClose: () => void
  onShare: (userId: string) => void
  loading: boolean
}
// Espera corta entre tecla y consulta: alcanza para no consultar en cada letra sin que el usuario
// tenga que esperar para ver las opciones.
const DEBOUNCE_MS = 300

export const ShareSnippetModal = (props: ShareSnippetModalProps) => {
  const {open, onClose, onShare, loading} = props
  const [name, setName] = useState("")
  const [debouncedName, setDebouncedName] = useState("")
  const {data, isLoading} = useGetUsers(debouncedName, 1, 5)
  const [selectedUser, setSelectedUser] = useState<User | undefined>()

  useEffect(() => {
    const getData = setTimeout(() => {
      setDebouncedName(name)
    }, DEBOUNCE_MS)
    return () => clearTimeout(getData)
  }, [name])

  function handleSelectUser(newValue: User | null) {
    newValue && setSelectedUser(newValue)
  }

  return (
      <ModalWrapper open={open} onClose={onClose}>
        <Typography variant={"h5"}>Share your snippet</Typography>
        <Divider/>
        <Box mt={2}>
          <Autocomplete
              data-testid="share-user-autocomplete"
              renderInput={(params) => <TextField {...params} label="Type the user's name" inputProps={{...params.inputProps, 'data-testid': 'share-user-input'}} />}
              options={data?.users ?? []}
              // El backend ya filtra por nombre o email (contiene, sin distinguir mayúsculas). El
              // filtro por defecto de MUI compararía lo tipeado contra las opciones de la consulta
              // anterior y mostraría "No options" hasta que llegue la nueva.
              filterOptions={options => options}
              isOptionEqualToValue={(option, value) =>
                  option.id === value.id
              }
              getOptionLabel={(option) => option.name}
              loading={isLoading}
              value={selectedUser}
              onInputChange={(_: unknown, newValue: string, reason: string) => {
                // Al elegir una opción MUI "resetea" el texto con la etiqueta; eso no es una búsqueda.
                if (reason !== 'reset') setName(newValue)
              }}
              onChange={(_: unknown, newValue: User | null) => handleSelectUser(newValue)}
          />
          <Box mt={4} display={"flex"} width={"100%"} justifyContent={"flex-end"}>
            <Button data-testid="share-cancel-button" onClick={onClose} variant={"outlined"}>Cancel</Button>
            <Button data-testid="share-confirm-button" disabled={!selectedUser || loading} onClick={() => selectedUser && onShare(selectedUser?.id)} sx={{marginLeft: 2}} variant={"contained"}>Share</Button>
          </Box>
        </Box>
      </ModalWrapper>
  )
}
