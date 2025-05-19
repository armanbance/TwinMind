import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HomeLayout } from "./HomeLayout"; // Adjusted path, renamed component
import { MemoriesTab } from "./tabs/MemoriesTab"; // Adjusted path
import { CalendarTab } from "./tabs/CalendarTab"; // Adjusted path
import { QuestionsTab } from "./tabs/QuestionsTab"; // Adjusted path
import { CaptureButton } from "./home-page-components/capture-button"; // Adjusted path
import { CalendarComponent } from "./home-page-components/calendar-component";
import { UpcomingMeetings } from "./home-page-components/upcoming-meetings";

// Ensure Tab type is consistent or imported if defined centrally
type Tab = "memories" | "calendar" | "questions";

export function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("memories");
  const [meetingsListVersion, setMeetingsListVersion] = useState(0);

  const triggerMeetingsListRefresh = () => {
    setMeetingsListVersion((prevVersion) => prevVersion + 1);
  };

  return (
    <HomeLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {" "}
      {/* Using HomeLayout */}
      <div className="flex flex-col h-full max-w-2xl mx-auto w-full px-4">
        <div className="flex-1 overflow-auto">
          {activeTab === "memories" && (
            <MemoriesTab listVersion={meetingsListVersion} />
          )}
          {activeTab === "calendar" && <CalendarTab />}
          {activeTab === "questions" && <QuestionsTab />}
        </div>
        <div className="sticky bottom-0 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <CaptureButton
            onMeetingSuccessfullyEnded={triggerMeetingsListRefresh}
          />
        </div>
      </div>
    </HomeLayout>
  );
}
