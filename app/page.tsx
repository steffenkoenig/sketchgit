import SketchGitApp from "../components/SketchGitApp";
import { AppErrorBoundary } from "../components/errors/AppErrorBoundary";

export default function HomePage() {
  return (
    <AppErrorBoundary>
      <SketchGitApp />
    </AppErrorBoundary>
  );
}
