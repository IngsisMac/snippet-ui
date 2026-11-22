import { apiRequest, authTokenOfCurrentUser, m2mToken } from '../support/api'

/**
 * Contratos de la API, sin interfaz.
 *
 * Lo único que pasa por el navegador es el login del usuario A, que es la única forma de
 * conseguir su access token (el tenant no tiene habilitado el grant de password). Todo lo demás
 * son `cy.request` contra el gateway desplegado.
 *
 * La gracia está en las dos identidades: A es dueña de lo que crea y el cliente M2M `e2e-bot`
 * está en el directorio pero no es dueño de nada de A. Esa asimetría es la que permite probar los
 * 403 de verdad, sin stubs.
 */
describe('Contratos de la API de Snippet Searcher', () => {
  const marca = Date.now()
  const nombreDeA = `E2E API Snippet de A ${marca}`
  const nombreEnJava = `E2E API Snippet Java ${marca}`
  const nombreEjecutable = `E2E API Ejecución ${marca}`

  const CONTENIDO_ORIGINAL = 'let saludo: string = "Hola contratos";\nprintln(saludo);\n'
  const CONTENIDO_EJECUTABLE = 'println("listo");\n'

  let tokenDeA: string
  let tokenDelBot: string
  let snippetDeA: string
  let snippetEnJava: string

  /** Alta de un snippet con el token que se le pase. Devuelve el id que asignó el backend. */
  function crearSnippet(
    token: string,
    nombre: string,
    contenido: string,
    lenguaje = 'printscript',
  ): Cypress.Chainable<string> {
    return apiRequest({
      method: 'POST',
      url: '/api/snippets',
      token,
      body: {
        name: nombre,
        language: lenguaje,
        version: '1.1',
        content: contenido,
        description: 'Snippet creado por la spec de contratos de API',
      },
    }).then((respuesta) => {
      expect(respuesta.status, `alta de ${nombre}`).to.eq(201)
      return (respuesta.body as { id: string }).id
    })
  }

  /** El contenido guardado, tal como lo devuelve el detalle del snippet. */
  function contenidoDe(token: string, snippetId: string): Cypress.Chainable<string> {
    return apiRequest({ method: 'GET', url: `/api/snippets/${snippetId}/content`, token })
      .then((respuesta) => {
        expect(respuesta.status).to.eq(200)
        return (respuesta.body as { content: string }).content
      })
  }

  /** La versión de reglas que el servicio de permisos informa para el dueño del token. */
  function versionDeReglas(token: string, tipo: 'lint' | 'format'): Cypress.Chainable<number> {
    return apiRequest({ method: 'GET', url: `/api/permissions/rules/${tipo}`, token })
      .then((respuesta) => {
        expect(respuesta.status).to.eq(200)
        return (respuesta.body as { rulesVersion: number }).rulesVersion
      })
  }

  before(() => {
    cy.loginToAuth0()
    cy.visit('/')
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript')

    authTokenOfCurrentUser().then((token) => {
      tokenDeA = token
      crearSnippet(tokenDeA, nombreDeA, CONTENIDO_ORIGINAL).then((id) => {
        snippetDeA = id
      })
      crearSnippet(tokenDeA, nombreEnJava, CONTENIDO_ORIGINAL, 'java').then((id) => {
        snippetEnJava = id
      })
    })

    m2mToken().then((token) => {
      tokenDelBot = token
    })
  })

  it('rechaza con 401 cualquier pedido sin token', () => {
    apiRequest({ method: 'GET', url: '/api/snippets' }).then((respuesta) => {
      expect(respuesta.status, 'listado de snippets sin token').to.eq(401)
    })

    apiRequest({ method: 'GET', url: '/api/permissions/rules/catalog/lint' }).then((respuesta) => {
      expect(respuesta.status, 'catálogo de reglas sin token').to.eq(401)
    })
  })

  it('impide que un usuario ajeno modifique, borre, comparta o le agregue casos de prueba a un snippet', () => {
    apiRequest({
      method: 'PUT',
      url: `/api/snippets/${snippetDeA}`,
      token: tokenDelBot,
      body: { content: 'println("secuestrado");\n' },
    }).then((respuesta) => {
      expect(respuesta.status, 'PUT de un snippet ajeno').to.eq(403)
    })

    apiRequest({
      method: 'POST',
      url: `/api/permissions/${snippetDeA}/share`,
      token: tokenDelBot,
      body: { targetUserId: 'auth0|quien-sea', level: 'READ' },
    }).then((respuesta) => {
      expect(respuesta.status, 'compartir un snippet ajeno').to.eq(403)
    })

    apiRequest({
      method: 'POST',
      url: `/api/snippets/${snippetDeA}/test-cases`,
      token: tokenDelBot,
      body: { name: 'E2E API caso ajeno', inputs: [], expectedOutputs: ['Hola contratos'] },
    }).then((respuesta) => {
      expect(respuesta.status, 'alta de caso de prueba sobre un snippet ajeno').to.eq(403)
    })

    apiRequest({
      method: 'DELETE',
      url: `/api/snippets/${snippetDeA}`,
      token: tokenDelBot,
    }).then((respuesta) => {
      expect(respuesta.status, 'DELETE de un snippet ajeno').to.eq(403)
    })

    contenidoDe(tokenDeA, snippetDeA).then((contenido) => {
      expect(contenido, 'el contenido de A sobrevive intacto a los cuatro intentos')
          .to.eq(CONTENIDO_ORIGINAL)
    })
  })

  it('rechaza con 400 un criterio de ordenamiento que no existe', () => {
    apiRequest({
      method: 'GET',
      url: '/api/snippets',
      token: tokenDeA,
      qs: { sort: 'propiedadInventada', page: 0, size: 20 },
    }).then((respuesta) => {
      expect(respuesta.status, 'ordenar por una propiedad inexistente').to.eq(400)
    })

    apiRequest({
      method: 'GET',
      url: '/api/snippets',
      token: tokenDeA,
      qs: { sort: 'name,asc', page: 0, size: 20 },
    }).then((respuesta) => {
      expect(respuesta.status, 'ordenar por una propiedad del catálogo').to.eq(200)
    })
  })

  it('rechaza los valores que el catálogo de reglas de linteo no acepta y deja la versión intacta', () => {
    const rechazos: Array<{ caso: string, rules: Record<string, unknown> }> = [
      { caso: 'clave desconocida', rules: { 'regla-que-no-existe': true } },
      { caso: 'tipo equivocado', rules: { 'no-unused-variables': 'sí' } },
      { caso: 'valor fuera de los aceptados', rules: { identifier_format: 'pascal case' } },
    ]

    versionDeReglas(tokenDelBot, 'lint').then((versionAntes) => {
      cy.wrap(rechazos, { log: false }).each((rechazo: { caso: string, rules: Record<string, unknown> }) => {
        apiRequest({
          method: 'PUT',
          url: '/api/permissions/rules/lint',
          token: tokenDelBot,
          body: { rules: rechazo.rules },
        }).then((respuesta) => {
          expect(respuesta.status, `PUT de reglas de linteo con ${rechazo.caso}`).to.eq(400)
        })
      })

      versionDeReglas(tokenDelBot, 'lint').then((versionDespues) => {
        expect(versionDespues, 'un PUT rechazado no incrementa rulesVersion').to.eq(versionAntes)
      })
    })
  })

  it('rechaza un número negativo en una regla de formato y deja la versión intacta', () => {
    // El catálogo de linteo no tiene ninguna regla numérica: la única forma de probar el borde
    // del número negativo es con una de formato (`indent-inside-if`).
    versionDeReglas(tokenDelBot, 'format').then((versionAntes) => {
      apiRequest({
        method: 'PUT',
        url: '/api/permissions/rules/format',
        token: tokenDelBot,
        body: { rules: { 'indent-inside-if': -2 } },
      }).then((respuesta) => {
        expect(respuesta.status, 'PUT de reglas de formato con un número negativo').to.eq(400)
      })

      versionDeReglas(tokenDelBot, 'format').then((versionDespues) => {
        expect(versionDespues, 'un PUT rechazado no incrementa rulesVersion').to.eq(versionAntes)
      })
    })
  })

  it('no deja compartir un snippet con nivel OWNER', () => {
    apiRequest({
      method: 'POST',
      url: `/api/permissions/${snippetDeA}/share`,
      token: tokenDeA,
      body: { targetUserId: 'auth0|destinatario-de-prueba', level: 'OWNER' },
    }).then((respuesta) => {
      expect(respuesta.status, 'compartir con nivel OWNER').to.eq(400)
      cy.log(`Mensaje del backend: ${JSON.stringify(respuesta.body)}`)
    })
  })

  it('informa rulesVersion 0 para un usuario que nunca guardó reglas', () => {
    // Regresión del bug corregido el 18/10: el GET devolvía 1 antes del primer PUT, así que el
    // runner descartaba los mensajes de revalidación por versión repetida.
    apiRequest({ method: 'GET', url: '/api/permissions/rules/lint', token: tokenDelBot })
        .then((respuesta) => {
          expect(respuesta.status).to.eq(200)
          const cuerpo = respuesta.body as { rulesVersion: number, rules: Record<string, unknown> }
          expect(Object.keys(cuerpo.rules), 'el cliente M2M no tiene reglas guardadas').to.have.length(0)
          expect(cuerpo.rulesVersion, 'rulesVersion de un usuario sin reglas').to.eq(0)
        })
  })

  it('responde 409 cuando llega un input a una ejecución que ya terminó', () => {
    // Regresión del bug corregido el 18/10: el runner tiraba IllegalArgumentException sin mapear
    // y el usuario veía un 500 donde corresponde un conflicto.
    crearSnippet(tokenDeA, nombreEjecutable, CONTENIDO_EJECUTABLE).then((snippetId) => {
      apiRequest({
        method: 'POST',
        url: `/api/snippets/${snippetId}/executions`,
        token: tokenDeA,
        body: { env: {} },
      }).then((inicio) => {
        expect(inicio.status, 'alta de la sesión de ejecución').to.eq(201)
        const ejecucion = (inicio.body as { executionId: string }).executionId

        // Leer el stream hasta que cierre es la forma determinística de saber que terminó: el
        // programa no pide input, así que la sesión se completa sola.
        apiRequest({
          method: 'GET',
          url: `/api/snippets/${snippetId}/executions/${ejecucion}/stream`,
          token: tokenDeA,
          timeout: 60000,
        }).then((stream) => {
          expect(stream.status, 'stream de la ejecución').to.eq(200)
          cy.log(`Salida de la ejecución: ${String(stream.body).replace(/\n/g, ' | ')}`)

          apiRequest({
            method: 'POST',
            url: `/api/snippets/${snippetId}/executions/${ejecucion}/input`,
            token: tokenDeA,
            body: { value: 'tarde' },
          }).then((respuesta) => {
            expect(respuesta.status, 'input sobre una ejecución terminada').to.eq(409)
          })
        })
      })
    })
  })

  it('bloquea desde afuera las rutas internas que solo valen dentro de la red de Docker', () => {
    const internas = ['/internal/permissions', '/runner', '/v1/asset']

    // Lo que se prueba acá es la configuración del gateway, así que las rutas se piden contra su
    // origen y no contra `baseUrl`: corriendo sobre el dev server de Vite solo `/api` esta
    // proxyado, y cualquier otra ruta devolveria el `index.html` de la aplicacion con un 200.
    const gateway = (Cypress.env('GATEWAY_URL') as string | undefined) ?? Cypress.config().baseUrl

    cy.wrap(internas, { log: false }).each((ruta: string) => {
      apiRequest({ method: 'GET', url: `${gateway}${ruta}`, token: tokenDeA }).then((respuesta) => {
        expect(respuesta.status, `ruta interna ${ruta} en ${gateway}`).to.eq(403)
      })
    })
  })

  it('filtra el listado por alcance, por lenguaje y por estado de cumplimiento', () => {
    const listar = (qs: Record<string, string | number>) =>
      apiRequest({ method: 'GET', url: '/api/snippets', token: tokenDeA, qs: { page: 0, size: 200, ...qs } })

    listar({ scope: 'OWNED' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const ids = (respuesta.body as { content: Array<{ id: string }> }).content.map((s) => s.id)
      expect(ids, 'los snippets propios aparecen con scope OWNED').to.include(snippetDeA)
    })

    listar({ scope: 'SHARED' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const ids = (respuesta.body as { content: Array<{ id: string }> }).content.map((s) => s.id)
      expect(ids, 'un snippet propio no es un snippet compartido conmigo').to.not.include(snippetDeA)
    })

    listar({ scope: 'ALL' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const ids = (respuesta.body as { content: Array<{ id: string }> }).content.map((s) => s.id)
      expect(ids, 'ALL incluye los propios').to.include(snippetDeA)
    })

    listar({ language: 'java' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const contenido = (respuesta.body as { content: Array<{ id: string, language: string }> }).content
      expect(contenido.map((s) => s.id), 'el filtro java trae el snippet en java').to.include(snippetEnJava)
      expect(contenido.map((s) => s.id), 'y deja afuera el de printscript').to.not.include(snippetDeA)
      contenido.forEach((s) => expect(s.language.toLowerCase()).to.eq('java'))
    })

    listar({ language: 'printscript' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const contenido = (respuesta.body as { content: Array<{ id: string, language: string }> }).content
      expect(contenido.map((s) => s.id), 'el filtro printscript trae el de printscript').to.include(snippetDeA)
      expect(contenido.map((s) => s.id), 'y deja afuera el de java').to.not.include(snippetEnJava)
    })

    listar({ status: 'COMPLIANT' }).then((respuesta) => {
      expect(respuesta.status).to.eq(200)
      const contenido = (respuesta.body as { content: Array<{ status: string }> }).content
      contenido.forEach((s) => expect(s.status, 'el filtro por estado no deja pasar otro').to.eq('COMPLIANT'))
    })

    listar({ status: 'EstadoInventado' }).then((respuesta) => {
      expect(respuesta.status, 'un estado que no existe en el enumerado').to.eq(400)
    })
  })

  it('actualiza el contenido de un snippet con el de un archivo válido y rechaza el inválido', () => {
    cy.fixture('valid_code.prs').then((codigoValido: string) => {
      apiRequest({
        method: 'PUT',
        url: `/api/snippets/${snippetDeA}`,
        token: tokenDeA,
        body: { content: codigoValido },
      }).then((respuesta) => {
        expect(respuesta.status, 'actualizar con el contenido de un archivo válido').to.eq(200)
      })

      contenidoDe(tokenDeA, snippetDeA).then((contenido) => {
        expect(contenido, 'el contenido guardado es el del archivo').to.eq(codigoValido)
      })
    })

    cy.fixture('invalid_code.prs').then((codigoInvalido: string) => {
      apiRequest({
        method: 'PUT',
        url: `/api/snippets/${snippetDeA}`,
        token: tokenDeA,
        body: { content: codigoInvalido },
      }).then((respuesta) => {
        expect(respuesta.status, 'actualizar con el contenido de un archivo inválido').to.eq(400)
        const mensaje = (respuesta.body as { message?: string }).message ?? ''
        expect(mensaje, 'el backend explica por qué no parsea').to.not.be.empty
        cy.log(`Mensaje del parser: ${mensaje}`)
      })
    })

    cy.fixture('valid_code.prs').then((codigoValido: string) => {
      contenidoDe(tokenDeA, snippetDeA).then((contenido) => {
        expect(contenido, 'el rechazo no pisó el contenido anterior').to.eq(codigoValido)
      })
    })
  })
})
