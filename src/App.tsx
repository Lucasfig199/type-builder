import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import NotFound from "./pages/NotFound";
import Operations from "./pages/Operations";
import OperationWorkspace from "./pages/OperationWorkspace";
import Telegrams from "./pages/Telegrams";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ReactFlowProvider>
          <Routes>
            <Route path="/" element={<Operations />} />
            <Route path="/op/:operationId" element={<OperationWorkspace />} />
            <Route path="/op/:operationId/telegrams" element={<Telegrams />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ReactFlowProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;