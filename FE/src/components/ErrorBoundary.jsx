import { Component, useEffect } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button, ArrowIcon } from "./ui/button";
import { reportError } from "../lib/reportError";

function ErrorScreen({ title, message, children }) {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center gap-5 py-20">
      <h1 className="text-[clamp(2rem,3.4vw,2.75rem)] leading-tight">{title}</h1>
      <p className="max-w-lg text-lg">{message}</p>
      {children}
    </div>
  );
}

// Route-level errors: render failures and failed lazy-chunk loads (e.g. after a deploy).
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) reportError(error, { kind: "route" });
  }, [error, notFound]);
  if (notFound) {
    return <ErrorScreen title="Page not found" message="The page you’re looking for doesn’t exist or has moved." />;
  }
  const chunkFailed = /dynamically imported module|Loading chunk/i.test(String(error?.message));
  return (
    <ErrorScreen
      title={chunkFailed ? "A new version is available" : "Something went wrong"}
      message={chunkFailed ? "Please reload the page to get the latest version of the store." : "We couldn’t load this page. Please try again."}
    >
      <div className="flex flex-wrap gap-3">
        <Button variant="brown" onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button as={Link} to="/" variant="outline">
          Back to home
        </Button>
      </div>
    </ErrorScreen>
  );
}

// Last-resort boundary around the whole app; crashes are reported to the API log.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { kind: "render", componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <ErrorScreen title="Something went wrong" message="Please reload the page. If this keeps happening, contact care@manushyam.com.">
        <Button variant="gold" size="lg" onClick={() => window.location.assign("/")}>
          Back to home <ArrowIcon />
        </Button>
      </ErrorScreen>
    );
  }
}
