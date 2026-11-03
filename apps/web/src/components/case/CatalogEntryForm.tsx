"use client";

import { useState, useTransition } from "react";
import { createCatalogEntry } from "@/app/(app)/faelle/[id]/actions";
import { Button, Field, inputClass, Notice } from "../ui";

export interface CatalogOption {
  insurers: Array<{ id: string; name: string }>;
  tariffs: Array<{ id: string; insurerId: string; name: string; code: string | null }>;
}

export function CatalogEntryForm({ caseId, catalog, defaults }: { caseId: string | null; catalog: CatalogOption; defaults: { insurer?: string; tariffName?: string; tariffCode?: string; generation?: string; layer?: string; productType?: string } }) {
  const [insurerId, setInsurerId] = useState("");
  const [tariffId, setTariffId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tariffs = catalog.tariffs.filter((t) => t.insurerId === insurerId);
  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await createCatalogEntry(caseId, fd);
          setError(r.error ?? null);
        })
      }
      className="space-y-3"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Versicherer">
          <select name="insurer_id" value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setTariffId(""); }} className={inputClass}>
            <option value="">– neu anlegen –</option>
            {catalog.insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        {!insurerId && (
          <Field label="Neuer Versicherer">
            <input name="insurer_name" defaultValue={defaults.insurer} className={inputClass} />
          </Field>
        )}
        <Field label="Tarif">
          <select name="tariff_id" value={tariffId} onChange={(e) => setTariffId(e.target.value)} className={inputClass}>
            <option value="">– neu anlegen –</option>
            {tariffs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.code ? ` (${t.code})` : ""}
              </option>
            ))}
          </select>
        </Field>
        {!tariffId && (
          <>
            <Field label="Tarifname">
              <input name="tariff_name" defaultValue={defaults.tariffName} className={inputClass} />
            </Field>
            <Field label="Tarifkürzel">
              <input name="tariff_code" defaultValue={defaults.tariffCode} className={inputClass} />
            </Field>
            <Field label="Schicht">
              <select name="layer" defaultValue={defaults.layer ?? "layer3"} className={inputClass}>
                <option value="riester">Riester</option>
                <option value="basis">Basisrente</option>
                <option value="layer3">Schicht 3</option>
                <option value="bav">bAV</option>
              </select>
            </Field>
            <Field label="Produktart">
              <select name="product_type" defaultValue={defaults.productType ?? "fonds"} className={inputClass}>
                <option value="fonds">Fondsgebunden</option>
                <option value="klassisch">Klassisch</option>
                <option value="hybrid">Hybrid</option>
                <option value="index">Index</option>
                <option value="sonstige">Sonstige</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Generation / Bedingungsstand" hint="z. B. „2015“ oder „Stand 01.2019“">
          <input name="generation_label" defaultValue={defaults.generation} required className={inputClass} />
        </Field>
        <Field label="gültig ab (optional)">
          <input name="valid_from" type="date" className={inputClass} />
        </Field>
        <Field label="gültig bis (optional)">
          <input name="valid_to" type="date" className={inputClass} />
        </Field>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button type="submit" disabled={pending}>
        {caseId ? "Anlegen und diesem Fall zuordnen" : "Anlegen"}
      </Button>
    </form>
  );
}
