type ContestantForCouples = {
  id: string;
  name: string;
  status: string;
};

type RoundForCouples = {
  id: string;
};

type TrackerEntryForCouples = {
  round_id: string;
  contestant_id: string;
  tracker_state: string;
  partner_contestant_id: string | null;
};

export type CurrentCoupleOption = {
  value: string;
  label: string;
  contestant1Id: string;
  contestant2Id: string;
};

export function normalizeCoupleValue(firstContestantId: string, secondContestantId: string) {
  return [firstContestantId, secondContestantId].sort().join(":");
}

export function parseCoupleValue(value: string) {
  const [contestant1Id = "", contestant2Id = ""] = value.split(":");
  return { contestant1Id, contestant2Id };
}

export function buildCurrentCoupleOptions(
  contestants: ContestantForCouples[],
  roundsInPriorityOrder: RoundForCouples[],
  trackerEntriesByRoundId: Record<string, TrackerEntryForCouples[]>
) {
  const latestTrackerRound = roundsInPriorityOrder.find(
    (round) => (trackerEntriesByRoundId[round.id] ?? []).length > 0
  );

  if (!latestTrackerRound) {
    return [] as CurrentCoupleOption[];
  }

  const contestantsById = new Map(contestants.map((contestant) => [contestant.id, contestant]));
  const roundEntries = trackerEntriesByRoundId[latestTrackerRound.id] ?? [];
  const seenPairs = new Set<string>();

  return roundEntries
    .flatMap((entry) => {
      if (entry.tracker_state !== "coupled" || !entry.partner_contestant_id) {
        return [];
      }

      const contestant = contestantsById.get(entry.contestant_id);
      const partner = contestantsById.get(entry.partner_contestant_id);

      if (!contestant || !partner) {
        return [];
      }

      if (contestant.status !== "active" || partner.status !== "active") {
        return [];
      }

      const pairValue = normalizeCoupleValue(contestant.id, partner.id);

      if (seenPairs.has(pairValue)) {
        return [];
      }

      seenPairs.add(pairValue);

      return [
        {
          value: pairValue,
          label: `${contestant.name} + ${partner.name}`,
          contestant1Id: pairValue.split(":")[0] ?? contestant.id,
          contestant2Id: pairValue.split(":")[1] ?? partner.id,
        },
      ];
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}
