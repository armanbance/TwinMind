import { Card, CardContent } from "@/components/ui/card";

const memories = [
  {
    date: "Today",
    entries: [
      { id: 1, title: "Morning Reflection", time: "09:00 AM", duration: "30m" },
      { id: 2, title: "Project Planning", time: "11:30 AM", duration: "45m" },
    ],
  },
  {
    date: "Yesterday",
    entries: [
      { id: 3, title: "Reading Notes", time: "02:00 PM", duration: "1h" },
      { id: 4, title: "Meeting Summary", time: "04:30 PM", duration: "25m" },
    ],
  },
];

export function MemoriesTab() {
  return (
    <div className="space-y-6">
      {memories.map((group) => (
        <div key={group.date}>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            {group.date}
          </h3>
          <div className="space-y-3">
            {group.entries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{entry.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {entry.time}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {entry.duration}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
