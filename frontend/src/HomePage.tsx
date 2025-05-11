import { useState } from "react";
import { HomeLayout } from "./HomeLayout"; // Adjusted path, renamed component
import { MemoriesTab } from "./tabs/MemoriesTab"; // Adjusted path
import { CalendarTab } from "./tabs/CalendarTab"; // Adjusted path
import { QuestionsTab } from "./tabs/QuestionsTab"; // Adjusted path
import { SearchBar } from "./home-page-components/search-bar"; // Adjusted path
import { CaptureButton } from "./home-page-components/capture-button"; // Adjusted path

// Ensure Tab type is consistent or imported if defined centrally
type Tab = "memories" | "calendar" | "questions";

export function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("memories");

  return (
    <HomeLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {" "}
      {/* Using HomeLayout */}
      <div className="flex flex-col h-full max-w-2xl mx-auto w-full px-4">
        <div className="flex-1 overflow-auto">
          {activeTab === "memories" && <MemoriesTab />}
          {activeTab === "calendar" && <CalendarTab />}
          {activeTab === "questions" && <QuestionsTab />}
        </div>
        <div className="sticky bottom-0 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <SearchBar />
          <CaptureButton />
        </div>
      </div>
    </HomeLayout>
  );
}
