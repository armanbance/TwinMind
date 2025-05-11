import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

const testimonials = [
  {
    quote:
      "Twinmind has completely transformed how I organize my research. The connections it helps me discover are invaluable.",
    author: "Alex Morgan",
    role: "PhD Researcher",
    avatar: "AM",
  },
  {
    quote:
      "As a writer, keeping track of ideas and connections is crucial. Twinmind makes this intuitive and even enjoyable.",
    author: "Sam Chen",
    role: "Content Creator",
    avatar: "SC",
  },
  {
    quote:
      "The collaboration features alone make this worth it. My team's productivity has increased dramatically.",
    author: "Priya Sharma",
    role: "Project Manager",
    avatar: "PS",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Loved by thinkers worldwide
          </h2>
          <p className="text-lg text-muted-foreground">
            Join thousands of users who have transformed their thinking process
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <TestimonialCard key={index} testimonial={testimonial} />
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="flex flex-wrap justify-center gap-8">
            {["TechCrunch", "Forbes", "Wired", "Product Hunt", "Fast Company"].map(
              (company) => (
                <div
                  key={company}
                  className="text-xl font-semibold text-muted-foreground/50"
                >
                  {company}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface TestimonialCardProps {
  testimonial: {
    quote: string;
    author: string;
    role: string;
    avatar: string;
  };
}

function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm h-full">
      <CardContent className="pt-6">
        <blockquote className="text-lg italic">"{testimonial.quote}"</blockquote>
      </CardContent>
      <CardFooter>
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src="" alt={testimonial.author} />
            <AvatarFallback>{testimonial.avatar}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold">{testimonial.author}</div>
            <div className="text-sm text-muted-foreground">
              {testimonial.role}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}