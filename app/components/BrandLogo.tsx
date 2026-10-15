// The ProdBoard logo as a single image (icon + wordmark), pixel-exact from the
// brand asset. Two variants are rendered and CSS shows the right one per theme:
// the dark variant lightens only the "Prod" wordmark so it stays legible on dark
// surfaces. An optional sub caption sits beneath (e.g. the organization name).
export default function BrandLogo({ height = 26, sub }: { height?: number; sub?: string }) {
  return (
    <span className="pblogo">
      <span className="pblogo-imgs" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pblogo-img light" src="/prodboard-logo.png" alt="ProdBoard" style={{ height }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pblogo-img dark" src="/prodboard-logo-dark.png" alt="ProdBoard" style={{ height }} />
      </span>
      {sub ? <span className="pblogo-sub">{sub}</span> : null}
    </span>
  );
}
