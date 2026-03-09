import SketchGitApp from "../components/SketchGitApp";
import { ErrorBoundary } from "../components/ErrorBoundary";

export default function HomePage() {
  return (
    <ErrorBoundary>
      <SketchGitApp />
    </ErrorBoundary>
  );
}
