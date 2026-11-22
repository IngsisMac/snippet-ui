import { authTokenOfCurrentUser, deleteE2ESnippets, m2mToken } from '../support/api'

/**
 * Ultima spec de la corrida (ordena alfabeticamente al final): borra los snippets que crearon las
 * demas. Va en una spec propia y no en un `after` global porque varias specs leen los snippets que
 * dejo la anterior; limpiar entre specs las haria fallar.
 */
describe('Limpieza del ambiente', () => {
  it('borra los snippets que crearon las specs del usuario dueño', () => {
    cy.loginToAuth0()
    cy.visit('/')
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript')

    authTokenOfCurrentUser().then((token) => {
      deleteE2ESnippets(token).then((borrados) => {
        cy.log(`Borrados ${borrados} snippets del usuario dueño`)
      })
    })
  })

  it('borra los snippets que creó el cliente M2M por API', () => {
    m2mToken().then((token) => {
      deleteE2ESnippets(token).then((borrados) => {
        cy.log(`Borrados ${borrados} snippets del cliente M2M`)
      })
    })
  })
})
