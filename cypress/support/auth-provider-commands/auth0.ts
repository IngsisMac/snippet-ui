

export function loginViaAuth0Ui(username: string, password: string) {
  // App landing page redirects to Auth0.
  cy.visit('/')

  const auth0Domain = Cypress.env('VITE_AUTH0_DOMAIN') || Cypress.env('auth0_domain')

  // Login on Auth0.
  cy.origin(
      auth0Domain,
      { args: { username, password } },
      ({ username, password }) => {
        cy.get('input#username', { timeout: 10000 }).type(username)
        cy.get('input#password').type(password, { log: false })
        cy.get('button[type=submit], button[value=default], button:contains("Continue")').first().click()
      }
  )

  // Ensure Auth0 has redirected us back to the application and completed code exchange.
  const baseUrl = Cypress.config().baseUrl || 'http://localhost:8080'
  cy.url({ timeout: 20000 }).should('include', baseUrl)
  cy.url({ timeout: 20000 }).should('not.include', 'code=')
  cy.get('.MuiTypography-h6', { timeout: 20000 }).should('have.text', 'Printscript')
}




