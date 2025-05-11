import { HeroSection } from "./hero-section";
import { FeaturesSection } from "./features-section";
import { TestimonialsSection } from "./testimonials-section";
import { CtaSection } from "./cta-section";

export function Home() {
  return (
    <div className="flex flex-col w-full">
      <HeroSection />
      <FeaturesSection />
      <TestimonialsSection />
      <CtaSection />
    </div>
  );
}