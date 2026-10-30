import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ToastProvider from "./components/ToastProvider";
import AppNotices from "./components/AppNotices";
import ErrorBoundary from "./components/ErrorBoundary";
import { reportApiError, reportApiSuccess } from "./lib/apiReachability";
import { logError } from "./lib/errors";
import { keepOffline } from "./lib/offlineCalendar";
import { meQuery } from "./lib/api/me";
import { propertiesQuery } from "./lib/api/properties";
import { allUnitsQuery } from "./lib/api/units";
import { allReservationsQuery } from "./lib/api/reservations";
import "./lib/pwa";
import "./index.css";

const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error, query) => {
            reportApiError(error);
            logError(error, `Loading ${JSON.stringify(query.queryKey)}`);
        },
        onSuccess: reportApiSuccess,
    }),
    mutationCache: new MutationCache({
        onError: (error) => {
            reportApiError(error);
            logError(error, "Saving");
        },
        onSuccess: reportApiSuccess,
    }),
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

// What the calendar needs, so it can still be read offline (view only).
keepOffline(queryClient, [meQuery.queryKey, propertiesQuery.queryKey, allUnitsQuery.queryKey, allReservationsQuery.queryKey]);

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <ToastProvider notices={<AppNotices />}>
                        <App />
                    </ToastProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>
);