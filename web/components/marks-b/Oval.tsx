/** A rough pen oval around a short word: today (docs/redesign/MARKS.md). Fixed path, so it never jitters. */
export function Oval(): React.JSX.Element {
  return (
    <svg className="mkb-oval" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M16 7C40 1 82 2 95 13C103 23 82 37 50 37C20 38 2 31 4 20C6 11 22 5 46 4" />
    </svg>
  )
}
