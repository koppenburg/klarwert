import Link from "next/link";
import type { GateResult } from "@klarwert/extraction";
import { Notice } from "@/components/ui";

/** Gate nicht erfüllt: Meldungen statt Zahlen. */
export function GateNotice({ gate, caseId, what = "Berechnung" }: { gate: GateResult; caseId: string; what?: string }) {
  return (
    <Notice tone="warn" title={`Keine ${what} ohne vollständig bestätigte Vertragsdaten und Kostenfaktoren`}>
      <ul className="list-disc space-y-1 pl-5">
        {gate.messages.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <p className="mt-2">
        Weiter zu{" "}
        <Link className="text-brand underline" href={`/faelle/${caseId}?schritt=erkennung`}>
          Erkennung
        </Link>{" "}
        bzw.{" "}
        <Link className="text-brand underline" href={`/faelle/${caseId}?schritt=kosten`}>
          Kostenfaktoren
        </Link>
        .
      </p>
    </Notice>
  );
}
