export function getAdmissionProofToAutoSelect(
  currentProofAttachmentId: number | null | undefined,
  newestProofAttachmentId: number | null | undefined,
): number | undefined {
  if (currentProofAttachmentId != null || newestProofAttachmentId == null) {
    return undefined;
  }

  return newestProofAttachmentId;
}

export function getAdmissionProofAfterDelete(
  currentProofAttachmentId: number | null | undefined,
  deletedAttachmentId: number,
): number | null | undefined {
  return currentProofAttachmentId === deletedAttachmentId
    ? undefined
    : currentProofAttachmentId;
}

export function keepUntouchedAdmissionFields<T extends Record<string, unknown>>(
  values: T,
  isFieldTouched: (field: keyof T) => boolean,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([field]) => !isFieldTouched(field as keyof T),
    ),
  ) as Partial<T>;
}
