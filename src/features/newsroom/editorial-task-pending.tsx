import styles from "./newsroom-shell.module.css";

export function EditorialTaskPending({
  label,
  headline,
  subtitle,
  headingId,
}: Readonly<{
  label: string;
  headline: string;
  subtitle: string;
  headingId?: string;
}>) {
  return (
    <section
      className={styles.progressCard}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby={headingId}
    >
      <span className={styles.progressMark} aria-hidden="true" />
      <div>
        <p className={styles.currentTaskLabel}>{label}</p>
        <h2 id={headingId}>{headline}</h2>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}
