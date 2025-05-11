import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5"
        aria-hidden="true"
      />

      {/* Background pattern */}
      <div
        className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxMTEiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptNiA2djZoNnYtNmgtNnptLTYgNnY2aDZ2LTZoLTZ6bTYgMHY2aDZ2LTZoLTZ6bTYtMTJ2NmgtNnY2aDZ2Nmg2di02aDZ2LTZoLTZ2LTZoLTZ6bS0xOCA2djZoNnYtNmgtNnoiLz48cGF0aCBkPSJNMjQgNDh2NmgtNnYtNmg2em0tNiA2djZoLTZ2LTZoNnptLTYgMHY2aC02di02aDZ6bTEyLTZ2NmgtNnY2aDZ2Nmg2di02aDZ2LTZoLTZ2LTZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')]"
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32 relative">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-bold text-4xl md:text-5xl lg:text-6xl tracking-tight mb-6 animate-fade-up">
            Connect and organize your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-500">
              thoughts
            </span>{" "}
            like never before
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 md:mb-12 max-w-2xl mx-auto animate-fade-up animation-delay-100">
            The intelligent platform that helps you capture, connect, and discover ideas in a whole new way.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-up animation-delay-200">
            <Button size="lg" className="gap-2 group">
              Get Started Free
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline">
              Watch Demo
            </Button>
          </div>

          {/* Browser mockup */}
          <div className="mt-12 md:mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 h-28 bottom-0"></div>
            <div className="relative rounded-xl overflow-hidden border border-border shadow-2xl animate-fade-up animation-delay-300">
              <div className="h-8 bg-muted/60 backdrop-blur-md flex items-center px-4 border-b border-border">
                <div className="flex gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                </div>
                <div className="ml-4 bg-background/50 rounded-md h-5 w-72 max-w-full mx-auto"></div>
              </div>
              <div className="aspect-video bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
                <div className="w-full max-w-3xl grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="h-24 rounded-lg bg-card border border-border shadow-sm flex items-center justify-center"
                    >
                      <div className="h-4 w-16 bg-muted rounded"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}