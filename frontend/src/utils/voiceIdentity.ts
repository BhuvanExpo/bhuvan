export interface ParsedVoice {
  originalName: string; // The real-world person's name (e.g. "Aarav Sharma")
  spotName: string;     // The spot name (e.g. "MANAV — The Human Witness")
}

/**
 * 10 Official Example Real-World Person Names & Corresponding Spot Titles
 */
export const EXAMPLE_VOICES: Record<number, { realName: string; spotName: string }> = {
  1: { realName: "Aarav Sharma", spotName: "MANAV — The Human Witness" },
  2: { realName: "Devraj Patel", spotName: "TVASHTA — The System Builder" },
  3: { realName: "Dr. Tara Vasudev", spotName: "PRITHVI — The Biosphere" },
  4: { realName: "Vikramaditya Singhania", spotName: "KUBERA — The Treasury" },
  5: { realName: "Dr. Siddharth Menon", spotName: "ASHWIN — The Healer" },
  6: { realName: "Ananya Iyer", spotName: "ANNAPURNA — The Sustainer" },
  7: { realName: "Aditya Vardhan", spotName: "AGNI — The Grid & Spark" },
  8: { realName: "Prof. Vidya Narayanan", spotName: "VEDA — The Knowledge" },
  9: { realName: "Justice Raghavan Bose", spotName: "RITAM — The Truth & Order" },
  10: { realName: "Commander Rudra Sen", spotName: "RUDRA — The Sovereign Force (7-Day Lock)" },
};

/**
 * Extracts the real world name as originalName, and spotName as the secondary title.
 * Zero numbers returned in names.
 */
export function parseVoiceIdentity(
  categoryLabel?: string | null,
  slotNumber?: number,
  explicitRealName?: string | null
): ParsedVoice {
  const fallback = slotNumber && EXAMPLE_VOICES[slotNumber] ? EXAMPLE_VOICES[slotNumber] : {
    realName: "Member",
    spotName: "Genesis Voice"
  };

  const real = (explicitRealName && explicitRealName.trim()) ? explicitRealName.trim() : fallback.realName;

  let rawSpot = (categoryLabel || fallback.spotName)
    .replace(/^\[#?\d+\]\s*/i, "")
    .replace(/^#?\d+\s*[-—]\s*/i, "")
    .replace(/^\[?\d+\]?\s*/i, "")
    .trim();

  return {
    originalName: real,
    spotName: rawSpot || fallback.spotName,
  };
}
