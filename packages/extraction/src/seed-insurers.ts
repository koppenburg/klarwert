/**
 * Startliste deutscher Lebensversicherer mit gebräuchlichen Kurzformen für das Matching.
 * Nur Namen und Aliase – keine Tarif- oder Kostendaten. Erweiterung erfolgt in der Bibliothek.
 */
export const SEED_INSURERS: ReadonlyArray<{ name: string; aliases: string[] }> = [
  { name: "Allianz Lebensversicherungs-AG", aliases: ["Allianz", "Allianz Leben"] },
  { name: "Alte Leipziger Lebensversicherung a.G.", aliases: ["Alte Leipziger", "ALH", "ARLP", "AL Leben"] },
  { name: "AXA Lebensversicherung AG", aliases: ["AXA"] },
  { name: "Canada Life Assurance Europe plc", aliases: ["Canada Life"] },
  { name: "Condor Lebensversicherung AG", aliases: ["Condor"] },
  { name: "Continentale Lebensversicherung AG", aliases: ["Continentale"] },
  { name: "Debeka Lebensversicherungsverein a.G.", aliases: ["Debeka"] },
  { name: "DEVK Lebensversicherungsverein a.G.", aliases: ["DEVK"] },
  { name: "Die Bayerische (Bayerische Beamten Lebensversicherung a.G.)", aliases: ["Die Bayerische", "BBL", "Bayerische"] },
  { name: "ERGO Vorsorge Lebensversicherung AG", aliases: ["ERGO", "ERGO Vorsorge"] },
  { name: "Generali Deutschland Lebensversicherung AG", aliases: ["Generali", "AachenMünchener"] },
  { name: "Gothaer Lebensversicherung AG", aliases: ["Gothaer"] },
  { name: "Hannoversche Lebensversicherung AG", aliases: ["Hannoversche", "Hannoversche Leben"] },
  { name: "HDI Lebensversicherung AG", aliases: ["HDI", "HDI Leben"] },
  { name: "HanseMerkur Lebensversicherung AG", aliases: ["HanseMerkur"] },
  { name: "IDEAL Lebensversicherung a.G.", aliases: ["IDEAL"] },
  { name: "LV 1871 (Lebensversicherung von 1871 a.G. München)", aliases: ["LV 1871", "LV1871"] },
  { name: "NÜRNBERGER Lebensversicherung AG", aliases: ["Nürnberger", "Nuernberger"] },
  { name: "R+V Lebensversicherung AG", aliases: ["R+V", "RuV", "R und V"] },
  { name: "SIGNAL IDUNA Lebensversicherung a.G.", aliases: ["Signal Iduna"] },
  { name: "Stuttgarter Lebensversicherung a.G.", aliases: ["Stuttgarter", "Die Stuttgarter"] },
  { name: "Swiss Life AG, Niederlassung für Deutschland", aliases: ["Swiss Life", "SwissLife"] },
  { name: "VOLKSWOHL BUND Lebensversicherung a.G.", aliases: ["Volkswohl Bund", "VWB"] },
  { name: "Württembergische Lebensversicherung AG", aliases: ["Württembergische", "WürttLeben"] },
  { name: "WWK Lebensversicherung a.G.", aliases: ["WWK"] },
  { name: "Zurich Deutscher Herold Lebensversicherung AG", aliases: ["Zurich", "Deutscher Herold"] },
];
