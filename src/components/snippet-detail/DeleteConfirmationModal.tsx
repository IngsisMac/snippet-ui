import {Box, Button, Typography} from "@mui/material";
import {ModalWrapper} from "../common/ModalWrapper.tsx";
import {useDeleteSnippet} from "../../utils/queries.tsx";
import {queryClient} from "../../App.tsx";
import {useSnackbarContext} from "../../contexts/snackbarContext.tsx";

type DeleteConfirmationModalProps = {
  open: boolean
  onClose: () => void
  id: string;
  setCloseDetails: () => void;
}
export const DeleteConfirmationModal = (props: DeleteConfirmationModalProps) => {
  const {open, onClose, id, setCloseDetails} = props;
  const {createSnackbar} = useSnackbarContext();

  const {mutate: deleteSnippet} = useDeleteSnippet({
    onSuccess: async () => {
      onClose();
      setCloseDetails();
      createSnackbar('success', 'Snippet deleted')
      await queryClient.invalidateQueries('listSnippets')
    },
  })

  // Solo el dueño puede borrar: un 403 se muestra y el modal se cierra sin tocar nada.
  const handleDelete = () => deleteSnippet(id, {
    onError: (error: Error) => {
      createSnackbar('error', error.message)
      onClose()
    }
  })

  return (
      <ModalWrapper open={open} onClose={onClose}>
        <Typography variant={"h6"}>Are you sure you want to delete this snippet?</Typography>
          <Box display={"flex"} justifyContent={"center"}>
            <Button onClick={onClose} variant={"outlined"}>Cancel</Button>
            <Button onClick={handleDelete} sx={{marginLeft: 2}} variant={"contained"} color={"error"}>Delete</Button>
          </Box>
      </ModalWrapper>
  )
}
