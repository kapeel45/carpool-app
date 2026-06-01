export type GenderValue = 'male' | 'female' | 'other';

export const GENDER_OPTIONS: { value: GenderValue; label: string; icon: string }[] = [
    { value: 'male', label: 'Male', icon: '♂️' },
    { value: 'female', label: 'Female', icon: '♀️' },
    { value: 'other', label: 'Other', icon: '⚧️' },
];

export const getGenderDisplay = (gender?: string | null) => {
    const match = GENDER_OPTIONS.find((option) => option.value === gender);
    if (match) return match;
    return null;
};
