describe('Rules Catalog and Snippet Sharing (US #7, #11, #12, #14, #15, #2)', () => {
  const timestamp = Date.now();
  const shareSnippetName = `Shareable E2E ${timestamp}`;

  beforeEach(() => {
    cy.loginToAuth0();
  });

  it('US #11, #12, #14, #15: Rule Catalog, Editing & Persistence for Linting and Formatting', () => {
    cy.intercept('GET', '/api/permissions/rules/lint').as('getLintRules');
    cy.intercept('GET', '/api/permissions/rules/format').as('getFormatRules');

    cy.visit('/rules');
    cy.wait(['@getLintRules', '@getFormatRules']);

    cy.contains('h3', 'Rules').should('be.visible');
    cy.contains('h6', 'Linting rules').should('be.visible');
    cy.contains('h6', 'Formatting rules').should('be.visible');

    // Verify rules list elements exist
    cy.get('[data-testid^="lint-rule-"]').should('have.length.greaterThan', 0);
    cy.get('[data-testid^="format-rule-"]').should('have.length.greaterThan', 0);

    // Toggle the first linting rule checkbox
    cy.get('[data-testid^="lint-rule-"]')
      .first()
      .find('input[type="checkbox"]')
      .as('firstLintCheckbox');

    cy.get('@firstLintCheckbox').then(($cb) => {
      const wasChecked = $cb.prop('checked');
      cy.wrap($cb).click({ force: true });
      cy.get('@firstLintCheckbox').should('have.prop', 'checked', !wasChecked);

      // Save changes
      cy.intercept('PUT', '/api/permissions/rules/lint').as('saveLintRules');
      cy.get('[data-testid="save-linting-rules-button"]').click();
      cy.wait('@saveLintRules');

      // Reload page and verify persisted value
      cy.reload();
      cy.wait(['@getLintRules', '@getFormatRules']);
      cy.get('[data-testid^="lint-rule-"]')
        .first()
        .find('input[type="checkbox"]')
        .should('have.prop', 'checked', !wasChecked);

      // Revert back so we do not leave environment dirty
      cy.get('[data-testid^="lint-rule-"]')
        .first()
        .find('input[type="checkbox"]')
        .click({ force: true });
      cy.get('[data-testid="save-linting-rules-button"]').click();
      cy.wait('@saveLintRules');
    });
  });

  it('US #7: Snippet Sharing with Directory Users', () => {
    cy.intercept('GET', '/api/users*').as('getUsers');
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // 1. Create a snippet for sharing
    cy.get('[data-testid="add-snippet-button"]').click();
    cy.contains('Create snippet').click();

    cy.get('#name').type(shareSnippetName);
    cy.get('#description').type('Snippet created to test directory user sharing');

    const code = 'let sharedMsg: string = "Hello Friend";{enter}println(sharedMsg);';
    cy.get('[data-testid="add-snippet-code-editor"]')
      .click()
      .type(code);

    cy.contains('button', 'Save Snippet').click();
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');

    // 2. Search and open detail drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(shareSnippetName);
    cy.contains(shareSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // 3. Open share modal
    cy.get('[data-testid="share-button"]').click();
    cy.contains('Share your snippet').should('be.visible');

    // 4. Select directory user from Autocomplete
    cy.get('[data-testid="share-user-autocomplete"] .MuiAutocomplete-popupIndicator').click();
    cy.get('.MuiAutocomplete-popper li', { timeout: 10000 }).first().click();

    // 5. Confirm share
    cy.intercept('POST', '/api/permissions/*/share').as('shareSnippet');
    cy.get('[data-testid="share-confirm-button"]').should('not.be.disabled').click();
    cy.wait('@shareSnippet');

    // 6. Verify success snackbar and modal close
    cy.contains('Snippet shared', { timeout: 10000 }).should('be.visible');
    cy.contains('Share your snippet').should('not.exist');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
  });

  it('US #2: Snippet Deletion and Confirmation Lifecycle', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // 1. Search and open the snippet created in previous test
    cy.get('[data-testid="search-snippet-input"]').clear().type(shareSnippetName);
    cy.contains(shareSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // 2. Click Delete button
    cy.get('[data-testid="delete-button"]').click();
    cy.contains('Are you sure you want to delete this snippet?').should('be.visible');

    // 3. Confirm deletion
    cy.intercept('DELETE', '/api/snippets/*').as('deleteSnippet');
    cy.get('[data-testid="confirm-delete-button"]').click();
    cy.wait('@deleteSnippet');

    // 4. Verify confirmation snackbar, drawer closing, and removal from table
    cy.contains('Snippet deleted', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="snippet-detail-editor"]').should('not.exist');

    // Table should no longer display the deleted snippet
    cy.get('[data-testid="search-snippet-input"]').clear().type(shareSnippetName);
    cy.contains(shareSnippetName).should('not.exist');
  });
});
