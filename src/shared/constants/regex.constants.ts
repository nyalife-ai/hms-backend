export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const URL_REGEX =
  /^https?:\/\/(?:[^\s/:]+\.)*[^\s/:]+(?::\d+)?(?:\/[^\s]*)?$/i;
export const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SAFE_FILENAME_REGEX =
  /^(?!\.{1,2}$)(?!.*(?:\/|\\|\.\.))[\p{L}\p{N}_. -]+$/u;
