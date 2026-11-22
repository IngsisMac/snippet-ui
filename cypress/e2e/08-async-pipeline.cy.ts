import {apiRequest, authTokenOfCurrentUser} from '../support/api'

/**
 * Pipeline asincrónico de linteo y formato (US #12 y #15).
 *
 * Es la única spec que aserta el camino completo por Redis Streams, el que ninguna pantalla
 * dispara a mano:
 *
 * - alta de snippet -> `lint-request` -> runner -> `lint-result` -> `snippet_statuses`
 * - `PUT` de reglas de linteo -> `lint-rules` -> un `lint-request` por snippet del usuario -> ...
 * - `PUT` de reglas de formato -> `format-rules` -> `format-request` -> `format-result` -> se
 *   reescribe el blob del snippet
 *
 * Nada de esto vuelve en la respuesta HTTP del `PUT`: el resultado aparece después, así que cada
 * escenario espera con reintentos hasta que el estado converge.
 *
 * **Muta las reglas reales del usuario A**, que es un ambiente compartido con las demas specs. Las
 * reglas originales se leen en el `before` y se restauran en el `after`, que Cypress corre tambien
 * cuando un test falla.
 */

/** Reglas elegidas del catálogo real (`GET /api/permissions/rules/catalog/{lint|format}`). */
const REGLA_LINT = 'no-unused-variables'
const REGLA_FORMATO = 'enforce-spacing-before-colon-in-declaration'

/**
 * `value` se declara y nunca se usa: con `no-unused-variables` activa el linter lo marca, y el
 * nombre es válido tanto en camel case como en snake case, así que `identifier_format` no
 * interfiere con el escenario.
 */
const CODIGO = 'let value: string = "hola";{enter}println("chau");'

/** Tiempo máximo que se le da a una espera asincrónica antes de considerarla una falla. */
const ESPERA_MAXIMA_MS = 45000
/** Cadencia de los reintentos. No es una espera fija: es cada cuanto se vuelve a preguntar. */
const INTERVALO_REINTENTO_MS = 1000

type ReglasGuardadas = Record<string, unknown>
type RespuestaDeReglas = {rulesVersion: number, rules: ReglasGuardadas}
type Pagina = {content: Array<{id: string, name: string}>}
type Hallazgo = {message: string, line: number, column: number}
type DetalleDeSnippet = {id: string, status: string, findingsCount: number, findings: Hallazgo[] | null}

describe('Asynchronous Lint and Format Pipeline (US #12, #15)', () => {
  const nombreDelSnippet = `Async E2E ${Date.now()}`

  let token = ''
  let snippetId = ''
  let reglasDeLintOriginales: ReglasGuardadas | undefined
  let reglasDeFormatoOriginales: ReglasGuardadas | undefined

  /** Demoras medidas, para dejarlas juntas al final de la corrida. */
  const demoras: Array<{escenario: string, ms: number}> = []

  /**
   * Momento en que respondió el pedido que dispara el trabajo asincrónico. La demora se mide
   * desde acá y no desde el primer reintento: lo que interesa es cuánto tarda el resultado en
   * estar disponible contado desde que la interfaz recibió su respuesta.
   */
  let momentoDelDisparo = 0

  const marcarDisparo = () => cy.then(() => {
    momentoDelDisparo = Date.now()
  })

  /**
   * Espera a que una lectura de la API cumpla una condición, reintentando hasta
   * `ESPERA_MAXIMA_MS`, y anota cuánto tardó. Se consulta la API y no la interfaz en los
   * escenarios en los que ninguna pantalla muestra el dato (el contenido reescrito por el
   * formateo masivo, la cantidad de hallazgos). La convergencia de la tabla del listado, que es
   * lo que ve el usuario en US #15, se aserta aparte sobre la propia tabla.
   */
  function esperarA<T>(
      escenario: string,
      leer: () => Cypress.Chainable<T>,
      cumple: (valor: T) => boolean,
  ): Cypress.Chainable<T> {
    let comienzo = 0

    const intentar = (): Cypress.Chainable<T> =>
        leer().then((valor) => {
          const transcurrido = Date.now() - comienzo
          if (cumple(valor)) {
            demoras.push({escenario, ms: transcurrido})
            cy.log(`${escenario}: convergió en ${transcurrido} ms`)
            return cy.wrap(valor, {log: false})
          }
          if (transcurrido >= ESPERA_MAXIMA_MS) {
            throw new Error(
                `${escenario}: no convergió en ${ESPERA_MAXIMA_MS} ms. ` +
                `Último valor leído: ${JSON.stringify(valor)}`,
            )
          }
          return cy.wait(INTERVALO_REINTENTO_MS, {log: false}).then(() => intentar())
        })

    // El primer intento se encola, no se dispara acá: así la lectura usa el id del snippet y el
    // reloj arranca cuando el escenario llega a esta espera, no cuando se armó la cola.
    return cy.then(() => {
      comienzo = momentoDelDisparo || Date.now()
      momentoDelDisparo = 0
      return intentar()
    })
  }

  /** Detalle del snippet, que es donde viven el estado de conformidad y los hallazgos. */
  function leerDetalle(): Cypress.Chainable<DetalleDeSnippet> {
    return apiRequest({method: 'GET', url: `/api/snippets/${snippetId}`, token})
        .then((respuesta) => respuesta.body as unknown as DetalleDeSnippet)
  }

  /** Contenido guardado del snippet, el blob que reescribe el formateo masivo. */
  function leerContenido(): Cypress.Chainable<string> {
    return apiRequest({method: 'GET', url: `/api/snippets/${snippetId}/content`, token})
        .then((respuesta) => (respuesta.body as unknown as {content: string}).content)
  }

  function guardarReglas(tipo: 'lint' | 'format', reglas: ReglasGuardadas) {
    return apiRequest({
      method: 'PUT',
      url: `/api/permissions/rules/${tipo}`,
      token,
      body: {rules: reglas},
    }).then((respuesta) => {
      expect(respuesta.status, `PUT de reglas de ${tipo}`).to.eq(200)
      return respuesta.body as unknown as RespuestaDeReglas
    })
  }

  function abrirDetalleEnLaInterfaz() {
    cy.visit('/')
    cy.get('.MuiTypography-h6', {timeout: 20000}).should('have.text', 'Printscript')
    cy.get('[data-testid="search-snippet-input"]').clear().type(nombreDelSnippet)
    cy.contains(nombreDelSnippet, {timeout: 20000}).click()
    cy.get('#snippet-detail-editor', {timeout: 20000}).should('be.visible')
  }

  /**
   * Vuelve al listado por el navbar, sin `cy.visit`. Es importante que sea navegación del router y
   * no una recarga: lo que se quiere verificar en US #15 es que la tabla llega al estado final
   * sola, con la misma sesión de la aplicación en la que se guardaron las reglas.
   */
  function volverAlListadoSinRecargar() {
    cy.contains('button', 'Snippets').click()
    cy.get('[data-testid="search-snippet-input"]').clear().type(nombreDelSnippet)
  }

  /**
   * Celda de conformidad de la fila del snippet dentro de la tabla del listado. El `timeout` va en
   * la última consulta de la cadena, que es la que define cuánto reintenta la aserción.
   */
  function celdaDeConformidad(timeout = 20000) {
    return cy.contains('[data-testid="snippet-row"]', nombreDelSnippet, {timeout})
        .find('td', {timeout})
        .eq(3, {timeout})
  }

  /** Apaga o prende una regla desde la pantalla de reglas y guarda, como lo haría una persona. */
  function cambiarReglaEnLaInterfaz(tipo: 'lint' | 'format', regla: string, activa: boolean) {
    cy.intercept('GET', '/api/permissions/rules/lint').as('getLintRules')
    cy.intercept('GET', '/api/permissions/rules/format').as('getFormatRules')
    cy.visit('/rules')
    cy.wait(['@getLintRules', '@getFormatRules'])

    const prefijo = tipo === 'lint' ? 'lint-rule' : 'format-rule'
    cy.get(`[data-testid="${prefijo}-${regla}"] input[type="checkbox"]`)
        .should('exist')
        .then(($casilla) => {
          if ($casilla.prop('checked') !== activa) {
            cy.wrap($casilla).click({force: true})
          }
        })
    cy.get(`[data-testid="${prefijo}-${regla}"] input[type="checkbox"]`)
        .should('have.prop', 'checked', activa)

    const boton = tipo === 'lint' ? 'save-linting-rules-button' : 'save-formatting-rules-button'
    cy.intercept('PUT', `/api/permissions/rules/${tipo}`).as('saveRules')
    cy.get(`[data-testid="${boton}"]`).click()
    cy.wait('@saveRules').its('response.statusCode').should('eq', 200)
    marcarDisparo()
  }

  before(() => {
    cy.loginToAuth0()
    cy.visit('/')
    cy.get('.MuiTypography-h6', {timeout: 20000}).should('have.text', 'Printscript')

    authTokenOfCurrentUser().then((accessToken) => {
      token = accessToken

      apiRequest({method: 'GET', url: '/api/permissions/rules/lint', token}).then((respuesta) => {
        expect(respuesta.status, 'GET de reglas de linteo').to.eq(200)
        reglasDeLintOriginales = (respuesta.body as unknown as RespuestaDeReglas).rules
      })
      apiRequest({method: 'GET', url: '/api/permissions/rules/format', token}).then((respuesta) => {
        expect(respuesta.status, 'GET de reglas de formato').to.eq(200)
        reglasDeFormatoOriginales = (respuesta.body as unknown as RespuestaDeReglas).rules
      })

      // Punto de partida conocido: la regla de linteo prendida y la de formato apagada, para que
      // cada escenario provoque un cambio observable y no dependa de como quedaron las reglas.
      guardarReglas('lint', {[REGLA_LINT]: true})
      guardarReglas('format', {})
    })
  })

  beforeEach(() => {
    cy.loginToAuth0()
  })

  it('Linting of a newly created snippet arrives with no one asking for it', () => {
    cy.visit('/')
    cy.get('.MuiTypography-h6', {timeout: 20000}).should('have.text', 'Printscript')

    cy.get('[data-testid="add-snippet-button"]').click()
    cy.contains('Create snippet').click()
    cy.get('#name').type(nombreDelSnippet)
    cy.get('#description').type('Verifica que el linteo asincrónico marque el snippet solo')
    cy.get('#add-snippet-code-editor').click().type(CODIGO)

    cy.intercept('POST', '/api/snippets').as('createSnippet')
    cy.contains('button', 'Save Snippet').click()
    cy.wait('@createSnippet').its('response.statusCode').should('eq', 201)
    marcarDisparo()
    cy.get('#modal-modal-title', {timeout: 20000}).should('not.exist')

    // El alta responde con el snippet en `pending`: el linteo todavía no corrió.
    apiRequest({method: 'GET', url: '/api/snippets', qs: {name: nombreDelSnippet, size: 5}, token})
        .then((respuesta) => {
          const pagina = respuesta.body as unknown as Pagina
          const encontrado = pagina.content.find((s) => s.name === nombreDelSnippet)
          expect(encontrado, `el snippet ${nombreDelSnippet} tiene que estar en el listado`).to.exist
          snippetId = (encontrado as {id: string}).id
        })

    esperarA(
        'linteo de un snippet nuevo',
        leerDetalle,
        (detalle) => detalle.status !== 'PENDING',
    ).then((detalle) => {
      expect(detalle.status, 'estado de conformidad').to.eq('NOT_COMPLIANT')
      expect(detalle.findingsCount, 'cantidad de hallazgos').to.be.greaterThan(0)
      expect(JSON.stringify(detalle.findings)).to.contain('never used')
    })

    abrirDetalleEnLaInterfaz()
    cy.contains('linting rule', {timeout: 20000}).should('be.visible')
    cy.contains("Variable 'value' is declared but never used").should('be.visible')
    cy.get('[data-testid="close-drawer-button"]').click()
  })

  it('US #15: Turning a linting rule off leaves the snippet compliant without touching it', () => {
    leerDetalle().then((detalle) => {
      expect(detalle.status, 'punto de partida del escenario').to.eq('NOT_COMPLIANT')
    })

    cambiarReglaEnLaInterfaz('lint', REGLA_LINT, false)

    // Se fuerza la carrera que motiva la ventana de revalidación. El primer `GET` del listado
    // después de guardar las reglas responde con el estado anterior, que es lo que pasa cuando ese
    // pedido llega antes de que el consumidor de `lint-rules` marque los snippets como `PENDING`.
    // Si el refresco automático dependiera solo de ver alguna fila en `pending`, la pantalla lo
    // apagaría acá y no se enteraría nunca del relinteo: habría que recargar a mano.
    // El pedido que se interviene es el filtrado por nombre, que es el que alimenta la fila que
    // mira la aserción: al entrar al listado la pantalla pide primero la página sin filtro.
    cy.intercept(
        {method: 'GET', url: '**/api/snippets?*', query: {name: nombreDelSnippet}, times: 1},
        (pedido) => {
          pedido.continue((respuesta) => {
            const pagina = respuesta.body as {content: Array<{status: string}>}
            pagina.content.forEach((snippet) => {
              snippet.status = 'NOT_COMPLIANT'
            })
          })
        },
    ).as('listadoConEstadoViejo')

    // Se vuelve al listado enseguida, sin recargar y sin esperar a la API: es el recorrido exacto
    // de US #15. La tabla tiene que llegar al estado final sola.
    volverAlListadoSinRecargar()
    cy.wait('@listadoConEstadoViejo')
    celdaDeConformidad(ESPERA_MAXIMA_MS).should('have.text', 'compliant')

    leerDetalle().then((detalle) => {
      expect(detalle.status, 'estado después del relinteo').to.eq('COMPLIANT')
      expect(detalle.findingsCount, 'hallazgos después del relinteo').to.eq(0)
    })

    abrirDetalleEnLaInterfaz()
    cy.contains('This snippet complies with all your linting rules', {timeout: 20000})
        .should('be.visible')
    cy.get('[data-testid="close-drawer-button"]').click()
  })

  it('US #12: Changing a formatting rule rewrites the stored content of the snippet', () => {
    leerContenido().then((contenidoPrevio) => {
      expect(contenidoPrevio, 'contenido antes del cambio de reglas').to.contain('value: string')

      cambiarReglaEnLaInterfaz('format', REGLA_FORMATO, true)

      esperarA(
          'formateo masivo tras cambiar la regla (US #12)',
          leerContenido,
          (contenido) => contenido !== contenidoPrevio,
      ).then((contenido) => {
        // La regla exige un espacio antes de los dos puntos de la declaración.
        expect(contenido, 'contenido reescrito por el formateo masivo').to.contain('value : string')
      })
    })

    // Y la pantalla de detalle, que lee el contenido del backend, muestra el texto ya reescrito
    // sin que nadie haya editado el snippet.
    abrirDetalleEnLaInterfaz()
    cy.get('#snippet-detail-editor').should('include.value', 'value : string')
    cy.get('[data-testid="close-drawer-button"]').click()
  })

  after(() => {
    if (!token) return

    if (reglasDeLintOriginales) {
      guardarReglas('lint', reglasDeLintOriginales)
    }
    if (reglasDeFormatoOriginales) {
      guardarReglas('format', reglasDeFormatoOriginales)
    }

    cy.then(() => {
      demoras.forEach(({escenario, ms}) => cy.log(`Demora asincrónica — ${escenario}: ${ms} ms`))
    })
  })
})
