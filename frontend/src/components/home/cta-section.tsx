import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-indigo-600 p-8 md:p-10 lg:p-12">
          {/* Background pattern */}
          <div
            className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptNiA2djZoNnYtNmgtNnptLTYgNnY2aDZ2LTZoLTZ6bTYgMHY2aDZ2LTZoLTZ6bTYtMTJ2NmgtNnY2aDZ2Nmg2di02aDZ2LTZoLTZ2LTZoLTZ6bS0xOCA2djZoNnYtNmgtNnoiLz48cGF0aCBkPSJNMjQgNDh2NmgtNnYtNmg2em0tNiA2djZoLTZ2LTZoNnptLTYgMHY2aC02di02aDZ6bTEyLTZ2NmgtNnY2aDZ2Nmg2di02aDZ2LTZoLTZ2LTZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')]"
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
                Ready to transform your thinking?
              </h2>
              <p className="text-lg text-white/80">
                Join thousands of users who have already revolutionized the way they capture and connect ideas.
                Start for free today.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" variant="secondary" className="gap-2 group">
                Get Started Free
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}