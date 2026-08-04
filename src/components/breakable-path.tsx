export function BreakablePath({ value, className = "" }: { value: string; className?: string }) {
  const parts = value.split(/([\\/])/);

  return (
    <code className={className} title={value} dir="ltr" data-breakable-path="true">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {/^[\\/]$/.test(part) ? <wbr /> : null}
        </span>
      ))}
    </code>
  );
}
