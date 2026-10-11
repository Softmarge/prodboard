// Shared password policy used by the client forms and the server routes.
export const PASSWORD_MIN = 12;

// Returns a human-readable problem, or null when the password is acceptable.
export function passwordProblem(pw: string): string | null {
  if (!pw || pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(pw)) return "Include at least one letter.";
  if (!/[0-9]/.test(pw)) return "Include at least one number.";
  return null;
}
