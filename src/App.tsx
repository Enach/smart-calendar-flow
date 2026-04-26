import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { ToastViewport } from "./components/Toast";
import { GlobalProgressBar } from "./components/GlobalProgressBar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GlobalProgressBar />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    <ToastViewport />
  </QueryClientProvider>
);

export default App;
