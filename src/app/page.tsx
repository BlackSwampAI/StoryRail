export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="intro" aria-labelledby="storyrail-title">
        <p className="eyebrow">Editorial control plane</p>
        <h1 id="storyrail-title">StoryRail</h1>
        <p className="purpose">
          Turn raw sources into researched, reviewed, publishable stories through a visible agentic
          editorial workflow.
        </p>
        <p className="status" role="status">
          <span aria-hidden="true" />
          Pre-alpha foundation
        </p>
      </section>
    </main>
  );
}
