export type WorkOption = {
  obra?: string;
  ativa?: boolean;
  fases?: string[];
};

export function getWorkOptionByObra(options: WorkOption[] | undefined, obra: string) {
  return (options ?? []).find((item) => String(item.obra ?? "") === obra);
}

export function getFasesForObra(options: WorkOption[] | undefined, obra: string) {
  const match = getWorkOptionByObra(options, obra);
  return ((match?.fases ?? []) as string[]).filter(Boolean);
}
