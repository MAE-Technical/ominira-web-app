"use client";

import { useActionState } from "react";
import TextField from "@/app/components/auth/TextField";
import AuthButton from "@/app/components/auth/AuthButton";
import { unlockAdmin, type UnlockState } from "./actions";

export default function UnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockAdmin, { error: null });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        label="PIN"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={12}
        required
        autoFocus
        className="tracking-[0.3em]"
        error={state.error ?? undefined}
      />
      <AuthButton type="submit" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </AuthButton>
    </form>
  );
}
