import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Brain, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "./components/theme-toggle"; // Adjusted path
import { LogoutButton } from "./auth/LogoutButton"; // Adjusted path

// Define Tab type here or import from HomePage if it's exported
type TabValue = "memories" | "calendar" | "questions";

interface HomeLayoutProps {
  // Renamed from LayoutProps
  children: React.ReactNode;
  activeTab: TabValue;
  onTabChange: (value: TabValue) => void;
}

export function HomeLayout({
  children,
  activeTab,
  onTabChange,
}: HomeLayoutProps) {
  // Renamed function
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <span className="font-semibold">TwinMind</span>
              <Badge variant="secondary" className="ml-2">
                PRO
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <LogoutButton />
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Help</span>
            </a>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Building Your Second Brain</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={0} className="mb-2" />
            <p className="text-sm text-muted-foreground">
              Capture 100 Hours to Unlock Features
            </p>
          </CardContent>
        </Card>

        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as TabValue)}
          className="mb-6"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="memories">Memories</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
          </TabsList>
        </Tabs>

        {children}
      </div>
    </div>
  );
}
