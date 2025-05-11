import { Brain, CloudLightning as Lightning, Link2, Search, Shield, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-16 md:py-24 bg-muted/30"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Features that empower your thinking
          </h2>
          <p className="text-lg text-muted-foreground">
            Discover how Twinmind transforms the way you capture and connect your ideas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Brain />}
            title="AI-Powered Insights"
            description="Our intelligent algorithms analyze your notes and suggest connections you might have missed."
          />
          <FeatureCard
            icon={<Link2 />}
            title="Bidirectional Linking"
            description="Create powerful connections between your notes with our intuitive linking system."
          />
          <FeatureCard
            icon={<Lightning />}
            title="Real-time Collaboration"
            description="Work together with your team in real-time, seeing changes as they happen."
          />
          <FeatureCard
            icon={<Search />}
            title="Semantic Search"
            description="Find exactly what you're looking for with our advanced semantic search capabilities."
          />
          <FeatureCard
            icon={<Shield />}
            title="End-to-End Encryption"
            description="Your data is always secure with our robust end-to-end encryption."
          />
          <FeatureCard
            icon={<Sparkles />}
            title="Customizable Workspace"
            description="Personalize your workspace to match your unique workflow and preferences."
          />
        </div>
      </div>
    </section>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card className="border border-border bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors duration-300 h-full">
      <CardHeader>
        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
          {icon}
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}