const normalizeEmailLocal = (email: string) => email.trim().toLowerCase();

/**
 * Personal / free email providers — blocked for verification.
 * Any other domain (e.g. @kaushasoftlabs.com, @yohita.com) is allowed.
 */
const BLOCKED_EMAIL_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.in',
    'yahoo.in',
    'ymail.com',
    'hotmail.com',
    'hotmail.co.in',
    'outlook.com',
    'outlook.in',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'aol.com',
    'protonmail.com',
    'proton.me',
    'pm.me',
    'mail.com',
    'gmx.com',
    'gmx.net',
    'yandex.com',
    'yandex.ru',
    'rediffmail.com',
    'rediff.com',
    'fastmail.com',
    'tutanota.com',
    'hey.com',
    'mailinator.com',
    'guerrillamail.com',
    'tempmail.com',
    '10minutemail.com',
    'qq.com',
    '163.com',
    '126.com',
    'sina.com',
    'inbox.com',
    'rocketmail.com',
    'facebook.com',
    'instagram.com',
]);

export const getEmailDomain = (email: string): string => {
    const normalized = normalizeEmailLocal(email);
    const at = normalized.lastIndexOf('@');
    if (at === -1) return '';
    return normalized.slice(at + 1);
};

export type WorkEmailValidation = {
    valid: boolean;
    domain: string;
    message?: string;
};

export const validateOfficialWorkEmail = (email: string): WorkEmailValidation => {
    const domain = getEmailDomain(email);

    if (!domain || !domain.includes('.')) {
        return {
            valid: false,
            domain,
            message: 'Enter a valid email (e.g. name@yourcompany.com).',
        };
    }

    const parts = domain.split('.');
    if (parts.length < 2 || parts.some((p) => !p)) {
        return {
            valid: false,
            domain,
            message: 'Enter a valid email address.',
        };
    }

    if (BLOCKED_EMAIL_DOMAINS.has(domain)) {
        return {
            valid: false,
            domain,
            message:
                'Personal email (Gmail, Yahoo, Outlook, etc.) is not allowed. Use your company email.',
        };
    }

    return { valid: true, domain };
};

export const assertOfficialWorkEmail = (email: string): void => {
    const result = validateOfficialWorkEmail(email);
    if (!result.valid) {
        throw new Error(result.message || 'Company email required.');
    }
};
