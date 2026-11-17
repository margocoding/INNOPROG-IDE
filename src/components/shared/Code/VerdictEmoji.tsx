import { useState } from "react";
import { pickVerdictEmoji } from "../../../utils/verdictEmoji";

export default function VerdictEmoji({ correct = false, value }: { correct?: boolean; value?: string }) {
  const [fallback] = useState(() => value ?? pickVerdictEmoji(correct));
  return <span aria-hidden="true"> {value ?? fallback}</span>;
}
