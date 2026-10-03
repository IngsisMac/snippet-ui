# Printscript UI

This is a React project using Vite and Node.js 20. This README will guide you on how to set up and start the project locally.

## Prerequisites

Before you begin, ensure you have met the following requirements:

- You have installed Node.js 20 or later
- You have installed npm

## Getting Started

To get a local copy up and running, follow these steps:

### 1. Fork this Repository in your github account

### 2. Clone the Repository

```bash
git clone https://github.com/your-username/printscript-ui.git
```

###  3. Navigate to the Project Directory
```bash
cd printscript-ui
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Start the Development Server

```bash
npm run dev
```

This will start the Vite development server. You can now open your browser and navigate to http://localhost:5173/ to see the application running.

## Build production version

To use this UI in production you should use an optimized and static version, this command will generate this version in `dist` directory:  

```bash
npm run build
```

## Cypress

To start cypress, make sure that the UI is running and enter: 

```bash
npm run cypress
```

## Auth0 and backend wiring

Authentication is already enabled: `App.tsx` is wrapped with `withAuthenticationRequired` and
`queries.tsx` builds an `HttpSnippetOperations` (see `src/utils/http/`) that attaches the access
token from `getAccessTokenSilently` to every request. The adapter translates the backend
contracts (Spring `Page`, upper-case compliance status, rules map) into the types this UI expects.

Create a `.env` file with:
```
VITE_AUTH0_DOMAIN=<tenant>.<region>.auth0.com
VITE_AUTH0_CLIENT_ID=<client_id of the SPA application>
VITE_AUTH0_AUDIENCE=https://snippet-searcher.ingsis/
```

The `audience` is mandatory: without it Auth0 issues opaque tokens that the resource servers reject.

API calls go to the relative path `/api`, which NGINX routes to the services. During local
development (`npm run dev` on port 5173) Vite proxies `/api` to the gateway on
`http://localhost:8080` (override it with `GATEWAY_URL` in `.env`).

On every login the UI registers the user's profile with `PUT /api/users/me`, so other users can
find them in the share dialog.

If you get 401 loop when getting token:
* Change application type in Auth0 to "Regular Web Application"
* In Application Settings > Credentials > "Authentication Method" select "None" 

## Start working

1. Fork the Project
2. Do your magic

## Contributing

1. Create your Feature Branch in this repo (git checkout -b feature/AmazingFeature)
2. Commit your Changes (git commit -m 'Add some AmazingFeature')
3. Push to the Branch (git push origin feature/AmazingFeature)
4. Open a Pull Request

## Tasks

- [x] Integrate Auth0 UI and private routes
- [x] Integrate your endpoints to the UI (Create custom "SnippetOperations")
- [x] Dockerize
- [ ] CI/CD
- [ ] Sockets*