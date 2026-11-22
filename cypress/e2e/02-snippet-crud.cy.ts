import { apiRequest, authTokenOfCurrentUser } from '../support/api';

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
    cy.get('#add-snippet-code-editor')
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
    cy.get('#add-snippet-code-editor')
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
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');
    cy.contains(editorSnippetName).should('be.visible');

    // Save changes button should initially be disabled
    cy.get('[data-testid="save-button"]').should('be.disabled');

    // Edit code in detail editor
    cy.get('#snippet-detail-editor')
      .click()
      .type('{enter}println("Added by Cypress edit");');

    // Save changes should now be enabled
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();

    // Success snackbar
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
    cy.get('#snippet-detail-editor').should('not.exist');
  });

  it('US #13 & #11: Should download the stored content and format it on demand', () => {
    // Codigo con espaciado y lineas en blanco de sobra: lo que hace visible la diferencia entre la
    // version original y la formateada. Sin esto, formatear devuelve el mismo texto y las dos
    // mitades de la historia serian indistinguibles.
    const contenidoSinFormato = 'let   feo :  string   =   "sin formato"   ;{enter}{enter}{enter}println( feo )  ;';

    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    // Open detail drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(editorSnippetName);
    cy.contains(editorSnippetName, { timeout: 10000 }).click();
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

    // Se persiste el contenido sin formato, que es el que tiene que entregar la descarga
    cy.intercept('PUT', '/api/snippets/*').as('guardarSinFormato');
    cy.get('#snippet-detail-editor').click().clear().type(contenidoSinFormato);
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();
    cy.wait('@guardarSinFormato').its('response.statusCode').should('eq', 200);
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');

    authTokenOfCurrentUser().then((token) => {
      apiRequest({ method: 'GET', url: '/api/snippets', qs: { page: 0, size: 50, name: editorSnippetName }, token })
        .then((listado) => {
          const snippetId = (listado.body as unknown as { content: { id: string }[] }).content[0].id;

          apiRequest({ method: 'GET', url: `/api/snippets/${snippetId}/content`, token }).then((crudo) => {
            expect(crudo.status).to.eq(200);
            const original = (crudo.body as unknown as { content: string }).content;

            apiRequest({ method: 'POST', url: `/api/snippets/${snippetId}/format`, token, body: { content: original } })
              .then((formateo) => {
                expect(formateo.status).to.eq(200);
                const formateado = (formateo.body as unknown as { formattedContent: string }).formattedContent;

                // US #13 pide distinguir las dos versiones, asi que tienen que ser distintas
                expect(formateado, 'la version formateada no es igual a la original').to.not.eq(original);

                // Lo que baja el link es el contenido guardado, no el formateado. El href es un
                // blob que armo la propia pagina, asi que se lee con el fetch de la ventana.
                cy.get('[data-testid="download-button"] a')
                  .should('have.attr', 'download')
                  .and('include', '.prs');
                cy.get('[data-testid="download-button"] a').then(($link) => {
                  const blob = $link.attr('href') as string;
                  expect(blob, 'el link apunta a un blob de la pagina').to.match(/^blob:/);
                  cy.window().then((win) => win.fetch(blob).then((r) => r.text()))
                    .then((bajado) => {
                      expect(bajado, 'la descarga entrega el contenido original').to.eq(original);
                      expect(bajado, 'la descarga no entrega el formateado').to.not.eq(formateado);
                    });
                });

                // US #11: formatear a demanda reemplaza el texto del editor por el del backend
                cy.intercept('POST', '/api/snippets/*/format').as('formatearSnippet');
                cy.get('#snippet-detail-editor').should('have.value', original);
                cy.get('[data-testid="format-button"]').click();
                cy.wait('@formatearSnippet').then((interception) => {
                  expect(interception.response?.statusCode, 'el formateo a demanda respondio bien').to.eq(200);
                  const devuelto = (interception.response?.body as { formattedContent: string }).formattedContent;
                  expect(devuelto, 'el backend formatea igual que por API').to.eq(formateado);
                  cy.get('#snippet-detail-editor').should('have.value', devuelto);
                  cy.get('#snippet-detail-editor').should('not.have.value', original);
                });

                // Formatear no guarda: el link de descarga sigue entregando el original
                cy.get('[data-testid="download-button"] a').then(($link) => {
                  const blob = $link.attr('href') as string;
                  cy.window().then((win) => win.fetch(blob).then((r) => r.text()))
                    .then((bajado) => {
                      expect(bajado, 'formatear el editor no cambio lo guardado').to.eq(original);
                    });
                });
              });
          });
        });
    });

    // Close drawer
    cy.get('[data-testid="close-drawer-button"]').click();
    cy.get('#snippet-detail-editor').should('not.exist');
  });

  it('US #2: Should update an existing snippet with the content of a file', () => {
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    cy.get('[data-testid="search-snippet-input"]').clear().type(editorSnippetName);
    cy.contains(editorSnippetName, { timeout: 10000 }).click();
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

    // Una extensión que no corresponde a ningún lenguaje se rechaza antes de llegar al backend
    cy.get('[data-testid="update-file-input"]')
      .selectFile('cypress/fixtures/example.json', { force: true });
    cy.contains('File type json not supported', { timeout: 10000 }).should('be.visible');
    cy.get('[data-testid="save-button"]').should('be.disabled');

    cy.get('[data-testid="update-file-input"]')
      .selectFile('cypress/fixtures/valid_code.prs', { force: true });
    cy.contains('valid_code.prs loaded', { timeout: 10000 }).should('be.visible');

    cy.intercept('PUT', '/api/snippets/*').as('updateFromFile');
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();
    cy.wait('@updateFromFile').its('response.statusCode').should('eq', 200);
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');

    // Lo que importa es lo que quedó persistido, no lo que muestra el editor
    cy.fixture('valid_code.prs').then((contenidoDelArchivo: string) => {
      authTokenOfCurrentUser().then((token) => {
        apiRequest({ method: 'GET', url: '/api/snippets', qs: { page: 0, size: 50, name: editorSnippetName }, token })
          .then((listado) => {
            const encontrado = (listado.body as unknown as { content: { id: string }[] }).content[0];
            expect(encontrado, 'el snippet editado sigue en el listado').to.not.be.undefined;

            apiRequest({ method: 'GET', url: `/api/snippets/${encontrado.id}/content`, token })
              .then((response) => {
                expect(response.status).to.eq(200);
                const guardado = (response.body as unknown as { content: string }).content;
                expect(guardado, 'el contenido guardado es el del archivo').to.eq(contenidoDelArchivo);
              });
          });
      });
    });

    cy.get('[data-testid="close-drawer-button"]').click();
  });
});
