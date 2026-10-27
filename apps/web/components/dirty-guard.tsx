"use client";

import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMessages } from "@/components/locale-provider";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { dirtyGuardMessages } from "@/i18n/client";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { defaultEntries, formSnapshot } from "@/lib/form-snapshot";

// Asks before a route dialog with unsaved changes closes (SPEC N-31, §5.33).

type GuardedForm = {
  form: () => HTMLFormElement | null;
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  /** The form creates something: the prompt offers "Absenden und verlassen". */
  create: boolean;
};

type DirtyGuard = {
  register: (entry: GuardedForm) => () => void;
  isDirty: () => boolean;
  /** Runs `proceed` right away without changes, else after the prompt's answer. */
  leave: (proceed: () => void) => void;
};

const DirtyGuardContext = createContext<DirtyGuard | null>(null);

export function useDirtyGuardLeave(): Pick<DirtyGuard, "isDirty" | "leave"> {
  const guard = useContext(DirtyGuardContext);
  if (!guard) throw new Error("useDirtyGuardLeave outside a DirtyGuardProvider");
  return guard;
}

function documentOrder(a: GuardedForm, b: GuardedForm): number {
  const formA = a.form();
  const formB = b.form();
  if (!formA || !formB) return 0;
  return formA.compareDocumentPosition(formB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  const t = useMessages(dirtyGuardMessages);
  const entries = useRef(new Set<GuardedForm>());
  // Kept after closing, so the prompt keeps its text while it closes.
  const [prompt, setPrompt] = useState<{ proceed: () => void; create: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef<HTMLButtonElement>(null);

  const dirtyForms = useCallback(
    () => [...entries.current].filter((entry) => entry.isDirty()).sort(documentOrder),
    [],
  );

  const guard = useMemo<DirtyGuard>(
    () => ({
      register(entry) {
        entries.current.add(entry);
        return () => {
          entries.current.delete(entry);
        };
      },
      isDirty: () => dirtyForms().length > 0,
      leave(proceed) {
        const dirty = dirtyForms();
        if (dirty.length === 0) {
          proceed();
          return;
        }
        setPrompt({ proceed, create: dirty.some((entry) => entry.create) });
        setOpen(true);
      },
    }),
    [dirtyForms],
  );

  // Reloading or leaving the site: the browser's own question.
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (dirtyForms().length > 0) event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyForms]);

  async function saveAndLeave() {
    if (!prompt || saving) return;
    setSaving(true);
    const address = window.location.href;
    for (const entry of dirtyForms()) {
      // Stays open at the first failure; the error shows at its form.
      if (!(await entry.save())) {
        setSaving(false);
        setOpen(false);
        return;
      }
    }
    setSaving(false);
    setOpen(false);
    // A creating action has already led on to its page.
    if (window.location.href === address) prompt.proceed();
  }

  function leaveWithoutSaving() {
    setOpen(false);
    prompt?.proceed();
  }

  return (
    <DirtyGuardContext value={guard}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => (saving ? undefined : setOpen(next))}>
        <AlertDialogContent initialFocus={saveRef}>
          <AlertDialogTitle className="text-pretty">{t.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <p>{prompt?.create ? t.textCreate : t.text}</p>
          </AlertDialogDescription>
          <div className="flex flex-col gap-2">
            <Button
              ref={saveRef}
              size="sm"
              className="w-full"
              disabled={saving}
              onClick={saveAndLeave}
            >
              {prompt?.create ? t.submitAndLeave : t.saveAndLeave}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={saving}
              onClick={leaveWithoutSaving}
            >
              {t.leaveWithoutSaving}
            </Button>
            <AlertDialogClose
              disabled={saving}
              className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full" })}
            >
              {t.cancel}
            </AlertDialogClose>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </DirtyGuardContext>
  );
}

/**
 * Registers a form of a route dialog: changed when its entries differ from those it was rendered
 * with (or last saved); `save` submits it and waits for the next action state. Call
 * `markDispatched` where the form hands its data to the action. Does nothing outside a dialog.
 */
export function useDirtyGuard({
  formRef,
  state,
  enabled = true,
  create = false,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  state: ActionState;
  enabled?: boolean;
  create?: boolean;
}): { markDispatched: () => void } {
  const guard = useContext(DirtyGuardContext);
  const baseline = useRef<string | null>(null);
  const dispatched = useRef(false);
  const pending = useRef<((saved: boolean) => void) | null>(null);

  useEffect(() => {
    if (formRef.current) baseline.current = formSnapshot(defaultEntries(formRef.current));
  }, [formRef]);

  // Each action state answers a submit; a saved form is the new starting point.
  useEffect(() => {
    if (state === initialActionState) return;
    if (state.done && formRef.current) {
      baseline.current = formSnapshot(new FormData(formRef.current));
    }
    pending.current?.(!state.error);
    pending.current = null;
  }, [state, formRef]);

  useEffect(() => {
    if (!guard || !enabled) return;
    const unregister = guard.register({
      form: () => formRef.current,
      create,
      isDirty() {
        const form = formRef.current;
        if (!form || baseline.current === null) return false;
        return formSnapshot(new FormData(form)) !== baseline.current;
      },
      save() {
        const form = formRef.current;
        if (!form) return Promise.resolve(true);
        if (!form.checkValidity()) {
          form.reportValidity();
          return Promise.resolve(false);
        }
        const saved = new Promise<boolean>((resolve) => {
          pending.current = resolve;
        });
        dispatched.current = false;
        // Runs the submit handler synchronously.
        form.requestSubmit();
        if (!dispatched.current) {
          // Stopped by the form's own checks (e.g. a logo too large), which show their message.
          pending.current = null;
          return Promise.resolve(false);
        }
        return saved;
      },
    });
    return () => {
      unregister();
      // A form that goes away with its action (a redirect) has done its job.
      pending.current?.(true);
      pending.current = null;
    };
  }, [guard, enabled, create, formRef]);

  return useMemo(
    () => ({
      markDispatched: () => {
        dispatched.current = true;
      },
    }),
    [],
  );
}
