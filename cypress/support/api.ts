/// <reference types="cypress" />

/**
 * Helpers para hablarle a la API sin pasar por la interfaz.
 *
 * Hay dos identidades distintas y conviene no mezclarlas:
 *
 * - **El usuario logueado** (A o B). Su access token sale del cache de `auth0-spa-js`, que la
 *   aplicacion guarda en `localStorage` (`cacheLocation="localstorage"` en `src/main.tsx`). Es la
 *   unica forma de actuar como una persona sin pedirle a Auth0 un grant de password, que el tenant
 *   no tiene habilitado.
 * - **El cliente M2M** (`e2e-bot`). Pide su propio token con `client_credentials`. Sirve para los
 *   contratos negativos, donde hace falta un segundo usuario que no sea dueño de nada.
 */

const AUTH0_CACHE_PREFIX = '@@auth0spajs@@'

/** Nombres que generan las specs. Lo que empiece con esto es descartable. */
export const E2E_SNIPPET_PATTERN = /^(E2E |Interactive E2E|Shareable E2E|TestCases E2E|Invalid Snippet|Guest E2E|Async E2E)/

type SpringPage<T> = { content: T[], totalElements: number }
type SnippetDescriptor = { id: string, name: string }

type ApiRequestOptions = Partial<Cypress.RequestOptions> & { token?: string }

/**
 * Lee el access token del usuario que tiene la sesion abierta en el navegador. Recorre las claves
 * del cache en lugar de armar la clave a mano (`@@auth0spajs@@::clientId::audience::scopes`), que
 * depende de los scopes pedidos y cambia sin aviso.
 */
function readTokenFromCache(win: Window): string | undefined {
  for (let i = 0; i < win.localStorage.length; i++) {
    const key = win.localStorage.key(i)
    if (!key?.startsWith(AUTH0_CACHE_PREFIX)) continue
    try {
      const entry = JSON.parse(win.localStorage.getItem(key) ?? '{}')
      const token = entry?.body?.access_token
      if (typeof token === 'string' && token.length > 0) return token
    } catch {
      // Una entrada que no es JSON no interesa: el cache guarda tambien marcas de uso.
    }
  }
  return undefined
}

/**
 * El token del usuario logueado. Necesita una pagina de la aplicacion abierta, asi que hay que
 * llamarlo despues de `cy.loginToAuth0()` y de un `cy.visit()`.
 */
export function authTokenOfCurrentUser(): Cypress.Chainable<string> {
  return cy.window({ log: false }).then((win) => {
    const token = readTokenFromCache(win)
    if (!token) {
      throw new Error(
          'No hay access token en localStorage. Llamá a cy.loginToAuth0() y visitá una página ' +
          'de la aplicación antes de pedir el token.',
      )
    }
    return token
  })
}

/** Token del cliente M2M `e2e-bot`, cacheado para no pedirle uno nuevo a Auth0 por cada test. */
export function m2mToken(): Cypress.Chainable<string> {
  const cached = Cypress.env('m2mTokenCache')
  if (cached) return cy.wrap(cached as string, { log: false })

  const domain = Cypress.env('VITE_AUTH0_DOMAIN') ?? Cypress.env('auth0_domain')
  const clientId = Cypress.env('AUTH0_M2M_CLIENT_ID')
  const clientSecret = Cypress.env('AUTH0_M2M_CLIENT_SECRET')
  const audience = Cypress.env('VITE_AUTH0_AUDIENCE')

  if (!clientId || !clientSecret) {
    throw new Error(
        'Faltan AUTH0_M2M_CLIENT_ID y AUTH0_M2M_CLIENT_SECRET en el .env de snippet-ui. ' +
        'Son las credenciales del cliente e2e-bot.',
    )
  }

  return cy.request({
    method: 'POST',
    url: `https://${domain}/oauth/token`,
    body: {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    },
  }).then((response) => {
    const token = response.body.access_token as string
    Cypress.env('m2mTokenCache', token)
    return token
  })
}

/**
 * `cy.request` con el bearer puesto y sin cortar la corrida ante un 4xx: los contratos negativos
 * esperan 401, 403, 400 y 409, asi que el status es parte de la asercion, no un error.
 */
export function apiRequest(options: ApiRequestOptions): Cypress.Chainable<Cypress.Response<never>> {
  const { token, headers, ...rest } = options
  return cy.request({
    failOnStatusCode: false,
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  } as Partial<Cypress.RequestOptions>)
}

/**
 * Borra los snippets que dejaron las specs. Se usa al final de la corrida (`99-cleanup.cy.ts`) y no
 * en un `after` por spec, porque hay specs que leen los snippets que creo la anterior.
 */
export function deleteE2ESnippets(token: string): Cypress.Chainable<number> {
  return apiRequest({
    method: 'GET',
    url: '/api/snippets',
    qs: { page: 0, size: 200 },
    token,
  }).then((response) => {
    if (response.status !== 200) {
      throw new Error(`El listado de snippets respondió ${response.status}, no se puede limpiar`)
    }
    const page = response.body as SpringPage<SnippetDescriptor>
    const descartables = page.content.filter((s) => E2E_SNIPPET_PATTERN.test(s.name))

    cy.log(`Limpieza: ${descartables.length} de ${page.content.length} snippets quedan por borrar`)

    return cy.wrap(descartables, { log: false })
        .each((snippet: SnippetDescriptor) => {
          apiRequest({ method: 'DELETE', url: `/api/snippets/${snippet.id}`, token })
              .then((res) => {
                // 403 es esperable para un snippet que otro usuario compartio con este: no es dueño.
                if (![204, 200, 403, 404].includes(res.status)) {
                  throw new Error(`DELETE de ${snippet.name} respondió ${res.status}`)
                }
              })
        })
        .then(() => descartables.length)
  })
}
