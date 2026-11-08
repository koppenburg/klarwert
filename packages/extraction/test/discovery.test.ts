import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { expect, it } from "vitest";
import { discoveryUserPrompt, TariffDiscovery } from "../src/index";

it("Recherche-Schema lässt sich als strukturierte Ausgabe übersetzen, Prompt nennt Versicherer und Aliase", () => {
  expect(() => betaZodOutputFormat(TariffDiscovery)).not.toThrow();
  const p = discoveryUserPrompt({ insurer: "Alte Leipziger Lebensversicherung a.G.", aliases: ["ALH", "ARLP"], layers: ["layer3", "basis"], today: "2026-11-08" });
  expect(p).toContain("Alte Leipziger");
  expect(p).toContain("ARLP");
  expect(p).toContain("2026-11-08");
});
