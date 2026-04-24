export interface Step {
  t: number;
  string?: string;
  strings?: string[];
}

export function getStepStrings(step: Step): string[] {
  if (step.strings) return step.strings;
  if (step.string) return [step.string];
  return [];
}
