"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { submitVerificationAction } from "./actions";
import { OTHER_UNIVERSITY } from "./constants";

type University = { id: string; name: string; city: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function VerificationForm({ universities }: { universities: University[] }) {
  const [state, action, pending] = useActionState(submitVerificationAction, initialActionState);
  const [university, setUniversity] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="university">Hochschule</Label>
        <select
          id="university"
          name="university"
          required
          className={selectClass}
          value={university}
          onChange={(event) => setUniversity(event.target.value)}
        >
          <option value="" disabled>
            Bitte wählen …
          </option>
          {universities.map((uni) => (
            <option key={uni.id} value={uni.id}>
              {uni.name} ({uni.city})
            </option>
          ))}
          <option value={OTHER_UNIVERSITY}>Andere</option>
        </select>
      </div>
      {university === OTHER_UNIVERSITY ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="universityOther">Name und Ort deiner Hochschule</Label>
          <Input id="universityOther" name="universityOther" required maxLength={200} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="file">Immatrikulationsbescheinigung (PDF, JPG oder PNG, max. 5 MB)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-primary" />
        <span>
          Wir nutzen deine Bescheinigung nur, um zu prüfen, ob du studierst. Die Datei sehen nur
          Admins. Sie wird direkt nach der Prüfung gelöscht, spätestens nach 14 Tagen. Danach
          speichern wir nur Status, Hochschule, Dateityp, Dateigröße, einen Ablehnungsgrund, die
          Zeitpunkte und wer geprüft hat. Ich bin damit einverstanden.
        </span>
      </label>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Wird hochgeladen …" : "Hochladen"}
      </Button>
    </form>
  );
}
