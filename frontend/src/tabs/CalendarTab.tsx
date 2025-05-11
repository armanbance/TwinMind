import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext"; // Adjusted path
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

interface CalendarEvent {
  id: string;
  summary: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function CalendarTab() {
  const { tokenResponse, isAuthenticated } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && tokenResponse?.access_token) {
      const fetchEvents = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const now = new Date();
          const timeMin = now.toISOString();
          const timeMax = new Date(
            now.setDate(now.getDate() + 7)
          ).toISOString(); // Next 7 days

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
            {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`,
              },
            }
          );

          if (!response.ok) {
            const errorData = await response.json();
            console.error("Google Calendar API error:", errorData);
            throw new Error(
              errorData.error?.message || "Failed to fetch calendar events"
            );
          }

          const data = await response.json();
          setEvents(data.items || []);
        } catch (err: unknown) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("An unexpected error occurred.");
          }
          setEvents([]); // Clear events on error
        }
        setIsLoading(false);
      };

      fetchEvents();
    }
  }, [tokenResponse, isAuthenticated]);

  const formatDate = (dateString?: string, isAllDay?: boolean) => {
    if (!dateString) return "N/A";
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    if (!isAllDay) {
      options.hour = "numeric";
      options.minute = "numeric";
      options.hour12 = true;
    }
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  if (!isAuthenticated) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Not Authenticated</AlertTitle>
        <AlertDescription>
          Please log in to view your calendar.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading calendar events...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Calendar</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {events.length === 0 && !isLoading && (
        <p className="text-center text-muted-foreground py-10">
          No upcoming events in the next 7 days.
        </p>
      )}
      {events.map((event) => {
        const isAllDay = !event.start?.dateTime;
        return (
          <Card key={event.id}>
            <CardHeader>
              <CardTitle className="text-lg">
                {event.summary || "(No title)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                Start:{" "}
                {formatDate(
                  event.start?.dateTime || event.start?.date,
                  isAllDay
                )}
              </p>
              <p>
                End:{" "}
                {formatDate(event.end?.dateTime || event.end?.date, isAllDay)}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
