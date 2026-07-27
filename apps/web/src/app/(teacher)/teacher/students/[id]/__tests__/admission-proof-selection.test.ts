import {
  getAdmissionProofAfterDelete,
  getAdmissionProofToAutoSelect,
  keepUntouchedAdmissionFields,
} from '../admission-proof-selection';

describe('getAdmissionProofToAutoSelect', () => {
  it.each([undefined, null])(
    'selects the newest uploaded proof when the form field is empty (%s)',
    (currentProofAttachmentId) => {
      expect(getAdmissionProofToAutoSelect(currentProofAttachmentId, 42)).toBe(
        42,
      );
    },
  );

  it('keeps an existing proof selection unchanged', () => {
    expect(getAdmissionProofToAutoSelect(7, 42)).toBeUndefined();
  });

  it.each([undefined, null])(
    'does not update the form when no proof attachment is available (%s)',
    (newestProofAttachmentId) => {
      expect(
        getAdmissionProofToAutoSelect(undefined, newestProofAttachmentId),
      ).toBeUndefined();
    },
  );
});

describe('getAdmissionProofAfterDelete', () => {
  it('clears the selected proof when that attachment is deleted', () => {
    expect(getAdmissionProofAfterDelete(7, 7)).toBeUndefined();
  });

  it('keeps another selected proof unchanged', () => {
    expect(getAdmissionProofAfterDelete(8, 7)).toBe(8);
  });
});

describe('keepUntouchedAdmissionFields', () => {
  it('does not overwrite fields the user has already edited', () => {
    const values = {
      admittedUniName: '四川大学',
      admittedMajorName: '汉语言文学',
      admittedMinScore: 620,
    };

    expect(
      keepUntouchedAdmissionFields(
        values,
        (field) => field === 'admittedUniName' || field === 'admittedMinScore',
      ),
    ).toEqual({ admittedMajorName: '汉语言文学' });
  });
});
