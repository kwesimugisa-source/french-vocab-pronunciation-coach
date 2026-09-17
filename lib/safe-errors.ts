export const RATE_MESSAGE = "Trop de demandes rapprochées. Patientez quelques instants, puis réessayez.";
export function requestError(status: number, operation: "reading" | "pronunciation" | "vocabulary") {
  if(status===429) return RATE_MESSAGE;
  if(status===413) return operation==="reading" ? "La demande audio est trop volumineuse. Limite hors théâtre : 4096 caractères par passage ou tour de parole. Raccourcissez le texte." : "La demande est trop volumineuse. Utilisez un passage ou un enregistrement plus court.";
  if(status===400) return "Le contenu de cette demande est invalide. Vérifiez le texte puis réessayez.";
  return operation==="reading" ? "Échec de la génération audio. Aucun passage incomplet ne sera lu." : operation==="pronunciation" ? "Impossible d’analyser la prononciation. Réessayez." : "Analyse indisponible pour le moment. Réessayez.";
}
