import { apiRequest, authTokenOfCurrentUser } from '../support/api'

/**
 * El borde de permisos de US #7, que es lo que ninguna otra spec mira: el lado del invitado.
 *
 * La dueña (usuario A) crea dos snippets por API y comparte solo uno con nivel `READ`. Despues el
 * invitado (usuario B) entra por la interfaz y se verifica que puede leer (abrir el detalle, correr
 * un test case, formatear, descargar) y que la interfaz le bloquea las escrituras (guardar, compartir,
 * borrar, editar tests) y el backend las rechaza con 403 si se piden igual.
 *
 * IMPORTANTE: los tests del invitado necesitan `AUTH0_PASSWORD_B` en el `.env` de `snippet-ui`.
 * Si esa variable esta vacia el bloque se SALTEA en lugar de fallar, para que la suite no se ponga
 * roja por una credencial que no esta en el repositorio.
 *
 * El usuario B tambien tiene que existir en el directorio de `permission-service`, que se alimenta
 * cuando cada persona inicia sesion: si B nunca entro a la aplicacion, el primer test falla con un
 * mensaje que lo dice.
 */
describe('Permisos de un invitado con solo lectura (US #7)', () => {
  const timestamp = Date.now()
  const snippetCompartido = `Guest E2E Compartido ${timestamp}`
  const snippetPrivado = `Guest E2E Privado ${timestamp}`
  const nombreDelCaso = `Guest E2E Caso ${timestamp}`
  const contenidoOriginal = 'let answer: number = 42;\nprintln(answer);'

  const usuarioB = Cypress.env('AUTH0_USERNAME_B') as string | undefined
  const passwordB = Cypress.env('AUTH0_PASSWORD_B') as string | undefined

  /** Se completa en el setup y lo leen los tests del invitado. */
  const compartido = { id: '', ownerId: '' }

  type SnippetCreado = { id: string, ownerId: string }
  type UsuarioDelDirectorio = { id: string, name: string, email?: string | null }
  type PaginaDeUsuarios = { content: UsuarioDelDirectorio[] }

  const esperarTitulo = () =>
      cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript')

  /** Alta por API: el setup no necesita la interfaz y asi no se gastan 20 s en tipear codigo. */
  const crearSnippet = (token: string, nombre: string, contenido: string) =>
      apiRequest({
        method: 'POST',
        url: '/api/snippets',
        token,
        body: {
          name: nombre,
          language: 'printscript',
          version: '1.1',
          content: contenido,
          description: 'Snippet del setup de la spec de permisos',
        },
      }).then((response) => {
        expect(response.status, `alta de ${nombre}`).to.eq(201)
        return response.body as unknown as SnippetCreado
      })

  /**
   * Resuelve el id de Auth0 del invitado contra el directorio. Busca por la parte local del mail
   * porque el perfil se registra con el nombre que trae el token, que no siempre es el mail entero.
   */
  const idDelInvitado = (token: string) => {
    const termino = (usuarioB ?? '').split('@')[0]
    return apiRequest({
      method: 'GET',
      url: '/api/users',
      qs: { name: termino, page: 0, size: 10 },
      token,
    }).then((response) => {
      expect(response.status, 'busqueda en el directorio de usuarios').to.eq(200)
      const pagina = response.body as unknown as PaginaDeUsuarios
      const encontrado = pagina.content.find((u) =>
          u.email?.toLowerCase() === usuarioB?.toLowerCase() ||
          u.name.toLowerCase().includes(termino.toLowerCase()),
      )
      if (!encontrado) {
        throw new Error(
            `El usuario ${usuarioB} no está en el directorio de permission-service. El directorio ` +
            'se alimenta cuando cada persona inicia sesión, así que hay que entrar una vez a la ' +
            'aplicación con ese usuario antes de correr esta spec.',
        )
      }
      return encontrado.id
    })
  }

  const abrirDetalleCompartido = () => {
    cy.get('[data-testid="search-snippet-input"]').clear().type(snippetCompartido)
    cy.contains(snippetCompartido, { timeout: 15000 }).click()
    // El aviso de solo lectura suma altura al detalle: con la ventana chica de Cypress el editor
    // queda bajo el pliegue del drawer, así que se lo trae a la vista antes de mirarlo.
    cy.get('#snippet-detail-editor', { timeout: 15000 }).scrollIntoView().should('be.visible')
  }

  it('la dueña comparte un snippet con el invitado y lo ve en su propio listado', () => {
    cy.loginToAuth0()
    cy.visit('/')
    esperarTitulo()

    authTokenOfCurrentUser().then((token) => {
      crearSnippet(token, snippetCompartido, contenidoOriginal).then((snippet) => {
        compartido.id = snippet.id
        compartido.ownerId = snippet.ownerId

        apiRequest({
          method: 'POST',
          url: `/api/snippets/${snippet.id}/test-cases`,
          token,
          body: { name: nombreDelCaso, inputs: [], expectedOutputs: ['42'] },
        }).then((response) => {
          expect(response.status, 'alta del test case que despues corre el invitado').to.eq(201)
        })

        idDelInvitado(token).then((targetUserId) => {
          apiRequest({
            method: 'POST',
            url: `/api/permissions/${snippet.id}/share`,
            token,
            body: { targetUserId, level: 'READ' },
          }).then((response) => {
            expect(response.status, `compartir ${snippetCompartido} con ${usuarioB}`).to.eq(200)
            expect(response.body).to.have.property('level', 'READ')
            cy.log(`Snippet ${snippet.id} compartido con ${usuarioB} (${targetUserId}) en modo READ`)
          })
        })
      })

      // El segundo snippet es el control: nunca se comparte, asi que el invitado no debe verlo.
      crearSnippet(token, snippetPrivado, 'let secreto: string = "solo de A";\nprintln(secreto);')
          .then((snippet) => {
            cy.log(`Snippet privado ${snippet.id} creado y deliberadamente no compartido`)
          })
    })

    cy.get('[data-testid="search-snippet-input"]').clear().type(snippetCompartido)
    cy.contains('[data-testid="snippet-row"]', snippetCompartido, { timeout: 15000 })
        .should('be.visible')
  })

  describe('Sesión del invitado con permiso de solo lectura', () => {
    before(function () {
      if (!passwordB) {
        cy.log('⚠️ AUTH0_PASSWORD_B está vacía en el .env: se saltean los tests del invitado')
        cy.log('⚠️ Completá AUTH0_PASSWORD_B con la contraseña de ' + usuarioB + ' para correrlos')
        this.skip()
      }
    })

    beforeEach(() => {
      cy.loginToAuth0(usuarioB, passwordB)
      cy.visit('/')
      esperarTitulo()
    })

    it('ve el snippet compartido en su listado con el nombre de la dueña como autora y abre el detalle', () => {
      cy.get('[data-testid="search-snippet-input"]').clear().type(snippetCompartido)
      cy.contains('[data-testid="snippet-row"]', snippetCompartido, { timeout: 15000 })
          .should('not.contain.text', 'auth0|')
          .click()

      // El identificador del editor esta sobre el <textarea> real (prop `textareaId` de
      // react-simple-code-editor), asi que el contenido se verifica con `have.value`.
      cy.get('#snippet-detail-editor', { timeout: 15000 })
          .scrollIntoView()
          .should('be.visible')
          .and('have.value', 'let answer: number = 42;\nprintln(answer);')
      cy.get('[data-testid="close-drawer-button"]').click()
    })

    it('la interfaz no le ofrece editar: avisa que es de solo lectura y bloquea guardar, subir archivo y el nombre', () => {
      abrirDetalleCompartido()

      cy.get('[data-testid="read-only-alert"]').should('be.visible')
      cy.get('[data-testid="save-button"]').should('be.disabled')
      cy.get('[data-testid="load-file-button"]').should('be.disabled')
      cy.get('[data-testid="snippet-name-input"]').should('be.disabled')
      cy.get('#snippet-detail-editor').should('have.attr', 'readonly')

      cy.get('[data-testid="close-drawer-button"]').click()
    })

    it('la interfaz no le ofrece compartir ni borrar porque no es la dueña', () => {
      abrirDetalleCompartido()

      cy.get('[data-testid="share-button"]').should('be.disabled')
      cy.get('[data-testid="delete-button"]').should('be.disabled')

      cy.get('[data-testid="close-drawer-button"]').click()
    })

    it('en el modal de tests no puede crear ni borrar casos, solo correrlos', () => {
      abrirDetalleCompartido()

      cy.get('[data-testid="test-button"]').click()
      cy.contains('Test snippet').should('be.visible')
      cy.get('[data-testid="add-test-case-button"]').should('not.exist')
      cy.contains('.MuiTab-root', nombreDelCaso, { timeout: 15000 }).click()
      cy.get('[data-testid="test-case-remove-button"]').should('not.exist')
      cy.get('[data-testid="test-case-save-button"]').should('be.disabled')
      cy.get('[data-testid="test-case-run-button"]').should('not.be.disabled')

      cy.get('body').type('{esc}')
      cy.get('[data-testid="close-drawer-button"]').click()
    })

    // La interfaz ya no manda estas escrituras, pero el permiso lo decide el backend: si alguien
    // las manda igual (otra UI, curl) tienen que volver 403 y no cambiar nada.
    it('el backend rechaza con 403 editar, compartir y borrar aunque se las pida directo', () => {
      authTokenOfCurrentUser().then((token) => {
        apiRequest({
          method: 'PUT',
          url: `/api/snippets/${compartido.id}`,
          token,
          body: { content: 'println("cambio del invitado");' },
        }).then((response) => {
          expect(response.status, 'editar como invitado').to.eq(403)
          expect((response.body as { message?: string }).message).to.contain('Not allowed to edit this snippet')
        })

        apiRequest({
          method: 'POST',
          url: `/api/permissions/${compartido.id}/share`,
          token,
          body: { targetUserId: 'auth0|cualquiera', level: 'READ' },
        }).then((response) => {
          expect(response.status, 'compartir como invitado').to.eq(403)
        })

        apiRequest({ method: 'DELETE', url: `/api/snippets/${compartido.id}`, token }).then((response) => {
          expect(response.status, 'borrar como invitado').to.eq(403)
          expect((response.body as { message?: string }).message).to.contain('Only the owner can delete this snippet')
        })

        apiRequest({ method: 'GET', url: `/api/snippets/${compartido.id}/content`, token }).then((response) => {
          expect(response.status, 'lectura del contenido como invitado').to.eq(200)
          const guardado = (response.body as unknown as { content: string }).content
          expect(guardado, 'el contenido guardado no cambió').to.eq(contenidoOriginal)
        })
      })
    })

    it('la lectura sí está permitida: descarga, formatea y corre el test case de la dueña', () => {
      abrirDetalleCompartido()

      cy.get('[data-testid="download-button"]').click()
      cy.get('[data-testid="download-original"]')
          .should('have.attr', 'download')
          .and('include', '.prs')
      cy.get('body').type('{esc}')

      cy.intercept('POST', '/api/snippets/*/format').as('formatearSnippet')
      cy.get('[data-testid="format-button"]').click()
      cy.wait('@formatearSnippet').its('response.statusCode').should('eq', 200)

      cy.get('[data-testid="test-button"]').click()
      cy.contains('Test snippet').should('be.visible')
      cy.contains('.MuiTab-root', nombreDelCaso, { timeout: 15000 }).click()

      cy.intercept('POST', '/api/snippets/*/test-cases/*/run').as('correrCaso')
      cy.get('[data-testid="test-case-run-button"]').click()
      cy.wait('@correrCaso').its('response.statusCode').should('eq', 200)
      cy.get('[data-testid="test-case-result-pass"]', { timeout: 15000 }).should('be.visible')

      cy.get('body').type('{esc}')
      cy.get('[data-testid="close-drawer-button"]').click()
    })

    it('no ve el snippet de la dueña que nunca le fue compartido', () => {
      cy.intercept('GET', '/api/snippets*').as('listarSnippets')
      cy.get('[data-testid="search-snippet-input"]').clear().type(snippetPrivado)
      cy.wait('@listarSnippets', { timeout: 15000 })

      cy.contains(snippetPrivado).should('not.exist')
      cy.get('[data-testid="snippet-row"]').should('have.length', 0)
    })
  })
})
