import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchCalendarEvents, GoogleCalendarEvent } from "../lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export function CalendarTab() {
  const {
    isAuthenticated,
    getGoogleAccessToken,
    isLoading: isAuthLoading,
    user,
  } = useAuth();
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("[CalendarTab] Initial auth state: ", {
      isAuthenticated,
      isAuthLoading,
      user: !!user,
      hasGoogleToken: !!getGoogleAccessToken(),
    });

    if (!isAuthenticated || isAuthLoading || !user) {
      if (!isAuthLoading && !isAuthenticated && user === null) {
        setError("Please log in to view calendar events.");
      } else if (isAuthLoading) {
        // UI will show loader
      } else if (!user || !isAuthenticated) {
        setError("User not authenticated. Please log in.");
      }
      return;
    }

    const loadEvents = async () => {
      const googleToken = getGoogleAccessToken();
      if (!googleToken) {
        setError("Google access token not found. Please log in again.");
        setIsLoadingEvents(false);
        return;
      }

      setIsLoadingEvents(true);
      setError(null);
      try {
        console.log("[CalendarTab] Fetching calendar events...");
        const fetchedEvents = await fetchCalendarEvents(googleToken);
        setEvents(fetchedEvents || []);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message || "Failed to load calendar events.");
        } else {
          setError("An unknown error occurred while fetching calendar events.");
        }
        setEvents([]);
      } finally {
        setIsLoadingEvents(false);
      }
    };

    loadEvents();
  }, [isAuthenticated, getGoogleAccessToken, isAuthLoading, user]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoadingEvents) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading calendar events...</span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Alert className="my-4">
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please log in to see your calendar.</AlertDescription>
      </Alert>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-10">
        No upcoming events found in your primary calendar for the next 7 days.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h2 className="text-2xl font-semibold tracking-tight mb-4">
        Your Google Calendar Events (Next 7 Days)
      </h2>
      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id || Math.random().toString()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {event.summary || "(No Title)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {event.start?.dateTime && (
                <p>
                  {new Date(event.start.dateTime).toLocaleString()} -
                  {event.end?.dateTime
                    ? ` ${new Date(event.end.dateTime).toLocaleTimeString()}`
                    : ""}
                </p>
              )}
              {event.start?.date && (
                <p>
                  {new Date(event.start.date).toLocaleDateString()} (All day)
                </p>
              )}
              {event.description && (
                <p className="text-xs mt-1 truncate">{event.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
