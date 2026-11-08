describe('Snippet CRUD Lifecycle (US #1, #2, #3, #4, #13)', () => {
  const timestamp = Date.now();
  const editorSnippetName = `E2E Editor ${timestamp}`;
  const fileSnippetName = `E2E File ${timestamp}`;

  beforeEach(() => {
    cy.loginToAuth0();
  });

  it('US #3: Should create a snippet via the web editor', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Open creation modal
    cy.get('[data-testid="add-snippet-button"]').click();
    cy.contains('Create snippet').click();

    // Fill form
    cy.get('#name').type(editorSnippetName);
    cy.get('#description').type('Snippet creado automáticamente por Cypress');

    // Type valid Printscript code in editor
    cy.get('[data-testid="add-snippet-code-editor"]')
      .click()
      .type('let greeting: string = "Hello Printscript";{enter}println(greeting);');

    // Save
    cy.contains('button', 'Save Snippet').click();

    // Modal should close and snippet should appear in table
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="search-snippet-input"]').clear().type(editorSnippetName);
    cy.contains(editorSnippetName, { timeout: 10000 }).should('be.visible');
  });

  it('Validation: Should reject invalid syntax with 400 and keep modal open', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Open creation modal
    cy.get('[data-testid="add-snippet-button"]').click();
    cy.contains('Create snippet').click();

    // Fill invalid code
    cy.get('#name').type(`Invalid Snippet ${Date.now()}`);
    cy.get('[data-testid="add-snippet-code-editor"]')
      .click()
      .type('let broken: string = ;{enter}');

    // Attempt to save
    cy.contains('button', 'Save Snippet').click();

    // Snackbar error should be displayed and modal remains open
    cy.get('.MuiAlert-filledError', { timeout: 10000 }).should('be.visible');
    cy.get('#modal-modal-title').should('be.visible');

    // Close modal via Escape
    cy.get('body').type('{esc}');
    cy.get('#modal-modal-title').should('not.exist');
  });

  it('US #1: Should create a snippet by uploading a .prs file', () => {
    cy.intercept('GET', '/api/snippets/file-types').as('getFileTypes');
    cy.visit('/');
    cy.wait('@getFileTypes');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Upload valid fixture
    cy.get('[data-testid="upload-file-input"]')
      .selectFile('cypress/fixtures/valid_code.prs', { force: true });

    // Modal opens populated with file content
    cy.get('#modal-modal-title', { timeout: 10000 }).should('be.visible');
    cy.get('#name').should('have.value', 'valid_code').clear().type(fileSnippetName);

    // Save
    cy.contains('button', 'Save Snippet').click();

    // Modal should close and uploaded snippet should appear in table
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');
    cy.get('[data-testid="search-snippet-input"]').clear().type(fileSnippetName);
    cy.contains(fileSnippetName, { timeout: 10000 }).should('be.visible');
  });

  it('US #4 & #6: Should view details, update content and save changes', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Click on the snippet created earlier
    cy.get('[data-testid="search-snippet-input"]').clear().type(editorSnippetName);
    cy.contains(editorSnippetName, { timeout: 10000 }).click();

    // Drawer should display details
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');
    cy.contains(editorSnippetName).should('be.visible');

    // Save changes button should initially be disabled
    cy.get('[data-testid="save-button"]').should('be.disabled');

    // Edit code in detail editor
    cy.get('[data-testid="snippet-detail-editor"]')
      .click()
      .type('{enter}println("Added by Cypress edit");');

    // Save changes should now be enabled
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();

    // Success snackbar
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
    cy.get('[data-testid="snippet-detail-editor"]').should('not.exist');
  });

  it('US #13 & #11: Should verify download link and format on-demand', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Open detail drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(editorSnippetName);
    cy.contains(editorSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // Verify download button has correct download attribute
    cy.get('[data-testid="download-button"] a')
      .should('have.attr', 'download')
      .and('include', '.prs');

    // Trigger on-demand formatting
    cy.get('[data-testid="format-button"]').click();

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
    cy.get('[data-testid="snippet-detail-editor"]').should('not.exist');
  });
});
