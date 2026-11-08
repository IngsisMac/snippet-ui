// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'
import {loginViaAuth0Ui} from "./auth-provider-commands/auth0";

Cypress.on('uncaught:exception', () => {
  return false
})

Cypress.Commands.add('loginToAuth0', (username?: string, password?: string) => {
  const user = username || Cypress.env('AUTH0_USERNAME')
  const pass = password || Cypress.env('AUTH0_PASSWORD')

  const log = Cypress.log({
    displayName: 'AUTH0 LOGIN',
    message: [`🔐 Authenticating | ${user}`],
    autoEnd: false,
  })
  log.snapshot('before')

  cy.session(
      `auth0-${user}`,
      () => {
        loginViaAuth0Ui(user, pass)
      },
      {
        validate: () => {
          cy.visit('/')
          cy.url({ timeout: 15000 }).should('not.include', 'auth0.com')
          cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript')
        },
      }
  )
  log.snapshot('after')
  log.end()
})
