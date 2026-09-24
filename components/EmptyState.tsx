export default function EmptyState({ emoji = '🎉', title, text }: { emoji?: string; title: string; text?: string }) {
  return (
    <div className="cs-empty">
      <div className="e" aria-hidden>{emoji}</div>
      <div className="t">{title}</div>
      {text && <div className="s">{text}</div>}
    </div>
  );
}
