import { Link } from "react-router";
import jutePouch from "../assets/content/jute-pouch.jpg";
import { Button, ArrowIcon } from "../components/ui/button";
import { Seo } from "../components/Seo";

export default function NotFound() {
  return (
    <div className="container-page grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
      <Seo title="Page not found" noindex />
      <div className="flex flex-col gap-5">
        <span className="font-display text-[clamp(6rem,12vw,10rem)] leading-[.9] text-gold-300" aria-hidden="true">
          404
        </span>
        <h1 className="text-[clamp(1.875rem,3vw,2.625rem)] leading-tight">This path has wandered off.</h1>
        <p className="max-w-md text-[17px]">The page you’re looking for doesn’t exist or has moved. Let’s get you back to your ritual.</p>
        <div className="mt-2 flex flex-wrap gap-3.5">
          <Button as={Link} to="/" variant="gold" size="lg">
            Back to home <ArrowIcon />
          </Button>
          <Button as={Link} to="/solutions" variant="outline" size="lg">
            Browse solutions
          </Button>
        </div>
      </div>
      <img src={jutePouch} alt="ManushyaM jute pouch with flowers" className="w-full rounded-b-lg rounded-t-[160px] border border-[#C9A063]" />
    </div>
  );
}
