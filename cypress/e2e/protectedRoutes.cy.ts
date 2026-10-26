import {AUTH0_USERNAME, AUTH0_PASSWORD} from "../../src/utils/constants";

describe('Protected routes test', () => {
  it('should redirect to login when accessing a protected route unauthenticated', () => {
    cy.visit('/');
    cy.url({ timeout: 15000 }).should('match', /auth0\.com|\/login|\/authorize/);
  });

  it('should display login content on Auth0', () => {
    cy.visit('/');
    const auth0Domain = Cypress.env('VITE_AUTH0_DOMAIN') || Cypress.env('auth0_domain');
    cy.origin(auth0Domain, () => {
      cy.get('input#username', { timeout: 15000 }).should('be.visible');
      cy.get('input#password').should('be.visible');
    });
  });

  it('should access protected routes when authenticated', () => {
    cy.loginToAuth0(
        AUTH0_USERNAME,
        AUTH0_PASSWORD
    );

    cy.visit('/');
    cy.url().should('not.include', 'auth0.com');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');
  });
});

