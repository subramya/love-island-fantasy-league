export const contestantTypeOptions = [
  {
    value: "original_islander",
    label: "OG",
    description: "Started in the villa from day one.",
    rowClassName: "bg-pink-500/6",
    badgeClassName: "border-pink-400/30 bg-pink-500/12 text-pink-200",
  },
  {
    value: "bombshell",
    label: "Bombshell",
    description: "Arrived later to shake up existing couples.",
    rowClassName: "bg-sky-500/6",
    badgeClassName: "border-sky-400/30 bg-sky-500/12 text-sky-200",
  },
  {
    value: "casa_amor",
    label: "Casa Amor",
    description: "Joined during Casa Amor.",
    rowClassName: "bg-yellow-400/6",
    badgeClassName: "border-yellow-300/30 bg-yellow-400/12 text-yellow-100",
  },
] as const;

export type ContestantTypeValue = (typeof contestantTypeOptions)[number]["value"];

export function getContestantTypeLabel(contestantType: string | null | undefined) {
  return (
    contestantTypeOptions.find((option) => option.value === contestantType)?.label ??
    "Original islander"
  );
}

export function getContestantTypeStyles(contestantType: string | null | undefined) {
  return (
    contestantTypeOptions.find((option) => option.value === contestantType) ?? contestantTypeOptions[0]
  );
}
