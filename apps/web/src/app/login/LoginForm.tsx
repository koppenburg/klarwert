"use client";

import { useActionState } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { signIn } from "./actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {notice && <Notice tone="bad">{notice}</Notice>}
      {state?.error && <Notice tone="bad">{state.error}</Notice>}
      <Field label="E-Mail">
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <Field label="Passwort">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full justify-center">
        {pending ? "Anmeldung läuft …" : "Anmelden"}
      </Button>
    </form>
  );
}
