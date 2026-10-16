import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ToastProvider from "./components/ToastProvider";
import AppNotices from "./components/AppNotices";
import { reportApiError, reportApiSuccess } from "./lib/apiReachability";
import "./lib/pwa";
import "./index.css";

const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: reportApiError, onSuccess: reportApiSuccess }),
    mutationCache: new MutationCache({ onError: reportApiError, onSuccess: reportApiSuccess }),
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <ToastProvider notices={<AppNotices />}>
                    <App />
                </ToastProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>
);