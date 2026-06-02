import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

type DestinationLink = {
  label: string;
  to: string;
  description: string;
};

const NotFound = () => {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  const destinations: DestinationLink[] = [
    { label: "Chat with Viva", to: "/", description: "Plan your wedding with our AI" },
    { label: "Pricing", to: "/pricing", description: "Plans, tokens & PayU checkout" },
    { label: "Help & FAQ", to: "/help", description: "Common questions and guides" },
    ...(user?.uid
      ? [
          {
            label: "My planner",
            to: `/${user.uid}/planner`,
            description: "Checklists and tasks",
          },
        ]
      : [
          { label: "Sign in", to: "/login", description: "Access your saved plans" },
        ]),
    { label: "Privacy", to: "/privacy", description: "How we handle your data" },
    { label: "Terms", to: "/terms", description: "Terms of service" },
  ];

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    }
  };

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center px-4 py-12">
      <div className="text-center w-full max-w-2xl">
        <h1 className="text-4xl font-bold mb-4 text-foreground/90">404</h1>
        <p className="text-xl text-foreground/60 mb-2">Oops! Page not found</p>
        <p className="text-sm text-foreground/50 mb-6 break-all">
          We couldn't find <code className="px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/70 text-xs">{location.pathname}</code>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Return to Home
          </Link>
          {window.history.length > 1 && (
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center justify-center rounded-md border border-foreground/20 px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 transition-colors"
            >
              Go back
            </button>
          )}
        </div>

        <div className="border-t border-foreground/10 pt-6 text-left">
          <h2 className="text-sm font-semibold text-foreground/70 mb-3 text-center">
            Popular destinations
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {destinations.map((dest) => (
              <li key={dest.to}>
                <Link
                  to={dest.to}
                  className="block rounded-md px-3 py-2 hover:bg-foreground/5 transition-colors group"
                >
                  <div className="text-sm font-medium text-primary group-hover:text-primary/80 underline-offset-2 group-hover:underline">
                    {dest.label}
                  </div>
                  <div className="text-xs text-foreground/50 mt-0.5">
                    {dest.description}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
