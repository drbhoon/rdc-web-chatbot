/**
 * RDC's facts of record: the website, numbers and plant counts the bot must
 * state, whatever older documents in the knowledge base say.
 *
 * The documents disagreed with each other — four different websites and plant
 * counts of 100+, 130 and 145 — and the bot quoted whichever it retrieved, so
 * one conversation said 145 plants and the next line 130. These values come
 * from RDC (2026-09-27) and override the documents. Update knowledge/facts.json
 * when they change; the plant list is checked against the commercial count
 * when it is rebuilt (scripts/buildPlantKnowledge.py).
 */
import facts from "../../knowledge/facts.json";

export const FACTS = facts;

export const TARA_WHATSAPP_LINK = facts.tara.link;

/** The block placed at the top of every answer's instructions. */
export function factsOfRecord(): string {
  const dedicated = facts.plants.total - facts.plants.commercial;
  return [
    `- Official website: ${facts.website} (never quote any other RDC website).`,
    `- Head office: ${facts.headOffice.address}. Phone for calls: ${facts.headOffice.phone}.`,
    `- ${facts.tara.name} is RDC's WhatsApp assistant on ${facts.tara.whatsapp} (${facts.tara.link}), for ${facts.tara.handles}.`,
    `- Local plant phone numbers are listed on ${facts.contactPage}.`,
    `- Presence: RDC serves customers in ${facts.footprint.states} states, ${facts.footprint.unionTerritories} union territories and ${facts.footprint.cities} cities of India.`,
    `- Plants: RDC operates ${facts.plants.total} ready-mix concrete plants as on ${facts.asOf} — ${facts.plants.commercial} commercial plants and ${dedicated} dedicated plants built for specific customer projects.`,
  ].join("\n");
}
