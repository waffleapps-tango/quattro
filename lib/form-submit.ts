import { startTransition, type FormEvent } from "react";

// React 19 resets a <form action={...}> after every action, failed ones included.
// Radix Select/Switch listen for that reset and snap back to their initial value,
// so a validation error would wipe the user's choices. Submitting through onSubmit
// skips the automatic reset; forms clear their own state on success.
export function submitKeepingValues(dispatch: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
}
