import { type FormEvent, startTransition } from "react";

/**
 * Submits a form through its action without React's automatic form reset, so the inputs keep
 * their values when core rejects them. The form's `action` prop stays as the fallback without
 * JavaScript.
 */
export function submitKeepingValues(
  event: FormEvent<HTMLFormElement>,
  dispatch: (formData: FormData) => void,
): void {
  event.preventDefault();
  const submitter = (event.nativeEvent as SubmitEvent).submitter;
  const formData = new FormData(event.currentTarget, submitter);
  startTransition(() => dispatch(formData));
}
