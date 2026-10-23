"use client";

import { type ComponentProps, useState } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** Textarea with "optional · 0/200" in its label, counting while typing (design handoff). */
export function CountedTextarea({
  label,
  maxLength,
  optional = true,
  defaultValue,
  ...props
}: Omit<ComponentProps<"textarea">, "maxLength" | "defaultValue"> & {
  label: string;
  maxLength: number;
  optional?: boolean;
  defaultValue?: string;
}) {
  const [length, setLength] = useState(defaultValue?.length ?? 0);
  return (
    <Field label={label} hint={`${optional ? "optional · " : ""}${length}/${maxLength}`}>
      <Textarea
        maxLength={maxLength}
        defaultValue={defaultValue}
        onChange={(event) => setLength(event.target.value.length)}
        {...props}
      />
    </Field>
  );
}
