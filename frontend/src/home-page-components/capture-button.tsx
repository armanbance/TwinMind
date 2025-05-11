import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CaptureButton() {
  return (
    <div className="flex justify-center">
      <Button
        size="icon"
        className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
      >
        <Mic className="h-6 w-6" />
        <span className="sr-only">Capture</span>
      </Button>
    </div>
  );
}
