import { apiRequest, authTokenOfCurrentUser } from '../support/api';

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

  it('US #5: Should move to the second page of the listing', () => {
    const TAMANO_DE_PAGINA = 10;
    const marca = Date.now();

    /** Crea los snippets que falten para que el listado tenga mas de una pagina. */
    const completarHasta = (token: string, faltantes: number) =>
      cy.wrap(Array.from({ length: faltantes }, (_, i) => i), { log: false })
        .each((indice: number) => {
          apiRequest({
            method: 'POST',
            url: '/api/snippets',
            token,
            body: {
              name: `E2E Paginado ${marca} ${indice}`,
              language: 'printscript',
              version: '1.1',
              content: `println(${indice});\n`,
              description: 'Snippet creado para que el listado tenga una segunda pagina',
            },
          }).then((alta) => {
            expect(alta.status, 'alta del snippet de relleno').to.eq(201);
          });
        });

    cy.intercept('GET', '/api/snippets*').as('getSnippets');
    cy.visit('/');
    cy.get('.MuiTypography-h6', { timeout: 15000 }).should('have.text', 'Printscript');

    cy.wait('@getSnippets').then((primeraLectura) => {
      const total = (primeraLectura.response?.body as { totalElements: number }).totalElements;
      cy.log(`El usuario tiene ${total} snippets`);
      if (total > TAMANO_DE_PAGINA) return;

      authTokenOfCurrentUser().then((token) => {
        completarHasta(token, TAMANO_DE_PAGINA + 1 - total).then(() => {
          cy.reload();
          cy.wait('@getSnippets');
        });
      });
    });

    // La primera pagina pide page=0 y trae tantas filas como el tamaño de pagina
    cy.get('[data-testid="snippet-row"]', { timeout: 10000 })
      .should('have.length', TAMANO_DE_PAGINA);

    cy.get('@getSnippets.all').then((lecturas) => {
      const ultima = (lecturas as unknown as { request: { url: string }, response: { body: { content: { id: string, name: string }[] } } }[]).at(-1)!;
      expect(ultima.request.url, 'la pagina que se ve es la primera').to.include('page=0');
      const primeraPagina = ultima.response.body.content;

      // Pasar de pagina: el backend tiene que recibir page=1 y devolver otros snippets
      cy.get('.MuiTablePagination-actions button').last().should('not.be.disabled').click();
      cy.wait('@getSnippets').then((segundaLectura) => {
        expect(segundaLectura.request.url, 'el clic pidio la segunda pagina').to.include('page=1');
        const segundaPagina = (segundaLectura.response?.body as { content: { id: string, name: string }[] }).content;
        expect(segundaPagina.length, 'la segunda pagina trae snippets').to.be.greaterThan(0);

        const idsDeLaPrimera = primeraPagina.map((s) => s.id);
        expect(
          segundaPagina.filter((s) => idsDeLaPrimera.includes(s.id)),
          'la segunda pagina no repite snippets de la primera',
        ).to.have.length(0);

        // Y lo que cambia es lo que se ve en la tabla, no solo el pedido
        cy.contains('[data-testid="snippet-row"]', segundaPagina[0].name, { timeout: 10000 })
          .should('be.visible');
        cy.contains('[data-testid="snippet-row"]', primeraPagina[0].name).should('not.exist');
      });
    });
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

  it('US #5: Should sort snippets by Language', () => {
    cy.intercept('GET', '/api/snippets*').as('sortSnippets');
    cy.visit('/');
    cy.wait('@sortSnippets');

    cy.contains('.MuiTableSortLabel-root', 'Language').click();
    cy.wait('@sortSnippets').its('request.url').should('include', 'sort=language,asc');

    cy.contains('.MuiTableSortLabel-root', 'Language').click();
    cy.wait('@sortSnippets').its('request.url').should('include', 'sort=language,desc');
  });

  it('US #6: Should view snippet details, description and compliance status', () => {
    cy.intercept('GET', '/api/snippets*').as('getSnippets');
    cy.visit('/');
    cy.wait('@getSnippets');

    // Click on the first snippet row
    cy.get('[data-testid="snippet-row"]').first().click();

    // Drawer should open with details
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

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
    cy.get('#snippet-detail-editor').should('not.exist');
  });
});
