// Texts shared by server actions and client components (§5.21): errors of actions and Better Auth.
import { dictionary } from "@uni-scrims/core/config/locale";

export const actionMessages = dictionary(
  {
    /** Better Auth errors the account actions can hit (§5.8), by error code. */
    authErrors: {
      INVALID_EMAIL_OR_PASSWORD: "E-Mail-Adresse oder Passwort stimmen nicht.",
      EMAIL_NOT_VERIFIED:
        "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir den Link noch einmal geschickt.",
      INVALID_TOKEN: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
      TOKEN_EXPIRED: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
      INVALID_PASSWORD: "Das aktuelle Passwort stimmt nicht.",
      CREDENTIAL_ACCOUNT_NOT_FOUND: "Für dein Konto ist noch kein Passwort gesetzt.",
      PASSWORD_TOO_SHORT: "Das Passwort ist zu kurz.",
      PASSWORD_TOO_LONG: "Das Passwort ist zu lang.",
      MAIL_FAILED: "Die Mail konnte nicht gesendet werden. Bitte versuch es später erneut.",
      // Staff 2FA (§5.9).
      INVALID_CODE: "Der Code stimmt nicht. Nimm den aktuellen aus deiner Authenticator-App.",
      INVALID_BACKUP_CODE: "Dieser Backup-Code stimmt nicht oder wurde schon benutzt.",
      INVALID_TWO_FACTOR_COOKIE: "Die Anmeldung ist abgelaufen. Bitte melde dich neu an.",
      TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Zu viele falsche Codes. Bitte melde dich neu an.",
      ACCOUNT_TEMPORARILY_LOCKED:
        "Zu viele falsche Codes. Die Anmeldung ist kurz gesperrt, bitte versuch es später erneut.",
      TOTP_ALREADY_ENABLED: "Die Zwei-Faktor-Anmeldung ist schon eingerichtet.",
    } as Record<string, string>,
    somethingWentWrong: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
    invalidInput: "Ungültige Eingabe.",
    rateLimited: "Zu viele Versuche. Bitte warte eine Minute.",
  },
  {
    authErrors: {
      INVALID_EMAIL_OR_PASSWORD: "The email address or password is wrong.",
      EMAIL_NOT_VERIFIED: "Please confirm your email address first. We've sent you the link again.",
      INVALID_TOKEN: "The link is invalid or has expired. Please request a new one.",
      TOKEN_EXPIRED: "The link is invalid or has expired. Please request a new one.",
      INVALID_PASSWORD: "The current password is wrong.",
      CREDENTIAL_ACCOUNT_NOT_FOUND: "Your account has no password yet.",
      PASSWORD_TOO_SHORT: "The password is too short.",
      PASSWORD_TOO_LONG: "The password is too long.",
      MAIL_FAILED: "The email couldn't be sent. Please try again later.",
      INVALID_CODE: "The code is wrong. Use the current one from your authenticator app.",
      INVALID_BACKUP_CODE: "This backup code is wrong or has already been used.",
      INVALID_TWO_FACTOR_COOKIE: "The sign-in has expired. Please sign in again.",
      TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many wrong codes. Please sign in again.",
      ACCOUNT_TEMPORARILY_LOCKED:
        "Too many wrong codes. Signing in is blocked for a moment, please try again later.",
      TOTP_ALREADY_ENABLED: "Two-factor sign-in is already set up.",
    },
    somethingWentWrong: "Something went wrong. Please try again.",
    invalidInput: "Invalid input.",
    rateLimited: "Too many attempts. Please wait a minute.",
  },
);
