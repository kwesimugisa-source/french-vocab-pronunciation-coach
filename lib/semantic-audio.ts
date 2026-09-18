import { localNoise } from "./procedural-ambience";
export const ENVIRONMENT_LABELS = {
  none: "Aucune", neutral_room: "Pièce calme", office: "Bureau", cafe: "Café",
  classroom: "Salle de classe", kitchen: "Cuisine", fireplace: "Cheminée",
  rain: "Pluie douce", thunderstorm: "Orage", wind: "Vent", forest: "Forêt",
  garden_birds: "Jardin et oiseaux", seaside: "Bord de mer", night_insects: "Insectes nocturnes",
  street: "Rue", traffic: "Circulation", market: "Marché", station: "Gare",
  crowd: "Foule", theatre_auditorium: "Salle de théâtre", tavern: "Taverne",
  ballroom: "Salle de bal", church: "Église", distant_battlefield: "Champ de bataille lointain",
  harbour_ship: "Port ou navire", rural_village: "Village rural",
} as const;

export type EnvironmentKind = keyof typeof ENVIRONMENT_LABELS;
export type EnvironmentId = `environment.${Exclude<EnvironmentKind, "none" | "station" | "street">}` | "environment.train_station" | "environment.street_city";
export const SFX_IDS = ["sfx.train_arriving", "sfx.train_departing", "sfx.train_brakes", "sfx.train_doors", "sfx.phone_ring", "sfx.door_knock", "sfx.footsteps", "sfx.thunder"] as const;
export type SfxId = typeof SFX_IDS[number];
export type SemanticAudioId = EnvironmentId | SfxId;
export type AudioSource = Blob | null | Promise<Blob | null>;
/** Resolvers are trusted application code, never filenames/URLs supplied by AI. */
export type AudioProvider = { kind: "procedural" | "bundled" | "approved-remote"; resolve: () => AudioSource };
export type SemanticAudioEntry = {
  id: SemanticAudioId; category: "ambience" | "sfx"; label: string;
  provider: AudioProvider | null; defaultGain: number; loop: boolean;
  aliases: readonly string[]; tags: readonly string[];
};
export function environmentId(kind: EnvironmentKind): EnvironmentId | null {
  if (kind === "none" || !Object.hasOwn(ENVIRONMENT_LABELS, kind)) return null;
  return kind === "station" ? "environment.train_station" : kind === "street" ? "environment.street_city" : ("environment."+kind) as EnvironmentId;
}
const providers: Partial<Record<EnvironmentKind, AudioProvider>> = {
  rain: {kind:"procedural",resolve:()=>localNoise("rain")},
  neutral_room: {kind:"procedural",resolve:()=>localNoise("room")},
  office: {kind:"procedural",resolve:()=>localNoise("office")},
  station: {kind:"procedural",resolve:()=>localNoise("station")},
};
const environments: SemanticAudioEntry[] = (Object.keys(ENVIRONMENT_LABELS) as EnvironmentKind[]).filter(k=>k!=="none").map(kind=>({
  id:environmentId(kind)!, category:"ambience", label:ENVIRONMENT_LABELS[kind],
  provider:providers[kind] ?? null, defaultGain:0.16, loop:true, aliases:[kind], tags:["environment"],
}));
const effects: SemanticAudioEntry[] = SFX_IDS.map(id=>({
  id,category:"sfx",label:id.slice(4),provider:null,defaultGain:0.5,loop:false,aliases:[],tags:["event"],
}));
/** Extending this list/provider map does not change parsing or narration ownership. */
export const SEMANTIC_AUDIO_REGISTRY: readonly SemanticAudioEntry[] = [...environments,...effects];
export class SemanticAudioRegistry {
  private entries: Map<SemanticAudioId, SemanticAudioEntry>;
  constructor(definitions: readonly SemanticAudioEntry[]) {
    this.entries = new Map();
    for (const entry of definitions) {
      if (!/^(environment|sfx)\.[a-z_]+$/.test(entry.id) || this.entries.has(entry.id) ||
        entry.category !== (entry.id.startsWith("environment.") ? "ambience" : "sfx") ||
        entry.loop !== (entry.category === "ambience") || !Number.isFinite(entry.defaultGain) ||
        entry.defaultGain < 0 || entry.defaultGain > 1) throw new Error("Registre audio invalide.");
      this.entries.set(entry.id, entry);
    }
  }
  lookup(id: unknown): SemanticAudioEntry | undefined { return typeof id === "string" ? this.entries.get(id as SemanticAudioId) : undefined; }
  resolve(id: unknown): AudioSource {
    const entry=this.lookup(id);
    if (!entry?.provider) return null;
    try {
      const result=entry.provider.resolve();
      return result instanceof Promise ? result.catch(()=>null) : result;
    } catch { return null; }
  }
}
const registry = new SemanticAudioRegistry(SEMANTIC_AUDIO_REGISTRY);
export function semanticAudioEntry(id: unknown): SemanticAudioEntry | undefined { return registry.lookup(id); }
export function isSemanticAudioId(id: unknown): id is SemanticAudioId { return !!semanticAudioEntry(id); }
export function resolveSemanticAudio(id: unknown): AudioSource { return registry.resolve(id); }
export function environmentAudioEntry(kind: EnvironmentKind): SemanticAudioEntry | undefined { return semanticAudioEntry(environmentId(kind)); }
