import './App.css';
import {RouterProvider} from "react-router";
import {createBrowserRouter} from "react-router-dom";
import HomeScreen from "./screens/Home.tsx";
import {QueryClient, QueryClientProvider} from "react-query";
import RulesScreen from "./screens/Rules.tsx";
import {withAuthenticationRequired} from "@auth0/auth0-react";
import {SessionBootstrap} from "./components/session/SessionBootstrap.tsx";

const router = createBrowserRouter([
    {
        path: "/",
        element: <HomeScreen/>
    },
    {
        path: '/rules',
        element: <RulesScreen/>
    }
]);

export const queryClient = new QueryClient()
const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <SessionBootstrap/>
            <RouterProvider router={router}/>
        </QueryClientProvider>
    );
}

export default withAuthenticationRequired(App);
