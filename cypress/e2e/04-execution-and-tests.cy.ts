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
    cy.get('#add-snippet-code-editor')
      .click()
      .type(code);

    cy.contains('button', 'Save Snippet').click();
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');

    // Filter by name and open drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(interactiveSnippetName);
    cy.contains(interactiveSnippetName, { timeout: 10000 }).click();
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

    // 2. Set up intercepts
    cy.intercept('POST', '/api/snippets/*/executions').as('startExecution');
    cy.intercept('POST', '/api/snippets/*/executions/*/input').as('sendInput');
    cy.intercept('DELETE', '/api/snippets/*/executions/*').as('cancelExecution');

    // 3. Click Run
    cy.get('[data-testid="execution-run-button"]').click();
    cy.wait('@startExecution');

    // 4. Verify console displays prompt and input becomes enabled
    cy.get('[data-testid="execution-console"]', { timeout: 15000 })
      .should('contain', 'Enter your name: ');
    // El data-testid queda en el contenedor de MUI: lo que se habilita y se deshabilita es el
    // <input> de adentro, y un <div> nunca esta `disabled`, asi que la asercion va sobre el input.
    cy.get('[data-testid="execution-input"] input').should('not.be.disabled');
    cy.get('[data-testid="execution-input"]').type('Macky{enter}');

    // 5. Wait for input transmission and final output
    cy.wait('@sendInput');
    cy.get('[data-testid="execution-console"]', { timeout: 15000 })
      .should('contain', 'Hello Macky');

    // 6. Verify execution finishes and Run button re-enables
    cy.get('[data-testid="execution-run-button"]', { timeout: 15000 })
      .should('not.be.disabled');

    // 7. La otra mitad del contrato de la ejecucion interactiva: cancelar. Se arranca una segunda
    // corrida, se la corta mientras el programa espera el input y se verifica que el boton de
    // frenar haya dado de baja la sesion en el runner con un DELETE propio.
    cy.log('Cancelacion de una ejecucion que esta esperando input');
    cy.get('[data-testid="execution-run-button"]').click();
    cy.wait('@startExecution').then((interception) => {
      const idDeLaSesion = (interception.response?.body as { executionId: string }).executionId;
      expect(idDeLaSesion, 'el runner devolvio un id de sesion').to.be.a('string');

      cy.get('[data-testid="execution-console"]', { timeout: 15000 })
        .should('contain', 'Enter your name: ');
      cy.get('[data-testid="execution-input"] input').should('not.be.disabled');

      cy.get('[data-testid="execution-stop-button"]').should('not.be.disabled').click();

      cy.wait('@cancelExecution').then((bajaDeLaSesion) => {
        expect(bajaDeLaSesion.request.url, 'el DELETE va contra la sesion que se abrio')
          .to.include(`/executions/${idDeLaSesion}`);
        expect(bajaDeLaSesion.response?.statusCode, 'el runner acepto la cancelacion')
          .to.be.oneOf([200, 204]);
      });
    });

    // Cancelada la sesion, la consola vuelve al estado inicial: no se puede mandar input y se
    // puede volver a correr. El programa nunca llego a imprimir el saludo.
    cy.get('[data-testid="execution-stop-button"]').should('be.disabled');
    cy.get('[data-testid="execution-input"] input').should('be.disabled');
    cy.get('[data-testid="execution-run-button"]').should('not.be.disabled');
    cy.get('[data-testid="execution-console"]').should('not.contain', 'Hello');

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
    cy.get('#add-snippet-code-editor')
      .click()
      .type(code);

    cy.contains('button', 'Save Snippet').click();
    cy.get('#modal-modal-title', { timeout: 10000 }).should('not.exist');

    // Filter by name and open detail drawer
    cy.get('[data-testid="search-snippet-input"]').clear().type(testCasesSnippetName);
    cy.contains(testCasesSnippetName, { timeout: 10000 }).click();
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

    // 2. Open Test modal
    cy.get('[data-testid="test-button"]').click();
    cy.contains('Test snippet').should('be.visible');

    // 3. Add passing test case (expected output: 42)
    cy.get('[data-testid="test-case-name-input"]', { timeout: 10000 }).type('Passing Test');
    cy.get('[data-testid="test-case-output-input"]').type('42{enter}');

    cy.intercept('POST', '/api/snippets/*/test-cases').as('createPassingTest');
    cy.get('[data-testid="test-case-save-button"]').click();
    cy.wait('@createPassingTest');

    // 4. Select the saved test case tab and run it, verifying PASS. Hay que esperar la pestaña:
    // el panel del test nuevo todavia no tiene id y el boton de correr falla sin pegarle a la red.
    cy.contains('.MuiTab-root', 'Passing Test', { timeout: 10000 }).click();
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

    // 7. El CRUD completo de US #8 incluye editar y borrar, que es lo que falta probar. Se usa un
    // test case aparte para no tocar los dos de arriba, que son los insumos de US #16.
    cy.log('Alta, edicion y baja de un test case descartable');
    cy.get('[data-testid="add-test-case-button"]').click();
    cy.get('[data-testid="test-case-name-input"]', { timeout: 10000 }).type('Editable Test');
    cy.get('[data-testid="test-case-output-input"]').type('42{enter}');

    cy.intercept('POST', '/api/snippets/*/test-cases').as('createEditableTest');
    cy.get('[data-testid="test-case-save-button"]').click();
    cy.wait('@createEditableTest').then((alta) => {
      const idOriginal = (alta.response?.body as { id: string }).id;
      expect(idOriginal, 'el alta devolvio el id del test case').to.be.a('string');

      // Editar: el panel ya tiene id, asi que guardar manda un PUT a ese id y no un POST nuevo.
      cy.contains('.MuiTab-root', 'Editable Test', { timeout: 10000 }).click();
      cy.get('[data-testid="test-case-output-input"]').type('123{enter}');

      cy.intercept('PUT', '/api/snippets/*/test-cases/*').as('updateEditableTest');
      cy.get('[data-testid="test-case-save-button"]').click();
      cy.wait('@updateEditableTest').then((edicion) => {
        expect(edicion.response?.statusCode, 'la edicion fue aceptada').to.eq(200);
        const editado = edicion.response?.body as { id: string, expectedOutputs: string[] };
        expect(editado.id, 'el PUT conserva el id del test case').to.eq(idOriginal);
        expect(editado.expectedOutputs, 'la salida esperada quedo con los dos valores')
          .to.deep.eq(['42', '123']);
      });

      // Baja: el boton de borrar solo existe en un test case guardado.
      cy.contains('.MuiTab-root', 'Editable Test', { timeout: 10000 }).click();
      cy.intercept('DELETE', '/api/snippets/*/test-cases/*').as('deleteEditableTest');
      cy.get('[data-testid="test-case-remove-button"]').click();
      cy.wait('@deleteEditableTest').then((baja) => {
        expect(baja.request.url, 'el DELETE va contra el test case editado').to.include(idOriginal);
        expect(baja.response?.statusCode, 'el backend acepto la baja').to.be.oneOf([200, 204]);
      });
    });

    // La pestaña desaparece y quedan solo los dos test cases que necesita US #16.
    cy.contains('.MuiTab-root', 'Editable Test').should('not.exist');
    cy.contains('.MuiTab-root', 'Passing Test').should('exist');
    cy.contains('.MuiTab-root', 'Failing Test').should('exist');

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
    cy.get('#snippet-detail-editor', { timeout: 10000 }).should('be.visible');

    // 2. Punto de partida: el snippet imprime 42, asi que el test que espera 42 esta en verde y el
    // que espera 999 en rojo. Es el estado que dejaron las corridas a mano del test anterior.
    cy.get('[data-testid="test-button"]').click();
    cy.contains('Test snippet').should('be.visible');
    cy.contains('.MuiTab-root', 'Passing Test', { timeout: 10000 })
      .find('[data-testid="test-status-passed"]').should('exist');
    cy.contains('.MuiTab-root', 'Failing Test')
      .find('[data-testid="test-status-failed"]').should('exist');
    cy.get('body').type('{esc}');
    cy.contains('Test snippet').should('not.exist');

    // 3. Se reemplaza el contenido por uno que imprime 999, que invierte el resultado de los dos
    // test cases. Nadie pide correrlos: el backend los dispara solo al cambiar el contenido.
    cy.get('#snippet-detail-editor')
      .click()
      .clear()
      .type('println(999);');

    // El estado intermedio `pending` existe pero dura menos de lo que tarda un clic: medido contra
    // el ambiente Dev, los dos test cases ya estan resueltos ~350 ms despues de que el PUT responde,
    // asi que no hay forma de observarlo desde la interfaz sin frenar la lectura. Para cubrir que la
    // interfaz lo dibuja y que despues lo resuelve sola, las dos primeras lecturas de la lista se
    // devuelven con los test cases en `PENDING`; la tercera (el refresco corre cada 2 s mientras
    // haya alguno pendiente) ya trae lo que guardo el backend de verdad. La lista se refresca al
    // guardar, no al abrir el modal: la query vive en el detalle, que la tiene montada todo el
    // tiempo, asi que el intercept se arma antes de guardar.
    cy.intercept({ method: 'GET', url: /\/api\/snippets\/[^/]+\/test-cases$/, times: 2 }, (req) => {
      req.continue((res) => {
        const testCases = res.body as { lastRun: { status: string } | null }[];
        testCases.forEach((testCase) => {
          testCase.lastRun = { ...(testCase.lastRun ?? {}), status: 'PENDING' } as { status: string };
        });
        res.send(testCases);
      });
    }).as('testCasesPendientes');

    cy.intercept('PUT', '/api/snippets/*').as('updateSnippet');
    cy.get('[data-testid="save-button"]').should('not.be.disabled').click();
    cy.wait('@updateSnippet').its('response.statusCode').should('eq', 200);
    cy.contains('Snippet saved', { timeout: 10000 }).should('be.visible');
    cy.wait('@testCasesPendientes');

    // 4. Los dos test cases quedan encolados a la espera de la corrida automatica.
    cy.get('[data-testid="test-button"]').click();
    cy.contains('Test snippet').should('be.visible');
    cy.get('[data-testid="test-status-pending"]').should('have.length', 2);

    // 5. La corrida automatica resolvio los dos test cases contra el contenido nuevo, y los dio
    // vuelta: el que esperaba 42 ahora falla y el que esperaba 999 ahora pasa.
    cy.get('[data-testid="test-status-pending"]', { timeout: 20000 }).should('not.exist');
    cy.contains('.MuiTab-root', 'Passing Test')
      .find('[data-testid="test-status-failed"]').should('exist');
    cy.contains('.MuiTab-root', 'Failing Test')
      .find('[data-testid="test-status-passed"]').should('exist');

    // Close modal and drawer
    cy.get('body').type('{esc}');
    cy.get('[data-testid="close-drawer-button"]').click();
  });
});
