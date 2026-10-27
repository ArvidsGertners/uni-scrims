"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { defaultEntries, formSnapshot } from "@/lib/form-snapshot";

// GET filter forms whose "Filtern" stays greyed until a field differs from the applied filter
// (SPEC N-30, §5.32).

type FormChange = { notify: () => void; changed: boolean; hydrated: boolean };

const FormChangeContext = createContext<FormChange | null>(null);

const noSubscription = () => () => {};

/**
 * For fields whose form value sits in a hidden input set by React, which fires no DOM event
 * (Base UI select, date picker): compares the form again after each change of `value`. Does
 * nothing outside a FilterForm.
 */
export function useFormChangeNotify(value: unknown) {
  const notify = useContext(FormChangeContext)?.notify;
  useEffect(() => {
    notify?.();
  }, [notify, value]);
}

/**
 * The GET filter form; the caller keys it by the applied filter, so the rendered values are the
 * applied filter, including the board's fallback to the own team rank.
 */
export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef<string | null>(null);
  const [changed, setChanged] = useState(false);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // Before the snapshot at mount (children's effects run first) there is nothing to compare.
  const notify = useCallback(() => {
    const form = formRef.current;
    if (!form || initial.current === null) return;
    setChanged(formSnapshot(new FormData(form)) !== initial.current);
  }, []);

  // Compares right away: something typed or ticked before hydration is a change.
  useEffect(() => {
    if (formRef.current) initial.current = formSnapshot(defaultEntries(formRef.current));
    notify();
  }, [notify]);

  const state = useMemo(() => ({ notify, changed, hydrated }), [notify, changed, hydrated]);

  return (
    <FormChangeContext value={state}>
      <form
        ref={formRef}
        method="get"
        action={action}
        // The browser would otherwise restore values after a reload that differ from the filter.
        autoComplete="off"
        // React's onChange fires on every input of the search field and on each checkbox click.
        onChange={notify}
        className={className}
      >
        {children}
      </form>
    </FormChangeContext>
  );
}

/** "Filtern": greyed after hydration while the form equals the applied filter; always on without JS. */
export function FilterSubmit({ children }: { children: ReactNode }) {
  const state = useContext(FormChangeContext);
  return (
    <Button
      type="submit"
      variant="outline"
      className="px-[18px]"
      disabled={state !== null && state.hydrated && !state.changed}
    >
      {children}
    </Button>
  );
}
