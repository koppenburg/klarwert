"use client";

import { useTransition } from "react";
import { assignGeneration } from "@/app/(app)/faelle/[id]/actions";
import { Button } from "../ui";

export function AssignButton({ caseId, generationId, label = "Zuordnen" }: { caseId: string; generationId: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} onClick={() => start(() => assignGeneration(caseId, generationId, true))}>
      {pending ? "…" : label}
    </Button>
  );
}
