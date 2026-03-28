import { ChatPage } from "@/components/ChatPage";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <ChatPage />
      </div>
    </TooltipProvider>
  );
}

export default App;
