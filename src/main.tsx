import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const Phone = lazy(() =>
  import("./camera/Phone").then((m) => ({ default: m.Phone })),
);
import "katex/dist/katex.min.css";
import "./style.css";

class Boundary extends React.Component<
  React.PropsWithChildren,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Let’s reopen the notebook.</h1>
        <p>
          The interface encountered an error. Your saved lessons are still on
          this computer.
        </p>
        <button onClick={() => location.reload()}>Reload Margin</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <Suspense
      fallback={
        <main className="opening">
          <span className="brand-mark">M</span>
          <p>Opening Margin…</p>
        </main>
      }
    >
      {location.pathname === "/phone" ? <Phone /> : <App />}
    </Suspense>
  </Boundary>,
);
