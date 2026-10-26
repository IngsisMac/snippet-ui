describe('Snippet Discovery and Inspection (US #5, US #6)', () => {
  beforeEach(() => {
    cy.loginToAuth0();
  });

  it('US #5: Should display snippets table with required columns and pagination', () => {
    cy.intercept('GET', '/api/snippets*').as('getSnippets');
    cy.visit('/');
    cy.wait('@getSnippets');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Verify table headers
    cy.contains('th', 'Name').should('be.visible');
    cy.contains('th', 'Language').should('be.visible');
    cy.contains('th', 'Author').should('be.visible');
    cy.contains('th', 'Conformance').should('be.visible');

    // Verify snippet rows are rendered
    cy.get('[data-testid="snippet-row"]', { timeout: 10000 })
      .should('have.length.greaterThan', 0);

    // Verify pagination controls exist
    cy.get('.MuiTablePagination-root').should('be.visible');
  });

  it('US #5: Should filter snippets by name using debounce search', () => {
    cy.intercept('GET', '/api/snippets*').as('searchSnippets');
    cy.visit('/');
    cy.wait('@searchSnippets');

    // Type search query
    cy.get('[data-testid="search-snippet-input"]')
      .clear()
      .type('E2E Editor');

    // Wait for debounced search request
    cy.wait('@searchSnippets').then((interception) => {
      expect(interception.request.url).to.include('name=E2E');
    });

    // Every visible row should match the search query
    cy.get('[data-testid="snippet-row"]').each(($row) => {
      cy.wrap($row).should('contain.text', 'E2E Editor');
    });

    // Clear search and verify all items return
    cy.get('[data-testid="search-snippet-input"]').clear();
    cy.wait('@searchSnippets');
    cy.get('[data-testid="snippet-row"]').should('have.length.greaterThan', 0);
  });

  it('US #5: Should sort snippets by Name and Conformance', () => {
    cy.intercept('GET', '/api/snippets*').as('sortSnippets');
    cy.visit('/');
    cy.wait('@sortSnippets');

    // Click Name column header for ascending sort
    cy.contains('.MuiTableSortLabel-root', 'Name').click();
    cy.wait('@sortSnippets').then((interception) => {
      expect(interception.request.url).to.include('sort=name,asc');
    });

    // Click Name column header again for descending sort
    cy.contains('.MuiTableSortLabel-root', 'Name').click();
    cy.wait('@sortSnippets').then((interception) => {
      expect(interception.request.url).to.include('sort=name,desc');
    });

    // Click Conformance column header
    cy.contains('.MuiTableSortLabel-root', 'Conformance').click();
    cy.wait('@sortSnippets').then((interception) => {
      expect(interception.request.url).to.include('sort=compliance,asc');
    });
  });

  it('US #6: Should view snippet details, description and compliance status', () => {
    cy.intercept('GET', '/api/snippets*').as('getSnippets');
    cy.visit('/');
    cy.wait('@getSnippets');

    // Click on the first snippet row
    cy.get('[data-testid="snippet-row"]').first().click();

    // Drawer should open with details
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // Description textfield should exist
    cy.get('textarea[placeholder="What does this snippet do?"]').should('exist');

    // Compliance banner should be displayed (either compliant success or warnings list)
    cy.get('.MuiAlert-root').should('be.visible');

    // Action buttons should exist
    cy.get('[data-testid="share-button"]').should('be.visible');
    cy.get('[data-testid="test-button"]').should('be.visible');
    cy.get('[data-testid="download-button"]').should('be.visible');
    cy.get('[data-testid="format-button"]').should('be.visible');
    cy.get('[data-testid="save-button"]').should('be.visible');
    cy.get('[data-testid="delete-button"]').should('be.visible');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
    cy.get('[data-testid="snippet-detail-editor"]').should('not.exist');
  });
});
