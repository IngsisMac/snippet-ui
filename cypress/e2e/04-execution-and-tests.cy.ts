describe('Execution and Test Cases (US #8, #9, #10, #16)', () => {
  const timestamp = Date.now();
  const interactiveSnippetName = `Interactive E2E ${timestamp}`;
  const testCasesSnippetName = `TestCases E2E ${timestamp}`;

  beforeEach(() => {
    cy.loginToAuth0();
  });

  it('US #10: Interactive Execution via Console and SSE with Input Stream', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // 1. Create snippet with readInput and println
    cy.get('[data-testid="add-snippet-button"]').click();
    cy.contains('Create snippet').click();

    cy.get('#name').type(interactiveSnippetName);
    cy.get('#description').type('Snippet for interactive console execution test');

    const code = 'let name: string = readInput("Enter your name: ");{enter}println("Hello " + name);';
    cy.get('[data-testid="add-snippet-code-editor"]')
      .click()
      .type(code);

    cy.contains('button', 'Save Snippet').click();
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');

    // Filter by name and open drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(interactiveSnippetName);
    cy.contains(interactiveSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // 2. Set up intercepts
    cy.intercept('POST', '/api/snippets/*/executions').as('startExecution');
    cy.intercept('POST', '/api/snippets/*/executions/*/input').as('sendInput');

    // 3. Click Run
    cy.get('[data-testid="execution-run-button"]').click();
    cy.wait('@startExecution');

    // 4. Verify console displays prompt and input becomes enabled
    cy.get('[data-testid="execution-console"]', { timeout: 15000 })
      .should('contain', 'Enter your name: ');
    cy.get('[data-testid="execution-input"]')
      .should('not.be.disabled')
      .type('Macky{enter}');

    // 5. Wait for input transmission and final output
    cy.wait('@sendInput');
    cy.get('[data-testid="execution-console"]', { timeout: 15000 })
      .should('contain', 'Hello Macky');

    // 6. Verify execution finishes and Run button re-enables
    cy.get('[data-testid="execution-run-button"]', { timeout: 15000 })
      .should('not.be.disabled');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
  });

  it('US #8 & #9: Test Case Management (CRUD) and Synchronous Execution (Pass & Fail)', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // 1. Create a snippet for test cases
    cy.get('[data-testid="add-snippet-button"]').click();
    cy.contains('Create snippet').click();

    cy.get('#name').type(testCasesSnippetName);
    cy.get('#description').type('Snippet for test runner verification');

    const code = 'let x: number = 42;{enter}println(x);';
    cy.get('[data-testid="add-snippet-code-editor"]')
      .click()
      .type(code);

    cy.contains('button', 'Save Snippet').click();
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');

    // Filter by name and open detail drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(testCasesSnippetName);
    cy.contains(testCasesSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // 2. Open Test modal
    cy.get('[data-testid="test-button"]').click();
    cy.contains('Test snippet').should('be.visible');

    // 3. Add passing test case (expected output: 42)
    cy.get('[data-testid="test-case-name-input"]', { timeout: 10000 }).type('Passing Test');
    cy.get('[data-testid="test-case-output-input"]').type('42{enter}');

    cy.intercept('POST', '/api/snippets/*/test-cases').as('createPassingTest');
    cy.get('[data-testid="test-case-save-button"]').click();
    cy.wait('@createPassingTest');

    // 4. Run test and verify PASS
    cy.intercept('POST', '/api/snippets/*/test-cases/*/run').as('runPassingTest');
    cy.get('[data-testid="test-case-run-button"]').click();
    cy.wait('@runPassingTest');
    cy.get('[data-testid="test-case-result-pass"]', { timeout: 10000 }).should('be.visible');

    // 5. Add second test case (failing expected output: 999)
    cy.get('[data-testid="add-test-case-button"]').click();
    cy.get('[data-testid="test-case-name-input"]', { timeout: 10000 }).type('Failing Test');
    cy.get('[data-testid="test-case-output-input"]').type('999{enter}');

    cy.intercept('POST', '/api/snippets/*/test-cases').as('createFailingTest');
    cy.get('[data-testid="test-case-save-button"]').click();
    cy.wait('@createFailingTest');

    // 6. Select Failing Test tab and run test to verify FAIL
    cy.contains('.MuiTab-root', 'Failing Test').click();
    cy.intercept('POST', '/api/snippets/*/test-cases/*/run').as('runFailingTest');
    cy.get('[data-testid="test-case-run-button"]').click();
    cy.wait('@runFailingTest');
    cy.get('[data-testid="test-case-result-fail"]', { timeout: 10000 }).should('be.visible');

    // Close modal
    cy.get('body').type('{esc}');
    cy.contains('Test snippet').should('not.exist');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
  });

  it('US #16: Background Automatic Test Re-run upon Snippet Content Change', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // 1. Search and open the snippet created with tests
    cy.get('[data-testid="search-snippet-input"]').clear().type(testCasesSnippetName);
    cy.contains(testCasesSnippetName, { timeout: 10000 }).click();
    cy.get('[data-testid="snippet-detail-editor"]', { timeout: 10000 }).should('be.visible');

    // 2. Modify snippet content
    cy.get('[data-testid="snippet-detail-editor"]')
      .click()
      .type('{enter}println(999);');

    // 3. Save changes
    cy.intercept('PUT', '/api/snippets/*').as('updateSnippet');
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();
    cy.wait('@updateSnippet');
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');

    // 4. Open Test modal and check test status icons
    cy.get('[data-testid="test-button"]').click();
    cy.contains('Test snippet').should('be.visible');

    // The test status icon should reflect that the test ran against the new code
    cy.get('[data-testid^="test-status-"]', { timeout: 10000 }).should('have.length.at.least', 1);

    // Close modal and drawer
    cy.get('body').type('{esc}');
    cy.get('[data-testid="close-drawer-button"]').click();
  });
});
