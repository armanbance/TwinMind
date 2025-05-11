import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps = {}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-gradient-to-br from-primary to-indigo-600 p-1.5 rounded-md text-primary-foreground">
        <Brain className="h-5 w-5" />
      </div>
      <span className="font-bold text-xl tracking-tight">Twinmind</span>
    </div>
  );
}