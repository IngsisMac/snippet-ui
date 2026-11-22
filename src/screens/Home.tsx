import {withNavbar} from "../components/navbar/withNavbar.tsx";
import {SnippetTable} from "../components/snippet-table/SnippetTable.tsx";
import {useParams} from "react-router-dom";
import {useEffect, useState} from "react";
import {SnippetDetail} from "./SnippetDetail.tsx";
import {Drawer} from "@mui/material";
import {useGetSnippets} from "../utils/queries.tsx";
import {usePaginationContext} from "../contexts/paginationContext.tsx";
import useDebounce from "../hooks/useDebounce.ts";
import {ComplianceEnum, SnippetScope, SnippetSort, SnippetSortField} from "../utils/snippet.ts";

const HomeScreen = () => {
  const {id: paramsId} = useParams<{ id: string }>();
  const [searchTerm, setSearchTerm] = useState('');
  const [snippetName, setSnippetName] = useState('');
  const [snippetId, setSnippetId] = useState<string | null>(null)
  const [sort, setSort] = useState<SnippetSort | undefined>()
  const [scope, setScope] = useState<SnippetScope>('all')
  const [language, setLanguage] = useState('')
  const [compliance, setCompliance] = useState<ComplianceEnum | ''>('')
  const {page, page_size, count, handleChangeCount, handleGoToPage} = usePaginationContext()
  const {data, isLoading} = useGetSnippets(page, page_size, {
    name: snippetName,
    scope,
    language: language || undefined,
    compliance: compliance || undefined,
  }, sort)

  useEffect(() => {
    if (data?.count !== undefined && data.count != count) {
      handleChangeCount(data.count)
    }
  }, [count, data?.count, handleChangeCount]);


  useEffect(() => {
    if (paramsId) {
      setSnippetId(paramsId);
    }
  }, [paramsId]);

  const handleCloseModal = () => setSnippetId(null)

  // DeBounce Function
  useDebounce(() => {
        setSnippetName(
            searchTerm
        );
      }, [searchTerm], 800
  );

  const handleSearchSnippet = (snippetName: string) => {
    setSearchTerm(snippetName);
  };

  // Cambiar un filtro cambia el conjunto de resultados: se vuelve a la primera página.
  const withFirstPage = <T, >(setter: (value: T) => void) => (value: T) => {
    setter(value)
    handleGoToPage(0)
  }

  // Click sobre la misma columna invierte la direccion; sobre otra, arranca ascendente.
  const handleSortSnippets = (field: SnippetSortField) => {
    setSort(current => current?.field === field
        ? {field, direction: current.direction === 'asc' ? 'desc' : 'asc'}
        : {field, direction: 'asc'});
  };

  return (
      <>
        <SnippetTable loading={isLoading} handleClickSnippet={setSnippetId} snippets={data?.snippets}
                      handleSearchSnippet={handleSearchSnippet} sort={sort}
                      handleSortSnippets={handleSortSnippets}
                      scope={scope} onScopeChange={withFirstPage(setScope)}
                      language={language} onLanguageChange={withFirstPage(setLanguage)}
                      compliance={compliance} onComplianceChange={withFirstPage(setCompliance)}/>
        <Drawer open={!!snippetId} anchor={"right"} onClose={handleCloseModal}>
          {snippetId && <SnippetDetail handleCloseModal={handleCloseModal} id={snippetId}/>}
        </Drawer>
      </>
  )
}

export default withNavbar(HomeScreen);

